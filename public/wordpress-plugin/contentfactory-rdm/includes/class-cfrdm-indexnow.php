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
        
        // Process queued URLs every 5 minutes
        add_action('cfrdm_indexnow_process_queue', array($this, 'process_queue'));
        if (!wp_next_scheduled('cfrdm_indexnow_process_queue')) {
            wp_schedule_event(time(), 'five_minutes', 'cfrdm_indexnow_process_queue');
        }
        
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
     * On post publish - notify all engines + trigger meta audit
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
        
        // Trigger meta audit on publish to ensure SEO meta is complete
        if (class_exists('CFRDM_Meta_Auditor')) {
            try {
                if (CFRDM_Method_Validator::safe_call('CFRDM_Meta_Auditor', 'is_enabled', array(), false)) {
                    $auditor = CFRDM_Meta_Auditor::get_instance();
                    $auditor->audit_single_post($post_id);
                }
            } catch (\Throwable $e) {
                CFRDM_Logger::warning('indexnow', 'Meta audit falhou: ' . $e->getMessage());
            }
        }
        
        // Invalidate llms.txt cache
        if (class_exists('CFRDM_LLMS_Txt')) {
            try {
                CFRDM_LLMS_Txt::get_instance()->invalidate_cache();
            } catch (\Throwable $e) {
                CFRDM_Logger::warning('indexnow', 'LLMS cache invalidation falhou: ' . $e->getMessage());
            }
        }
        
        CFRDM_Logger::success('indexnow', 'URL submetida para indexação + meta auditada', array(
            'url' => $url,
            'post_id' => $post_id,
        ), $post_id);
    }
    
    /**
     * Submit URL to IndexNow API with retry + backoff for 429
     */
    public function submit_indexnow($url, $attempt = 0) {
        $key = self::get_key();
        if (empty($key)) return false;
        
        // Rate limit: max 10 submissions per minute
        $throttle_key = 'cfrdm_indexnow_throttle';
        $count = (int) get_transient($throttle_key);
        if ($count >= 10) {
            // Queue for later instead of hammering the API
            $queued = get_option('cfrdm_indexnow_queue', array());
            $urls = is_array($url) ? $url : array($url);
            $queued = array_merge($queued, $urls);
            update_option('cfrdm_indexnow_queue', array_unique($queued));
            CFRDM_Logger::info('indexnow', 'URL enfileirada (rate limit local)', array('url' => $url));
            return true;
        }
        
        $host = parse_url(get_site_url(), PHP_URL_HOST);
        
        $body = array(
            'host' => $host,
            'key' => $key,
            'keyLocation' => get_site_url() . '/' . $key . '.txt',
            'urlList' => is_array($url) ? $url : array($url),
        );
        
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
        
        // Handle 429 Too Many Requests with exponential backoff (max 3 retries)
        if ($status === 429 && $attempt < 3) {
            $delay = pow(2, $attempt + 1); // 2s, 4s, 8s
            CFRDM_Logger::warning('indexnow', "429 recebido, retry #{$attempt} em {$delay}s", array('url' => $url));
            sleep($delay);
            return $this->submit_indexnow($url, $attempt + 1);
        }
        
        if (in_array($status, array(200, 202))) {
            set_transient($throttle_key, $count + 1, 60);
            return true;
        }
        
        CFRDM_Logger::warning('indexnow', "IndexNow retornou status {$status}", array('url' => $url, 'status' => $status));
        return false;
    }
    
    /**
     * Process queued URLs (called via WP-Cron or manually)
     */
    public function process_queue() {
        $queued = get_option('cfrdm_indexnow_queue', array());
        if (empty($queued)) return;
        
        $batch = array_splice($queued, 0, 10);
        update_option('cfrdm_indexnow_queue', $queued);
        
        $this->submit_indexnow($batch);
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
