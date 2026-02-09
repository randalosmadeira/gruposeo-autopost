<?php
/**
 * Post Duplicator + Bulk Delete
 * 
 * Features:
 * - One-click duplicate any post or page (including all meta, taxonomies)
 * - Bulk duplicate selected posts
 * - Bulk delete with confirmation
 * - Admin column action links
 * 
 * @package ContentFactory_RDM
 * @since 3.1.0
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_Post_Duplicator {
    
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
        // Add "Duplicate" link to post/page row actions
        add_filter('post_row_actions', array($this, 'add_duplicate_link'), 10, 2);
        add_filter('page_row_actions', array($this, 'add_duplicate_link'), 10, 2);
        
        // Handle duplicate action
        add_action('admin_action_cfrdm_duplicate_post', array($this, 'handle_duplicate'));
        
        // Add bulk actions
        add_filter('bulk_actions-edit-post', array($this, 'register_bulk_actions'));
        add_filter('bulk_actions-edit-page', array($this, 'register_bulk_actions'));
        add_filter('handle_bulk_actions-edit-post', array($this, 'handle_bulk_action'), 10, 3);
        add_filter('handle_bulk_actions-edit-page', array($this, 'handle_bulk_action'), 10, 3);
        
        // Admin notices
        add_action('admin_notices', array($this, 'show_notices'));
        
        // REST API endpoint for external duplicate
        add_action('rest_api_init', array($this, 'register_rest_routes'));
    }
    
    /**
     * Add "Duplicar" link to row actions
     */
    public function add_duplicate_link($actions, $post) {
        if (!current_user_can('edit_posts')) {
            return $actions;
        }
        
        $url = wp_nonce_url(
            admin_url('admin.php?action=cfrdm_duplicate_post&post=' . $post->ID),
            'cfrdm_duplicate_' . $post->ID
        );
        
        $actions['cfrdm_duplicate'] = '<a href="' . esc_url($url) . '" title="Criar cópia deste conteúdo">Duplicar</a>';
        
        return $actions;
    }
    
    /**
     * Handle single duplicate action
     */
    public function handle_duplicate() {
        if (!isset($_GET['post']) || !isset($_GET['_wpnonce'])) {
            wp_die('Requisição inválida.');
        }
        
        $post_id = intval($_GET['post']);
        
        if (!wp_verify_nonce($_GET['_wpnonce'], 'cfrdm_duplicate_' . $post_id)) {
            wp_die('Nonce inválido.');
        }
        
        if (!current_user_can('edit_posts')) {
            wp_die('Permissão negada.');
        }
        
        $new_id = $this->duplicate_post($post_id);
        
        if (is_wp_error($new_id)) {
            wp_redirect(admin_url('edit.php?cfrdm_dup_error=1'));
            exit;
        }
        
        $post_type = get_post_type($post_id);
        wp_redirect(admin_url('edit.php?post_type=' . $post_type . '&cfrdm_duplicated=1'));
        exit;
    }
    
    /**
     * Register bulk actions
     */
    public function register_bulk_actions($actions) {
        $actions['cfrdm_bulk_duplicate'] = '📋 Duplicar Selecionados';
        $actions['cfrdm_bulk_delete'] = '🗑️ Excluir Permanentemente';
        return $actions;
    }
    
    /**
     * Handle bulk actions
     */
    public function handle_bulk_action($redirect_to, $action, $post_ids) {
        if ($action === 'cfrdm_bulk_duplicate') {
            $count = 0;
            foreach ($post_ids as $post_id) {
                $result = $this->duplicate_post($post_id);
                if (!is_wp_error($result)) {
                    $count++;
                }
            }
            $redirect_to = add_query_arg('cfrdm_bulk_duplicated', $count, $redirect_to);
        }
        
        if ($action === 'cfrdm_bulk_delete') {
            $count = 0;
            foreach ($post_ids as $post_id) {
                if (wp_delete_post($post_id, true)) {
                    $count++;
                }
            }
            $redirect_to = add_query_arg('cfrdm_bulk_deleted', $count, $redirect_to);
            
            CFRDM_Logger::success('duplicator', 'Exclusão em lote', array(
                'deleted' => $count,
            ));
        }
        
        return $redirect_to;
    }
    
    /**
     * Duplicate a post with all metadata
     * 
     * @param int $post_id Source post ID
     * @param array $overrides Optional field overrides
     * @return int|WP_Error New post ID or error
     */
    public function duplicate_post($post_id, $overrides = array()) {
        $post = get_post($post_id);
        
        if (!$post) {
            return new WP_Error('invalid_post', 'Post não encontrado');
        }
        
        // Prepare new post data
        $new_post = array(
            'post_title'     => isset($overrides['title']) ? $overrides['title'] : $post->post_title . ' (Cópia)',
            'post_content'   => $post->post_content,
            'post_excerpt'   => $post->post_excerpt,
            'post_status'    => isset($overrides['status']) ? $overrides['status'] : 'draft',
            'post_type'      => $post->post_type,
            'post_author'    => get_current_user_id(),
            'post_parent'    => $post->post_parent,
            'menu_order'     => $post->menu_order,
            'comment_status' => $post->comment_status,
            'ping_status'    => $post->ping_status,
            'post_password'  => $post->post_password,
        );
        
        // Insert new post
        $new_id = wp_insert_post($new_post, true);
        
        if (is_wp_error($new_id)) {
            return $new_id;
        }
        
        // Duplicate all post meta
        $post_meta = get_post_meta($post_id);
        foreach ($post_meta as $key => $values) {
            // Skip internal WordPress meta
            if ($key === '_edit_lock' || $key === '_edit_last') {
                continue;
            }
            foreach ($values as $value) {
                add_post_meta($new_id, $key, maybe_unserialize($value));
            }
        }
        
        // Duplicate taxonomies (categories, tags, custom taxonomies)
        $taxonomies = get_object_taxonomies($post->post_type);
        foreach ($taxonomies as $taxonomy) {
            $terms = wp_get_object_terms($post_id, $taxonomy, array('fields' => 'ids'));
            if (!empty($terms) && !is_wp_error($terms)) {
                wp_set_object_terms($new_id, $terms, $taxonomy);
            }
        }
        
        // Duplicate featured image
        $thumbnail_id = get_post_thumbnail_id($post_id);
        if ($thumbnail_id) {
            set_post_thumbnail($new_id, $thumbnail_id);
        }
        
        // Mark as duplicated
        update_post_meta($new_id, '_cfrdm_duplicated_from', $post_id);
        update_post_meta($new_id, '_cfrdm_duplicated_at', current_time('mysql'));
        
        CFRDM_Logger::success('duplicator', 'Post duplicado', array(
            'source_id' => $post_id,
            'new_id' => $new_id,
            'title' => $post->post_title,
        ), $new_id);
        
        return $new_id;
    }
    
    /**
     * Show admin notices
     */
    public function show_notices() {
        if (isset($_GET['cfrdm_duplicated'])) {
            echo '<div class="notice notice-success is-dismissible"><p>✅ Post duplicado com sucesso! A cópia foi salva como rascunho.</p></div>';
        }
        if (isset($_GET['cfrdm_bulk_duplicated'])) {
            $count = intval($_GET['cfrdm_bulk_duplicated']);
            echo '<div class="notice notice-success is-dismissible"><p>✅ ' . $count . ' post(s) duplicado(s) com sucesso!</p></div>';
        }
        if (isset($_GET['cfrdm_bulk_deleted'])) {
            $count = intval($_GET['cfrdm_bulk_deleted']);
            echo '<div class="notice notice-success is-dismissible"><p>🗑️ ' . $count . ' post(s) excluído(s) permanentemente.</p></div>';
        }
    }
    
    /**
     * Register REST API routes
     */
    public function register_rest_routes() {
        register_rest_route('cfrdm/v1', '/duplicate/(?P<id>\d+)', array(
            'methods' => 'POST',
            'callback' => array($this, 'rest_duplicate'),
            'permission_callback' => function() {
                return current_user_can('edit_posts');
            },
        ));
    }
    
    /**
     * REST API duplicate handler
     */
    public function rest_duplicate($request) {
        $post_id = $request->get_param('id');
        $overrides = $request->get_json_params();
        
        $new_id = $this->duplicate_post($post_id, $overrides ?: array());
        
        if (is_wp_error($new_id)) {
            return new WP_REST_Response(array('error' => $new_id->get_error_message()), 400);
        }
        
        return new WP_REST_Response(array(
            'success' => true,
            'new_id' => $new_id,
            'edit_url' => get_edit_post_link($new_id, 'raw'),
        ));
    }
}
