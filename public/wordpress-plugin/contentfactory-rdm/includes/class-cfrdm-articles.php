<?php
/**
 * Articles Management
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_Articles {
    
    /**
     * Get articles stats
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
        );
        
        // Count by status
        $counts = wp_count_posts('post');
        $stats['total'] = $counts->publish + $counts->draft + $counts->pending + $counts->private;
        $stats['published'] = $counts->publish;
        $stats['draft'] = $counts->draft;
        $stats['pending'] = $counts->pending;
        $stats['private'] = $counts->private;
        $stats['trash'] = $counts->trash;
        
        // Count synced articles (with ContentFactory ID)
        $synced = $wpdb->get_var(
            "SELECT COUNT(*) FROM {$wpdb->postmeta} 
             WHERE meta_key = '_cfrdm_article_id' AND meta_value != ''"
        );
        $stats['synced'] = intval($synced);
        
        return $stats;
    }
    
    /**
     * Get recent synced articles
     */
    public static function get_synced_articles($limit = 10) {
        global $wpdb;
        
        $results = $wpdb->get_results($wpdb->prepare(
            "SELECT p.ID, p.post_title, p.post_status, p.post_date, pm.meta_value as cfrdm_id
             FROM {$wpdb->posts} p
             INNER JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id
             WHERE pm.meta_key = '_cfrdm_article_id' AND pm.meta_value != ''
             AND p.post_type = 'post'
             ORDER BY p.post_date DESC
             LIMIT %d",
            $limit
        ));
        
        return $results;
    }
    
    /**
     * Sync article from ContentFactory
     */
    public static function sync_from_contentfactory($cfrdm_id, $article_data) {
        // Check if article already exists
        $existing = self::get_by_cfrdm_id($cfrdm_id);
        
        if ($existing) {
            // Update existing
            $post_data = array(
                'ID' => $existing->ID,
            );
        } else {
            // Create new
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
        } else {
            $post_id = wp_insert_post($post_data, true);
        }
        
        if (is_wp_error($post_id)) {
            return $post_id;
        }
        
        // Set ContentFactory ID
        update_post_meta($post_id, '_cfrdm_article_id', sanitize_text_field($cfrdm_id));
        
        // Set categories
        if (!empty($article_data['categories'])) {
            wp_set_post_categories($post_id, array_map('intval', $article_data['categories']));
        }
        
        // Set tags
        if (!empty($article_data['tags'])) {
            wp_set_post_tags($post_id, $article_data['tags']);
        }
        
        return $post_id;
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
        
        return $results;
    }
}
