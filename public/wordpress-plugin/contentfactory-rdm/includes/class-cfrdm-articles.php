<?php
/**
 * Articles Management - Enhanced with error tracking and sync status
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_Articles {
    
    /**
     * Get articles stats - Enhanced version
     */
    public static function get_stats() {
        global $wpdb;
        
        $stats = array(
            'total' => 0,
            'published' => 0,
            'draft' => 0,
            'pending' => 0,
            'private' => 0,
            'trash' => 0,
            'synced' => 0,
            'errors' => 0,
            'needs_attention' => 0,
            'missing_images' => 0,
            'scheduled' => 0,
            'today' => 0,
            'this_week' => 0,
            'this_month' => 0,
        );
        
        // Count by status
        $counts = wp_count_posts('post');
        $stats['total'] = $counts->publish + $counts->draft + $counts->pending + $counts->private;
        $stats['published'] = $counts->publish;
        $stats['draft'] = $counts->draft;
        $stats['pending'] = $counts->pending;
        $stats['private'] = $counts->private;
        $stats['trash'] = $counts->trash;
        $stats['scheduled'] = $counts->future ?? 0;
        
        // Count synced articles (with ContentFactory ID)
        $stats['synced'] = intval($wpdb->get_var(
            "SELECT COUNT(*) FROM {$wpdb->postmeta} 
             WHERE meta_key = '_cfrdm_article_id' AND meta_value != ''"
        ));
        
        // Count articles with errors
        $stats['errors'] = intval($wpdb->get_var(
            "SELECT COUNT(*) FROM {$wpdb->postmeta} 
             WHERE meta_key = '_cfrdm_sync_error' AND meta_value != ''"
        ));
        
        // Count articles needing attention
        $stats['needs_attention'] = intval($wpdb->get_var(
            "SELECT COUNT(*) FROM {$wpdb->postmeta} 
             WHERE meta_key = '_cfrdm_needs_attention'"
        ));
        
        // Count articles missing featured images
        $stats['missing_images'] = intval($wpdb->get_var(
            "SELECT COUNT(*) FROM {$wpdb->postmeta} 
             WHERE meta_key = '_cfrdm_needs_featured_image' AND meta_value = '1'"
        ));
        
        // Articles published today
        $stats['today'] = intval($wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->posts} 
             WHERE post_type = 'post' AND post_status = 'publish' 
             AND DATE(post_date) = %s",
            current_time('Y-m-d')
        )));
        
        // Articles published this week
        $stats['this_week'] = intval($wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->posts} 
             WHERE post_type = 'post' AND post_status = 'publish' 
             AND post_date >= %s",
            date('Y-m-d', strtotime('-7 days'))
        )));
        
        // Articles published this month
        $stats['this_month'] = intval($wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->posts} 
             WHERE post_type = 'post' AND post_status = 'publish' 
             AND YEAR(post_date) = %d AND MONTH(post_date) = %d",
            current_time('Y'),
            current_time('m')
        )));
        
        return $stats;
    }
    
    /**
     * Get publishing trends for charts
     */
    public static function get_publishing_trends($days = 30) {
        global $wpdb;
        
        $date_limit = date('Y-m-d', strtotime("-$days days"));
        
        $results = $wpdb->get_results($wpdb->prepare(
            "SELECT DATE(post_date) as date, 
                    COUNT(*) as total,
                    SUM(CASE WHEN post_status = 'publish' THEN 1 ELSE 0 END) as published,
                    SUM(CASE WHEN post_status = 'draft' THEN 1 ELSE 0 END) as draft
             FROM {$wpdb->posts} 
             WHERE post_type = 'post' 
             AND post_date >= %s
             GROUP BY DATE(post_date)
             ORDER BY date ASC",
            $date_limit
        ));
        
        // Fill in missing dates
        $trends = array();
        $current = strtotime($date_limit);
        $end = strtotime(current_time('Y-m-d'));
        
        while ($current <= $end) {
            $date = date('Y-m-d', $current);
            $found = false;
            
            foreach ($results as $row) {
                if ($row->date === $date) {
                    $trends[] = array(
                        'date' => $date,
                        'total' => intval($row->total),
                        'published' => intval($row->published),
                        'draft' => intval($row->draft),
                    );
                    $found = true;
                    break;
                }
            }
            
            if (!$found) {
                $trends[] = array(
                    'date' => $date,
                    'total' => 0,
                    'published' => 0,
                    'draft' => 0,
                );
            }
            
            $current = strtotime('+1 day', $current);
        }
        
        return $trends;
    }
    
    /**
     * Get recent synced articles
     */
    public static function get_synced_articles($limit = 10) {
        global $wpdb;
        
        $results = $wpdb->get_results($wpdb->prepare(
            "SELECT p.ID, p.post_title, p.post_status, p.post_date, 
                    pm.meta_value as cfrdm_id,
                    pm2.meta_value as sync_error,
                    pm3.meta_value as needs_attention
             FROM {$wpdb->posts} p
             INNER JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_cfrdm_article_id'
             LEFT JOIN {$wpdb->postmeta} pm2 ON p.ID = pm2.post_id AND pm2.meta_key = '_cfrdm_sync_error'
             LEFT JOIN {$wpdb->postmeta} pm3 ON p.ID = pm3.post_id AND pm3.meta_key = '_cfrdm_needs_attention'
             WHERE pm.meta_value != '' AND p.post_type = 'post'
             ORDER BY p.post_date DESC
             LIMIT %d",
            $limit
        ));
        
        return $results;
    }
    
    /**
     * Get articles with errors
     */
    public static function get_error_articles($limit = 20) {
        global $wpdb;
        
        return $wpdb->get_results($wpdb->prepare(
            "SELECT p.ID, p.post_title, p.post_status, p.post_date,
                    pm.meta_value as error_message,
                    pm2.meta_value as cfrdm_id
             FROM {$wpdb->posts} p
             INNER JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_cfrdm_sync_error'
             LEFT JOIN {$wpdb->postmeta} pm2 ON p.ID = pm2.post_id AND pm2.meta_key = '_cfrdm_article_id'
             WHERE pm.meta_value != '' AND p.post_type = 'post'
             ORDER BY p.post_modified DESC
             LIMIT %d",
            $limit
        ));
    }
    
    /**
     * Get articles needing attention
     */
    public static function get_attention_articles($limit = 20) {
        global $wpdb;
        
        return $wpdb->get_results($wpdb->prepare(
            "SELECT p.ID, p.post_title, p.post_status, p.post_date,
                    pm.meta_value as attention_date,
                    pm2.meta_value as seo_issues,
                    pm3.meta_value as broken_links,
                    pm4.meta_value as needs_image
             FROM {$wpdb->posts} p
             INNER JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_cfrdm_needs_attention'
             LEFT JOIN {$wpdb->postmeta} pm2 ON p.ID = pm2.post_id AND pm2.meta_key = '_cfrdm_seo_issues'
             LEFT JOIN {$wpdb->postmeta} pm3 ON p.ID = pm3.post_id AND pm3.meta_key = '_cfrdm_broken_links'
             LEFT JOIN {$wpdb->postmeta} pm4 ON p.ID = pm4.post_id AND pm4.meta_key = '_cfrdm_needs_featured_image'
             WHERE p.post_type = 'post'
             ORDER BY pm.meta_value DESC
             LIMIT %d",
            $limit
        ));
    }
    
    /**
     * Sync article from ContentFactory
     */
    public static function sync_from_contentfactory($cfrdm_id, $article_data) {
        // Check if article already exists
        $existing = self::get_by_cfrdm_id($cfrdm_id);
        
        if ($existing) {
            $post_data = array('ID' => $existing->ID);
        } else {
            $post_data = array(
                'post_type' => 'post',
                'post_status' => get_option('cfrdm_default_status', 'draft'),
            );
        }
        
        // Set article data
        if (isset($article_data['title'])) {
            $post_data['post_title'] = sanitize_text_field($article_data['title']);
        }
        if (isset($article_data['content'])) {
            $post_data['post_content'] = wp_kses_post($article_data['content']);
        }
        if (isset($article_data['excerpt'])) {
            $post_data['post_excerpt'] = sanitize_textarea_field($article_data['excerpt']);
        }
        if (isset($article_data['slug'])) {
            $post_data['post_name'] = sanitize_title($article_data['slug']);
        }
        if (isset($article_data['status'])) {
            $post_data['post_status'] = sanitize_text_field($article_data['status']);
        }
        
        // Insert or update
        if (isset($post_data['ID'])) {
            $post_id = wp_update_post($post_data, true);
            $action = 'updated';
        } else {
            $post_id = wp_insert_post($post_data, true);
            $action = 'created';
        }
        
        if (is_wp_error($post_id)) {
            CFRDM_Logger::error('sync', 'Erro ao sincronizar artigo', array(
                'cfrdm_id' => $cfrdm_id,
                'error' => $post_id->get_error_message(),
            ));
            return $post_id;
        }
        
        // Set ContentFactory ID
        update_post_meta($post_id, '_cfrdm_article_id', sanitize_text_field($cfrdm_id));
        update_post_meta($post_id, '_cfrdm_last_sync', current_time('mysql'));
        delete_post_meta($post_id, '_cfrdm_sync_error');
        
        // Set categories
        if (!empty($article_data['categories'])) {
            wp_set_post_categories($post_id, array_map('intval', $article_data['categories']));
        }
        
        // Set tags
        if (!empty($article_data['tags'])) {
            wp_set_post_tags($post_id, $article_data['tags']);
        }
        
        CFRDM_Logger::success('sync', "Artigo $action via sincronização", array(
            'post_id' => $post_id,
            'cfrdm_id' => $cfrdm_id,
            'title' => $post_data['post_title'] ?? '',
        ), $post_id);
        
        return $post_id;
    }
    
    /**
     * Set sync error
     */
    public static function set_sync_error($post_id, $error_message) {
        update_post_meta($post_id, '_cfrdm_sync_error', $error_message);
        update_post_meta($post_id, '_cfrdm_sync_error_time', current_time('mysql'));
        
        CFRDM_Logger::error('sync', $error_message, array(
            'post_id' => $post_id,
        ), $post_id);
    }
    
    /**
     * Clear sync error
     */
    public static function clear_sync_error($post_id) {
        delete_post_meta($post_id, '_cfrdm_sync_error');
        delete_post_meta($post_id, '_cfrdm_sync_error_time');
    }
    
    /**
     * Get article by ContentFactory ID
     */
    public static function get_by_cfrdm_id($cfrdm_id) {
        global $wpdb;
        
        $post_id = $wpdb->get_var($wpdb->prepare(
            "SELECT post_id FROM {$wpdb->postmeta} 
             WHERE meta_key = '_cfrdm_article_id' AND meta_value = %s
             LIMIT 1",
            $cfrdm_id
        ));
        
        return $post_id ? get_post($post_id) : null;
    }
    
    /**
     * Bulk import articles
     */
    public static function bulk_import($articles) {
        $results = array(
            'success' => 0,
            'failed' => 0,
            'errors' => array(),
        );
        
        foreach ($articles as $article) {
            if (empty($article['cfrdm_id'])) {
                $results['failed']++;
                $results['errors'][] = __('ID do ContentFactory não fornecido', 'contentfactory-rdm');
                continue;
            }
            
            $post_id = self::sync_from_contentfactory($article['cfrdm_id'], $article);
            
            if (is_wp_error($post_id)) {
                $results['failed']++;
                $results['errors'][] = $post_id->get_error_message();
            } else {
                $results['success']++;
            }
        }
        
        CFRDM_Logger::info('sync', 'Importação em massa concluída', $results);
        
        return $results;
    }
    
    /**
     * Get comments stats for synced articles
     */
    public static function get_comments_stats() {
        global $wpdb;
        
        // Get total comments on synced articles
        $total = $wpdb->get_var(
            "SELECT COUNT(*) FROM {$wpdb->comments} c
             INNER JOIN {$wpdb->postmeta} pm ON c.comment_post_ID = pm.post_id
             WHERE pm.meta_key = '_cfrdm_article_id' AND pm.meta_value != ''"
        );
        
        // Get pending comments
        $pending = $wpdb->get_var(
            "SELECT COUNT(*) FROM {$wpdb->comments} c
             INNER JOIN {$wpdb->postmeta} pm ON c.comment_post_ID = pm.post_id
             WHERE pm.meta_key = '_cfrdm_article_id' AND pm.meta_value != ''
             AND c.comment_approved = '0'"
        );
        
        // Get approved comments
        $approved = $wpdb->get_var(
            "SELECT COUNT(*) FROM {$wpdb->comments} c
             INNER JOIN {$wpdb->postmeta} pm ON c.comment_post_ID = pm.post_id
             WHERE pm.meta_key = '_cfrdm_article_id' AND pm.meta_value != ''
             AND c.comment_approved = '1'"
        );
        
        return array(
            'total' => intval($total),
            'pending' => intval($pending),
            'approved' => intval($approved),
        );
    }
}
