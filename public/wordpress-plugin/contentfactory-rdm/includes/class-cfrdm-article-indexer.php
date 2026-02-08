<?php
/**
 * Article Indexer Class
 * 
 * Handles automatic crawling and syncing of WordPress articles
 * with the ContentFactory platform for intelligent internal linking.
 * 
 * @package ContentFactory_RDM
 * @since 2.6.0
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_Article_Indexer {
    
    /**
     * API endpoint for syncing
     */
    private $sync_endpoint = '/analyze-wp-articles';
    
    /**
     * Batch size for syncing
     */
    private $batch_size = 10;
    
    /**
     * Constructor
     */
    public function __construct() {
        // Register REST API endpoints
        add_action('rest_api_init', array($this, 'register_rest_routes'));
        
        // Hook into post save for real-time sync
        add_action('save_post', array($this, 'on_post_save'), 30, 3);
        add_action('delete_post', array($this, 'on_post_delete'));
        
        // Add cron for periodic sync
        add_action('cfrdm_periodic_article_sync', array($this, 'run_periodic_sync'));
        
        // Schedule cron if not already scheduled
        if (!wp_next_scheduled('cfrdm_periodic_article_sync')) {
            wp_schedule_event(time(), 'twicedaily', 'cfrdm_periodic_article_sync');
        }
        
        // Admin AJAX handlers
        add_action('wp_ajax_cfrdm_start_full_sync', array($this, 'ajax_start_full_sync'));
        add_action('wp_ajax_cfrdm_get_sync_status', array($this, 'ajax_get_sync_status'));
    }
    
    /**
     * Register REST API routes
     */
    public function register_rest_routes() {
        // Endpoint for external sync trigger
        register_rest_route('cfrdm/v1', '/trigger-sync', array(
            'methods' => 'POST',
            'callback' => array($this, 'rest_trigger_sync'),
            'permission_callback' => array($this, 'check_api_permission'),
        ));
        
        // Endpoint to get local article data
        register_rest_route('cfrdm/v1', '/articles-for-indexing', array(
            'methods' => 'GET',
            'callback' => array($this, 'rest_get_articles'),
            'permission_callback' => array($this, 'check_api_permission'),
        ));
        
        // Endpoint to get article content
        register_rest_route('cfrdm/v1', '/article-content/(?P<id>\d+)', array(
            'methods' => 'GET',
            'callback' => array($this, 'rest_get_article_content'),
            'permission_callback' => array($this, 'check_api_permission'),
        ));
        
        // Endpoint for batch export
        register_rest_route('cfrdm/v1', '/export-articles-batch', array(
            'methods' => 'POST',
            'callback' => array($this, 'rest_export_batch'),
            'permission_callback' => array($this, 'check_api_permission'),
        ));
    }
    
    /**
     * Check API permission
     */
    public function check_api_permission($request) {
        // Check for API key in header
        $api_key = $request->get_header('X-CFRDM-API-Key');
        $stored_key = get_option('cfrdm_api_key');
        
        if ($api_key && $stored_key && hash_equals($stored_key, $api_key)) {
            return true;
        }
        
        // Fallback to user capability check
        return current_user_can('edit_posts');
    }
    
    /**
     * Get all publishable articles for indexing
     */
    public function rest_get_articles($request) {
        $page = $request->get_param('page') ?: 1;
        $per_page = $request->get_param('per_page') ?: 100;
        $modified_after = $request->get_param('modified_after');
        
        $args = array(
            'post_type' => array('post', 'page'),
            'post_status' => 'publish',
            'posts_per_page' => $per_page,
            'paged' => $page,
            'orderby' => 'modified',
            'order' => 'DESC',
        );
        
        if ($modified_after) {
            $args['date_query'] = array(
                array(
                    'column' => 'post_modified',
                    'after' => $modified_after,
                ),
            );
        }
        
        $query = new WP_Query($args);
        $articles = array();
        
        foreach ($query->posts as $post) {
            $articles[] = $this->format_article_for_export($post, false);
        }
        
        return rest_ensure_response(array(
            'success' => true,
            'articles' => $articles,
            'total' => $query->found_posts,
            'pages' => $query->max_num_pages,
            'current_page' => $page,
        ));
    }
    
    /**
     * Get single article content
     */
    public function rest_get_article_content($request) {
        $post_id = $request->get_param('id');
        $post = get_post($post_id);
        
        if (!$post || $post->post_status !== 'publish') {
            return new WP_Error('not_found', 'Artigo não encontrado', array('status' => 404));
        }
        
        $article = $this->format_article_for_export($post, true);
        
        return rest_ensure_response(array(
            'success' => true,
            'article' => $article,
        ));
    }
    
    /**
     * Export articles in batch
     */
    public function rest_export_batch($request) {
        $post_ids = $request->get_param('post_ids');
        
        if (!is_array($post_ids) || empty($post_ids)) {
            return new WP_Error('invalid_request', 'IDs de posts são obrigatórios', array('status' => 400));
        }
        
        $articles = array();
        foreach ($post_ids as $post_id) {
            $post = get_post($post_id);
            if ($post && $post->post_status === 'publish') {
                $articles[] = $this->format_article_for_export($post, true);
            }
        }
        
        return rest_ensure_response(array(
            'success' => true,
            'articles' => $articles,
            'count' => count($articles),
        ));
    }
    
    /**
     * Format article data for export
     */
    private function format_article_for_export($post, $include_content = false) {
        $categories = wp_get_post_categories($post->ID, array('fields' => 'names'));
        $tags = wp_get_post_tags($post->ID, array('fields' => 'names'));
        
        $data = array(
            'wp_post_id' => $post->ID,
            'wp_post_url' => get_permalink($post->ID),
            'wp_post_slug' => $post->post_name,
            'wp_post_title' => $post->post_title,
            'wp_post_type' => $post->post_type,
            'wp_post_status' => $post->post_status,
            'wp_categories' => $categories ?: array(),
            'wp_tags' => $tags ?: array(),
            'word_count' => str_word_count(strip_tags($post->post_content)),
            'last_wp_modified_at' => $post->post_modified_gmt,
        );
        
        if ($include_content) {
            // Strip shortcodes and clean content
            $content = $post->post_content;
            $content = strip_shortcodes($content);
            $content = apply_filters('the_content', $content);
            
            // Keep HTML for link analysis
            $data['content'] = $content;
            $data['content_plain'] = wp_strip_all_tags($content);
        }
        
        return $data;
    }
    
    /**
     * Trigger sync from REST API
     */
    public function rest_trigger_sync($request) {
        $full_sync = $request->get_param('full_sync') ?? false;
        
        if ($full_sync) {
            $result = $this->run_full_sync();
        } else {
            $result = $this->run_incremental_sync();
        }
        
        return rest_ensure_response(array(
            'success' => true,
            'result' => $result,
        ));
    }
    
    /**
     * Run periodic sync (called by cron)
     */
    public function run_periodic_sync() {
        CFRDM_Logger::info(
            CFRDM_Logger::CATEGORY_SYNC,
            'Iniciando sincronização periódica de artigos'
        );
        
        $result = $this->run_incremental_sync();
        
        CFRDM_Logger::success(
            CFRDM_Logger::CATEGORY_SYNC,
            'Sincronização periódica concluída',
            $result
        );
    }
    
    /**
     * Run incremental sync (only modified articles)
     */
    public function run_incremental_sync() {
        $last_sync = get_option('cfrdm_last_article_sync', '2000-01-01 00:00:00');
        
        $args = array(
            'post_type' => array('post', 'page'),
            'post_status' => 'publish',
            'posts_per_page' => 50,
            'date_query' => array(
                array(
                    'column' => 'post_modified',
                    'after' => $last_sync,
                ),
            ),
            'orderby' => 'modified',
            'order' => 'ASC',
        );
        
        $query = new WP_Query($args);
        
        if ($query->post_count === 0) {
            return array(
                'synced' => 0,
                'message' => 'Nenhum artigo modificado desde a última sincronização',
            );
        }
        
        $articles = array();
        foreach ($query->posts as $post) {
            $articles[] = $this->format_article_for_export($post, true);
        }
        
        $result = $this->send_to_platform($articles);
        
        if ($result['success']) {
            update_option('cfrdm_last_article_sync', current_time('mysql', true));
        }
        
        return $result;
    }
    
    /**
     * Run full sync (all articles)
     */
    public function run_full_sync() {
        $args = array(
            'post_type' => array('post', 'page'),
            'post_status' => 'publish',
            'posts_per_page' => -1,
            'orderby' => 'date',
            'order' => 'DESC',
        );
        
        $query = new WP_Query($args);
        $total = $query->post_count;
        $synced = 0;
        $errors = 0;
        
        // Process in batches
        $batch = array();
        foreach ($query->posts as $index => $post) {
            $batch[] = $this->format_article_for_export($post, true);
            
            if (count($batch) >= $this->batch_size || $index === $total - 1) {
                $result = $this->send_to_platform($batch);
                
                if ($result['success']) {
                    $synced += $result['results']['synced'] ?? count($batch);
                } else {
                    $errors += count($batch);
                }
                
                $batch = array();
                
                // Update progress
                update_option('cfrdm_sync_progress', array(
                    'total' => $total,
                    'processed' => $index + 1,
                    'synced' => $synced,
                    'errors' => $errors,
                    'status' => 'running',
                ));
                
                // Small delay between batches
                usleep(500000); // 0.5 seconds
            }
        }
        
        update_option('cfrdm_last_article_sync', current_time('mysql', true));
        update_option('cfrdm_sync_progress', array(
            'total' => $total,
            'processed' => $total,
            'synced' => $synced,
            'errors' => $errors,
            'status' => 'completed',
        ));
        
        return array(
            'success' => true,
            'total' => $total,
            'synced' => $synced,
            'errors' => $errors,
        );
    }
    
    /**
     * Send articles to the ContentFactory platform
     */
    private function send_to_platform($articles) {
        $api_url = get_option('cfrdm_api_url');
        $api_key = get_option('cfrdm_api_key');
        $project_id = get_option('cfrdm_project_id');
        
        if (!$api_url || !$api_key || !$project_id) {
            return array(
                'success' => false,
                'error' => 'Configuração incompleta. Verifique API URL, API Key e Project ID.',
            );
        }
        
        // Build the Edge Function URL
        $endpoint_url = rtrim($api_url, '/') . '/functions/v1' . $this->sync_endpoint;
        
        $response = wp_remote_post($endpoint_url, array(
            'timeout' => 60,
            'headers' => array(
                'Content-Type' => 'application/json',
                'Authorization' => 'Bearer ' . $api_key,
            ),
            'body' => json_encode(array(
                'action' => 'sync',
                'project_id' => $project_id,
                'articles' => $articles,
                'site_url' => home_url(),
            )),
        ));
        
        if (is_wp_error($response)) {
            CFRDM_Logger::error(
                CFRDM_Logger::CATEGORY_SYNC,
                'Erro ao sincronizar artigos',
                array('error' => $response->get_error_message())
            );
            
            return array(
                'success' => false,
                'error' => $response->get_error_message(),
            );
        }
        
        $body = json_decode(wp_remote_retrieve_body($response), true);
        $status_code = wp_remote_retrieve_response_code($response);
        
        if ($status_code !== 200 || !isset($body['success'])) {
            return array(
                'success' => false,
                'error' => $body['error'] ?? 'Erro desconhecido',
                'status_code' => $status_code,
            );
        }
        
        return $body;
    }
    
    /**
     * Hook: On post save
     */
    public function on_post_save($post_id, $post, $update) {
        // Skip revisions and autosaves
        if (wp_is_post_revision($post_id) || wp_is_post_autosave($post_id)) {
            return;
        }
        
        // Only sync published posts
        if ($post->post_status !== 'publish') {
            return;
        }
        
        // Only sync posts and pages
        if (!in_array($post->post_type, array('post', 'page'))) {
            return;
        }
        
        // Schedule async sync to avoid blocking save
        wp_schedule_single_event(time() + 30, 'cfrdm_sync_single_article', array($post_id));
    }
    
    /**
     * Hook: On post delete
     */
    public function on_post_delete($post_id) {
        // Notify platform about deletion
        $api_url = get_option('cfrdm_api_url');
        $api_key = get_option('cfrdm_api_key');
        $project_id = get_option('cfrdm_project_id');
        
        if (!$api_url || !$api_key || !$project_id) {
            return;
        }
        
        // Could implement delete notification here
        // For now, the platform will handle orphaned records during next sync
    }
    
    /**
     * AJAX: Start full sync
     */
    public function ajax_start_full_sync() {
        check_ajax_referer('cfrdm_admin_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error(array('message' => 'Permissão negada'));
        }
        
        // Reset progress
        update_option('cfrdm_sync_progress', array(
            'total' => 0,
            'processed' => 0,
            'synced' => 0,
            'errors' => 0,
            'status' => 'starting',
        ));
        
        // Schedule the sync
        wp_schedule_single_event(time(), 'cfrdm_run_full_sync');
        
        wp_send_json_success(array('message' => 'Sincronização iniciada'));
    }
    
    /**
     * AJAX: Get sync status
     */
    public function ajax_get_sync_status() {
        check_ajax_referer('cfrdm_admin_nonce', 'nonce');
        
        $progress = get_option('cfrdm_sync_progress', array(
            'status' => 'idle',
        ));
        
        wp_send_json_success($progress);
    }
}

