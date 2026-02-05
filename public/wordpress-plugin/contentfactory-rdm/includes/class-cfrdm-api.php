<?php
/**
 * REST API Handler
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_API {
    
    public static function register_routes() {
        // Health check
        register_rest_route('cfrdm/v1', '/health', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'health_check'),
            'permission_callback' => '__return_true',
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
        
        // Regenerate API key
        register_rest_route('cfrdm/v1', '/regenerate-key', array(
            'methods' => 'POST',
            'callback' => array(__CLASS__, 'regenerate_api_key'),
            'permission_callback' => array(__CLASS__, 'verify_admin'),
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
    
    public static function test_connection($request) {
        return new WP_REST_Response(array(
            'success' => true,
            'message' => __('Conexão estabelecida com sucesso!', 'contentfactory-rdm'),
            'site' => array(
                'name' => get_bloginfo('name'),
                'url' => get_site_url(),
                'admin_email' => get_option('admin_email'),
            ),
        ), 200);
    }
    
    public static function get_site_info($request) {
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
                'seo_plugin' => $seo_plugin,
                'plugin_version' => CFRDM_VERSION,
            ),
            'capabilities' => array(
                'posts' => true,
                'categories' => true,
                'tags' => true,
                'media' => true,
                'webhooks' => get_option('cfrdm_webhook_enabled', true),
            ),
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
        
        // Set SEO meta
        self::set_seo_meta($post_id, $params);
        
        // Store ContentFactory ID if provided
        if (!empty($params['cfrdm_id'])) {
            update_post_meta($post_id, '_cfrdm_article_id', sanitize_text_field($params['cfrdm_id']));
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
}
