<?php
/**
 * REST API Handler
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_API {
    
    public static function register_routes() {
        // Version endpoint (public, no auth required)
        register_rest_route('cfrdm/v1', '/version', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'get_version'),
            'permission_callback' => '__return_true',
        ));
        
        // Health check
        register_rest_route('cfrdm/v1', '/health', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'health_check'),
            'permission_callback' => '__return_true',
        ));

        // Healthcheck (full diagnostics) - requires auth
        register_rest_route('cfrdm/v1', '/healthcheck', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'health_check_full'),
            'permission_callback' => array(__CLASS__, 'verify_api_key'),
        ));
        
        // Connection test (requires auth)
        register_rest_route('cfrdm/v1', '/test', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'test_connection'),
            'permission_callback' => array(__CLASS__, 'verify_api_key'),
        ));
        
        // Get site info
        register_rest_route('cfrdm/v1', '/info', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'get_site_info'),
            'permission_callback' => array(__CLASS__, 'verify_api_key'),
        ));
        
        // Articles endpoints
        register_rest_route('cfrdm/v1', '/articles', array(
            array(
                'methods' => 'GET',
                'callback' => array(__CLASS__, 'get_articles'),
                'permission_callback' => array(__CLASS__, 'verify_api_key'),
            ),
            array(
                'methods' => 'POST',
                'callback' => array(__CLASS__, 'create_article'),
                'permission_callback' => array(__CLASS__, 'verify_api_key'),
            ),
        ));
        
        register_rest_route('cfrdm/v1', '/articles/(?P<id>\d+)', array(
            array(
                'methods' => 'GET',
                'callback' => array(__CLASS__, 'get_article'),
                'permission_callback' => array(__CLASS__, 'verify_api_key'),
            ),
            array(
                'methods' => 'PUT',
                'callback' => array(__CLASS__, 'update_article'),
                'permission_callback' => array(__CLASS__, 'verify_api_key'),
            ),
            array(
                'methods' => 'DELETE',
                'callback' => array(__CLASS__, 'delete_article'),
                'permission_callback' => array(__CLASS__, 'verify_api_key'),
            ),
        ));
        
        // Categories
        register_rest_route('cfrdm/v1', '/categories', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'get_categories'),
            'permission_callback' => array(__CLASS__, 'verify_api_key'),
        ));
        
        // Tags
        register_rest_route('cfrdm/v1', '/tags', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'get_tags'),
            'permission_callback' => array(__CLASS__, 'verify_api_key'),
        ));
        
        // Media upload
        register_rest_route('cfrdm/v1', '/media', array(
            'methods' => 'POST',
            'callback' => array(__CLASS__, 'upload_media'),
            'permission_callback' => array(__CLASS__, 'verify_api_key'),
        ));
        
        // Media import from URL (with deduplication)
        register_rest_route('cfrdm/v1', '/media/import', array(
            'methods' => 'POST',
            'callback' => array(__CLASS__, 'import_media'),
            'permission_callback' => array(__CLASS__, 'verify_api_key'),
        ));
        
        // Regenerate API key
        register_rest_route('cfrdm/v1', '/regenerate-key', array(
            'methods' => 'POST',
            'callback' => array(__CLASS__, 'regenerate_api_key'),
            'permission_callback' => array(__CLASS__, 'verify_admin'),
        ));
        
        // Check tables status (public for diagnostics)
        register_rest_route('cfrdm/v1', '/check-tables', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'check_tables_status'),
            'permission_callback' => '__return_true',
        ));
        
        // Repair/recreate database tables (admin only)
        register_rest_route('cfrdm/v1', '/repair-tables', array(
            'methods' => 'POST',
            'callback' => array(__CLASS__, 'repair_tables'),
            'permission_callback' => array(__CLASS__, 'verify_admin'),
        ));
        
        // Token verification callback (for platform connection verification)
        register_rest_route('cfrdm/v1', '/verify-connection', array(
            'methods' => 'POST',
            'callback' => array(__CLASS__, 'verify_connection_callback'),
            'permission_callback' => array(__CLASS__, 'verify_api_key'),
        ));
        
        // SEO plugin info
        register_rest_route('cfrdm/v1', '/seo-info', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'get_seo_info'),
            'permission_callback' => array(__CLASS__, 'verify_api_key'),
        ));
        
        // AI SEO generation
        register_rest_route('cfrdm/v1', '/generate-seo', array(
            'methods' => 'POST',
            'callback' => array(__CLASS__, 'generate_seo'),
            'permission_callback' => array(__CLASS__, 'verify_api_key'),
        ));
        
        // Structured logs
        register_rest_route('cfrdm/v1', '/logs', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'get_structured_logs'),
            'permission_callback' => array(__CLASS__, 'verify_api_key'),
        ));
        
        // Log stats
        register_rest_route('cfrdm/v1', '/logs/stats', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'get_log_stats'),
            'permission_callback' => array(__CLASS__, 'verify_api_key'),
        ));
        
        // ===== Social Poster Endpoints =====
        
        // Get social accounts
        register_rest_route('cfrdm/v1', '/social/accounts', array(
            array(
                'methods' => 'GET',
                'callback' => array(__CLASS__, 'get_social_accounts'),
                'permission_callback' => array(__CLASS__, 'verify_api_key'),
            ),
            array(
                'methods' => 'POST',
                'callback' => array(__CLASS__, 'add_social_account'),
                'permission_callback' => array(__CLASS__, 'verify_api_key'),
            ),
        ));
        
        // Social account actions
        register_rest_route('cfrdm/v1', '/social/accounts/(?P<id>\d+)', array(
            array(
                'methods' => 'PUT',
                'callback' => array(__CLASS__, 'update_social_account'),
                'permission_callback' => array(__CLASS__, 'verify_api_key'),
            ),
            array(
                'methods' => 'DELETE',
                'callback' => array(__CLASS__, 'delete_social_account'),
                'permission_callback' => array(__CLASS__, 'verify_api_key'),
            ),
        ));
        
        // Social queue
        register_rest_route('cfrdm/v1', '/social/queue', array(
            array(
                'methods' => 'GET',
                'callback' => array(__CLASS__, 'get_social_queue'),
                'permission_callback' => array(__CLASS__, 'verify_api_key'),
            ),
            array(
                'methods' => 'POST',
                'callback' => array(__CLASS__, 'queue_social_post'),
                'permission_callback' => array(__CLASS__, 'verify_api_key'),
            ),
        ));
        
        // Social queue stats
        register_rest_route('cfrdm/v1', '/social/queue/stats', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'get_social_queue_stats'),
            'permission_callback' => array(__CLASS__, 'verify_api_key'),
        ));
        
        // Social networks list
        register_rest_route('cfrdm/v1', '/social/networks', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'get_social_networks'),
            'permission_callback' => array(__CLASS__, 'verify_api_key'),
        ));
        
        // ===== Content Queue Endpoints =====
        
        // Content queue
        register_rest_route('cfrdm/v1', '/queue', array(
            array(
                'methods' => 'GET',
                'callback' => array(__CLASS__, 'get_content_queue'),
                'permission_callback' => array(__CLASS__, 'verify_api_key'),
            ),
            array(
                'methods' => 'POST',
                'callback' => array(__CLASS__, 'push_to_content_queue'),
                'permission_callback' => array(__CLASS__, 'verify_api_key'),
            ),
        ));
        
        // Content queue stats
        register_rest_route('cfrdm/v1', '/queue/stats', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'get_content_queue_stats'),
            'permission_callback' => array(__CLASS__, 'verify_api_key'),
        ));
        
        // Content queue item actions
        register_rest_route('cfrdm/v1', '/queue/(?P<id>\d+)/(?P<action>cancel|retry|pause|resume)', array(
            'methods' => 'POST',
            'callback' => array(__CLASS__, 'content_queue_action'),
            'permission_callback' => array(__CLASS__, 'verify_api_key'),
        ));
        
        // ===== Cron Scheduler Endpoints =====
        
        // Cron jobs
        register_rest_route('cfrdm/v1', '/cron/jobs', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'get_cron_jobs'),
            'permission_callback' => array(__CLASS__, 'verify_api_key'),
        ));
        
        // Cron job toggle
        register_rest_route('cfrdm/v1', '/cron/jobs/(?P<id>\d+)/toggle', array(
            'methods' => 'POST',
            'callback' => array(__CLASS__, 'toggle_cron_job'),
            'permission_callback' => array(__CLASS__, 'verify_api_key'),
        ));
        
        // Cron job run manually
        register_rest_route('cfrdm/v1', '/cron/jobs/(?P<name>[a-zA-Z0-9_-]+)/run', array(
            'methods' => 'POST',
            'callback' => array(__CLASS__, 'run_cron_job'),
            'permission_callback' => array(__CLASS__, 'verify_api_key'),
        ));
        
        // Cron history
        register_rest_route('cfrdm/v1', '/cron/history', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'get_cron_history'),
            'permission_callback' => array(__CLASS__, 'verify_api_key'),
        ));
        
        // Cron diagnostics
        register_rest_route('cfrdm/v1', '/cron/diagnostics', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'get_cron_diagnostics'),
            'permission_callback' => array(__CLASS__, 'verify_api_key'),
        ));
        
        // ===== v3.0.0 - GSC Integration Endpoints =====
        
        // GSC status
        register_rest_route('cfrdm/v1', '/gsc/status', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'get_gsc_status'),
            'permission_callback' => array(__CLASS__, 'verify_api_key'),
        ));
        
        // GSC sync
        register_rest_route('cfrdm/v1', '/gsc-sync', array(
            'methods' => 'POST',
            'callback' => array(__CLASS__, 'trigger_gsc_sync'),
            'permission_callback' => array(__CLASS__, 'verify_admin'),
        ));
        
        // GSC disconnect
        register_rest_route('cfrdm/v1', '/gsc-disconnect', array(
            'methods' => 'POST',
            'callback' => array(__CLASS__, 'disconnect_gsc'),
            'permission_callback' => array(__CLASS__, 'verify_admin'),
        ));
        
        // ===== v3.0.0 - AI Auto-Fix Endpoints =====
        
        // Fix queue
        register_rest_route('cfrdm/v1', '/fix-queue', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'get_fix_queue'),
            'permission_callback' => array(__CLASS__, 'verify_api_key'),
        ));
        
        // Fix queue stats
        register_rest_route('cfrdm/v1', '/fix-queue/stats', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'get_fix_queue_stats'),
            'permission_callback' => array(__CLASS__, 'verify_api_key'),
        ));
        
        // Trigger fix queue processing
        register_rest_route('cfrdm/v1', '/fix-queue/process', array(
            'methods' => 'POST',
            'callback' => array(__CLASS__, 'process_fix_queue'),
            'permission_callback' => array(__CLASS__, 'verify_admin'),
        ));
        
        // ===== Auto-Update Endpoints =====
        
        // Check for updates
        register_rest_route('cfrdm/v1', '/updates/check', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'check_for_updates'),
            'permission_callback' => array(__CLASS__, 'verify_api_key'),
        ));
        
        // Get update status
        register_rest_route('cfrdm/v1', '/updates/status', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'get_update_status'),
            'permission_callback' => array(__CLASS__, 'verify_api_key'),
        ));
        
        // Apply update
        register_rest_route('cfrdm/v1', '/updates/apply', array(
            'methods' => 'POST',
            'callback' => array(__CLASS__, 'apply_update'),
            'permission_callback' => array(__CLASS__, 'verify_admin'),
        ));
        
        // Rollback update
        register_rest_route('cfrdm/v1', '/updates/rollback', array(
            'methods' => 'POST',
            'callback' => array(__CLASS__, 'rollback_update'),
            'permission_callback' => array(__CLASS__, 'verify_admin'),
        ));
        
        // ===== Stats Endpoint (for Chat IA sync) =====
        register_rest_route('cfrdm/v1', '/stats', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'get_stats'),
            'permission_callback' => array(__CLASS__, 'verify_api_key'),
        ));
        
        // ===== Apply Internal Link Endpoint (for Chat IA) =====
        register_rest_route('cfrdm/v1', '/apply-internal-link', array(
            'methods' => 'POST',
            'callback' => array(__CLASS__, 'apply_internal_link'),
            'permission_callback' => array(__CLASS__, 'verify_api_key'),
        ));
    }
    
    public static function verify_api_key($request) {
        $api_key = $request->get_header('X-CFRDM-API-Key');
        
        if (empty($api_key)) {
            $api_key = $request->get_param('api_key');
        }
        
        $stored_key = get_option('cfrdm_api_key');
        
        if (empty($stored_key) || $api_key !== $stored_key) {
            return new WP_Error(
                'unauthorized',
                __('API Key inválida ou não fornecida.', 'contentfactory-rdm'),
                array('status' => 401)
            );
        }
        
        return true;
    }
    
    public static function verify_admin($request) {
        return current_user_can('manage_options');
    }
    
    /**
     * Get plugin version (public endpoint)
     */
    public static function get_version() {
        return new WP_REST_Response(array(
            'success' => true,
            'version' => CFRDM_VERSION,
            'minimum_supported' => '3.0.0',
            'is_current' => version_compare(CFRDM_VERSION, '3.2.0', '>='),
            'released' => '2026-02-10',
            'features' => array(
                'gsc_integration' => version_compare(CFRDM_VERSION, '3.0.0', '>='),
                'ai_auto_fix' => version_compare(CFRDM_VERSION, '3.0.0', '>='),
                'ubersuggest_sync' => version_compare(CFRDM_VERSION, '3.0.0', '>='),
                'https_enforcer' => version_compare(CFRDM_VERSION, '3.0.0', '>='),
                'content_enhancer' => version_compare(CFRDM_VERSION, '3.0.0', '>='),
                'meta_auditor' => version_compare(CFRDM_VERSION, '3.1.0', '>='),
                'indexnow' => version_compare(CFRDM_VERSION, '3.1.0', '>='),
                'llms_txt' => version_compare(CFRDM_VERSION, '3.1.0', '>='),
                'post_duplicator' => version_compare(CFRDM_VERSION, '3.1.0', '>='),
                'sitemap_optimizer' => version_compare(CFRDM_VERSION, '3.1.0', '>='),
                'portal_monitoring' => version_compare(CFRDM_VERSION, '3.2.0', '>='),
                'auto_notifications' => version_compare(CFRDM_VERSION, '3.2.0', '>='),
                'stats_endpoint' => version_compare(CFRDM_VERSION, '3.2.0', '>='),
                'apply_internal_link' => version_compare(CFRDM_VERSION, '3.2.0', '>='),
            ),
            'changelog_url' => 'https://gruposeo-autopost.lovable.app/wordpress-plugin',
        ), 200);
    }
    
    public static function health_check() {
        return new WP_REST_Response(array(
            'success' => true,
            'message' => 'ContentFactory RDM Plugin is active',
            'version' => CFRDM_VERSION,
            'wordpress' => get_bloginfo('version'),
            'php' => PHP_VERSION,
            'timestamp' => current_time('c'),
        ), 200);
    }

    /**
     * Full healthcheck with diagnostics (requires API key)
     */
    public static function health_check_full($request) {
        $diagnostics = null;
        if (class_exists('CFRDM_Diagnostics')) {
            $diagnostics = CFRDM_Diagnostics::get_report();
        }

        return new WP_REST_Response(array(
            'success' => true,
            'version' => CFRDM_VERSION,
            'wordpress' => get_bloginfo('version'),
            'php' => PHP_VERSION,
            'timestamp' => current_time('c'),
            'diagnostics' => $diagnostics,
        ), 200);
    }
    
    public static function test_connection($request) {
        return new WP_REST_Response(array(
            'success' => true,
            'message' => __('Conexão estabelecida com sucesso!', 'contentfactory-rdm'),
            'version' => CFRDM_VERSION,
            'site' => array(
                'name' => get_bloginfo('name'),
                'url' => get_site_url(),
                'admin_email' => get_option('admin_email'),
            ),
        ), 200);
    }
    
    public static function get_site_info($request) {
        // Load SEO class if available
        if (class_exists('CFRDM_SEO')) {
            $seo_info = CFRDM_SEO::get_plugin_info();
        } else {
            // Fallback detection
            $active_plugins = get_option('active_plugins', array());
            $seo_plugin = 'none';
            
            foreach ($active_plugins as $plugin) {
                if (strpos($plugin, 'wordpress-seo') !== false) {
                    $seo_plugin = 'yoast';
                    break;
                }
                if (strpos($plugin, 'seo-by-rank-math') !== false) {
                    $seo_plugin = 'rankmath';
                    break;
                }
                if (strpos($plugin, 'all-in-one-seo') !== false) {
                    $seo_plugin = 'aioseo';
                    break;
                }
            }
            $seo_info = array('plugin' => $seo_plugin);
        }
        
        // Get media deduplication stats
        $media_stats = array();
        if (class_exists('CFRDM_Media')) {
            $media_stats = CFRDM_Media::get_stats();
        }
        
        return new WP_REST_Response(array(
            'success' => true,
            'site' => array(
                'name' => get_bloginfo('name'),
                'description' => get_bloginfo('description'),
                'url' => get_site_url(),
                'admin_email' => get_option('admin_email'),
                'language' => get_locale(),
                'timezone' => get_option('timezone_string') ?: 'UTC',
                'wordpress_version' => get_bloginfo('version'),
                'php_version' => PHP_VERSION,
                'seo_plugin' => $seo_info['plugin'],
                'seo_plugin_name' => $seo_info['name'] ?? '',
                'seo_plugin_version' => $seo_info['version'] ?? '',
                'plugin_version' => CFRDM_VERSION,
                'default_author' => intval(get_option('cfrdm_default_author', 0)),
            ),
            'capabilities' => array(
                'posts' => true,
                'categories' => true,
                'tags' => true,
                'media' => true,
                'media_deduplication' => class_exists('CFRDM_Media'),
                'seo_meta' => class_exists('CFRDM_SEO'),
                'webhooks' => get_option('cfrdm_webhook_enabled', true),
                'schemas' => array('Article', 'Product', 'Review', 'HowTo', 'FAQPage', 'BreadcrumbList'),
            ),
            'media_stats' => $media_stats,
        ), 200);
    }
    
    public static function get_articles($request) {
        $args = array(
            'post_type' => 'post',
            'post_status' => $request->get_param('status') ?: 'any',
            'posts_per_page' => $request->get_param('per_page') ?: 20,
            'paged' => $request->get_param('page') ?: 1,
            'orderby' => $request->get_param('orderby') ?: 'date',
            'order' => $request->get_param('order') ?: 'DESC',
        );
        
        if ($request->get_param('category')) {
            $args['cat'] = intval($request->get_param('category'));
        }
        
        if ($request->get_param('search')) {
            $args['s'] = sanitize_text_field($request->get_param('search'));
        }
        
        $query = new WP_Query($args);
        $articles = array();
        
        foreach ($query->posts as $post) {
            $articles[] = self::format_article($post);
        }
        
        return new WP_REST_Response(array(
            'success' => true,
            'data' => $articles,
            'pagination' => array(
                'total' => $query->found_posts,
                'pages' => $query->max_num_pages,
                'page' => intval($args['paged']),
                'per_page' => intval($args['posts_per_page']),
            ),
        ), 200);
    }
    
    public static function get_article($request) {
        $post = get_post($request->get_param('id'));
        
        if (!$post || $post->post_type !== 'post') {
            return new WP_Error(
                'not_found',
                __('Artigo não encontrado.', 'contentfactory-rdm'),
                array('status' => 404)
            );
        }
        
        return new WP_REST_Response(array(
            'success' => true,
            'data' => self::format_article($post, true),
        ), 200);
    }
    
    public static function create_article($request) {
        $params = $request->get_json_params();
        
        $post_data = array(
            'post_title' => sanitize_text_field($params['title'] ?? ''),
            'post_content' => wp_kses_post($params['content'] ?? ''),
            'post_excerpt' => sanitize_textarea_field($params['excerpt'] ?? ''),
            'post_status' => sanitize_text_field($params['status'] ?? get_option('cfrdm_default_status', 'draft')),
            'post_type' => 'post',
        );
        
        if (!empty($params['slug'])) {
            $post_data['post_name'] = sanitize_title($params['slug']);
        }
        
        if (!empty($params['author'])) {
            $post_data['post_author'] = intval($params['author']);
        } elseif (get_option('cfrdm_default_author')) {
            $post_data['post_author'] = intval(get_option('cfrdm_default_author'));
        }
        
        if (!empty($params['date'])) {
            $post_data['post_date'] = $params['date'];
        }
        
        $post_id = wp_insert_post($post_data, true);
        
        if (is_wp_error($post_id)) {
            return new WP_Error(
                'create_failed',
                $post_id->get_error_message(),
                array('status' => 400)
            );
        }
        
        // Set categories
        if (!empty($params['categories'])) {
            wp_set_post_categories($post_id, array_map('intval', $params['categories']));
        } elseif (get_option('cfrdm_default_category')) {
            wp_set_post_categories($post_id, array(intval(get_option('cfrdm_default_category'))));
        }
        
        // Set tags
        if (!empty($params['tags'])) {
            wp_set_post_tags($post_id, $params['tags']);
        }
        
        // Set featured image
        if (!empty($params['featured_image_id'])) {
            set_post_thumbnail($post_id, intval($params['featured_image_id']));
        }
        
        // Set SEO meta using new SEO class
        if (class_exists('CFRDM_SEO')) {
            $seo_meta = array();
            if (!empty($params['seo_title'])) $seo_meta['title'] = $params['seo_title'];
            if (!empty($params['seo_description'])) $seo_meta['description'] = $params['seo_description'];
            if (!empty($params['focus_keyword'])) $seo_meta['focus_keyword'] = $params['focus_keyword'];
            if (!empty($params['og_title'])) $seo_meta['og_title'] = $params['og_title'];
            if (!empty($params['og_description'])) $seo_meta['og_description'] = $params['og_description'];
            if (!empty($params['og_image'])) $seo_meta['og_image'] = $params['og_image'];
            if (!empty($params['twitter_title'])) $seo_meta['twitter_title'] = $params['twitter_title'];
            if (!empty($params['twitter_description'])) $seo_meta['twitter_description'] = $params['twitter_description'];
            if (!empty($params['twitter_image'])) $seo_meta['twitter_image'] = $params['twitter_image'];
            
            if (!empty($seo_meta)) {
                CFRDM_SEO::set_meta($post_id, $seo_meta);
            }
        } else {
            // Fallback to old method
            self::set_seo_meta($post_id, $params);
        }
        
        // Store ContentFactory ID if provided
        if (!empty($params['cfrdm_id'])) {
            update_post_meta($post_id, '_cfrdm_article_id', sanitize_text_field($params['cfrdm_id']));
        }
        
        // Store article type for schema generation
        if (!empty($params['article_type'])) {
            update_post_meta($post_id, '_cfrdm_article_type', sanitize_text_field($params['article_type']));
        }
        
        // Store HowTo data if provided
        if (!empty($params['howto_steps'])) {
            update_post_meta($post_id, '_cfrdm_is_howto', true);
            update_post_meta($post_id, '_cfrdm_howto_steps', $params['howto_steps']);
            if (!empty($params['howto_time'])) {
                update_post_meta($post_id, '_cfrdm_howto_time', intval($params['howto_time']));
            }
            if (!empty($params['howto_supplies'])) {
                update_post_meta($post_id, '_cfrdm_howto_supplies', $params['howto_supplies']);
            }
            if (!empty($params['howto_tools'])) {
                update_post_meta($post_id, '_cfrdm_howto_tools', $params['howto_tools']);
            }
        }
        
        // Store Review data if provided
        if (!empty($params['review_rating'])) {
            update_post_meta($post_id, '_cfrdm_review_rating', floatval($params['review_rating']));
        }
        if (!empty($params['review_pros'])) {
            update_post_meta($post_id, '_cfrdm_review_pros', $params['review_pros']);
        }
        if (!empty($params['review_cons'])) {
            update_post_meta($post_id, '_cfrdm_review_cons', $params['review_cons']);
        }
        
        // Log action
        CFRDM_Webhooks::log('article_created', array(
            'post_id' => $post_id,
            'title' => $post_data['post_title'],
        ));
        
        return new WP_REST_Response(array(
            'success' => true,
            'message' => __('Artigo criado com sucesso!', 'contentfactory-rdm'),
            'data' => self::format_article(get_post($post_id)),
        ), 201);
    }
    
    public static function update_article($request) {
        $post_id = intval($request->get_param('id'));
        $post = get_post($post_id);
        
        if (!$post || $post->post_type !== 'post') {
            return new WP_Error(
                'not_found',
                __('Artigo não encontrado.', 'contentfactory-rdm'),
                array('status' => 404)
            );
        }
        
        $params = $request->get_json_params();
        $post_data = array('ID' => $post_id);
        
        if (isset($params['title'])) {
            $post_data['post_title'] = sanitize_text_field($params['title']);
        }
        if (isset($params['content'])) {
            $post_data['post_content'] = wp_kses_post($params['content']);
        }
        if (isset($params['excerpt'])) {
            $post_data['post_excerpt'] = sanitize_textarea_field($params['excerpt']);
        }
        if (isset($params['status'])) {
            $post_data['post_status'] = sanitize_text_field($params['status']);
        }
        if (isset($params['slug'])) {
            $post_data['post_name'] = sanitize_title($params['slug']);
        }
        
        $result = wp_update_post($post_data, true);
        
        if (is_wp_error($result)) {
            return new WP_Error(
                'update_failed',
                $result->get_error_message(),
                array('status' => 400)
            );
        }
        
        // Update categories
        if (isset($params['categories'])) {
            wp_set_post_categories($post_id, array_map('intval', $params['categories']));
        }
        
        // Update tags
        if (isset($params['tags'])) {
            wp_set_post_tags($post_id, $params['tags']);
        }
        
        // Update featured image
        if (isset($params['featured_image_id'])) {
            if ($params['featured_image_id']) {
                set_post_thumbnail($post_id, intval($params['featured_image_id']));
            } else {
                delete_post_thumbnail($post_id);
            }
        }
        
        // Update SEO meta
        self::set_seo_meta($post_id, $params);
        
        // Log action
        CFRDM_Webhooks::log('article_updated', array(
            'post_id' => $post_id,
            'title' => get_the_title($post_id),
        ));
        
        return new WP_REST_Response(array(
            'success' => true,
            'message' => __('Artigo atualizado com sucesso!', 'contentfactory-rdm'),
            'data' => self::format_article(get_post($post_id)),
        ), 200);
    }
    
    public static function delete_article($request) {
        $post_id = intval($request->get_param('id'));
        $force = $request->get_param('force') === 'true';
        
        $post = get_post($post_id);
        
        if (!$post || $post->post_type !== 'post') {
            return new WP_Error(
                'not_found',
                __('Artigo não encontrado.', 'contentfactory-rdm'),
                array('status' => 404)
            );
        }
        
        $title = $post->post_title;
        $result = wp_delete_post($post_id, $force);
        
        if (!$result) {
            return new WP_Error(
                'delete_failed',
                __('Erro ao excluir artigo.', 'contentfactory-rdm'),
                array('status' => 400)
            );
        }
        
        // Log action
        CFRDM_Webhooks::log('article_deleted', array(
            'post_id' => $post_id,
            'title' => $title,
            'force' => $force,
        ));
        
        return new WP_REST_Response(array(
            'success' => true,
            'message' => $force 
                ? __('Artigo excluído permanentemente.', 'contentfactory-rdm')
                : __('Artigo movido para lixeira.', 'contentfactory-rdm'),
        ), 200);
    }
    
    public static function get_categories($request) {
        $categories = get_categories(array(
            'hide_empty' => false,
            'orderby' => 'name',
            'order' => 'ASC',
        ));
        
        $data = array();
        foreach ($categories as $cat) {
            $data[] = array(
                'id' => $cat->term_id,
                'name' => $cat->name,
                'slug' => $cat->slug,
                'description' => $cat->description,
                'parent' => $cat->parent,
                'count' => $cat->count,
            );
        }
        
        return new WP_REST_Response(array(
            'success' => true,
            'data' => $data,
        ), 200);
    }
    
    public static function get_tags($request) {
        $tags = get_tags(array(
            'hide_empty' => false,
            'orderby' => 'name',
            'order' => 'ASC',
        ));
        
        $data = array();
        foreach ($tags as $tag) {
            $data[] = array(
                'id' => $tag->term_id,
                'name' => $tag->name,
                'slug' => $tag->slug,
                'description' => $tag->description,
                'count' => $tag->count,
            );
        }
        
        return new WP_REST_Response(array(
            'success' => true,
            'data' => $data,
        ), 200);
    }
    
    public static function upload_media($request) {
        $params = $request->get_json_params();
        
        if (empty($params['image_data'])) {
            return new WP_Error(
                'missing_data',
                __('Dados da imagem não fornecidos.', 'contentfactory-rdm'),
                array('status' => 400)
            );
        }
        
        // Decode base64
        $image_data = preg_replace('/^data:image\/\w+;base64,/', '', $params['image_data']);
        $image_data = base64_decode($image_data);
        
        if ($image_data === false) {
            return new WP_Error(
                'invalid_data',
                __('Dados de imagem inválidos.', 'contentfactory-rdm'),
                array('status' => 400)
            );
        }
        
        // Generate filename
        $filename = sanitize_file_name($params['filename'] ?? 'image-' . time() . '.png');
        $upload = wp_upload_bits($filename, null, $image_data);
        
        if ($upload['error']) {
            return new WP_Error(
                'upload_failed',
                $upload['error'],
                array('status' => 400)
            );
        }
        
        // Create attachment
        $attachment = array(
            'post_mime_type' => wp_check_filetype($filename)['type'] ?: 'image/png',
            'post_title' => sanitize_text_field($params['title'] ?? pathinfo($filename, PATHINFO_FILENAME)),
            'post_content' => '',
            'post_status' => 'inherit',
        );
        
        $attach_id = wp_insert_attachment($attachment, $upload['file']);
        
        if (is_wp_error($attach_id)) {
            return new WP_Error(
                'attachment_failed',
                $attach_id->get_error_message(),
                array('status' => 400)
            );
        }
        
        // Generate metadata
        require_once(ABSPATH . 'wp-admin/includes/image.php');
        $attach_data = wp_generate_attachment_metadata($attach_id, $upload['file']);
        wp_update_attachment_metadata($attach_id, $attach_data);
        
        // Set alt text
        if (!empty($params['alt'])) {
            update_post_meta($attach_id, '_wp_attachment_image_alt', sanitize_text_field($params['alt']));
        }
        
        return new WP_REST_Response(array(
            'success' => true,
            'message' => __('Imagem enviada com sucesso!', 'contentfactory-rdm'),
            'data' => array(
                'id' => $attach_id,
                'url' => wp_get_attachment_url($attach_id),
                'title' => get_the_title($attach_id),
                'sizes' => wp_get_attachment_image_src($attach_id, 'full'),
            ),
        ), 201);
    }
    
    public static function regenerate_api_key($request) {
        $new_key = wp_generate_uuid4();
        update_option('cfrdm_api_key', $new_key);
        
        CFRDM_Webhooks::log('api_key_regenerated', array(
            'user' => get_current_user_id(),
        ));
        
        return new WP_REST_Response(array(
            'success' => true,
            'message' => __('API Key regenerada com sucesso!', 'contentfactory-rdm'),
            'api_key' => $new_key,
        ), 200);
    }
    
    private static function format_article($post, $full = false) {
        $data = array(
            'id' => $post->ID,
            'title' => $post->post_title,
            'slug' => $post->post_name,
            'status' => $post->post_status,
            'date' => $post->post_date,
            'modified' => $post->post_modified,
            'link' => get_permalink($post->ID),
            'author' => array(
                'id' => $post->post_author,
                'name' => get_the_author_meta('display_name', $post->post_author),
            ),
            'categories' => wp_get_post_categories($post->ID),
            'tags' => wp_get_post_tags($post->ID, array('fields' => 'ids')),
            'featured_image' => get_the_post_thumbnail_url($post->ID, 'full'),
            'cfrdm_id' => get_post_meta($post->ID, '_cfrdm_article_id', true),
        );
        
        if ($full) {
            $data['content'] = $post->post_content;
            $data['excerpt'] = $post->post_excerpt;
            $data['seo'] = self::get_seo_meta($post->ID);
        }
        
        return $data;
    }
    
    private static function get_seo_meta($post_id) {
        // Use new SEO class if available
        if (class_exists('CFRDM_SEO')) {
            return CFRDM_SEO::get_meta($post_id);
        }
        
        // Fallback
        $seo = array(
            'title' => '',
            'description' => '',
            'focus_keyword' => '',
        );
        
        // Yoast SEO
        if (class_exists('WPSEO_Meta')) {
            $seo['title'] = get_post_meta($post_id, '_yoast_wpseo_title', true);
            $seo['description'] = get_post_meta($post_id, '_yoast_wpseo_metadesc', true);
            $seo['focus_keyword'] = get_post_meta($post_id, '_yoast_wpseo_focuskw', true);
        }
        
        // Rank Math
        if (class_exists('RankMath')) {
            $seo['title'] = get_post_meta($post_id, 'rank_math_title', true) ?: $seo['title'];
            $seo['description'] = get_post_meta($post_id, 'rank_math_description', true) ?: $seo['description'];
            $seo['focus_keyword'] = get_post_meta($post_id, 'rank_math_focus_keyword', true) ?: $seo['focus_keyword'];
        }
        
        return $seo;
    }
    
    private static function set_seo_meta($post_id, $params) {
        if (isset($params['seo_title'])) {
            // Yoast
            update_post_meta($post_id, '_yoast_wpseo_title', sanitize_text_field($params['seo_title']));
            // Rank Math
            update_post_meta($post_id, 'rank_math_title', sanitize_text_field($params['seo_title']));
        }
        
        if (isset($params['seo_description'])) {
            // Yoast
            update_post_meta($post_id, '_yoast_wpseo_metadesc', sanitize_textarea_field($params['seo_description']));
            // Rank Math
            update_post_meta($post_id, 'rank_math_description', sanitize_textarea_field($params['seo_description']));
        }
        
        if (isset($params['focus_keyword'])) {
            // Yoast
            update_post_meta($post_id, '_yoast_wpseo_focuskw', sanitize_text_field($params['focus_keyword']));
            // Rank Math
            update_post_meta($post_id, 'rank_math_focus_keyword', sanitize_text_field($params['focus_keyword']));
        }
    }
    
    /**
     * Import media from URL with deduplication
     */
    public static function import_media($request) {
        $params = $request->get_json_params();
        
        if (empty($params['url'])) {
            return new WP_Error(
                'missing_url',
                __('URL da imagem não fornecida.', 'contentfactory-rdm'),
                array('status' => 400)
            );
        }
        
        // Check if CFRDM_Media class exists
        if (!class_exists('CFRDM_Media')) {
            return new WP_Error(
                'class_not_found',
                __('Classe de mídia não encontrada.', 'contentfactory-rdm'),
                array('status' => 500)
            );
        }
        
        $post_id = intval($params['post_id'] ?? 0);
        $options = array(
            'alt' => sanitize_text_field($params['alt'] ?? ''),
            'title' => sanitize_text_field($params['title'] ?? ''),
            'filename' => sanitize_file_name($params['filename'] ?? ''),
        );
        
        $result = CFRDM_Media::import_image($params['url'], $post_id, $options);
        
        if (is_wp_error($result)) {
            return new WP_Error(
                'import_failed',
                $result->get_error_message(),
                array('status' => 400)
            );
        }
        
        // Set as featured image if requested
        if (!empty($params['set_featured']) && $post_id) {
            set_post_thumbnail($post_id, $result['attachment_id']);
        }
        
        return new WP_REST_Response(array(
            'success' => true,
            'message' => $result['deduplicated'] 
                ? __('Imagem existente reutilizada (deduplicada).', 'contentfactory-rdm')
                : __('Imagem importada com sucesso!', 'contentfactory-rdm'),
            'data' => array(
                'id' => $result['attachment_id'],
                'url' => $result['url'],
                'deduplicated' => $result['deduplicated'],
            ),
        ), 201);
    }
    
    /**
     * Verify connection callback - called by platform when token is saved
     */
    public static function verify_connection_callback($request) {
        $params = $request->get_json_params();
        
        // Store the API URL from the platform
        if (!empty($params['api_url'])) {
            update_option('cfrdm_api_url', esc_url_raw($params['api_url']));
        }
        
        // Store project ID if provided
        if (!empty($params['project_id'])) {
            update_option('cfrdm_project_id', sanitize_text_field($params['project_id']));
        }
        
        // Log the connection verification
        CFRDM_Webhooks::log('connection_verified', array(
            'api_url' => $params['api_url'] ?? '',
            'project_id' => $params['project_id'] ?? '',
            'timestamp' => current_time('c'),
        ));
        
        // Return site info for platform to store
        return new WP_REST_Response(array(
            'success' => true,
            'message' => __('Conexão verificada com sucesso!', 'contentfactory-rdm'),
            'site' => array(
                'name' => get_bloginfo('name'),
                'url' => get_site_url(),
                'rest_url' => rest_url('cfrdm/v1/'),
                'wordpress_version' => get_bloginfo('version'),
                'plugin_version' => CFRDM_VERSION,
                'seo_plugin' => class_exists('CFRDM_SEO') ? CFRDM_SEO::detect_seo_plugin() : 'none',
                'capabilities' => array(
                    'media_deduplication' => class_exists('CFRDM_Media'),
                    'advanced_seo' => class_exists('CFRDM_SEO'),
                    'schemas' => class_exists('CFRDM_Schema_Validator'),
                ),
            ),
        ), 200);
    }
    
    /**
     * Get SEO plugin info
     */
    public static function get_seo_info($request) {
        if (!class_exists('CFRDM_SEO')) {
            return new WP_REST_Response(array(
                'success' => true,
                'plugin' => 'none',
                'features' => array(),
            ), 200);
        }
        
        return new WP_REST_Response(array(
            'success' => true,
            'data' => CFRDM_SEO::get_plugin_info(),
        ), 200);
    }
    
    /**
     * Generate SEO metadata using AI
     */
    public static function generate_seo($request) {
        $params = $request->get_json_params();
        
        $post_id = isset($params['post_id']) ? intval($params['post_id']) : 0;
        
        if (!$post_id) {
            return new WP_Error(
                'missing_post_id',
                __('ID do post é obrigatório.', 'contentfactory-rdm'),
                array('status' => 400)
            );
        }
        
        $post = get_post($post_id);
        if (!$post) {
            return new WP_Error(
                'not_found',
                __('Post não encontrado.', 'contentfactory-rdm'),
                array('status' => 404)
            );
        }
        
        if (!class_exists('CFRDM_AI_SEO')) {
            return new WP_Error(
                'not_available',
                __('Módulo de SEO via IA não disponível.', 'contentfactory-rdm'),
                array('status' => 500)
            );
        }
        
        $options = array(
            'language' => isset($params['language']) ? sanitize_text_field($params['language']) : 'pt-BR',
            'country' => isset($params['country']) ? sanitize_text_field($params['country']) : 'Brasil',
            'apply_to_post' => isset($params['apply']) ? (bool) $params['apply'] : false,
        );
        
        if (!empty($params['title'])) {
            $options['title'] = sanitize_text_field($params['title']);
        }
        if (!empty($params['content'])) {
            $options['content'] = wp_kses_post($params['content']);
        }
        
        $result = CFRDM_AI_SEO::generate($post_id, $options);
        
        if (is_wp_error($result)) {
            return new WP_Error(
                'generation_failed',
                $result->get_error_message(),
                array('status' => 500)
            );
        }
        
        CFRDM_Logger::success('api', 'SEO gerado via IA', array(
            'post_id' => $post_id,
        ), $post_id);
        
        return new WP_REST_Response(array(
            'success' => true,
            'data' => $result,
        ), 200);
    }
    
    /**
     * Get structured logs
     */
    public static function get_structured_logs($request) {
        if (!class_exists('CFRDM_Structured_Logs')) {
            return new WP_Error(
                'not_available',
                __('Módulo de logs estruturados não disponível.', 'contentfactory-rdm'),
                array('status' => 500)
            );
        }
        
        $args = array(
            'article_id' => $request->get_param('article_id'),
            'post_id' => $request->get_param('post_id'),
            'status' => $request->get_param('status'),
            'step' => $request->get_param('step'),
            'limit' => $request->get_param('limit') ?: 50,
            'offset' => $request->get_param('offset') ?: 0,
            'order_by' => $request->get_param('order_by') ?: 'created_at',
            'order' => $request->get_param('order') ?: 'DESC',
        );
        
        $result = CFRDM_Structured_Logs::get_logs($args);
        
        return new WP_REST_Response(array(
            'success' => true,
            'data' => $result['logs'],
            'pagination' => array(
                'total' => $result['total'],
                'limit' => $result['limit'],
                'offset' => $result['offset'],
                'pages' => $result['pages'],
            ),
        ), 200);
    }
    
    /**
     * Get log statistics
     */
    public static function get_log_stats($request) {
        if (!class_exists('CFRDM_Structured_Logs')) {
            return new WP_Error(
                'not_available',
                __('Módulo de logs estruturados não disponível.', 'contentfactory-rdm'),
                array('status' => 500)
            );
        }
        
        $days = $request->get_param('days') ?: 7;
        $stats = CFRDM_Structured_Logs::get_stats(intval($days));
        
        return new WP_REST_Response(array(
            'success' => true,
            'data' => $stats,
        ), 200);
    }
    
    // ===== Social Poster API Methods =====
    
    /**
     * Get social accounts
     */
    public static function get_social_accounts($request) {
        $network = $request->get_param('network');
        $active_only = $request->get_param('active_only') !== 'false';
        
        $accounts = CFRDM_Social_Poster::get_accounts($network, $active_only);
        
        return new WP_REST_Response(array(
            'success' => true,
            'data' => $accounts,
        ), 200);
    }
    
    /**
     * Add social account
     */
    public static function add_social_account($request) {
        $params = $request->get_json_params();
        
        if (empty($params['network']) || empty($params['account_name'])) {
            return new WP_Error(
                'missing_fields',
                __('network e account_name são obrigatórios.', 'contentfactory-rdm'),
                array('status' => 400)
            );
        }
        
        $id = CFRDM_Social_Poster::add_account($params);
        
        if (!$id) {
            return new WP_Error(
                'create_failed',
                __('Falha ao adicionar conta social.', 'contentfactory-rdm'),
                array('status' => 500)
            );
        }
        
        return new WP_REST_Response(array(
            'success' => true,
            'message' => __('Conta social adicionada!', 'contentfactory-rdm'),
            'id' => $id,
        ), 201);
    }
    
    /**
     * Update social account
     */
    public static function update_social_account($request) {
        $id = intval($request->get_param('id'));
        $params = $request->get_json_params();
        
        $result = CFRDM_Social_Poster::update_account($id, $params);
        
        return new WP_REST_Response(array(
            'success' => $result !== false,
            'message' => $result !== false 
                ? __('Conta atualizada!', 'contentfactory-rdm')
                : __('Falha ao atualizar.', 'contentfactory-rdm'),
        ), 200);
    }
    
    /**
     * Delete social account
     */
    public static function delete_social_account($request) {
        $id = intval($request->get_param('id'));
        
        CFRDM_Social_Poster::delete_account($id);
        
        return new WP_REST_Response(array(
            'success' => true,
            'message' => __('Conta removida!', 'contentfactory-rdm'),
        ), 200);
    }
    
    /**
     * Get social queue
     */
    public static function get_social_queue($request) {
        $args = array(
            'post_id' => $request->get_param('post_id'),
            'account_id' => $request->get_param('account_id'),
            'network' => $request->get_param('network'),
            'status' => $request->get_param('status'),
            'limit' => $request->get_param('limit') ?: 50,
        );
        
        $items = CFRDM_Social_Poster::get_queue($args);
        
        return new WP_REST_Response(array(
            'success' => true,
            'data' => $items,
        ), 200);
    }
    
    /**
     * Queue social post
     */
    public static function queue_social_post($request) {
        $params = $request->get_json_params();
        
        if (empty($params['post_id']) || empty($params['account_id'])) {
            return new WP_Error(
                'missing_fields',
                __('post_id e account_id são obrigatórios.', 'contentfactory-rdm'),
                array('status' => 400)
            );
        }
        
        $result = CFRDM_Social_Poster::queue_post(
            $params['post_id'],
            $params['account_id'],
            $params['options'] ?? array()
        );
        
        if (is_wp_error($result)) {
            return $result;
        }
        
        return new WP_REST_Response(array(
            'success' => true,
            'message' => __('Post adicionado à fila!', 'contentfactory-rdm'),
            'queue_id' => $result,
        ), 201);
    }
    
    /**
     * Get social queue stats
     */
    public static function get_social_queue_stats($request) {
        $stats = CFRDM_Social_Poster::get_queue_stats();
        
        return new WP_REST_Response(array(
            'success' => true,
            'data' => $stats,
        ), 200);
    }
    
    /**
     * Get available social networks
     */
    public static function get_social_networks($request) {
        return new WP_REST_Response(array(
            'success' => true,
            'data' => CFRDM_Social_Poster::get_networks(),
        ), 200);
    }
    
    // ===== Content Queue API Methods =====
    
    /**
     * Get content queue
     */
    public static function get_content_queue($request) {
        $args = array(
            'queue_type' => $request->get_param('queue_type'),
            'action' => $request->get_param('action'),
            'status' => $request->get_param('status'),
            'post_id' => $request->get_param('post_id'),
            'article_id' => $request->get_param('article_id'),
            'project_id' => $request->get_param('project_id'),
            'limit' => $request->get_param('limit') ?: 50,
            'offset' => $request->get_param('offset') ?: 0,
        );
        
        $items = CFRDM_Content_Queue::get_items($args);
        
        return new WP_REST_Response(array(
            'success' => true,
            'data' => $items,
        ), 200);
    }
    
    /**
     * Push to content queue
     */
    public static function push_to_content_queue($request) {
        $params = $request->get_json_params();
        
        if (empty($params['queue_type']) || empty($params['action']) || !isset($params['payload'])) {
            return new WP_Error(
                'missing_fields',
                __('queue_type, action e payload são obrigatórios.', 'contentfactory-rdm'),
                array('status' => 400)
            );
        }
        
        $id = CFRDM_Content_Queue::push(
            $params['queue_type'],
            $params['action'],
            $params['payload'],
            $params['options'] ?? array()
        );
        
        if (!$id) {
            return new WP_Error(
                'queue_failed',
                __('Falha ao adicionar à fila.', 'contentfactory-rdm'),
                array('status' => 500)
            );
        }
        
        return new WP_REST_Response(array(
            'success' => true,
            'message' => __('Item adicionado à fila!', 'contentfactory-rdm'),
            'queue_id' => $id,
        ), 201);
    }
    
    /**
     * Get content queue stats
     */
    public static function get_content_queue_stats($request) {
        $queue_type = $request->get_param('queue_type');
        $stats = CFRDM_Content_Queue::get_stats($queue_type);
        
        return new WP_REST_Response(array(
            'success' => true,
            'data' => $stats,
        ), 200);
    }
    
    /**
     * Content queue item action
     */
    public static function content_queue_action($request) {
        $id = intval($request->get_param('id'));
        $action = $request->get_param('action');
        
        switch ($action) {
            case 'cancel':
                $result = CFRDM_Content_Queue::cancel($id);
                break;
            case 'retry':
                $result = CFRDM_Content_Queue::retry($id);
                break;
            case 'pause':
                $result = CFRDM_Content_Queue::pause($id);
                break;
            case 'resume':
                $result = CFRDM_Content_Queue::resume($id);
                break;
            default:
                return new WP_Error(
                    'invalid_action',
                    __('Ação inválida.', 'contentfactory-rdm'),
                    array('status' => 400)
                );
        }
        
        return new WP_REST_Response(array(
            'success' => $result !== false,
            'message' => $result !== false 
                ? __('Ação executada!', 'contentfactory-rdm')
                : __('Falha ao executar ação.', 'contentfactory-rdm'),
        ), 200);
    }
    
    // ===== Cron Scheduler API Methods =====
    
    /**
     * Get cron jobs
     */
    public static function get_cron_jobs($request) {
        $enabled_only = $request->get_param('enabled_only') === 'true';
        $jobs = CFRDM_Cron_Scheduler::get_jobs($enabled_only);
        
        return new WP_REST_Response(array(
            'success' => true,
            'data' => $jobs,
        ), 200);
    }
    
    /**
     * Toggle cron job
     */
    public static function toggle_cron_job($request) {
        $id = intval($request->get_param('id'));
        $params = $request->get_json_params();
        $enabled = isset($params['enabled']) ? (bool) $params['enabled'] : true;
        
        $result = CFRDM_Cron_Scheduler::toggle_job($id, $enabled);
        
        return new WP_REST_Response(array(
            'success' => $result !== false,
            'message' => $result !== false 
                ? ($enabled ? __('Job ativado!', 'contentfactory-rdm') : __('Job desativado!', 'contentfactory-rdm'))
                : __('Falha ao alterar status.', 'contentfactory-rdm'),
        ), 200);
    }
    
    /**
     * Run cron job manually
     */
    public static function run_cron_job($request) {
        $name = sanitize_text_field($request->get_param('name'));
        
        $result = CFRDM_Cron_Scheduler::run_job($name, true);
        
        if (is_wp_error($result)) {
            return $result;
        }
        
        return new WP_REST_Response(array(
            'success' => true,
            'message' => __('Job executado!', 'contentfactory-rdm'),
            'data' => $result,
        ), 200);
    }
    
    /**
     * Get cron history
     */
    public static function get_cron_history($request) {
        $job_name = $request->get_param('job_name');
        $limit = $request->get_param('limit') ?: 50;
        
        $history = CFRDM_Cron_Scheduler::get_history($job_name, $limit);
        
        return new WP_REST_Response(array(
            'success' => true,
            'data' => $history,
        ), 200);
    }
    
    /**
     * Get cron diagnostics
     */
    public static function get_cron_diagnostics($request) {
        $diagnostics = CFRDM_Cron_Scheduler::get_diagnostics();
        
        return new WP_REST_Response(array(
            'success' => true,
            'data' => $diagnostics,
        ), 200);
    }
    
    /**
     * Check tables status (public endpoint for diagnostics)
     */
    public static function check_tables_status($request) {
        global $wpdb;
        
        $tables = array(
            'cfrdm_logs' => defined('CFRDM_LOG_TABLE') ? CFRDM_LOG_TABLE : 'cfrdm_logs',
            'cfrdm_news' => defined('CFRDM_NEWS_TABLE') ? CFRDM_NEWS_TABLE : 'cfrdm_news',
            'cfrdm_structured_logs' => defined('CFRDM_STRUCTURED_LOGS_TABLE') ? CFRDM_STRUCTURED_LOGS_TABLE : 'cfrdm_structured_logs',
            'cfrdm_social_queue' => defined('CFRDM_SOCIAL_QUEUE_TABLE') ? CFRDM_SOCIAL_QUEUE_TABLE : 'cfrdm_social_queue',
            'cfrdm_social_accounts' => defined('CFRDM_SOCIAL_ACCOUNTS_TABLE') ? CFRDM_SOCIAL_ACCOUNTS_TABLE : 'cfrdm_social_accounts',
            'cfrdm_cron_jobs' => defined('CFRDM_CRON_JOBS_TABLE') ? CFRDM_CRON_JOBS_TABLE : 'cfrdm_cron_jobs',
            'cfrdm_cron_history' => defined('CFRDM_CRON_HISTORY_TABLE') ? CFRDM_CRON_HISTORY_TABLE : 'cfrdm_cron_history',
            'cfrdm_content_queue' => defined('CFRDM_CONTENT_QUEUE_TABLE') ? CFRDM_CONTENT_QUEUE_TABLE : 'cfrdm_content_queue',
            'cfrdm_fix_queue' => defined('CFRDM_FIX_QUEUE_TABLE') ? CFRDM_FIX_QUEUE_TABLE : 'cfrdm_fix_queue',
            'cfrdm_ubersuggest_data' => defined('CFRDM_UBERSUGGEST_TABLE') ? CFRDM_UBERSUGGEST_TABLE : 'cfrdm_ubersuggest_data',
        );
        
        $status = array();
        $missing = array();
        
        foreach ($tables as $key => $table_name) {
            $full_table = $wpdb->prefix . $table_name;
            $exists = !empty($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $full_table)));
            $status[$key] = $exists;
            if (!$exists) {
                $missing[] = $key;
            }
        }
        
        // Check API key
        $api_key = get_option('cfrdm_api_key');
        $has_api_key = !empty($api_key);
        
        return new WP_REST_Response(array(
            'success' => true,
            'tables' => $status,
            'missing' => $missing,
            'has_api_key' => $has_api_key,
            'needs_repair' => !empty($missing) || !$has_api_key,
        ), 200);
    }
    
    /**
     * Repair/recreate database tables
     */
    public static function repair_tables($request) {
        global $wpdb;
        
        $charset_collate = $wpdb->get_charset_collate();
        $created = array();
        $verified = array();
        $errors = array();
        
        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        
        // Logs table
        $logs_table = $wpdb->prefix . CFRDM_LOG_TABLE;
        $sql_logs = "CREATE TABLE IF NOT EXISTS $logs_table (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            log_type varchar(50) NOT NULL DEFAULT 'info',
            category varchar(50) NOT NULL DEFAULT 'general',
            message text NOT NULL,
            context longtext,
            post_id bigint(20) DEFAULT NULL,
            user_id bigint(20) DEFAULT NULL,
            ip_address varchar(45) DEFAULT NULL,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY log_type (log_type),
            KEY category (category),
            KEY post_id (post_id),
            KEY created_at (created_at)
        ) $charset_collate;";
        
        dbDelta($sql_logs);
        if ($wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s", $logs_table))) {
            $created[] = 'cfrdm_logs';
        } else {
            $errors[] = 'cfrdm_logs: ' . $wpdb->last_error;
        }
        
        // News table
        $news_table = $wpdb->prefix . CFRDM_NEWS_TABLE;
        $sql_news = "CREATE TABLE IF NOT EXISTS $news_table (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            news_id varchar(100) NOT NULL,
            title varchar(255) NOT NULL,
            content text,
            news_type varchar(50) DEFAULT 'update',
            priority int(11) DEFAULT 0,
            link varchar(500) DEFAULT NULL,
            is_read tinyint(1) DEFAULT 0,
            is_dismissed tinyint(1) DEFAULT 0,
            published_at datetime DEFAULT NULL,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY news_id (news_id),
            KEY news_type (news_type),
            KEY is_dismissed (is_dismissed)
        ) $charset_collate;";
        
        dbDelta($sql_news);
        if ($wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s", $news_table))) {
            $created[] = 'cfrdm_news';
        } else {
            $errors[] = 'cfrdm_news: ' . $wpdb->last_error;
        }
        
        // Structured logs table (cfrdm_structured_logs)
        $structured_logs_table = $wpdb->prefix . (defined('CFRDM_STRUCTURED_LOGS_TABLE') ? CFRDM_STRUCTURED_LOGS_TABLE : 'cfrdm_structured_logs');
        $sql_structured = "CREATE TABLE IF NOT EXISTS $structured_logs_table (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            article_id varchar(50) DEFAULT NULL,
            post_id bigint(20) DEFAULT NULL,
            source_url varchar(500) DEFAULT NULL,
            source_title varchar(500) DEFAULT NULL,
            status varchar(50) DEFAULT 'processing',
            step varchar(50) DEFAULT 'init',
            message text,
            error_details text,
            metadata longtext,
            duration_ms int DEFAULT NULL,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY article_id (article_id),
            KEY post_id (post_id),
            KEY status (status),
            KEY step (step),
            KEY created_at (created_at)
        ) $charset_collate;";
        
        dbDelta($sql_structured);
        if ($wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s", $structured_logs_table))) {
            $created[] = 'cfrdm_structured_logs';
        } else {
            $errors[] = 'cfrdm_structured_logs: ' . $wpdb->last_error;
        }
        
        // Social queue table
        if (class_exists('CFRDM_Social_Poster')) {
            CFRDM_Social_Poster::create_tables();
        }
        $social_queue_table = $wpdb->prefix . (defined('CFRDM_SOCIAL_QUEUE_TABLE') ? CFRDM_SOCIAL_QUEUE_TABLE : 'cfrdm_social_queue');
        $social_accounts_table = $wpdb->prefix . (defined('CFRDM_SOCIAL_ACCOUNTS_TABLE') ? CFRDM_SOCIAL_ACCOUNTS_TABLE : 'cfrdm_social_accounts');
        if ($wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s", $social_queue_table))) {
            $created[] = 'cfrdm_social_queue';
        }
        if ($wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s", $social_accounts_table))) {
            $created[] = 'cfrdm_social_accounts';
        }
        
        // Cron tables
        if (class_exists('CFRDM_Cron_Scheduler')) {
            CFRDM_Cron_Scheduler::create_tables();
        }
        $cron_jobs_table = $wpdb->prefix . (defined('CFRDM_CRON_JOBS_TABLE') ? CFRDM_CRON_JOBS_TABLE : 'cfrdm_cron_jobs');
        $cron_history_table = $wpdb->prefix . (defined('CFRDM_CRON_HISTORY_TABLE') ? CFRDM_CRON_HISTORY_TABLE : 'cfrdm_cron_history');
        if ($wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s", $cron_jobs_table))) {
            $created[] = 'cfrdm_cron_jobs';
        }
        if ($wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s", $cron_history_table))) {
            $created[] = 'cfrdm_cron_history';
        }
        
        // Content queue table
        if (class_exists('CFRDM_Content_Queue')) {
            CFRDM_Content_Queue::create_table();
        }
        $content_queue_table = $wpdb->prefix . (defined('CFRDM_CONTENT_QUEUE_TABLE') ? CFRDM_CONTENT_QUEUE_TABLE : 'cfrdm_content_queue');
        if ($wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s", $content_queue_table))) {
            $created[] = 'cfrdm_content_queue';
        }
        
        // v3.0.0 - AI Auto-Fix tables
        if (class_exists('CFRDM_AI_Auto_Fix')) {
            CFRDM_AI_Auto_Fix::create_table();
        }
        $fix_queue_table = $wpdb->prefix . (defined('CFRDM_FIX_QUEUE_TABLE') ? CFRDM_FIX_QUEUE_TABLE : 'cfrdm_fix_queue');
        if ($wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s", $fix_queue_table))) {
            $created[] = 'cfrdm_fix_queue';
        }
        
        // Ubersuggest table
        if (class_exists('CFRDM_Ubersuggest_Sync')) {
            CFRDM_Ubersuggest_Sync::create_table();
        }
        $ubersuggest_table = $wpdb->prefix . (defined('CFRDM_UBERSUGGEST_TABLE') ? CFRDM_UBERSUGGEST_TABLE : 'cfrdm_ubersuggest_data');
        if ($wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s", $ubersuggest_table))) {
            $created[] = 'cfrdm_ubersuggest_data';
        }
        
        // Always regenerate API key if missing or empty
        $current_key = get_option('cfrdm_api_key');
        $api_key_generated = false;
        if (empty($current_key)) {
            $new_key = wp_generate_uuid4();
            update_option('cfrdm_api_key', $new_key);
            $api_key_generated = true;
        }
        
        // Log the repair
        if (class_exists('CFRDM_Logger') && cfrdm_tables_exist()) {
            CFRDM_Logger::log('system', 'Tabelas reparadas via API REST', array(
                'created' => $created,
                'errors' => $errors,
                'api_key_generated' => $api_key_generated,
            ));
        }
        
        if (!empty($errors)) {
            return new WP_REST_Response(array(
                'success' => false,
                'message' => __('Algumas tabelas não puderam ser criadas.', 'contentfactory-rdm'),
                'created' => $created,
                'errors' => $errors,
                'api_key_generated' => $api_key_generated,
            ), 500);
        }
        
        return new WP_REST_Response(array(
            'success' => true,
            'message' => __('Todas as tabelas foram criadas/verificadas com sucesso!', 'contentfactory-rdm'),
            'created' => $created,
            'api_key_generated' => $api_key_generated,
        ), 200);
    }
    
    // ===== v3.0.0 - GSC Integration Methods =====
    
    /**
     * Get GSC connection status
     */
    public static function get_gsc_status($request) {
        if (!class_exists('CFRDM_GSC_Integration')) {
            return new WP_REST_Response(array(
                'success' => false,
                'message' => __('Módulo GSC não disponível', 'contentfactory-rdm'),
            ), 400);
        }
        
        $status = CFRDM_GSC_Integration::get_connection_status();
        $stats = CFRDM_GSC_Integration::get_stats();
        
        return new WP_REST_Response(array(
            'success' => true,
            'status' => $status,
            'stats' => $stats,
        ), 200);
    }
    
    /**
     * Trigger GSC sync manually
     */
    public static function trigger_gsc_sync($request) {
        if (!class_exists('CFRDM_GSC_Integration')) {
            return new WP_REST_Response(array(
                'success' => false,
                'message' => __('Módulo GSC não disponível', 'contentfactory-rdm'),
            ), 400);
        }
        
        $gsc = CFRDM_GSC_Integration::get_instance();
        
        if (!CFRDM_GSC_Integration::is_connected()) {
            return new WP_REST_Response(array(
                'success' => false,
                'message' => __('GSC não está conectado', 'contentfactory-rdm'),
            ), 400);
        }
        
        $gsc->sync_gsc_data();
        
        return new WP_REST_Response(array(
            'success' => true,
            'message' => __('Sincronização iniciada', 'contentfactory-rdm'),
        ), 200);
    }
    
    /**
     * Disconnect from GSC
     */
    public static function disconnect_gsc($request) {
        if (!class_exists('CFRDM_GSC_Integration')) {
            return new WP_REST_Response(array(
                'success' => false,
                'message' => __('Módulo GSC não disponível', 'contentfactory-rdm'),
            ), 400);
        }
        
        $gsc = CFRDM_GSC_Integration::get_instance();
        $gsc->disconnect();
        
        return new WP_REST_Response(array(
            'success' => true,
            'message' => __('GSC desconectado', 'contentfactory-rdm'),
        ), 200);
    }
    
    // ===== v3.0.0 - AI Auto-Fix Methods =====
    
    /**
     * Get fix queue items
     */
    public static function get_fix_queue($request) {
        if (!class_exists('CFRDM_AI_Auto_Fix')) {
            return new WP_REST_Response(array(
                'success' => false,
                'message' => __('Módulo AI Auto-Fix não disponível', 'contentfactory-rdm'),
            ), 400);
        }
        
        $status = $request->get_param('status');
        $limit = intval($request->get_param('limit')) ?: 50;
        
        $items = CFRDM_AI_Auto_Fix::get_queue($status, $limit);
        
        return new WP_REST_Response(array(
            'success' => true,
            'items' => $items,
            'count' => count($items),
        ), 200);
    }
    
    /**
     * Get fix queue stats
     */
    public static function get_fix_queue_stats($request) {
        global $wpdb;
        
        $table = $wpdb->prefix . 'cfrdm_fix_queue';
        
        // Check if table exists
        if ($wpdb->get_var("SHOW TABLES LIKE '$table'") !== $table) {
            return new WP_REST_Response(array(
                'success' => false,
                'message' => __('Tabela não encontrada', 'contentfactory-rdm'),
            ), 400);
        }
        
        $stats = array(
            'pending' => $wpdb->get_var("SELECT COUNT(*) FROM $table WHERE status = 'pending'") ?: 0,
            'processing' => $wpdb->get_var("SELECT COUNT(*) FROM $table WHERE status = 'processing'") ?: 0,
            'completed' => $wpdb->get_var("SELECT COUNT(*) FROM $table WHERE status = 'completed'") ?: 0,
            'failed' => $wpdb->get_var("SELECT COUNT(*) FROM $table WHERE status = 'failed'") ?: 0,
            'total' => $wpdb->get_var("SELECT COUNT(*) FROM $table") ?: 0,
        );
        
        // Get by issue type
        $by_type = $wpdb->get_results("
            SELECT issue_type, COUNT(*) as count 
            FROM $table 
            GROUP BY issue_type
        ", ARRAY_A);
        
        $stats['by_type'] = array();
        foreach ($by_type as $row) {
            $stats['by_type'][$row['issue_type']] = intval($row['count']);
        }
        
        return new WP_REST_Response(array(
            'success' => true,
            'stats' => $stats,
        ), 200);
    }
    
    /**
     * Trigger fix queue processing
     */
    public static function process_fix_queue($request) {
        if (!class_exists('CFRDM_AI_Auto_Fix')) {
            return new WP_REST_Response(array(
                'success' => false,
                'message' => __('Módulo AI Auto-Fix não disponível', 'contentfactory-rdm'),
            ), 400);
        }
        
        $limit = intval($request->get_param('limit')) ?: 10;
        
        $autofix = CFRDM_AI_Auto_Fix::get_instance();
        $autofix->process_queue($limit);
        
        return new WP_REST_Response(array(
            'success' => true,
            'message' => __('Processamento da fila iniciado', 'contentfactory-rdm'),
        ), 200);
    }
    
    // ===== Auto-Update Endpoints =====
    
    /**
     * Check for plugin updates
     */
    public static function check_for_updates($request) {
        if (!class_exists('CFRDM_Auto_Update')) {
            return new WP_REST_Response(array(
                'success' => false,
                'message' => __('Módulo de auto-update não disponível', 'contentfactory-rdm'),
            ), 400);
        }
        
        $updater = CFRDM_Auto_Update::get_instance();
        $update_info = $updater->check_for_updates();
        
        return new WP_REST_Response(array(
            'success' => true,
            'current_version' => CFRDM_VERSION,
            'update_available' => !empty($update_info),
            'update_info' => $update_info ?: null,
        ), 200);
    }
    
    /**
     * Get update status
     */
    public static function get_update_status($request) {
        if (!class_exists('CFRDM_Auto_Update')) {
            return new WP_REST_Response(array(
                'success' => false,
                'message' => __('Módulo de auto-update não disponível', 'contentfactory-rdm'),
            ), 400);
        }
        
        $stats = CFRDM_Auto_Update::get_stats();
        $backups = CFRDM_Auto_Update::get_backups();
        
        return new WP_REST_Response(array(
            'success' => true,
            'stats' => $stats,
            'backups' => array_map(function($backup) {
                return array(
                    'version' => $backup['version'],
                    'created_at' => $backup['created_at'],
                    'exists' => file_exists($backup['path']),
                );
            }, $backups),
        ), 200);
    }
    
    /**
     * Apply pending update
     */
    public static function apply_update($request) {
        if (!class_exists('CFRDM_Auto_Update')) {
            return new WP_REST_Response(array(
                'success' => false,
                'message' => __('Módulo de auto-update não disponível', 'contentfactory-rdm'),
            ), 400);
        }
        
        $updater = CFRDM_Auto_Update::get_instance();
        $result = $updater->apply_update_patch();
        
        if ($result['success']) {
            return new WP_REST_Response(array(
                'success' => true,
                'message' => __('Atualização aplicada com sucesso', 'contentfactory-rdm'),
                'from_version' => $result['from_version'] ?? CFRDM_VERSION,
                'to_version' => $result['to_version'] ?? 'unknown',
            ), 200);
        } else {
            return new WP_REST_Response(array(
                'success' => false,
                'message' => $result['error'] ?? __('Erro ao aplicar atualização', 'contentfactory-rdm'),
                'rollback' => $result['rollback'] ?? false,
            ), 500);
        }
    }
    
    /**
     * Rollback to previous version
     */
    public static function rollback_update($request) {
        if (!class_exists('CFRDM_Auto_Update')) {
            return new WP_REST_Response(array(
                'success' => false,
                'message' => __('Módulo de auto-update não disponível', 'contentfactory-rdm'),
            ), 400);
        }
        
        $updater = CFRDM_Auto_Update::get_instance();
        $result = $updater->rollback_update();
        
        if ($result['success']) {
            return new WP_REST_Response(array(
                'success' => true,
                'message' => __('Rollback executado com sucesso', 'contentfactory-rdm'),
            ), 200);
        } else {
            return new WP_REST_Response(array(
                'success' => false,
                'message' => $result['error'] ?? __('Erro ao executar rollback', 'contentfactory-rdm'),
            ), 500);
        }
    }
    
    /**
     * Get site statistics for Chat IA sync
     */
    public static function get_stats($request) {
        $counts = wp_count_posts('post');
        
        $comments_count = wp_count_comments();
        
        return new WP_REST_Response(array(
            'success' => true,
            'published' => isset($counts->publish) ? (int) $counts->publish : 0,
            'draft' => isset($counts->draft) ? (int) $counts->draft : 0,
            'pending' => isset($counts->pending) ? (int) $counts->pending : 0,
            'private' => isset($counts->private) ? (int) $counts->private : 0,
            'trash' => isset($counts->trash) ? (int) $counts->trash : 0,
            'total' => (isset($counts->publish) ? (int) $counts->publish : 0) + 
                       (isset($counts->draft) ? (int) $counts->draft : 0) + 
                       (isset($counts->pending) ? (int) $counts->pending : 0),
            'comments' => isset($comments_count->approved) ? (int) $comments_count->approved : 0,
            'pages' => (int) wp_count_posts('page')->publish,
        ), 200);
    }
    
    /**
     * Apply a single internal link to a post
     */
    public static function apply_internal_link($request) {
        $params = $request->get_json_params();
        $target_url = isset($params['target_url']) ? sanitize_url($params['target_url']) : '';
        $anchor_text = isset($params['anchor_text']) ? sanitize_text_field($params['anchor_text']) : '';
        $source_post_id = isset($params['source_post_id']) ? intval($params['source_post_id']) : 0;
        
        if (empty($target_url) || empty($anchor_text)) {
            return new WP_REST_Response(array(
                'success' => false,
                'message' => __('target_url e anchor_text são obrigatórios', 'contentfactory-rdm'),
            ), 400);
        }
        
        // If source_post_id is provided, apply to that specific post
        if ($source_post_id > 0) {
            $post = get_post($source_post_id);
            if (!$post || $post->post_status !== 'publish') {
                return new WP_REST_Response(array(
                    'success' => false,
                    'message' => __('Post não encontrado ou não publicado', 'contentfactory-rdm'),
                ), 404);
            }
            
            $result = self::insert_link_into_post_flexible($post, $anchor_text, $target_url);
            
            return new WP_REST_Response(array(
                'success' => $result['inserted'],
                'message' => $result['inserted'] 
                    ? sprintf(__('Link inserido com sucesso (âncora: %s)', 'contentfactory-rdm'), $result['used_anchor'])
                    : __('Texto âncora não encontrado no conteúdo do post', 'contentfactory-rdm'),
                'post_id' => $source_post_id,
                'used_anchor' => $result['used_anchor'] ?? $anchor_text,
            ), $result['inserted'] ? 200 : 422);
        }
        
        // If no source_post_id, find the best matching post
        $posts = get_posts(array(
            'post_type' => 'post',
            'post_status' => 'publish',
            'posts_per_page' => 100,
            'orderby' => 'modified',
            'order' => 'DESC',
        ));
        
        foreach ($posts as $post) {
            // Skip if post already links to this URL
            if (strpos($post->post_content, $target_url) !== false) {
                continue;
            }
            
            $result = self::insert_link_into_post_flexible($post, $anchor_text, $target_url);
            if ($result['inserted']) {
                return new WP_REST_Response(array(
                    'success' => true,
                    'message' => sprintf(
                        __('Link inserido no post "%s" (âncora: %s)', 'contentfactory-rdm'),
                        $post->post_title,
                        $result['used_anchor']
                    ),
                    'post_id' => $post->ID,
                    'used_anchor' => $result['used_anchor'],
                ), 200);
            }
        }
        
        // FALLBACK: If no exact/partial match, insert link at end of a relevant paragraph
        // Find posts related to the target URL's topic by checking if target_url domain matches
        foreach ($posts as $post) {
            if (strpos($post->post_content, $target_url) !== false) continue;
            
            // Insert as a contextual "Leia também" link after the 3rd paragraph
            $result = self::insert_link_as_suggestion($post, $anchor_text, $target_url);
            if ($result['inserted']) {
                return new WP_REST_Response(array(
                    'success' => true,
                    'message' => sprintf(
                        __('Link inserido como sugestão de leitura no post "%s"', 'contentfactory-rdm'),
                        $post->post_title
                    ),
                    'post_id' => $post->ID,
                    'used_anchor' => $anchor_text,
                    'method' => 'read_also',
                ), 200);
            }
        }
        
        return new WP_REST_Response(array(
            'success' => false,
            'message' => __('Nenhum post encontrado com o texto âncora especificado', 'contentfactory-rdm'),
        ), 422);
    }
    
    /**
     * Helper: Insert a link flexibly - tries exact match, then partial, then keywords
     */
    private static function insert_link_into_post_flexible($post, $anchor_text, $target_url) {
        $content = $post->post_content;
        
        // Strategy 1: Exact anchor text match
        $result = self::insert_link_into_post($post, $anchor_text, $target_url);
        if ($result['inserted']) {
            return array('inserted' => true, 'used_anchor' => $anchor_text);
        }
        
        // Strategy 2: Try partial match - use significant words (4+ chars) from anchor
        $stop_words = array('de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas', 'um', 'uma', 'para', 'com', 'por', 'que', 'como', 'mais', 'sobre', 'entre', 'seu', 'sua');
        $words = preg_split('/\s+/', $anchor_text);
        $significant = array_filter($words, function($w) use ($stop_words) {
            return mb_strlen($w) >= 4 && !in_array(mb_strtolower($w), $stop_words);
        });
        
        // Try 2-word combinations from significant words
        $significant = array_values($significant);
        if (count($significant) >= 2) {
            for ($i = 0; $i < count($significant) - 1; $i++) {
                $combo = $significant[$i] . ' ' . $significant[$i + 1];
                $result = self::insert_link_into_post($post, $combo, $target_url);
                if ($result['inserted']) {
                    return array('inserted' => true, 'used_anchor' => $combo);
                }
            }
        }
        
        // Strategy 3: Try each significant word alone (longest first)
        usort($significant, function($a, $b) { return mb_strlen($b) - mb_strlen($a); });
        foreach ($significant as $word) {
            if (mb_strlen($word) >= 5) {
                $result = self::insert_link_into_post($post, $word, $target_url);
                if ($result['inserted']) {
                    return array('inserted' => true, 'used_anchor' => $word);
                }
            }
        }
        
        return array('inserted' => false, 'used_anchor' => $anchor_text);
    }
    
    /**
     * Helper: Insert a link into a post's content (exact match)
     */
    private static function insert_link_into_post($post, $anchor_text, $target_url) {
        $content = $post->post_content;
        
        // Search for anchor text that's not already inside a link
        $pattern = '/(?<!<a [^>]*>)(\b' . preg_quote($anchor_text, '/') . '\b)(?![^<]*<\/a>)/iu';
        
        if (preg_match($pattern, $content, $matches, PREG_OFFSET_CAPTURE)) {
            $match = $matches[1][0];
            $offset = $matches[1][1];
            
            $link = '<a href="' . esc_url($target_url) . '" title="' . esc_attr($anchor_text) . '">' . $match . '</a>';
            $new_content = substr_replace($content, $link, $offset, strlen($match));
            
            wp_update_post(array(
                'ID' => $post->ID,
                'post_content' => $new_content,
            ));
            
            if (class_exists('CFRDM_Logger')) {
                CFRDM_Logger::info(
                    CFRDM_Logger::CATEGORY_SYNC,
                    sprintf('Link interno aplicado: %s → %s', $anchor_text, $target_url),
                    array('post_id' => $post->ID, 'anchor' => $anchor_text, 'url' => $target_url),
                    $post->ID
                );
            }
            
            return array('inserted' => true);
        }
        
        return array('inserted' => false);
    }
    
    /**
     * Helper: Insert link as "Leia também" after 3rd paragraph
     */
    private static function insert_link_as_suggestion($post, $anchor_text, $target_url) {
        $content = $post->post_content;
        
        // Don't add if already has too many "leia também" links
        if (substr_count(strtolower($content), 'leia também') >= 3) {
            return array('inserted' => false);
        }
        
        // Don't add if already links to this URL
        if (strpos($content, $target_url) !== false) {
            return array('inserted' => false);
        }
        
        // Find the 3rd closing </p> tag to insert after
        $count = 0;
        $insert_pos = false;
        $offset = 0;
        while (($pos = strpos($content, '</p>', $offset)) !== false) {
            $count++;
            $offset = $pos + 4;
            if ($count === 3) {
                $insert_pos = $pos + 4;
                break;
            }
        }
        
        // Fallback: insert after 2nd </p> or 1st
        if ($insert_pos === false && $count >= 1) {
            $count2 = 0;
            $offset2 = 0;
            while (($pos2 = strpos($content, '</p>', $offset2)) !== false) {
                $count2++;
                $offset2 = $pos2 + 4;
                if ($count2 === min($count, 2)) {
                    $insert_pos = $pos2 + 4;
                    break;
                }
            }
        }
        
        if ($insert_pos === false) {
            return array('inserted' => false);
        }
        
        $link_html = "\n<p><strong>📖 Leia também:</strong> <a href=\"" . esc_url($target_url) . "\" title=\"" . esc_attr($anchor_text) . "\">" . esc_html($anchor_text) . "</a></p>\n";
        
        $new_content = substr_replace($content, $link_html, $insert_pos, 0);
        
        wp_update_post(array(
            'ID' => $post->ID,
            'post_content' => $new_content,
        ));
        
        if (class_exists('CFRDM_Logger')) {
            CFRDM_Logger::info(
                CFRDM_Logger::CATEGORY_SYNC,
                sprintf('Link "Leia também" inserido: %s → %s', $anchor_text, $target_url),
                array('post_id' => $post->ID, 'anchor' => $anchor_text, 'url' => $target_url),
                $post->ID
            );
        }
        
        return array('inserted' => true);
    }
}