// Register cron action for single article sync
add_action('cfrdm_sync_single_article', function($post_id) {
    $indexer = new CFRDM_Article_Indexer();
    $post = get_post($post_id);
    
    if ($post && $post->post_status === 'publish') {
        $article = array(
            'wp_post_id' => $post->ID,
            'wp_post_url' => get_permalink($post->ID),
            'wp_post_slug' => $post->post_name,
            'wp_post_title' => $post->post_title,
            'wp_post_type' => $post->post_type,
            'wp_post_status' => $post->post_status,
            'wp_categories' => wp_get_post_categories($post->ID, array('fields' => 'names')) ?: array(),
            'wp_tags' => wp_get_post_tags($post->ID, array('fields' => 'names')) ?: array(),
            'content' => apply_filters('the_content', $post->post_content),
            'word_count' => str_word_count(strip_tags($post->post_content)),
            'last_wp_modified_at' => $post->post_modified_gmt,
        );
        
        // Use reflection to access private method
        $method = new ReflectionMethod('CFRDM_Article_Indexer', 'send_to_platform');
        $method->setAccessible(true);
        $method->invoke($indexer, array($article));
    }
});

// Register cron action for full sync
add_action('cfrdm_run_full_sync', function() {
    $indexer = new CFRDM_Article_Indexer();
    $indexer->run_full_sync();
});
