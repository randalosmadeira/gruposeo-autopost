<?php
/**
 * IndexNow + Search Engine Ping
 * 
 * Instantly notifies search engines when content is published/updated:
 * - IndexNow API (Bing, Yandex, DuckDuckGo, etc.)
 * - Google Ping (via sitemaps ping)
 * - Bing Webmaster Ping
 * 
 * @package ContentFactory_RDM
 * @since 3.1.0
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_IndexNow {
    
    const OPTION_ENABLED = 'cfrdm_indexnow_enabled';
    const OPTION_KEY = 'cfrdm_indexnow_key';
    const OPTION_GOOGLE_PING = 'cfrdm_google_ping_enabled';
    const OPTION_BING_PING = 'cfrdm_bing_ping_enabled';
    
    private static $instance = null;
    
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    /**
     * Initialize IndexNow
     */
    public function init() {
        if (!self::is_enabled()) {
            return;
        }
        
        // Auto-notify on publish/update
        add_action('publish_post', array($this, 'on_post_publish'), 200, 2);
        add_action('publish_page', array($this, 'on_post_publish'), 200, 2);
        
        // Generate key file endpoint
        add_action('init', array($this, 'serve_key_file'));
        
        // Ensure key exists
        $this->ensure_key();
    }
    
    public static function is_enabled() {
        return (bool) get_option(self::OPTION_ENABLED, true);
    }
    
    /**
     * Ensure IndexNow key exists
     */
    private function ensure_key() {
        if (empty(get_option(self::OPTION_KEY))) {
            $key = wp_generate_password(32, false);
            update_option(self::OPTION_KEY, $key);
        }
    }
    
    /**
     * Get IndexNow key
     */
    public static function get_key() {
        return get_option(self::OPTION_KEY, '');
    }
    
    /**
     * Serve the IndexNow key verification file
     */
    public function serve_key_file() {
        $key = self::get_key();
        if (empty($key)) return;
        
        $request_uri = $_SERVER['REQUEST_URI'] ?? '';
        if ($request_uri === '/' . $key . '.txt') {
            header('Content-Type: text/plain');
            echo $key;
            exit;
        }
    }
    
    /**
     * On post publish - notify all engines
     */
    public function on_post_publish($post_id, $post) {
        if (wp_is_post_revision($post_id) || wp_is_post_autosave($post_id)) {
            return;
        }
        
        $url = get_permalink($post_id);
        if (!$url) return;
        
        // Submit to IndexNow (async)
        $this->submit_indexnow($url);
        
        // Ping Google
        if (get_option(self::OPTION_GOOGLE_PING, true)) {
            $this->ping_google();
        }
        
        // Ping Bing
        if (get_option(self::OPTION_BING_PING, true)) {
            $this->ping_bing($url);
        }
        
        CFRDM_Logger::success('indexnow', 'URL submetida para indexação', array(
            'url' => $url,
            'post_id' => $post_id,
        ), $post_id);
    }
    
    /**
     * Submit URL to IndexNow API
     */
    public function submit_indexnow($url) {
        $key = self::get_key();
        if (empty($key)) return false;
        
        $host = parse_url(get_site_url(), PHP_URL_HOST);
        
        $body = array(
            'host' => $host,
            'key' => $key,
            'keyLocation' => get_site_url() . '/' . $key . '.txt',
            'urlList' => is_array($url) ? $url : array($url),
        );
        
        // Submit to IndexNow API (Bing endpoint - redistributes to all partners)
        $response = wp_remote_post('https://api.indexnow.org/indexnow', array(
            'timeout' => 15,
            'headers' => array('Content-Type' => 'application/json'),
            'body' => wp_json_encode($body),
        ));
        
        if (is_wp_error($response)) {
            CFRDM_Logger::error('indexnow', 'Erro ao submeter IndexNow', array(
                'error' => $response->get_error_message(),
            ));
            return false;
        }
        
        $status = wp_remote_retrieve_response_code($response);
        return in_array($status, array(200, 202));
    }
    
    /**
     * Submit multiple URLs at once
     */
    public function submit_batch($urls) {
        if (empty($urls)) return false;
        return $this->submit_indexnow($urls);
    }
    
    /**
     * Ping Google via sitemap
     */
    private function ping_google() {
        $sitemap_url = $this->get_sitemap_url();
        if (!$sitemap_url) return;
        
        wp_remote_get('https://www.google.com/ping?sitemap=' . urlencode($sitemap_url), array(
            'timeout' => 10,
            'blocking' => false,
        ));
    }
    
    /**
     * Ping Bing
     */
    private function ping_bing($url) {
        wp_remote_get('https://www.bing.com/ping?url=' . urlencode($url), array(
            'timeout' => 10,
            'blocking' => false,
        ));
    }
    
    /**
     * Get sitemap URL (auto-detect)
     */
    private function get_sitemap_url() {
        $possible = array(
            get_site_url() . '/sitemap_index.xml',  // Yoast
            get_site_url() . '/sitemap.xml',          // Generic
            get_site_url() . '/wp-sitemap.xml',       // WordPress core
        );
        
        foreach ($possible as $url) {
            $response = wp_remote_head($url, array('timeout' => 5));
            if (!is_wp_error($response) && wp_remote_retrieve_response_code($response) === 200) {
                return $url;
            }
        }
        
        return get_site_url() . '/wp-sitemap.xml';
    }
}
