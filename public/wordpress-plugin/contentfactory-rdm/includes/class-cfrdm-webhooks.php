<?php
/**
 * Webhooks Handler
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_Webhooks {
    
    /**
     * Triggered when post status changes
     */
    public static function on_post_status_change($new_status, $old_status, $post) {
        if (!get_option('cfrdm_webhook_enabled', true)) {
            return;
        }
        
        if ($post->post_type !== 'post') {
            return;
        }
        
        // Skip if same status
        if ($new_status === $old_status) {
            return;
        }
        
        $event = null;
        
        // Determine event type
        if ($new_status === 'publish' && $old_status !== 'publish') {
            $event = 'post_published';
        } elseif ($new_status !== 'publish' && $old_status === 'publish') {
            $event = 'post_unpublished';
        } elseif ($new_status === 'publish' && $old_status === 'publish') {
            $event = 'post_updated';
        } elseif ($new_status === 'trash') {
            $event = 'post_trashed';
        }
        
        if (!$event) {
            return;
        }
        
        self::send_webhook($event, array(
            'post_id' => $post->ID,
            'post_title' => $post->post_title,
            'post_url' => get_permalink($post->ID),
            'post_status' => $new_status,
            'old_status' => $old_status,
            'author_id' => $post->post_author,
            'cfrdm_id' => get_post_meta($post->ID, '_cfrdm_article_id', true),
            'categories' => wp_get_post_categories($post->ID),
            'tags' => wp_get_post_tags($post->ID, array('fields' => 'ids')),
        ));
    }
    
    /**
     * Triggered before post deletion
     */
    public static function on_post_delete($post_id) {
        if (!get_option('cfrdm_webhook_enabled', true)) {
            return;
        }
        
        $post = get_post($post_id);
        
        if (!$post || $post->post_type !== 'post') {
            return;
        }
        
        self::send_webhook('post_deleted', array(
            'post_id' => $post_id,
            'post_title' => $post->post_title,
            'post_url' => get_permalink($post_id),
            'cfrdm_id' => get_post_meta($post_id, '_cfrdm_article_id', true),
        ));
    }
    
    /**
     * Send webhook to ContentFactory
     */
    public static function send_webhook($event, $data) {
        $api_url = get_option('cfrdm_api_url');
        
        if (empty($api_url)) {
            self::log('webhook_skipped', array(
                'event' => $event,
                'reason' => 'API URL not configured',
            ));
            return false;
        }
        
        // Build webhook URL
        $webhook_url = trailingslashit($api_url) . 'functions/v1/webhooks';
        $webhook_url = add_query_arg(array(
            'source' => 'wordpress',
            'event' => $event,
        ), $webhook_url);
        
        // Build payload
        $payload = array(
            'event' => $event,
            'timestamp' => current_time('c'),
            'site_url' => get_site_url(),
            'site_name' => get_bloginfo('name'),
            'data' => $data,
        );
        
        // Get webhook secret
        $secret = get_option('cfrdm_webhook_secret', get_option('cfrdm_api_key'));
        
        // Send request
        $response = wp_remote_post($webhook_url, array(
            'timeout' => 15,
            'headers' => array(
                'Content-Type' => 'application/json',
                'X-Webhook-Secret' => $secret,
                'X-CFRDM-Site' => get_site_url(),
            ),
            'body' => wp_json_encode($payload),
        ));
        
        $success = !is_wp_error($response) && wp_remote_retrieve_response_code($response) < 400;
        
        self::log('webhook_sent', array(
            'event' => $event,
            'url' => $webhook_url,
            'success' => $success,
            'response_code' => is_wp_error($response) ? 0 : wp_remote_retrieve_response_code($response),
            'error' => is_wp_error($response) ? $response->get_error_message() : null,
        ));
        
        return $success;
    }
    
    /**
     * Log actions
     */
    public static function log($action, $data = array()) {
        $logs = get_option('cfrdm_logs', array());
        
        // Keep only last 100 entries
        if (count($logs) >= 100) {
            $logs = array_slice($logs, -99);
        }
        
        $logs[] = array(
            'action' => $action,
            'data' => $data,
            'timestamp' => current_time('c'),
            'user_id' => get_current_user_id(),
        );
        
        update_option('cfrdm_logs', $logs);
    }
    
    /**
     * Get logs
     */
    public static function get_logs($limit = 50) {
        $logs = get_option('cfrdm_logs', array());
        return array_reverse(array_slice($logs, -$limit));
    }
    
    /**
     * Clear logs
     */
    public static function clear_logs() {
        update_option('cfrdm_logs', array());
    }
    
    /**
     * Test webhook connection
     */
    public static function test_webhook() {
        return self::send_webhook('test', array(
            'message' => __('Teste de conexão webhook', 'contentfactory-rdm'),
            'timestamp' => current_time('c'),
        ));
    }
}
