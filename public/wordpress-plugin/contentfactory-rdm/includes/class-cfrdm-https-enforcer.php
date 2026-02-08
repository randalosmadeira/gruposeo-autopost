<?php
/**
 * HTTPS Enforcement Engine
 * 
 * Converte todos os links HTTP para HTTPS automaticamente
 * 
 * @package ContentFactory_RDM
 * @since 3.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_HTTPS_Enforcer {
    
    const OPTION_ENABLED = 'cfrdm_https_enforcer_enabled';
    const OPTION_LAST_SCAN = 'cfrdm_https_last_scan';
    const OPTION_AUTO_FIX = 'cfrdm_https_auto_fix';
    
    private static $instance = null;
    
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    /**
     * Initialize HTTPS enforcer
     */
    public function init() {
        // Auto-fix on save if enabled
        if (get_option(self::OPTION_AUTO_FIX, false)) {
            add_filter('content_save_pre', array($this, 'auto_fix_content'), 10, 1);
        }
        
        // Register cron job for bulk scanning
        add_action('cfrdm_https_scan', array($this, 'scan_all_posts'));
        
        // Schedule daily scan (WordPress doesn't have 'weekly' by default)
        if (!wp_next_scheduled('cfrdm_https_scan')) {
            wp_schedule_event(time(), 'daily', 'cfrdm_https_scan');
        }
    }
    
    /**
     * Check if enforcer is enabled
     */
    public static function is_enabled() {
        return get_option(self::OPTION_ENABLED, false);
    }
    
    /**
     * Scan all posts for HTTP links
     * 
     * @param int $limit Number of posts to scan
     * @return array Scan results
     */
    public function scan_all_posts($limit = 100) {
        $args = array(
            'post_type' => array('post', 'page'),
            'post_status' => 'publish',
            'posts_per_page' => $limit,
            'orderby' => 'modified',
            'order' => 'DESC',
        );
        
        $posts = get_posts($args);
        $results = array(
            'scanned' => 0,
            'with_http' => 0,
            'total_http_links' => 0,
            'posts' => array(),
        );
        
        foreach ($posts as $post) {
            $http_links = $this->scan_http_links($post->post_content);
            $results['scanned']++;
            
            if (!empty($http_links)) {
                $results['with_http']++;
                $results['total_http_links'] += count($http_links);
                $results['posts'][] = array(
                    'id' => $post->ID,
                    'title' => $post->post_title,
                    'http_count' => count($http_links),
                    'links' => array_slice($http_links, 0, 5), // First 5 for preview
                );
            }
        }
        
        update_option(self::OPTION_LAST_SCAN, array(
            'date' => current_time('mysql'),
            'results' => array(
                'scanned' => $results['scanned'],
                'with_http' => $results['with_http'],
                'total_http_links' => $results['total_http_links'],
            ),
        ));
        
        CFRDM_Logger::info('https_scan', 'Scan concluído', array(
            'scanned' => $results['scanned'],
            'with_http' => $results['with_http'],
            'total_links' => $results['total_http_links'],
        ));
        
        return $results;
    }
    
    /**
     * Scan content for HTTP links
     * 
     * @param string $content Post content
     * @return array List of HTTP links found
     */
    public function scan_http_links($content) {
        $http_links = array();
        $site_host = parse_url(get_site_url(), PHP_URL_HOST);
        
        // Find all URLs in content
        $patterns = array(
            // href attributes
            '/href=["\']http:\/\/([^"\']+)["\']/i',
            // src attributes
            '/src=["\']http:\/\/([^"\']+)["\']/i',
            // srcset attributes
            '/srcset=["\'][^"\']*http:\/\/([^"\']+)[^"\']*["\']/i',
            // data attributes
            '/data-[a-z-]+=["\']http:\/\/([^"\']+)["\']/i',
            // Background images in style
            '/url\(["\']?http:\/\/([^"\'\)\s]+)["\']?\)/i',
        );
        
        foreach ($patterns as $pattern) {
            if (preg_match_all($pattern, $content, $matches)) {
                foreach ($matches[0] as $match) {
                    // Extract the full URL
                    if (preg_match('/http:\/\/[^\s"\'<>]+/', $match, $url_match)) {
                        $url = $url_match[0];
                        
                        // Check if it's an internal link
                        $is_internal = strpos($url, $site_host) !== false;
                        
                        $http_links[] = array(
                            'url' => $url,
                            'is_internal' => $is_internal,
                        );
                    }
                }
            }
        }
        
        // Remove duplicates
        $unique_links = array();
        foreach ($http_links as $link) {
            $unique_links[$link['url']] = $link;
        }
        
        return array_values($unique_links);
    }
    
    /**
     * Convert HTTP to HTTPS in a post
     * 
     * @param int $post_id Post ID
     * @param bool $internal_only Only convert internal links
     * @return array Conversion results
     */
    public function convert_to_https($post_id, $internal_only = false) {
        $post = get_post($post_id);
        
        if (!$post) {
            return array('success' => false, 'error' => 'Post não encontrado');
        }
        
        $original_content = $post->post_content;
        $converted_content = $this->convert_content_to_https($original_content, $internal_only);
        
        $changes = $original_content !== $converted_content;
        
        if ($changes) {
            // Update post
            wp_update_post(array(
                'ID' => $post_id,
                'post_content' => $converted_content,
            ));
            
            // Count changes
            $original_http = preg_match_all('/http:\/\//', $original_content, $m1);
            $new_http = preg_match_all('/http:\/\//', $converted_content, $m2);
            $converted_count = $original_http - $new_http;
            
            CFRDM_Logger::success('https_convert', 'Links HTTP convertidos', array(
                'post_id' => $post_id,
                'converted' => $converted_count,
            ));
            
            return array(
                'success' => true,
                'converted' => $converted_count,
            );
        }
        
        return array(
            'success' => true,
            'converted' => 0,
            'message' => 'Nenhum link HTTP encontrado',
        );
    }
    
    /**
     * Convert content HTTP links to HTTPS
     * 
     * @param string $content Content to convert
     * @param bool $internal_only Only convert internal links
     * @return string Converted content
     */
    public function convert_content_to_https($content, $internal_only = false) {
        $site_host = parse_url(get_site_url(), PHP_URL_HOST);
        
        if ($internal_only) {
            // Only convert internal links
            $pattern = '/http:\/\/' . preg_quote($site_host, '/') . '/i';
            $content = preg_replace($pattern, 'https://' . $site_host, $content);
        } else {
            // Convert all HTTP to HTTPS
            // First, convert internal links
            $content = str_replace('http://' . $site_host, 'https://' . $site_host, $content);
            
            // Then, try to convert external links (only if they support HTTPS)
            $content = preg_replace_callback(
                '/http:\/\/([^\s"\'<>]+)/i',
                array($this, 'maybe_convert_external_link'),
                $content
            );
        }
        
        return $content;
    }
    
    /**
     * Maybe convert external link to HTTPS
     */
    private function maybe_convert_external_link($matches) {
        $url = 'http://' . $matches[1];
        $site_host = parse_url(get_site_url(), PHP_URL_HOST);
        
        // Skip if it's internal (already handled)
        if (strpos($matches[1], $site_host) === 0) {
            return 'https://' . $matches[1];
        }
        
        // For external links, check if HTTPS is available
        if ($this->verify_external_ssl($matches[1])) {
            return 'https://' . $matches[1];
        }
        
        // Keep as HTTP if HTTPS not available
        return $url;
    }
    
    /**
     * Auto-fix content on save
     */
    public function auto_fix_content($content) {
        // Only convert internal links on auto-fix
        return $this->convert_content_to_https($content, true);
    }
    
    /**
     * Bulk update database
     * 
     * @param bool $internal_only Only convert internal links
     * @return array Update results
     */
    public function bulk_update_database($internal_only = true) {
        global $wpdb;
        
        $site_host = parse_url(get_site_url(), PHP_URL_HOST);
        $site_http = 'http://' . $site_host;
        $site_https = 'https://' . $site_host;
        
        // Update post content
        $posts_updated = $wpdb->query($wpdb->prepare(
            "UPDATE {$wpdb->posts} 
             SET post_content = REPLACE(post_content, %s, %s)
             WHERE post_content LIKE %s",
            $site_http,
            $site_https,
            '%' . $wpdb->esc_like($site_http) . '%'
        ));
        
        // Update post meta
        $meta_updated = $wpdb->query($wpdb->prepare(
            "UPDATE {$wpdb->postmeta} 
             SET meta_value = REPLACE(meta_value, %s, %s)
             WHERE meta_value LIKE %s",
            $site_http,
            $site_https,
            '%' . $wpdb->esc_like($site_http) . '%'
        ));
        
        // Update options
        $options_updated = $wpdb->query($wpdb->prepare(
            "UPDATE {$wpdb->options} 
             SET option_value = REPLACE(option_value, %s, %s)
             WHERE option_value LIKE %s
             AND option_name NOT LIKE '%_transient%'",
            $site_http,
            $site_https,
            '%' . $wpdb->esc_like($site_http) . '%'
        ));
        
        // Clear caches
        wp_cache_flush();
        
        $results = array(
            'success' => true,
            'posts_updated' => $posts_updated,
            'meta_updated' => $meta_updated,
            'options_updated' => $options_updated,
        );
        
        CFRDM_Logger::success('https_bulk', 'Atualização em massa concluída', $results);
        
        return $results;
    }
    
    /**
     * Verify if external URL supports SSL
     * 
     * @param string $host Hostname to check
     * @return bool
     */
    public function verify_external_ssl($host) {
        // Extract just the host if full URL was passed
        if (strpos($host, '/') !== false) {
            $host = parse_url('http://' . $host, PHP_URL_HOST);
        }
        
        // Cache results
        $cache_key = 'cfrdm_ssl_check_' . md5($host);
        $cached = get_transient($cache_key);
        
        if ($cached !== false) {
            return $cached === 'yes';
        }
        
        // Try to connect via HTTPS
        $response = wp_remote_head('https://' . $host, array(
            'timeout' => 5,
            'sslverify' => true,
        ));
        
        $supports_ssl = !is_wp_error($response);
        
        // Cache for 1 week
        set_transient($cache_key, $supports_ssl ? 'yes' : 'no', WEEK_IN_SECONDS);
        
        return $supports_ssl;
    }
    
    /**
     * Get statistics
     */
    public static function get_stats() {
        global $wpdb;
        
        $site_host = parse_url(get_site_url(), PHP_URL_HOST);
        $http_pattern = '%http://' . $wpdb->esc_like($site_host) . '%';
        
        // Count posts with HTTP links
        $posts_with_http = $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->posts} 
             WHERE post_status = 'publish' 
             AND post_content LIKE %s",
            $http_pattern
        ));
        
        $last_scan = get_option(self::OPTION_LAST_SCAN);
        
        return array(
            'posts_with_http' => $posts_with_http,
            'last_scan' => $last_scan['date'] ?? null,
            'last_results' => $last_scan['results'] ?? null,
            'enabled' => self::is_enabled(),
            'auto_fix' => get_option(self::OPTION_AUTO_FIX, false),
        );
    }
    
    /**
     * Handle AJAX scan request
     */
    public static function ajax_scan() {
        check_ajax_referer('cfrdm_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Permissão negada');
        }
        
        $instance = self::get_instance();
        $results = $instance->scan_all_posts(100);
        
        wp_send_json_success($results);
    }
    
    /**
     * Handle AJAX bulk convert request
     */
    public static function ajax_bulk_convert() {
        check_ajax_referer('cfrdm_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Permissão negada');
        }
        
        $internal_only = isset($_POST['internal_only']) ? (bool) $_POST['internal_only'] : true;
        
        $instance = self::get_instance();
        $results = $instance->bulk_update_database($internal_only);
        
        wp_send_json_success($results);
    }
    
    /**
     * Handle AJAX single post convert
     */
    public static function ajax_convert_post() {
        check_ajax_referer('cfrdm_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Permissão negada');
        }
        
        $post_id = intval($_POST['post_id'] ?? 0);
        
        if (!$post_id) {
            wp_send_json_error('Post ID inválido');
        }
        
        $instance = self::get_instance();
        $results = $instance->convert_to_https($post_id, false);
        
        if ($results['success']) {
            wp_send_json_success($results);
        } else {
            wp_send_json_error($results['error']);
        }
    }
}
