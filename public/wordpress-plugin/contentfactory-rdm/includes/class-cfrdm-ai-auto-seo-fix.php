<?php
/**
 * AI Auto SEO Fix - Autonomous SEO corrections via AI
 * 
 * v3.6.0 Features:
 * - Bulk title/meta auto-generation via AI
 * - 404 detection and auto-redirect creation
 * - Sitemap cleanup (remove dead URLs)
 * - Update SEO meta for Rank Math, Yoast, AIOSEO
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_AI_Auto_SEO_Fix {

    /**
     * Initialize REST API endpoints
     */
    public static function init() {
        add_action('rest_api_init', array(__CLASS__, 'register_routes'));
    }

    /**
     * Register REST API routes
     */
    public static function register_routes() {
        register_rest_route('cfrdm/v1', '/update-seo-meta', array(
            'methods' => 'POST',
            'callback' => array(__CLASS__, 'update_seo_meta'),
            'permission_callback' => array('CFRDM_API', 'verify_api_key'),
        ));

        register_rest_route('cfrdm/v1', '/scan-404-urls', array(
            'methods' => 'POST',
            'callback' => array(__CLASS__, 'scan_404_urls'),
            'permission_callback' => array('CFRDM_API', 'verify_api_key'),
        ));

        register_rest_route('cfrdm/v1', '/auto-fix-404', array(
            'methods' => 'POST',
            'callback' => array(__CLASS__, 'auto_fix_404'),
            'permission_callback' => array('CFRDM_API', 'verify_api_key'),
        ));
    }

    /**
     * Update SEO meta for a single post
     */
    public static function update_seo_meta($request) {
        $post_id = intval($request->get_param('post_id'));
        $meta_title = sanitize_text_field($request->get_param('meta_title'));
        $meta_description = sanitize_text_field($request->get_param('meta_description'));
        $focus_keyword = sanitize_text_field($request->get_param('focus_keyword'));
        $canonical_url = esc_url_raw($request->get_param('canonical_url'));
        
        if (!$post_id || !get_post($post_id)) {
            return new WP_REST_Response(array('success' => false, 'error' => 'Post not found'), 404);
        }
        
        $updated = 0;
        $seo_plugin = self::detect_seo_plugin();
        
        // Update meta title
        if (!empty($meta_title)) {
            if ($seo_plugin === 'rank_math') {
                update_post_meta($post_id, 'rank_math_title', $meta_title);
            } elseif ($seo_plugin === 'yoast') {
                update_post_meta($post_id, '_yoast_wpseo_title', $meta_title);
            } elseif ($seo_plugin === 'aioseo') {
                update_post_meta($post_id, '_aioseo_title', $meta_title);
            }
            // Also update WordPress title if too long
            $post = get_post($post_id);
            if ($post && strlen($post->post_title) > 70) {
                wp_update_post(array('ID' => $post_id, 'post_title' => $meta_title));
            }
            $updated++;
        }
        
        // Update meta description
        if (!empty($meta_description)) {
            if ($seo_plugin === 'rank_math') {
                update_post_meta($post_id, 'rank_math_description', $meta_description);
            } elseif ($seo_plugin === 'yoast') {
                update_post_meta($post_id, '_yoast_wpseo_metadesc', $meta_description);
            } elseif ($seo_plugin === 'aioseo') {
                update_post_meta($post_id, '_aioseo_description', $meta_description);
            }
            $updated++;
        }
        
        // Update focus keyword
        if (!empty($focus_keyword)) {
            if ($seo_plugin === 'rank_math') {
                update_post_meta($post_id, 'rank_math_focus_keyword', $focus_keyword);
            } elseif ($seo_plugin === 'yoast') {
                update_post_meta($post_id, '_yoast_wpseo_focuskw', $focus_keyword);
            } elseif ($seo_plugin === 'aioseo') {
                update_post_meta($post_id, '_aioseo_keyphrases', wp_json_encode(array(
                    'focus' => array('keyphrase' => $focus_keyword)
                )));
            }
            $updated++;
        }

        // Update canonical URL
        if (!empty($canonical_url)) {
            if ($seo_plugin === 'rank_math') {
                update_post_meta($post_id, 'rank_math_canonical_url', $canonical_url);
            } elseif ($seo_plugin === 'yoast') {
                update_post_meta($post_id, '_yoast_wpseo_canonical', $canonical_url);
            }
            $updated++;
        }

        CFRDM_Logger::success('ai_auto_seo', "SEO meta atualizado para post {$post_id}", array(
            'plugin' => $seo_plugin,
            'fields_updated' => $updated,
        ), $post_id);

        return new WP_REST_Response(array(
            'success' => true,
            'post_id' => $post_id,
            'seo_plugin' => $seo_plugin,
            'fields_updated' => $updated,
        ));
    }

    /**
     * Scan for 404 URLs in published content
     */
    public static function scan_404_urls($request) {
        $limit = intval($request->get_param('limit')) ?: 100;
        
        $posts = get_posts(array(
            'post_type' => array('post', 'page'),
            'post_status' => 'publish',
            'numberposts' => $limit,
            'orderby' => 'modified',
            'order' => 'DESC',
        ));
        
        $broken_urls = array();
        $checked = 0;
        
        foreach ($posts as $post) {
            $permalink = get_permalink($post->ID);
            if (!$permalink) continue;
            
            $checked++;
            $response = wp_remote_head($permalink, array('timeout' => 5, 'redirection' => 0));
            
            if (is_wp_error($response)) continue;
            
            $status = wp_remote_retrieve_response_code($response);
            if ($status === 404 || $status === 410) {
                $broken_urls[] = array(
                    'post_id' => $post->ID,
                    'url' => $permalink,
                    'title' => $post->post_title,
                    'status' => $status,
                );
            }
        }
        
        return new WP_REST_Response(array(
            'success' => true,
            'checked' => $checked,
            'broken_count' => count($broken_urls),
            'broken_urls' => $broken_urls,
        ));
    }

    /**
     * Auto-fix 404 URLs by creating redirects
     */
    public static function auto_fix_404($request) {
        $redirects = $request->get_param('redirects');
        if (!is_array($redirects)) {
            return new WP_REST_Response(array('success' => false, 'error' => 'redirects array required'), 400);
        }
        
        $created = 0;
        $errors = array();
        
        foreach ($redirects as $redirect) {
            $source = sanitize_text_field($redirect['source_url'] ?? '');
            $target = esc_url_raw($redirect['target_url'] ?? '');
            $notes = sanitize_text_field($redirect['notes'] ?? 'Auto-fix 404');
            
            if (empty($source) || empty($target)) {
                $errors[] = "Missing source or target URL";
                continue;
            }
            
            // Use redirect manager if available
            if (class_exists('CFRDM_Redirect_Manager')) {
                $result = CFRDM_Redirect_Manager::add_redirect($source, $target, 301, $notes);
                if ($result) {
                    $created++;
                } else {
                    $errors[] = "Failed to create redirect: {$source}";
                }
            } else {
                // Fallback: store as option
                $existing = get_option('cfrdm_auto_redirects', array());
                $existing[] = array(
                    'source' => $source,
                    'target' => $target,
                    'type' => 301,
                    'notes' => $notes,
                    'created_at' => current_time('mysql'),
                );
                update_option('cfrdm_auto_redirects', $existing);
                $created++;
            }
        }
        
        if ($created > 0) {
            CFRDM_Logger::success('ai_auto_seo', "{$created} redirects 301 criados automaticamente", array(
                'total' => count($redirects),
                'created' => $created,
                'errors' => count($errors),
            ));
        }
        
        return new WP_REST_Response(array(
            'success' => true,
            'created' => $created,
            'errors' => $errors,
        ));
    }
    
    /**
     * Detect active SEO plugin
     */
    private static function detect_seo_plugin() {
        if (class_exists('RankMath') || defined('RANK_MATH_VERSION')) {
            return 'rank_math';
        }
        if (defined('WPSEO_VERSION') || class_exists('WPSEO_Utils')) {
            return 'yoast';
        }
        if (defined('AIOSEO_VERSION') || class_exists('AIOSEO\\Plugin\\AIOSEO')) {
            return 'aioseo';
        }
        return 'none';
    }
}
