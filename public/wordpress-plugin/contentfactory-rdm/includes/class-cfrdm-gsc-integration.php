<?php
/**
 * Google Search Console Integration
 * 
 * Conecta com GSC API via OAuth 2.0, baixa dados de indexação,
 * identifica problemas e cria filas de correção
 * 
 * @package ContentFactory_RDM
 * @since 3.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_GSC_Integration {
    
    const OPTION_CLIENT_ID = 'cfrdm_gsc_client_id';
    const OPTION_CLIENT_SECRET = 'cfrdm_gsc_client_secret';
    const OPTION_ACCESS_TOKEN = 'cfrdm_gsc_access_token';
    const OPTION_SITE_URL = 'cfrdm_gsc_site_url';
    const OPTION_LAST_SYNC = 'cfrdm_gsc_last_sync';
    
    private static $instance = null;
    
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    /**
     * Initialize GSC integration
     */
    public function init() {
        // Register cron job
        add_action('cfrdm_gsc_sync', array($this, 'sync_gsc_data'));
        
        // Schedule every 6 hours (using custom interval from CFRDM_Cron_Scheduler)
        // Only schedule if not already scheduled AND if the interval is registered
        if (!wp_next_scheduled('cfrdm_gsc_sync')) {
            $schedules = wp_get_schedules();
            $interval = isset($schedules['every_6_hours']) ? 'every_6_hours' : 'twicedaily';
            wp_schedule_event(time(), $interval, 'cfrdm_gsc_sync');
        }
        
        // Admin page for OAuth
        add_action('admin_init', array($this, 'handle_oauth_callback'));
    }
    
    /**
     * Check if GSC is connected
     */
    public static function is_connected() {
        $token = get_option(self::OPTION_ACCESS_TOKEN);
        return !empty($token);
    }
    
    /**
     * Get connection status
     */
    public static function get_connection_status() {
        $token = get_option(self::OPTION_ACCESS_TOKEN);
        $last_sync = get_option(self::OPTION_LAST_SYNC);
        
        return array(
            'connected' => !empty($token),
            'site_url' => get_option(self::OPTION_SITE_URL, get_site_url()),
            'last_sync' => $last_sync,
            'has_credentials' => !empty(get_option(self::OPTION_CLIENT_ID)),
        );
    }
    
    /**
     * Get OAuth authorization URL
     */
    public function get_auth_url() {
        $client_id = get_option(self::OPTION_CLIENT_ID);
        $redirect_uri = admin_url('admin.php?page=cfrdm-gsc-auth');
        
        $params = array(
            'client_id' => $client_id,
            'redirect_uri' => $redirect_uri,
            'response_type' => 'code',
            'scope' => 'https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/indexing',
            'access_type' => 'offline',
            'prompt' => 'consent',
        );
        
        return 'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query($params);
    }
    
    /**
     * Handle OAuth callback
     */
    public function handle_oauth_callback() {
        if (!isset($_GET['page']) || $_GET['page'] !== 'cfrdm-gsc-auth') {
            return;
        }
        
        if (!isset($_GET['code'])) {
            return;
        }
        
        $code = sanitize_text_field($_GET['code']);
        $result = $this->exchange_code_for_token($code);
        
        if ($result) {
            wp_redirect(admin_url('admin.php?page=cfrdm-settings&gsc_connected=1'));
        } else {
            wp_redirect(admin_url('admin.php?page=cfrdm-settings&gsc_error=1'));
        }
        exit;
    }
    
    /**
     * Exchange authorization code for access token
     */
    private function exchange_code_for_token($code) {
        $client_id = get_option(self::OPTION_CLIENT_ID);
        $client_secret = get_option(self::OPTION_CLIENT_SECRET);
        $redirect_uri = admin_url('admin.php?page=cfrdm-gsc-auth');
        
        $response = wp_remote_post('https://oauth2.googleapis.com/token', array(
            'body' => array(
                'code' => $code,
                'client_id' => $client_id,
                'client_secret' => $client_secret,
                'redirect_uri' => $redirect_uri,
                'grant_type' => 'authorization_code',
            ),
        ));
        
        if (is_wp_error($response)) {
            CFRDM_Logger::error('gsc_auth', 'Erro ao trocar código por token', array(
                'error' => $response->get_error_message(),
            ));
            return false;
        }
        
        $body = json_decode(wp_remote_retrieve_body($response), true);
        
        if (isset($body['access_token'])) {
            update_option(self::OPTION_ACCESS_TOKEN, $body);
            CFRDM_Logger::success('gsc_auth', 'GSC conectado com sucesso');
            return true;
        }
        
        CFRDM_Logger::error('gsc_auth', 'Token não recebido', $body);
        return false;
    }
    
    /**
     * Get valid access token (refresh if needed)
     */
    private function get_access_token() {
        $token_data = get_option(self::OPTION_ACCESS_TOKEN);
        
        if (empty($token_data)) {
            return null;
        }
        
        // Check if token is expired
        $expires_at = isset($token_data['created']) 
            ? $token_data['created'] + $token_data['expires_in'] 
            : 0;
        
        if (time() >= $expires_at && isset($token_data['refresh_token'])) {
            $token_data = $this->refresh_token($token_data['refresh_token']);
            if (!$token_data) {
                return null;
            }
        }
        
        return $token_data['access_token'] ?? null;
    }
    
    /**
     * Refresh access token
     */
    private function refresh_token($refresh_token) {
        $client_id = get_option(self::OPTION_CLIENT_ID);
        $client_secret = get_option(self::OPTION_CLIENT_SECRET);
        
        $response = wp_remote_post('https://oauth2.googleapis.com/token', array(
            'body' => array(
                'refresh_token' => $refresh_token,
                'client_id' => $client_id,
                'client_secret' => $client_secret,
                'grant_type' => 'refresh_token',
            ),
        ));
        
        if (is_wp_error($response)) {
            CFRDM_Logger::error('gsc_auth', 'Erro ao renovar token', array(
                'error' => $response->get_error_message(),
            ));
            return null;
        }
        
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
     * Make authenticated request to GSC API
     */
    private function api_request($endpoint, $method = 'GET', $body = null) {
        $access_token = $this->get_access_token();
        
        if (!$access_token) {
            return new WP_Error('no_token', 'GSC não está conectado');
        }
        
        $args = array(
            'method' => $method,
            'headers' => array(
                'Authorization' => 'Bearer ' . $access_token,
                'Content-Type' => 'application/json',
            ),
            'timeout' => 30,
        );
        
        if ($body) {
            $args['body'] = json_encode($body);
        }
        
        $response = wp_remote_request($endpoint, $args);
        
        if (is_wp_error($response)) {
            return $response;
        }
        
        $status_code = wp_remote_retrieve_response_code($response);
        $body = json_decode(wp_remote_retrieve_body($response), true);
        
        if ($status_code >= 400) {
            return new WP_Error('api_error', $body['error']['message'] ?? 'Erro na API', $body);
        }
        
        return $body;
    }
    
    /**
     * Fetch indexing data from GSC
     */
    public function fetch_indexing_data() {
        $site_url = get_option(self::OPTION_SITE_URL, get_site_url());
        $encoded_url = urlencode($site_url);
        
        // Fetch URL inspection data
        $endpoint = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";
        
        // Get all pages to inspect
        $pages = $this->get_pages_to_inspect();
        $results = array(
            'indexed' => array(),
            'not_indexed' => array(),
            'errors' => array(),
        );
        
        foreach ($pages as $page_url) {
            $response = $this->api_request($endpoint, 'POST', array(
                'inspectionUrl' => $page_url,
                'siteUrl' => $site_url,
            ));
            
            if (is_wp_error($response)) {
                continue;
            }
            
            $verdict = $response['inspectionResult']['indexStatusResult']['verdict'] ?? 'UNKNOWN';
            
            if ($verdict === 'PASS') {
                $results['indexed'][] = $page_url;
            } elseif ($verdict === 'FAIL') {
                $results['not_indexed'][] = array(
                    'url' => $page_url,
                    'reason' => $response['inspectionResult']['indexStatusResult']['coverageState'] ?? 'Unknown',
                );
            } else {
                $results['errors'][] = array(
                    'url' => $page_url,
                    'verdict' => $verdict,
                );
            }
            
            // Rate limiting
            usleep(500000); // 0.5 second delay
        }
        
        return $results;
    }
    
    /**
     * Get pages to inspect
     */
    private function get_pages_to_inspect($limit = 100) {
        $post_types = array('post', 'page');
        
        // Include products if WooCommerce is active
        if (post_type_exists('product')) {
            $post_types[] = 'product';
        }
        
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
    
    /**
     * Get 404 pages from GSC
     */
    public function get_404_pages() {
        $site_url = get_option(self::OPTION_SITE_URL, get_site_url());
        $encoded_url = urlencode($site_url);
        
        // Use Search Analytics API to find pages with errors
        $endpoint = "https://www.googleapis.com/webmasters/v3/sites/{$encoded_url}/urlCrawlErrorsSamples";
        
        $response = $this->api_request($endpoint . '?category=notFound&platform=web');
        
        if (is_wp_error($response)) {
            CFRDM_Logger::error('gsc_api', 'Erro ao buscar 404s', array(
                'error' => $response->get_error_message(),
            ));
            return array();
        }
        
        $errors = array();
        if (isset($response['urlCrawlErrorSample'])) {
            foreach ($response['urlCrawlErrorSample'] as $sample) {
                $errors[] = array(
                    'url' => $sample['pageUrl'] ?? '',
                    'detected' => $sample['first_detected'] ?? '',
                    'last_crawled' => $sample['last_crawled'] ?? '',
                );
            }
        }
        
        return $errors;
    }
    
    /**
     * Get non-indexed pages
     */
    public function get_non_indexed_pages() {
        $indexing_data = $this->fetch_indexing_data();
        return $indexing_data['not_indexed'] ?? array();
    }
    
    /**
     * Get schema issues
     */
    public function get_schema_issues() {
        $site_url = get_option(self::OPTION_SITE_URL, get_site_url());
        $encoded_url = urlencode($site_url);
        
        // Get Rich Results status
        $endpoint = "https://searchconsole.googleapis.com/v1/sites/{$encoded_url}/richResults";
        
        $response = $this->api_request($endpoint);
        
        if (is_wp_error($response)) {
            return array();
        }
        
        $issues = array();
        if (isset($response['richResultsTypes'])) {
            foreach ($response['richResultsTypes'] as $type) {
                if (isset($type['issues']) && !empty($type['issues'])) {
                    $issues[$type['name']] = $type['issues'];
                }
            }
        }
        
        return $issues;
    }
    
    /**
     * Request indexing of a URL
     */
    public function request_indexing($url) {
        $endpoint = 'https://indexing.googleapis.com/v3/urlNotifications:publish';
        
        $response = $this->api_request($endpoint, 'POST', array(
            'url' => $url,
            'type' => 'URL_UPDATED',
        ));
        
        if (is_wp_error($response)) {
            CFRDM_Logger::error('gsc_indexing', 'Erro ao solicitar indexação', array(
                'url' => $url,
                'error' => $response->get_error_message(),
            ));
            return false;
        }
        
        CFRDM_Logger::success('gsc_indexing', 'Indexação solicitada', array('url' => $url));
        return true;
    }
    
    /**
     * Sync GSC data (cron callback)
     */
    public function sync_gsc_data() {
        if (!self::is_connected()) {
            return;
        }
        
        CFRDM_Logger::info('gsc_sync', 'Iniciando sincronização GSC');
        
        // Fetch 404 pages
        $errors_404 = $this->get_404_pages();
        
        // Add to fix queue
        if (!empty($errors_404) && class_exists('CFRDM_AI_Auto_Fix')) {
            foreach ($errors_404 as $error) {
                CFRDM_AI_Auto_Fix::add_to_queue(
                    '404',
                    $error['url'],
                    null,
                    8, // High priority
                    array('detected' => $error['detected'])
                );
            }
        }
        
        // Fetch non-indexed pages
        $non_indexed = $this->get_non_indexed_pages();
        
        if (!empty($non_indexed) && class_exists('CFRDM_AI_Auto_Fix')) {
            foreach ($non_indexed as $page) {
                CFRDM_AI_Auto_Fix::add_to_queue(
                    'not_indexed',
                    $page['url'],
                    null,
                    5,
                    array('reason' => $page['reason'])
                );
            }
        }
        
        // Fetch schema issues
        $schema_issues = $this->get_schema_issues();
        
        if (!empty($schema_issues) && class_exists('CFRDM_AI_Auto_Fix')) {
            foreach ($schema_issues as $type => $issues) {
                foreach ($issues as $issue) {
                    CFRDM_AI_Auto_Fix::add_to_queue(
                        'schema_error',
                        $issue['url'] ?? '',
                        null,
                        6,
                        array('type' => $type, 'issue' => $issue)
                    );
                }
            }
        }
        
        update_option(self::OPTION_LAST_SYNC, current_time('mysql'));
        
        CFRDM_Logger::success('gsc_sync', 'Sincronização GSC concluída', array(
            '404s' => count($errors_404),
            'non_indexed' => count($non_indexed),
            'schema_issues' => count($schema_issues),
        ));
    }
    
    /**
     * Disconnect from GSC
     */
    public function disconnect() {
        delete_option(self::OPTION_ACCESS_TOKEN);
        CFRDM_Logger::info('gsc_auth', 'GSC desconectado');
    }
    
    /**
     * Get sync statistics
     */
    public static function get_stats() {
        global $wpdb;
        
        $table = $wpdb->prefix . 'cfrdm_fix_queue';
        
        // Check if table exists
        if ($wpdb->get_var("SHOW TABLES LIKE '$table'") !== $table) {
            return array(
                'total' => 0,
                'pending' => 0,
                'processing' => 0,
                'completed' => 0,
                'failed' => 0,
                'by_type' => array(),
            );
        }
        
        $stats = array(
            'total' => $wpdb->get_var("SELECT COUNT(*) FROM $table"),
            'pending' => $wpdb->get_var("SELECT COUNT(*) FROM $table WHERE status = 'pending'"),
            'processing' => $wpdb->get_var("SELECT COUNT(*) FROM $table WHERE status = 'processing'"),
            'completed' => $wpdb->get_var("SELECT COUNT(*) FROM $table WHERE status = 'completed'"),
            'failed' => $wpdb->get_var("SELECT COUNT(*) FROM $table WHERE status = 'failed'"),
            'by_type' => array(),
        );
        
        $types = $wpdb->get_results(
            "SELECT issue_type, COUNT(*) as count FROM $table GROUP BY issue_type"
        );
        
        foreach ($types as $type) {
            $stats['by_type'][$type->issue_type] = $type->count;
        }
        
        return $stats;
    }
}
