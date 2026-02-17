<?php
/**
 * Redirect Manager - 301 Redirects & Duplicate URL Cleanup
 * 
 * Manages 301 redirects, detects duplicate URLs, and serves redirects
 * on the frontend. Exposes REST API endpoints for remote management.
 * 
 * @package ContentFactory_RDM
 * @since 3.4.3
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_Redirect_Manager {
    
    const TABLE_NAME = 'cfrdm_redirects_301';
    const OPTION_ENABLED = 'cfrdm_redirects_enabled';
    
    private static $instance = null;
    
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    /**
     * Initialize Redirect Manager
     */
    public function init() {
        // Serve redirects on every request (high priority)
        add_action('template_redirect', array($this, 'serve_redirects'), 1);
        
        // Register REST API endpoints
        add_action('rest_api_init', array($this, 'register_routes'));
    }
    
    /**
     * Create database table
     */
    public static function create_table() {
        global $wpdb;
        
        $table_name = $wpdb->prefix . self::TABLE_NAME;
        $charset_collate = $wpdb->get_charset_collate();
        
        $sql = "CREATE TABLE IF NOT EXISTS $table_name (
            id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            source_url VARCHAR(500) NOT NULL,
            target_url VARCHAR(500) NOT NULL,
            redirect_type INT(3) DEFAULT 301,
            hits INT(11) DEFAULT 0,
            last_hit_at DATETIME NULL,
            category VARCHAR(50) DEFAULT 'manual',
            notes TEXT NULL,
            is_active TINYINT(1) DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY source_url (source_url(191)),
            KEY category (category),
            KEY is_active (is_active)
        ) $charset_collate;";
        
        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        dbDelta($sql);
    }
    
    /**
     * Register REST API routes
     */
    public function register_routes() {
        register_rest_route('cfrdm/v1', '/redirects', array(
            array(
                'methods' => 'GET',
                'callback' => array($this, 'api_list_redirects'),
                'permission_callback' => array($this, 'check_api_permission'),
            ),
            array(
                'methods' => 'POST',
                'callback' => array($this, 'api_create_redirect'),
                'permission_callback' => array($this, 'check_api_permission'),
            ),
        ));
        
        register_rest_route('cfrdm/v1', '/redirects/batch', array(
            'methods' => 'POST',
            'callback' => array($this, 'api_batch_redirects'),
            'permission_callback' => array($this, 'check_api_permission'),
        ));
        
        register_rest_route('cfrdm/v1', '/redirects/cleanup-duplicates', array(
            'methods' => 'POST',
            'callback' => array($this, 'api_cleanup_duplicates'),
            'permission_callback' => array($this, 'check_api_permission'),
        ));
        
        register_rest_route('cfrdm/v1', '/redirects/(?P<id>\d+)', array(
            array(
                'methods' => 'DELETE',
                'callback' => array($this, 'api_delete_redirect'),
                'permission_callback' => array($this, 'check_api_permission'),
            ),
        ));
        
        register_rest_route('cfrdm/v1', '/redirects/stats', array(
            'methods' => 'GET',
            'callback' => array($this, 'api_stats'),
            'permission_callback' => array($this, 'check_api_permission'),
        ));
    }
    
    /**
     * Check API permission
     */
    public function check_api_permission($request) {
        $api_key = $request->get_header('X-CFRDM-API-Key');
        $stored_key = get_option('cfrdm_api_key');
        
        if (!empty($api_key) && !empty($stored_key) && hash_equals($stored_key, $api_key)) {
            return true;
        }
        
        // Also allow WP nonce auth for admin
        $nonce = $request->get_header('X-WP-Nonce');
        if ($nonce && wp_verify_nonce($nonce, 'wp_rest') && current_user_can('manage_options')) {
            return true;
        }
        
        return false;
    }
    
    /**
     * Serve redirects on frontend
     */
    public function serve_redirects() {
        if (is_admin()) return;
        
        global $wpdb;
        $table = $wpdb->prefix . self::TABLE_NAME;
        
        // Check if table exists
        if ($wpdb->get_var("SHOW TABLES LIKE '$table'") !== $table) return;
        
        $request_uri = $_SERVER['REQUEST_URI'] ?? '';
        $request_path = parse_url($request_uri, PHP_URL_PATH);
        
        // Normalize: remove trailing slash for comparison
        $normalized = rtrim($request_path, '/');
        $with_slash = $normalized . '/';
        
        $redirect = $wpdb->get_row($wpdb->prepare(
            "SELECT id, target_url, redirect_type FROM $table WHERE is_active = 1 AND (source_url = %s OR source_url = %s) LIMIT 1",
            $normalized, $with_slash
        ));
        
        if ($redirect) {
            // Update hit counter
            $wpdb->query($wpdb->prepare(
                "UPDATE $table SET hits = hits + 1, last_hit_at = %s WHERE id = %d",
                current_time('mysql'), $redirect->id
            ));
            
            wp_redirect($redirect->target_url, $redirect->redirect_type);
            exit;
        }
    }
    
    /**
     * Add a redirect
     */
    public static function add_redirect($source_url, $target_url, $category = 'auto', $notes = '', $type = 301) {
        global $wpdb;
        $table = $wpdb->prefix . self::TABLE_NAME;
        
        // Normalize source to path only
        $source_path = parse_url($source_url, PHP_URL_PATH);
        if (!$source_path) $source_path = $source_url;
        $source_path = rtrim($source_path, '/');
        if (empty($source_path)) $source_path = '/';
        
        // Don't redirect to self
        $target_path = parse_url($target_url, PHP_URL_PATH);
        if ($source_path === rtrim($target_path ?? '', '/')) return false;
        
        // Upsert
        $existing = $wpdb->get_var($wpdb->prepare(
            "SELECT id FROM $table WHERE source_url = %s",
            $source_path
        ));
        
        if ($existing) {
            $wpdb->update($table, array(
                'target_url' => $target_url,
                'redirect_type' => $type,
                'category' => $category,
                'notes' => $notes,
                'is_active' => 1,
            ), array('id' => $existing));
            return $existing;
        }
        
        $wpdb->insert($table, array(
            'source_url' => $source_path,
            'target_url' => $target_url,
            'redirect_type' => $type,
            'category' => $category,
            'notes' => $notes,
            'is_active' => 1,
        ));
        
        return $wpdb->insert_id;
    }
    
    /**
     * API: List redirects
     */
    public function api_list_redirects($request) {
        global $wpdb;
        $table = $wpdb->prefix . self::TABLE_NAME;
        
        if ($wpdb->get_var("SHOW TABLES LIKE '$table'") !== $table) {
            self::create_table();
        }
        
        $category = $request->get_param('category');
        $limit = min(intval($request->get_param('limit') ?: 100), 500);
        
        $where = "WHERE 1=1";
        $params = array();
        
        if ($category) {
            $where .= " AND category = %s";
            $params[] = $category;
        }
        
        $params[] = $limit;
        $results = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM $table $where ORDER BY created_at DESC LIMIT %d",
            ...$params
        ));
        
        $total = $wpdb->get_var("SELECT COUNT(*) FROM $table");
        
        return new WP_REST_Response(array(
            'success' => true,
            'total' => intval($total),
            'redirects' => $results,
        ), 200);
    }
    
    /**
     * API: Create single redirect
     */
    public function api_create_redirect($request) {
        $source = $request->get_param('source_url');
        $target = $request->get_param('target_url');
        $category = $request->get_param('category') ?: 'manual';
        $notes = $request->get_param('notes') ?: '';
        
        if (empty($source) || empty($target)) {
            return new WP_REST_Response(array('success' => false, 'error' => 'source_url and target_url required'), 400);
        }
        
        global $wpdb;
        $table = $wpdb->prefix . self::TABLE_NAME;
        if ($wpdb->get_var("SHOW TABLES LIKE '$table'") !== $table) {
            self::create_table();
        }
        
        $id = self::add_redirect($source, $target, $category, $notes);
        
        CFRDM_Logger::success('redirects', 'Redirect 301 criado', array(
            'source' => $source,
            'target' => $target,
            'category' => $category,
        ));
        
        return new WP_REST_Response(array('success' => true, 'id' => $id), 201);
    }
    
    /**
     * API: Batch create redirects
     */
    public function api_batch_redirects($request) {
        $redirects = $request->get_param('redirects');
        
        if (!is_array($redirects) || empty($redirects)) {
            return new WP_REST_Response(array('success' => false, 'error' => 'redirects array required'), 400);
        }
        
        global $wpdb;
        $table = $wpdb->prefix . self::TABLE_NAME;
        if ($wpdb->get_var("SHOW TABLES LIKE '$table'") !== $table) {
            self::create_table();
        }
        
        $created = 0;
        $skipped = 0;
        $errors = array();
        
        foreach (array_slice($redirects, 0, 200) as $r) {
            if (empty($r['source_url']) || empty($r['target_url'])) {
                $skipped++;
                continue;
            }
            
            $id = self::add_redirect(
                $r['source_url'],
                $r['target_url'],
                $r['category'] ?? 'batch',
                $r['notes'] ?? ''
            );
            
            if ($id) {
                $created++;
            } else {
                $skipped++;
            }
        }
        
        CFRDM_Logger::success('redirects', "Batch: {$created} redirects criados", array(
            'created' => $created,
            'skipped' => $skipped,
        ));
        
        return new WP_REST_Response(array(
            'success' => true,
            'created' => $created,
            'skipped' => $skipped,
        ), 200);
    }
    
    /**
     * API: Auto-cleanup duplicate URLs
     * Detects posts with -2, -3 suffixes and parameter-based duplicates
     */
    public function api_cleanup_duplicates($request) {
        global $wpdb;
        
        $table = $wpdb->prefix . self::TABLE_NAME;
        if ($wpdb->get_var("SHOW TABLES LIKE '$table'") !== $table) {
            self::create_table();
        }
        
        $limit = intval($request->get_param('limit') ?: 100);
        $dry_run = (bool) $request->get_param('dry_run');
        
        $duplicates_found = array();
        $redirects_created = 0;
        $noindex_applied = 0;
        
        // 1) Find posts with -2, -3 suffixes (duplicate slugs)
        $suffix_posts = $wpdb->get_results(
            "SELECT ID, post_name, post_title, post_type, post_status 
             FROM {$wpdb->posts} 
             WHERE post_status = 'publish' 
             AND post_name REGEXP '-[0-9]+$'
             AND post_type IN ('post', 'page')
             ORDER BY post_name ASC
             LIMIT {$limit}"
        );
        
        foreach ($suffix_posts as $post) {
            // Extract the base slug (remove -2, -3, etc.)
            $base_slug = preg_replace('/-(\d+)$/', '', $post->post_name);
            
            // Find the original post with the base slug
            $original = $wpdb->get_row($wpdb->prepare(
                "SELECT ID, post_name FROM {$wpdb->posts} 
                 WHERE post_name = %s AND post_status = 'publish' AND post_type = %s AND ID != %d LIMIT 1",
                $base_slug, $post->post_type, $post->ID
            ));
            
            if ($original) {
                $source_url = get_permalink($post->ID);
                $target_url = get_permalink($original->ID);
                
                $duplicates_found[] = array(
                    'type' => 'duplicate_slug',
                    'source_post_id' => $post->ID,
                    'source_slug' => $post->post_name,
                    'target_post_id' => $original->ID,
                    'target_slug' => $original->post_name,
                    'source_url' => $source_url,
                    'target_url' => $target_url,
                );
                
                if (!$dry_run) {
                    // Create 301 redirect
                    self::add_redirect($source_url, $target_url, 'duplicate_cleanup', "Duplicate of: {$original->post_name}");
                    $redirects_created++;
                    
                    // Mark duplicate as noindex
                    CFRDM_SEO::set_robots($post->ID, array('noindex' => true, 'nofollow' => false), CFRDM_SEO::detect_seo_plugin());
                    $noindex_applied++;
                }
            }
        }
        
        // 2) Find junk URLs: hello-world, sample-page
        $junk_slugs = array('hello-world', 'sample-page', 'privacy-policy-2', 'my-account', 'cart', 'checkout');
        foreach ($junk_slugs as $slug) {
            $junk_post = $wpdb->get_row($wpdb->prepare(
                "SELECT ID, post_name FROM {$wpdb->posts} WHERE post_name = %s AND post_status = 'publish' LIMIT 1",
                $slug
            ));
            
            if ($junk_post) {
                $source_url = get_permalink($junk_post->ID);
                $home = home_url('/');
                
                $duplicates_found[] = array(
                    'type' => 'junk_page',
                    'source_post_id' => $junk_post->ID,
                    'source_slug' => $junk_post->post_name,
                    'source_url' => $source_url,
                    'target_url' => $home,
                );
                
                if (!$dry_run) {
                    self::add_redirect($source_url, $home, 'junk_cleanup', "Junk page: {$slug}");
                    $redirects_created++;
                    
                    CFRDM_SEO::set_robots($junk_post->ID, array('noindex' => true, 'nofollow' => true), CFRDM_SEO::detect_seo_plugin());
                    $noindex_applied++;
                }
            }
        }
        
        // 3) Find archive/date/author pages and mark as noindex (not redirects)
        // These are handled by robots meta, not redirects
        
        CFRDM_Logger::success('redirects', "Cleanup: {$redirects_created} redirects, {$noindex_applied} noindex", array(
            'duplicates_found' => count($duplicates_found),
            'dry_run' => $dry_run,
        ));
        
        return new WP_REST_Response(array(
            'success' => true,
            'duplicates_found' => count($duplicates_found),
            'redirects_created' => $redirects_created,
            'noindex_applied' => $noindex_applied,
            'dry_run' => $dry_run,
            'details' => array_slice($duplicates_found, 0, 50),
        ), 200);
    }
    
    /**
     * API: Delete redirect
     */
    public function api_delete_redirect($request) {
        global $wpdb;
        $table = $wpdb->prefix . self::TABLE_NAME;
        $id = intval($request->get_param('id'));
        
        $wpdb->delete($table, array('id' => $id));
        
        return new WP_REST_Response(array('success' => true), 200);
    }
    
    /**
     * API: Stats
     */
    public function api_stats($request) {
        global $wpdb;
        $table = $wpdb->prefix . self::TABLE_NAME;
        
        if ($wpdb->get_var("SHOW TABLES LIKE '$table'") !== $table) {
            return new WP_REST_Response(array(
                'total' => 0, 'active' => 0, 'total_hits' => 0,
                'by_category' => array(),
            ), 200);
        }
        
        $total = intval($wpdb->get_var("SELECT COUNT(*) FROM $table"));
        $active = intval($wpdb->get_var("SELECT COUNT(*) FROM $table WHERE is_active = 1"));
        $total_hits = intval($wpdb->get_var("SELECT SUM(hits) FROM $table"));
        
        $by_category = $wpdb->get_results(
            "SELECT category, COUNT(*) as count, SUM(hits) as hits FROM $table GROUP BY category ORDER BY count DESC"
        );
        
        return new WP_REST_Response(array(
            'total' => $total,
            'active' => $active,
            'total_hits' => $total_hits,
            'by_category' => $by_category,
        ), 200);
    }
}
