<?php
/**
 * Sync Class - Bidirectional synchronization and auto-corrections
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_Sync {
    
    /**
     * Sync stats to ContentFactory platform
     */
    public static function sync_stats_to_platform() {
        $api_url = get_option('cfrdm_api_url');
        $api_key = get_option('cfrdm_api_key');
        
        if (empty($api_url)) {
            return;
        }
        
        $stats = self::get_full_stats();
        
        $response = wp_remote_post($api_url . '/functions/v1/webhooks', array(
            'headers' => array(
                'Content-Type' => 'application/json',
                'X-CFRDM-API-Key' => $api_key,
            ),
            'body' => json_encode(array(
                'event' => 'stats_sync',
                'site_url' => get_site_url(),
                'stats' => $stats,
                'timestamp' => current_time('c'),
            )),
            'timeout' => 15,
        ));
        
        if (is_wp_error($response)) {
            CFRDM_Logger::error('sync', 'Falha ao sincronizar estatísticas', array(
                'error' => $response->get_error_message(),
            ));
        } else {
            CFRDM_Logger::debug('sync', 'Estatísticas sincronizadas', $stats);
        }
    }
    
    /**
     * Get full stats for sync
     */
    public static function get_full_stats() {
        $article_stats = CFRDM_Articles::get_stats();
        $image_stats = CFRDM_Image_Optimizer::get_stats();
        $log_stats = CFRDM_Logger::get_stats(7);
        
        // Get comments count
        $comments = wp_count_comments();
        
        // Get error articles
        $error_count = self::get_error_articles_count();
        
        // Get recent activity
        $recent_syncs = self::get_recent_sync_activity();
        
        return array(
            'articles' => $article_stats,
            'images' => $image_stats,
            'comments' => array(
                'total' => $comments->total_comments,
                'approved' => $comments->approved,
                'pending' => $comments->moderated,
                'spam' => $comments->spam,
            ),
            'errors' => array(
                'articles_with_errors' => $error_count,
                'recent_errors' => $log_stats['by_type']['error']->count ?? 0,
            ),
            'sync' => array(
                'last_sync' => get_option('cfrdm_last_sync'),
                'recent_activity' => $recent_syncs,
            ),
            'plugin_version' => CFRDM_VERSION,
            'wordpress_version' => get_bloginfo('version'),
            'php_version' => PHP_VERSION,
        );
    }
    
    /**
     * Get error articles count
     */
    public static function get_error_articles_count() {
        global $wpdb;
        
        return $wpdb->get_var(
            "SELECT COUNT(*) FROM {$wpdb->postmeta} 
             WHERE meta_key = '_cfrdm_sync_error' 
             AND meta_value != ''"
        );
    }
    
    /**
     * Get recent sync activity
     */
    public static function get_recent_sync_activity($limit = 10) {
        global $wpdb;
        
        $table = $wpdb->prefix . CFRDM_LOG_TABLE;
        
        return $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM $table 
             WHERE category IN ('sync', 'publish', 'api') 
             ORDER BY created_at DESC 
             LIMIT %d",
            $limit
        ));
    }
    
    /**
     * Fetch news and updates from platform
     */
    public static function fetch_platform_news() {
        $api_url = get_option('cfrdm_api_url');
        
        if (empty($api_url)) {
            return;
        }
        
        // For now, we'll simulate news - in production this would fetch from the platform
        $sample_news = array(
            array(
                'news_id' => 'cfrdm_v2_release',
                'title' => 'ContentFactory RDM 2.0 Lançado!',
                'content' => 'A nova versão inclui otimização automática de imagens, sistema de logs completo e autocorreções inteligentes.',
                'news_type' => 'update',
                'priority' => 1,
                'link' => 'https://contentfactory.rdm.com.br/changelog',
                'published_at' => current_time('mysql'),
            ),
        );
        
        foreach ($sample_news as $news) {
            self::save_news($news);
        }
    }
    
    /**
     * Save news item
     */
    public static function save_news($news) {
        global $wpdb;
        
        $table = $wpdb->prefix . CFRDM_NEWS_TABLE;
        
        // Check if already exists
        $exists = $wpdb->get_var($wpdb->prepare(
            "SELECT id FROM $table WHERE news_id = %s",
            $news['news_id']
        ));
        
        if ($exists) {
            return false;
        }
        
        return $wpdb->insert($table, array(
            'news_id' => $news['news_id'],
            'title' => $news['title'],
            'content' => $news['content'] ?? '',
            'news_type' => $news['news_type'] ?? 'update',
            'priority' => $news['priority'] ?? 0,
            'link' => $news['link'] ?? null,
            'published_at' => $news['published_at'] ?? current_time('mysql'),
        ));
    }
    
    /**
     * Get unread news
     */
    public static function get_unread_news($limit = 20) {
        global $wpdb;
        
        $table = $wpdb->prefix . CFRDM_NEWS_TABLE;
        
        return $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM $table 
             WHERE is_dismissed = 0 
             ORDER BY priority DESC, published_at DESC 
             LIMIT %d",
            $limit
        ));
    }
    
    /**
     * Get unread news count
     */
    public static function get_unread_news_count() {
        global $wpdb;
        
        $table = $wpdb->prefix . CFRDM_NEWS_TABLE;
        
        return $wpdb->get_var(
            "SELECT COUNT(*) FROM $table WHERE is_dismissed = 0 AND is_read = 0"
        );
    }
    
    /**
     * Mark news as read
     */
    public static function mark_news_read($news_id) {
        global $wpdb;
        
        $table = $wpdb->prefix . CFRDM_NEWS_TABLE;
        
        return $wpdb->update(
            $table,
            array('is_read' => 1),
            array('id' => $news_id)
        );
    }
    
    /**
     * Dismiss news
     */
    public static function dismiss_news($news_id) {
        global $wpdb;
        
        $table = $wpdb->prefix . CFRDM_NEWS_TABLE;
        
        return $wpdb->update(
            $table,
            array('is_dismissed' => 1, 'is_read' => 1),
            array('id' => $news_id)
        );
    }
    
    /**
     * Cleanup old news
     */
    public static function cleanup_old_news($days = 60) {
        global $wpdb;
        
        $table = $wpdb->prefix . CFRDM_NEWS_TABLE;
        $date_limit = date('Y-m-d H:i:s', strtotime("-$days days"));
        
        return $wpdb->query($wpdb->prepare(
            "DELETE FROM $table WHERE is_dismissed = 1 AND created_at < %s",
            $date_limit
        ));
    }
    
    /**
     * Auto-correct post on save
     */
    public static function auto_correct_post($post_id, $post, $update) {
        // Skip if not enabled
        if (!get_option('cfrdm_auto_correct', true)) {
            return;
        }
        
        // Skip autosaves and revisions
        if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) {
            return;
        }
        
        if (wp_is_post_revision($post_id) || wp_is_post_autosave($post_id)) {
            return;
        }
        
        // Only process posts
        if ($post->post_type !== 'post') {
            return;
        }
        
        $corrections = array();
        
        // Check for missing featured image
        if (get_option('cfrdm_auto_correct_images', true)) {
            if (!has_post_thumbnail($post_id)) {
                $corrections['missing_featured_image'] = true;
                update_post_meta($post_id, '_cfrdm_needs_featured_image', 1);
            } else {
                delete_post_meta($post_id, '_cfrdm_needs_featured_image');
            }
        }
        
        // Check SEO meta
        if (get_option('cfrdm_auto_correct_seo', true)) {
            $seo_issues = self::check_seo_issues($post_id, $post);
            if (!empty($seo_issues)) {
                $corrections['seo_issues'] = $seo_issues;
                update_post_meta($post_id, '_cfrdm_seo_issues', $seo_issues);
            } else {
                delete_post_meta($post_id, '_cfrdm_seo_issues');
            }
        }
        
        // Check for broken links
        if (get_option('cfrdm_auto_correct_links', true)) {
            $broken_links = self::check_broken_links($post->post_content);
            if (!empty($broken_links)) {
                $corrections['broken_links'] = count($broken_links);
                update_post_meta($post_id, '_cfrdm_broken_links', $broken_links);
            } else {
                delete_post_meta($post_id, '_cfrdm_broken_links');
            }
        }
        
        if (!empty($corrections)) {
            CFRDM_Logger::warning('autocorrect', 'Problemas detectados no artigo', array(
                'post_id' => $post_id,
                'title' => $post->post_title,
                'corrections' => $corrections,
            ), $post_id);
            
            update_post_meta($post_id, '_cfrdm_needs_attention', current_time('mysql'));
        } else {
            delete_post_meta($post_id, '_cfrdm_needs_attention');
            delete_post_meta($post_id, '_cfrdm_sync_error');
        }
    }
    
    /**
     * Check SEO issues
     */
    private static function check_seo_issues($post_id, $post) {
        $issues = array();
        
        // Check title length
        $title_length = strlen($post->post_title);
        if ($title_length < 30) {
            $issues[] = 'title_too_short';
        } elseif ($title_length > 60) {
            $issues[] = 'title_too_long';
        }
        
        // Check excerpt
        if (empty($post->post_excerpt)) {
            $issues[] = 'missing_excerpt';
        } else {
            $excerpt_length = strlen($post->post_excerpt);
            if ($excerpt_length < 50) {
                $issues[] = 'excerpt_too_short';
            } elseif ($excerpt_length > 160) {
                $issues[] = 'excerpt_too_long';
            }
        }
        
        // Check content length
        $word_count = str_word_count(strip_tags($post->post_content));
        if ($word_count < 300) {
            $issues[] = 'content_too_short';
        }
        
        // Check for headings
        if (strpos($post->post_content, '<h2') === false && strpos($post->post_content, '<h3') === false) {
            $issues[] = 'missing_headings';
        }
        
        // Check for images
        if (strpos($post->post_content, '<img') === false) {
            $issues[] = 'no_images_in_content';
        }
        
        // Check Yoast or Rank Math SEO meta
        $yoast_title = get_post_meta($post_id, '_yoast_wpseo_title', true);
        $yoast_desc = get_post_meta($post_id, '_yoast_wpseo_metadesc', true);
        $rankmath_title = get_post_meta($post_id, 'rank_math_title', true);
        $rankmath_desc = get_post_meta($post_id, 'rank_math_description', true);
        
        if (empty($yoast_title) && empty($rankmath_title)) {
            $issues[] = 'missing_seo_title';
        }
        
        if (empty($yoast_desc) && empty($rankmath_desc)) {
            $issues[] = 'missing_meta_description';
        }
        
        return $issues;
    }
    
    /**
     * Check for broken links
     */
    private static function check_broken_links($content) {
        $broken = array();
        
        // Extract all links
        preg_match_all('/<a[^>]+href=["\']([^"\']+)["\'][^>]*>/i', $content, $matches);
        
        if (empty($matches[1])) {
            return $broken;
        }
        
        foreach ($matches[1] as $url) {
            // Skip internal anchors
            if (strpos($url, '#') === 0) {
                continue;
            }
            
            // Skip mailto and tel links
            if (strpos($url, 'mailto:') === 0 || strpos($url, 'tel:') === 0) {
                continue;
            }
            
            // Check if internal link exists
            if (strpos($url, get_site_url()) === 0 || strpos($url, '/') === 0) {
                $post_id = url_to_postid($url);
                if (!$post_id && strpos($url, get_site_url()) === 0) {
                    // Could be a broken internal link
                    $broken[] = $url;
                }
            }
        }
        
        return $broken;
    }
    
    /**
     * Run bulk auto-corrections
     */
    public static function run_bulk_autocorrect($limit = 50) {
        $posts = get_posts(array(
            'post_type' => 'post',
            'post_status' => array('publish', 'draft', 'pending'),
            'posts_per_page' => $limit,
            'meta_query' => array(
                'relation' => 'OR',
                array(
                    'key' => '_cfrdm_last_autocorrect',
                    'compare' => 'NOT EXISTS',
                ),
                array(
                    'key' => '_cfrdm_last_autocorrect',
                    'value' => date('Y-m-d H:i:s', strtotime('-7 days')),
                    'compare' => '<',
                    'type' => 'DATETIME',
                ),
            ),
        ));
        
        $results = array(
            'processed' => 0,
            'with_issues' => 0,
            'clean' => 0,
        );
        
        foreach ($posts as $post) {
            self::auto_correct_post($post->ID, $post, true);
            update_post_meta($post->ID, '_cfrdm_last_autocorrect', current_time('mysql'));
            $results['processed']++;
            
            if (get_post_meta($post->ID, '_cfrdm_needs_attention', true)) {
                $results['with_issues']++;
            } else {
                $results['clean']++;
            }
        }
        
        CFRDM_Logger::info('autocorrect', 'Autocorreção em massa executada', $results);
        
        return $results;
    }
    
    /**
     * Get articles needing attention
     */
    public static function get_articles_needing_attention($limit = 20) {
        return get_posts(array(
            'post_type' => 'post',
            'posts_per_page' => $limit,
            'meta_query' => array(
                array(
                    'key' => '_cfrdm_needs_attention',
                    'compare' => 'EXISTS',
                ),
            ),
        ));
    }
}
