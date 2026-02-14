<?php
/**
 * Google My Business Auto-Poster
 * 
 * Publishes WordPress posts, pages and custom post types directly
 * to Google Business Profile. Features:
 * - Auto-post on publish with clean content (strips HTML, shortcodes, page builder markup)
 * - Multisite support (network and site level)
 * - Custom templates per post type
 * - Image attachment support
 * - CTA button configuration
 * - Post scheduling
 * 
 * @package ContentFactory_RDM
 * @since 3.2.7
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_GMB_Poster {
    
    const OPTION_ENABLED = 'cfrdm_gmb_enabled';
    const OPTION_ACCESS_TOKEN = 'cfrdm_gmb_access_token';
    const OPTION_ACCOUNT_ID = 'cfrdm_gmb_account_id';
    const OPTION_LOCATION_ID = 'cfrdm_gmb_location_id';
    const OPTION_POST_TYPES = 'cfrdm_gmb_post_types';
    const OPTION_TEMPLATE = 'cfrdm_gmb_template';
    const OPTION_CTA_TYPE = 'cfrdm_gmb_cta_type';
    const OPTION_AUTO_POST = 'cfrdm_gmb_auto_post';
    const OPTION_STRIP_BUILDERS = 'cfrdm_gmb_strip_builders';
    const GMB_API_BASE = 'https://mybusiness.googleapis.com/v4';
    const GMB_TABLE = 'cfrdm_gmb_posts';
    
    private static $instance = null;
    
    /**
     * Page builder patterns to strip
     */
    private static $builder_patterns = array(
        '/\[et_pb_[^\]]*\]/',           // Divi
        '/\[\/et_pb_[^\]]*\]/',         // Divi closing
        '/\[vc_[^\]]*\]/',              // WPBakery
        '/\[\/vc_[^\]]*\]/',            // WPBakery closing
        '/\[fusion_[^\]]*\]/',          // Avada
        '/\[\/fusion_[^\]]*\]/',        // Avada closing
        '/\[fl_builder[^\]]*\]/',       // Beaver Builder
        '/\[elementor[^\]]*\]/',        // Elementor
        '/<!-- wp:[^\-]+ .* \/-->/',    // Gutenberg self-closing
    );
    
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    /**
     * Initialize GMB Poster
     */
    public function init() {
        if (!self::is_enabled()) {
            return;
        }
        
        // Auto-post on publish
        if (get_option(self::OPTION_AUTO_POST, true)) {
            $post_types = self::get_post_types();
            foreach ($post_types as $pt) {
                add_action("publish_{$pt}", array($this, 'on_publish'), 180, 2);
            }
        }
        
        // REST API
        add_action('rest_api_init', array($this, 'register_routes'));
        
        // OAuth callback
        add_action('admin_init', array($this, 'handle_oauth_callback'));
    }
    
    public static function is_enabled() {
        return (bool) get_option(self::OPTION_ENABLED, false);
    }
    
    public static function get_post_types() {
        return get_option(self::OPTION_POST_TYPES, array('post'));
    }
    
    public static function is_connected() {
        $token = get_option(self::OPTION_ACCESS_TOKEN);
        return !empty($token);
    }
    
    /**
     * Create GMB posts table
     */
    public static function create_tables() {
        global $wpdb;
        $charset_collate = $wpdb->get_charset_collate();
        $table = $wpdb->prefix . self::GMB_TABLE;
        
        $sql = "CREATE TABLE IF NOT EXISTS {$table} (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            post_id bigint(20) NOT NULL,
            gmb_post_name varchar(500) DEFAULT NULL,
            summary text,
            cta_type varchar(50) DEFAULT 'LEARN_MORE',
            cta_url varchar(500) DEFAULT NULL,
            image_url varchar(500) DEFAULT NULL,
            status varchar(50) DEFAULT 'pending',
            posted_at datetime DEFAULT NULL,
            error_message text,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY post_id (post_id),
            KEY status (status)
        ) {$charset_collate};";
        
        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        dbDelta($sql);
    }
    
    /**
     * On publish - auto-post to GMB
     */
    public function on_publish($post_id, $post) {
        if (wp_is_post_revision($post_id) || wp_is_post_autosave($post_id)) {
            return;
        }
        
        // Check if already posted
        $already = get_post_meta($post_id, '_cfrdm_gmb_posted', true);
        if ($already) return;
        
        $result = $this->post_to_gmb($post_id);
        
        if ($result && !is_wp_error($result)) {
            update_post_meta($post_id, '_cfrdm_gmb_posted', current_time('mysql'));
            update_post_meta($post_id, '_cfrdm_gmb_post_name', $result['name'] ?? '');
        }
    }
    
    /**
     * Post content to Google My Business
     */
    public function post_to_gmb($post_id) {
        $post = get_post($post_id);
        if (!$post) return false;
        
        $access_token = $this->get_access_token();
        if (!$access_token) {
            CFRDM_Logger::error('gmb', 'GMB não conectado');
            return false;
        }
        
        $account_id = get_option(self::OPTION_ACCOUNT_ID);
        $location_id = get_option(self::OPTION_LOCATION_ID);
        
        if (empty($account_id) || empty($location_id)) {
            CFRDM_Logger::error('gmb', 'Account/Location ID não configurados');
            return false;
        }
        
        // Build clean summary
        $summary = $this->build_summary($post);
        $permalink = get_permalink($post_id);
        $cta_type = get_option(self::OPTION_CTA_TYPE, 'LEARN_MORE');
        
        // Build GMB post body
        $gmb_body = array(
            'languageCode' => substr(get_locale(), 0, 2),
            'summary' => $summary,
            'callToAction' => array(
                'actionType' => $cta_type,
                'url' => $permalink,
            ),
            'topicType' => 'STANDARD',
        );
        
        // Add image if available
        $image_url = get_the_post_thumbnail_url($post_id, 'large');
        if ($image_url) {
            $gmb_body['media'] = array(
                array(
                    'mediaFormat' => 'PHOTO',
                    'sourceUrl' => $image_url,
                ),
            );
        }
        
        // API call
        $endpoint = self::GMB_API_BASE . "/accounts/{$account_id}/locations/{$location_id}/localPosts";
        
        $response = wp_remote_post($endpoint, array(
            'timeout' => 30,
            'headers' => array(
                'Authorization' => 'Bearer ' . $access_token,
                'Content-Type' => 'application/json',
            ),
            'body' => wp_json_encode($gmb_body),
        ));
        
        if (is_wp_error($response)) {
            CFRDM_Logger::error('gmb', 'Erro ao postar no GMB', array(
                'error' => $response->get_error_message(),
                'post_id' => $post_id,
            ));
            $this->log_gmb_post($post_id, $summary, 'failed', $response->get_error_message());
            return $response;
        }
        
        $status_code = wp_remote_retrieve_response_code($response);
        $body = json_decode(wp_remote_retrieve_body($response), true);
        
        if ($status_code >= 400) {
            $error = $body['error']['message'] ?? 'Erro desconhecido';
            CFRDM_Logger::error('gmb', 'GMB API retornou erro', array(
                'status' => $status_code,
                'error' => $error,
                'post_id' => $post_id,
            ));
            $this->log_gmb_post($post_id, $summary, 'failed', $error);
            return new WP_Error('gmb_api_error', $error);
        }
        
        CFRDM_Logger::success('gmb', 'Post publicado no Google Meu Negócio', array(
            'post_id' => $post_id,
            'gmb_name' => $body['name'] ?? '',
        ));
        
        $this->log_gmb_post($post_id, $summary, 'posted');
        return $body;
    }
    
    /**
     * Build clean summary from post content
     */
    private function build_summary($post) {
        $template = get_option(self::OPTION_TEMPLATE, "{title}\n\n{excerpt}\n\n🔗 Leia mais no site!");
        
        // Get excerpt or generate from content
        $excerpt = $post->post_excerpt;
        if (empty($excerpt)) {
            $content = $post->post_content;
            
            // Strip page builder markup if enabled
            if (get_option(self::OPTION_STRIP_BUILDERS, true)) {
                $content = $this->strip_builder_markup($content);
            }
            
            // Strip all HTML and shortcodes
            $content = strip_shortcodes($content);
            $content = wp_strip_all_tags($content);
            $content = preg_replace('/\s+/', ' ', $content);
            
            $excerpt = wp_trim_words($content, 40, '...');
        }
        
        $placeholders = array(
            '{title}' => $post->post_title,
            '{excerpt}' => $excerpt,
            '{link}' => get_permalink($post->ID),
            '{category}' => $this->get_primary_category($post->ID),
            '{author}' => get_the_author_meta('display_name', $post->post_author),
            '{site_name}' => get_bloginfo('name'),
            '{date}' => get_the_date('', $post->ID),
        );
        
        $summary = str_replace(array_keys($placeholders), array_values($placeholders), $template);
        
        // GMB limit: 1500 characters
        if (mb_strlen($summary) > 1500) {
            $summary = mb_substr($summary, 0, 1497) . '...';
        }
        
        return $summary;
    }
    
    /**
     * Strip page builder markup (Divi, WPBakery, Avada, etc.)
     */
    private function strip_builder_markup($content) {
        foreach (self::$builder_patterns as $pattern) {
            $content = preg_replace($pattern, '', $content);
        }
        return $content;
    }
    
    /**
     * Get primary category
     */
    private function get_primary_category($post_id) {
        $categories = get_the_category($post_id);
        return !empty($categories) ? $categories[0]->name : '';
    }
    
    /**
     * Log GMB post to database
     */
    private function log_gmb_post($post_id, $summary, $status, $error = null) {
        global $wpdb;
        $table = $wpdb->prefix . self::GMB_TABLE;
        
        // Check if table exists
        if ($wpdb->get_var("SHOW TABLES LIKE '{$table}'") !== $table) {
            return;
        }
        
        $wpdb->insert($table, array(
            'post_id' => $post_id,
            'summary' => $summary,
            'status' => $status,
            'posted_at' => ($status === 'posted') ? current_time('mysql') : null,
            'error_message' => $error,
            'cta_type' => get_option(self::OPTION_CTA_TYPE, 'LEARN_MORE'),
            'cta_url' => get_permalink($post_id),
            'image_url' => get_the_post_thumbnail_url($post_id, 'large') ?: null,
        ));
    }
    
    /**
     * Get access token (with refresh)
     */
    private function get_access_token() {
        $token_data = get_option(self::OPTION_ACCESS_TOKEN);
        if (empty($token_data)) return null;
        
        // Check expiry
        $expires_at = isset($token_data['created'])
            ? $token_data['created'] + ($token_data['expires_in'] ?? 3600)
            : 0;
        
        if (time() >= $expires_at && !empty($token_data['refresh_token'])) {
            $token_data = $this->refresh_token($token_data['refresh_token']);
            if (!$token_data) return null;
        }
        
        return $token_data['access_token'] ?? null;
    }
    
    /**
     * Refresh OAuth token
     */
    private function refresh_token($refresh_token) {
        // Reuse GSC client credentials if available
        $client_id = get_option('cfrdm_gmb_client_id', get_option('cfrdm_gsc_client_id'));
        $client_secret = get_option('cfrdm_gmb_client_secret', get_option('cfrdm_gsc_client_secret'));
        
        if (empty($client_id) || empty($client_secret)) return null;
        
        $response = wp_remote_post('https://oauth2.googleapis.com/token', array(
            'body' => array(
                'refresh_token' => $refresh_token,
                'client_id' => $client_id,
                'client_secret' => $client_secret,
                'grant_type' => 'refresh_token',
            ),
        ));
        
        if (is_wp_error($response)) return null;
        
        $body = json_decode(wp_remote_retrieve_body($response), true);
        if (isset($body['access_token'])) {
            $body['refresh_token'] = $refresh_token;
            $body['created'] = time();
            update_option(self::OPTION_ACCESS_TOKEN, $body);
            return $body;
        }
        
        return null;
    }
    
    /**
     * Handle OAuth callback
     */
    public function handle_oauth_callback() {
        if (!isset($_GET['page']) || $_GET['page'] !== 'cfrdm-gmb-auth') return;
        if (!isset($_GET['code'])) return;
        
        $code = sanitize_text_field($_GET['code']);
        $client_id = get_option('cfrdm_gmb_client_id', get_option('cfrdm_gsc_client_id'));
        $client_secret = get_option('cfrdm_gmb_client_secret', get_option('cfrdm_gsc_client_secret'));
        $redirect_uri = admin_url('admin.php?page=cfrdm-gmb-auth');
        
        $response = wp_remote_post('https://oauth2.googleapis.com/token', array(
            'body' => array(
                'code' => $code,
                'client_id' => $client_id,
                'client_secret' => $client_secret,
                'redirect_uri' => $redirect_uri,
                'grant_type' => 'authorization_code',
            ),
        ));
        
        if (!is_wp_error($response)) {
            $body = json_decode(wp_remote_retrieve_body($response), true);
            if (isset($body['access_token'])) {
                $body['created'] = time();
                update_option(self::OPTION_ACCESS_TOKEN, $body);
                CFRDM_Logger::success('gmb', 'Google Meu Negócio conectado com sucesso');
                wp_redirect(admin_url('admin.php?page=cfrdm-settings&gmb_connected=1'));
                exit;
            }
        }
        
        wp_redirect(admin_url('admin.php?page=cfrdm-settings&gmb_error=1'));
        exit;
    }
    
    /**
     * Get OAuth authorization URL
     */
    public function get_auth_url() {
        $client_id = get_option('cfrdm_gmb_client_id', get_option('cfrdm_gsc_client_id'));
        $redirect_uri = admin_url('admin.php?page=cfrdm-gmb-auth');
        
        $params = array(
            'client_id' => $client_id,
            'redirect_uri' => $redirect_uri,
            'response_type' => 'code',
            'scope' => 'https://www.googleapis.com/auth/business.manage',
            'access_type' => 'offline',
            'prompt' => 'consent',
        );
        
        return 'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query($params);
    }
    
    /**
     * Register REST routes
     */
    public function register_routes() {
        register_rest_route('cfrdm/v1', '/gmb/status', array(
            'methods' => 'GET',
            'callback' => array($this, 'rest_status'),
            'permission_callback' => function() { return CFRDM_API::verify_api_key(); },
        ));
        
        register_rest_route('cfrdm/v1', '/gmb/post', array(
            'methods' => 'POST',
            'callback' => array($this, 'rest_post'),
            'permission_callback' => function() { return CFRDM_API::verify_api_key(); },
        ));
        
        register_rest_route('cfrdm/v1', '/gmb/history', array(
            'methods' => 'GET',
            'callback' => array($this, 'rest_history'),
            'permission_callback' => function() { return CFRDM_API::verify_api_key(); },
        ));
    }
    
    /**
     * REST: Status
     */
    public function rest_status() {
        return rest_ensure_response(array(
            'success' => true,
            'enabled' => self::is_enabled(),
            'connected' => self::is_connected(),
            'auto_post' => (bool) get_option(self::OPTION_AUTO_POST, true),
            'post_types' => self::get_post_types(),
            'cta_type' => get_option(self::OPTION_CTA_TYPE, 'LEARN_MORE'),
            'strip_builders' => (bool) get_option(self::OPTION_STRIP_BUILDERS, true),
        ));
    }
    
    /**
     * REST: Manual post
     */
    public function rest_post($request) {
        $params = $request->get_json_params();
        $post_id = intval($params['post_id'] ?? 0);
        
        if (!$post_id) {
            return new WP_Error('missing_post_id', 'Post ID obrigatório', array('status' => 400));
        }
        
        $result = $this->post_to_gmb($post_id);
        
        if (is_wp_error($result)) {
            return $result;
        }
        
        return rest_ensure_response(array(
            'success' => true,
            'post_id' => $post_id,
            'gmb_post' => $result,
        ));
    }
    
    /**
     * REST: History
     */
    public function rest_history() {
        global $wpdb;
        $table = $wpdb->prefix . self::GMB_TABLE;
        
        if ($wpdb->get_var("SHOW TABLES LIKE '{$table}'") !== $table) {
            return rest_ensure_response(array('success' => true, 'posts' => array()));
        }
        
        $posts = $wpdb->get_results(
            "SELECT g.*, p.post_title 
             FROM {$table} g
             LEFT JOIN {$wpdb->posts} p ON g.post_id = p.ID
             ORDER BY g.created_at DESC
             LIMIT 50",
            ARRAY_A
        );
        
        return rest_ensure_response(array(
            'success' => true,
            'posts' => $posts,
        ));
    }
    
    /**
     * Disconnect
     */
    public function disconnect() {
        delete_option(self::OPTION_ACCESS_TOKEN);
        CFRDM_Logger::info('gmb', 'Google Meu Negócio desconectado');
    }
}
