<?php
/**
 * Google Indexing API Direct Submitter
 * 
 * Sends URLs of posts, pages and products directly to Google's Indexing API
 * to accelerate crawling and indexing, instead of waiting for natural discovery.
 * 
 * Supports:
 * - Single URL submission (URL_UPDATED / URL_DELETED)
 * - Batch submission (up to 200 URLs/day quota)
 * - Auto-submit on publish/update for posts, pages, products
 * - REST API endpoints for external triggering
 * 
 * @package ContentFactory_RDM
 * @since 3.2.7
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_Google_Indexing_Submitter {
    
    const OPTION_ENABLED = 'cfrdm_google_indexing_enabled';
    const OPTION_POST_TYPES = 'cfrdm_google_indexing_post_types';
    const OPTION_DAILY_QUOTA = 'cfrdm_google_indexing_daily_count';
    const OPTION_QUOTA_DATE = 'cfrdm_google_indexing_quota_date';
    const MAX_DAILY_QUOTA = 200;
    
    private static $instance = null;
    
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    /**
     * Initialize
     */
    public function init() {
        if (!self::is_enabled()) {
            return;
        }
        
        // Auto-submit on publish for configured post types
        $post_types = self::get_post_types();
        foreach ($post_types as $pt) {
            add_action("publish_{$pt}", array($this, 'on_publish'), 150, 2);
        }
        
        // REST API
        add_action('rest_api_init', array($this, 'register_routes'));
    }
    
    public static function is_enabled() {
        return (bool) get_option(self::OPTION_ENABLED, true);
    }
    
    /**
     * Get post types to auto-submit
     */
    public static function get_post_types() {
        $defaults = array('post', 'page', 'product');
        return get_option(self::OPTION_POST_TYPES, $defaults);
    }
    
    /**
     * On publish — submit URL to Google Indexing API
     */
    public function on_publish($post_id, $post) {
        if (wp_is_post_revision($post_id) || wp_is_post_autosave($post_id)) {
            return;
        }
        
        $url = get_permalink($post_id);
        if (!$url) return;
        
        $result = $this->submit_url($url, 'URL_UPDATED');
        
        if ($result) {
            update_post_meta($post_id, '_cfrdm_google_indexing_submitted', current_time('mysql'));
            update_post_meta($post_id, '_cfrdm_google_indexing_type', 'URL_UPDATED');
        }
    }
    
    /**
     * Submit a single URL to Google Indexing API
     */
    public function submit_url($url, $type = 'URL_UPDATED') {
        // Check daily quota
        if (!$this->check_quota()) {
            CFRDM_Logger::warning('google_indexing', 'Quota diária atingida (200 URLs/dia)', array('url' => $url));
            return false;
        }
        
        // Get access token from GSC integration
        if (!class_exists('CFRDM_GSC_Integration') || !CFRDM_GSC_Integration::is_connected()) {
            // Fallback: use IndexNow instead
            if (class_exists('CFRDM_IndexNow')) {
                CFRDM_IndexNow::get_instance()->submit_indexnow($url);
                CFRDM_Logger::info('google_indexing', 'GSC não conectado, URL submetida via IndexNow', array('url' => $url));
                return true;
            }
            CFRDM_Logger::warning('google_indexing', 'GSC não conectado e IndexNow indisponível');
            return false;
        }
        
        $gsc = CFRDM_GSC_Integration::get_instance();
        $result = $gsc->request_indexing($url);
        
        if ($result) {
            $this->increment_quota();
            CFRDM_Logger::success('google_indexing', 'URL submetida à Google Indexing API', array(
                'url' => $url,
                'type' => $type,
            ));
            
            // Also submit to IndexNow for other engines
            if (class_exists('CFRDM_IndexNow')) {
                try {
                    CFRDM_IndexNow::get_instance()->submit_indexnow($url);
                } catch (\Throwable $e) {
                    // Silent
                }
            }
        }
        
        return $result;
    }
    
    /**
     * Submit batch of URLs
     */
    public function submit_batch($urls) {
        $results = array('submitted' => 0, 'failed' => 0, 'quota_exceeded' => 0);
        
        foreach ($urls as $url) {
            if (!$this->check_quota()) {
                $results['quota_exceeded']++;
                continue;
            }
            
            $ok = $this->submit_url($url);
            if ($ok) {
                $results['submitted']++;
            } else {
                $results['failed']++;
            }
            
            // Rate limiting: 100ms between submissions
            usleep(100000);
        }
        
        CFRDM_Logger::info('google_indexing', 'Batch submission concluído', $results);
        return $results;
    }
    
    /**
     * Check if daily quota allows more submissions
     */
    private function check_quota() {
        $today = date('Y-m-d');
        $quota_date = get_option(self::OPTION_QUOTA_DATE, '');
        
        if ($quota_date !== $today) {
            // New day — reset
            update_option(self::OPTION_DAILY_QUOTA, 0);
            update_option(self::OPTION_QUOTA_DATE, $today);
            return true;
        }
        
        $count = (int) get_option(self::OPTION_DAILY_QUOTA, 0);
        return $count < self::MAX_DAILY_QUOTA;
    }
    
    /**
     * Increment daily quota counter
     */
    private function increment_quota() {
        $count = (int) get_option(self::OPTION_DAILY_QUOTA, 0);
        update_option(self::OPTION_DAILY_QUOTA, $count + 1);
    }
    
    /**
     * Register REST routes
     */
    public function register_routes() {
        register_rest_route('cfrdm/v1', '/google-indexing/submit', array(
            'methods' => 'POST',
            'callback' => array($this, 'rest_submit'),
            'permission_callback' => function() {
                return CFRDM_API::verify_api_key();
            },
        ));
        
        register_rest_route('cfrdm/v1', '/google-indexing/batch', array(
            'methods' => 'POST',
            'callback' => array($this, 'rest_batch'),
            'permission_callback' => function() {
                return CFRDM_API::verify_api_key();
            },
        ));
        
        register_rest_route('cfrdm/v1', '/google-indexing/status', array(
            'methods' => 'GET',
            'callback' => array($this, 'rest_status'),
            'permission_callback' => function() {
                return CFRDM_API::verify_api_key();
            },
        ));
    }
    
    /**
     * REST: Submit single URL
     */
    public function rest_submit($request) {
        $params = $request->get_json_params();
        $url = $params['url'] ?? '';
        $type = $params['type'] ?? 'URL_UPDATED';
        
        if (empty($url)) {
            return new WP_Error('missing_url', 'URL é obrigatória', array('status' => 400));
        }
        
        $result = $this->submit_url($url, $type);
        
        return rest_ensure_response(array(
            'success' => $result,
            'url' => $url,
            'type' => $type,
            'quota_remaining' => self::MAX_DAILY_QUOTA - (int) get_option(self::OPTION_DAILY_QUOTA, 0),
        ));
    }
    
    /**
     * REST: Batch submit
     */
    public function rest_batch($request) {
        $params = $request->get_json_params();
        $urls = $params['urls'] ?? array();
        
        if (empty($urls)) {
            // Auto-collect recent published posts/pages/products
            $urls = $this->collect_recent_urls();
        }
        
        $results = $this->submit_batch($urls);
        
        return rest_ensure_response(array(
            'success' => true,
            'results' => $results,
            'total_urls' => count($urls),
            'quota_remaining' => self::MAX_DAILY_QUOTA - (int) get_option(self::OPTION_DAILY_QUOTA, 0),
        ));
    }
    
    /**
     * REST: Get indexing status
     */
    public function rest_status() {
        $today = date('Y-m-d');
        $quota_date = get_option(self::OPTION_QUOTA_DATE, $today);
        $count = ($quota_date === $today) ? (int) get_option(self::OPTION_DAILY_QUOTA, 0) : 0;
        
        // Get recently submitted posts
        global $wpdb;
        $submitted = $wpdb->get_results(
            "SELECT p.ID, p.post_title, p.post_type, p.post_status,
                    pm.meta_value as submitted_at
             FROM {$wpdb->posts} p
             INNER JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_cfrdm_google_indexing_submitted'
             ORDER BY pm.meta_value DESC
             LIMIT 50"
        );
        
        $recent = array();
        foreach ($submitted as $s) {
            $recent[] = array(
                'id' => $s->ID,
                'title' => $s->post_title,
                'type' => $s->post_type,
                'status' => $s->post_status,
                'url' => get_permalink($s->ID),
                'submitted_at' => $s->submitted_at,
            );
        }
        
        return rest_ensure_response(array(
            'success' => true,
            'enabled' => self::is_enabled(),
            'gsc_connected' => class_exists('CFRDM_GSC_Integration') && CFRDM_GSC_Integration::is_connected(),
            'quota' => array(
                'used' => $count,
                'max' => self::MAX_DAILY_QUOTA,
                'remaining' => self::MAX_DAILY_QUOTA - $count,
                'date' => $today,
            ),
            'post_types' => self::get_post_types(),
            'recent_submissions' => $recent,
        ));
    }
    
    /**
     * Collect recent URLs for batch submission
     */
    private function collect_recent_urls($limit = 50) {
        $post_types = self::get_post_types();
        $args = array(
            'post_type' => $post_types,
            'post_status' => 'publish',
            'posts_per_page' => $limit,
            'orderby' => 'modified',
            'order' => 'DESC',
            'fields' => 'ids',
        );
        
        $posts = get_posts($args);
        $urls = array();
        foreach ($posts as $post_id) {
            $urls[] = get_permalink($post_id);
        }
        return $urls;
    }
}
