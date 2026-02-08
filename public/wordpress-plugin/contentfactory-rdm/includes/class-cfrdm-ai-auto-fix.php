<?php
/**
 * AI Auto-Fix Engine
 * 
 * Motor de IA que analisa problemas e executa correções
 * automáticas sem intervenção humana usando a edge function ai-api
 * 
 * @package ContentFactory_RDM
 * @since 3.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_AI_Auto_Fix {
    
    const TABLE_NAME = 'cfrdm_fix_queue';
    const OPTION_ENABLED = 'cfrdm_ai_auto_fix_enabled';
    const OPTION_MIN_CONFIDENCE = 'cfrdm_ai_auto_fix_min_confidence';
    
    private static $instance = null;
    
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    /**
     * Initialize Auto-Fix system
     */
    public function init() {
        // Register cron job
        add_action('cfrdm_process_fix_queue', array($this, 'process_queue'));
        
        // Schedule if not already scheduled
        if (!wp_next_scheduled('cfrdm_process_fix_queue')) {
            wp_schedule_event(time(), 'hourly', 'cfrdm_process_fix_queue');
        }
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
            issue_type VARCHAR(50) NOT NULL,
            url TEXT NOT NULL,
            post_id BIGINT(20) UNSIGNED NULL,
            priority INT(11) DEFAULT 5,
            status VARCHAR(20) DEFAULT 'pending',
            context LONGTEXT NULL,
            ai_analysis LONGTEXT NULL,
            fix_action VARCHAR(100) NULL,
            error_message TEXT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            processed_at DATETIME NULL,
            PRIMARY KEY (id),
            KEY issue_type (issue_type),
            KEY status (status),
            KEY priority (priority)
        ) $charset_collate;";
        
        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        dbDelta($sql);
    }
    
    /**
     * Check if auto-fix is enabled
     */
    public static function is_enabled() {
        return get_option(self::OPTION_ENABLED, false);
    }
    
    /**
     * Get minimum confidence threshold
     */
    public static function get_min_confidence() {
        return floatval(get_option(self::OPTION_MIN_CONFIDENCE, 0.8));
    }
    
    /**
     * Add issue to fix queue
     */
    public static function add_to_queue($issue_type, $url, $post_id = null, $priority = 5, $context = array()) {
        global $wpdb;
        
        $table = $wpdb->prefix . self::TABLE_NAME;
        
        // Check if already in queue
        $exists = $wpdb->get_var($wpdb->prepare(
            "SELECT id FROM $table WHERE url = %s AND status IN ('pending', 'processing')",
            $url
        ));
        
        if ($exists) {
            return false;
        }
        
        return $wpdb->insert($table, array(
            'issue_type' => $issue_type,
            'url' => $url,
            'post_id' => $post_id,
            'priority' => $priority,
            'status' => 'pending',
            'context' => json_encode($context),
            'created_at' => current_time('mysql'),
        ));
    }
    
    /**
     * Get queue items
     */
    public static function get_queue($status = null, $limit = 50) {
        global $wpdb;
        
        $table = $wpdb->prefix . self::TABLE_NAME;
        
        $sql = "SELECT * FROM $table";
        
        if ($status) {
            $sql .= $wpdb->prepare(" WHERE status = %s", $status);
        }
        
        $sql .= " ORDER BY priority DESC, created_at ASC LIMIT %d";
        
        return $wpdb->get_results($wpdb->prepare($sql, $limit));
    }
    
    /**
     * Process fix queue
     */
    public function process_queue($limit = 10) {
        if (!self::is_enabled()) {
            return;
        }
        
        $items = self::get_queue('pending', $limit);
        
        foreach ($items as $item) {
            $this->process_item($item);
        }
    }
    
    /**
     * Process single queue item
     */
    private function process_item($item) {
        global $wpdb;
        
        $table = $wpdb->prefix . self::TABLE_NAME;
        
        // Mark as processing
        $wpdb->update($table, array('status' => 'processing'), array('id' => $item->id));
        
        try {
            $result = null;
            
            switch ($item->issue_type) {
                case '404':
                    $result = $this->analyze_404($item->url, json_decode($item->context, true) ?: array());
                    break;
                    
                case 'not_indexed':
                    $result = $this->analyze_not_indexed($item->url, json_decode($item->context, true) ?: array());
                    break;
                    
                case 'thin_content':
                    $result = $this->analyze_thin_content($item->post_id);
                    break;
                    
                case 'schema_error':
                    $result = $this->analyze_schema_error($item->post_id, json_decode($item->context, true) ?: array());
                    break;
                    
                default:
                    $result = array('action' => 'SKIP', 'reason' => 'Tipo de problema desconhecido');
            }
            
            // Update with result
            $wpdb->update($table, array(
                'status' => $result ? 'completed' : 'failed',
                'ai_analysis' => json_encode($result),
                'fix_action' => $result['action'] ?? null,
                'processed_at' => current_time('mysql'),
            ), array('id' => $item->id));
            
            CFRDM_Logger::success('ai_auto_fix', 'Item processado', array(
                'id' => $item->id,
                'type' => $item->issue_type,
                'action' => $result['action'] ?? 'unknown',
            ));
            
        } catch (Exception $e) {
            $wpdb->update($table, array(
                'status' => 'failed',
                'error_message' => $e->getMessage(),
                'processed_at' => current_time('mysql'),
            ), array('id' => $item->id));
            
            CFRDM_Logger::error('ai_auto_fix', 'Erro ao processar item', array(
                'id' => $item->id,
                'error' => $e->getMessage(),
            ));
        }
    }
    
    /**
     * Call AI API via edge function
     */
    private function call_ai_api($prompt, $system_prompt = null) {
        $api_url = get_option('cfrdm_api_url');
        $api_key = get_option('cfrdm_api_key');
        
        if (empty($api_url)) {
            throw new Exception('API URL não configurada');
        }
        
        $endpoint = rtrim($api_url, '/') . '/functions/v1/ai-api';
        
        $body = array(
            'action' => 'generate-text',
            'model' => 'flash',
            'prompt' => $prompt,
            'maxTokens' => 2000,
            'temperature' => 0.3,
        );
        
        if ($system_prompt) {
            $body['systemPrompt'] = $system_prompt;
        }
        
        $response = wp_remote_post($endpoint, array(
            'headers' => array(
                'Content-Type' => 'application/json',
                'X-CFRDM-API-Key' => $api_key,
            ),
            'body' => json_encode($body),
            'timeout' => 60,
        ));
        
        if (is_wp_error($response)) {
            throw new Exception($response->get_error_message());
        }
        
        $status_code = wp_remote_retrieve_response_code($response);
        $body = json_decode(wp_remote_retrieve_body($response), true);
        
        if ($status_code >= 400) {
            throw new Exception($body['error'] ?? 'Erro na API de IA');
        }
        
        return $body['text'] ?? '';
    }
    
    /**
     * Analyze 404 URL and decide action
     */
    public function analyze_404($url, $context = array()) {
        // Get historical data
        $historical_data = $this->get_url_historical_data($url);
        
        // Find similar pages
        $similar_pages = $this->find_similar_pages($url);
        
        // Build prompt
        $prompt = "Analise esta URL 404 e decida a melhor ação:

URL: {$url}

DADOS HISTÓRICOS:
- Acessos últimos 90 dias: " . ($historical_data['pageviews'] ?? 0) . "
- Backlinks conhecidos: " . ($context['backlinks'] ?? 0) . "

PÁGINAS SIMILARES ENCONTRADAS:
" . json_encode($similar_pages, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "

DECISÕES POSSÍVEIS:
1. REDIRECT - Redirecionar para página similar (especificar URL)
2. REMOVE - Remover do sitemap (se conteúdo obsoleto)
3. RECREATE - Recriar conteúdo (se importante para SEO)

Retorne APENAS um JSON no formato:
{
    \"action\": \"REDIRECT|REMOVE|RECREATE\",
    \"target_url\": \"https://...\",
    \"reason\": \"Explicação breve\",
    \"confidence\": 0.95
}";

        $ai_response = $this->call_ai_api($prompt, 'Você é um especialista em SEO técnico. Analise problemas e sugira correções precisas.');
        
        // Parse JSON from response
        $decision = $this->extract_json($ai_response);
        
        if (!$decision) {
            return array('action' => 'MANUAL_REVIEW', 'reason' => 'Não foi possível analisar');
        }
        
        // Execute action if confidence is high enough
        if (($decision['confidence'] ?? 0) >= self::get_min_confidence()) {
            switch ($decision['action']) {
                case 'REDIRECT':
                    $this->create_smart_redirect($url, $decision['target_url']);
                    break;
                    
                case 'REMOVE':
                    $this->remove_obsolete_url($url);
                    break;
                    
                case 'RECREATE':
                    // Queue for content recreation
                    if (class_exists('CFRDM_AI_Content_Enhancer')) {
                        CFRDM_AI_Content_Enhancer::queue_recreation($url, $context);
                    }
                    break;
            }
        } else {
            $decision['action'] = 'MANUAL_REVIEW';
            $decision['reason'] = 'Confiança baixa - requer revisão manual';
        }
        
        return $decision;
    }
    
    /**
     * Analyze non-indexed page
     */
    public function analyze_not_indexed($url, $context = array()) {
        $post_id = url_to_postid($url);
        
        if (!$post_id) {
            return array('action' => 'SKIP', 'reason' => 'Post não encontrado');
        }
        
        $post = get_post($post_id);
        $content = $post->post_content;
        $word_count = str_word_count(strip_tags($content));
        
        // Check for thin content
        if ($word_count < 300) {
            self::add_to_queue('thin_content', $url, $post_id, 7, array(
                'word_count' => $word_count,
                'reason' => $context['reason'] ?? 'Conteúdo fino',
            ));
            
            return array(
                'action' => 'QUEUE_ENHANCEMENT',
                'reason' => 'Conteúdo fino detectado (' . $word_count . ' palavras)',
            );
        }
        
        // Request re-indexing
        if (class_exists('CFRDM_GSC_Integration')) {
            $gsc = CFRDM_GSC_Integration::get_instance();
            $gsc->request_indexing($url);
        }
        
        return array(
            'action' => 'REINDEX_REQUESTED',
            'reason' => 'Solicitada nova indexação',
        );
    }
    
    /**
     * Analyze thin content
     */
    public function analyze_thin_content($post_id) {
        if (!$post_id) {
            return array('action' => 'SKIP', 'reason' => 'Post ID inválido');
        }
        
        // Delegate to content enhancer
        if (class_exists('CFRDM_AI_Content_Enhancer')) {
            $enhancer = CFRDM_AI_Content_Enhancer::get_instance();
            return $enhancer->enhance_thin_content($post_id);
        }
        
        return array('action' => 'SKIP', 'reason' => 'Módulo de enhancement não disponível');
    }
    
    /**
     * Analyze schema error
     */
    public function analyze_schema_error($post_id, $context = array()) {
        if (!$post_id) {
            return array('action' => 'SKIP', 'reason' => 'Post ID inválido');
        }
        
        $issue_type = $context['type'] ?? '';
        
        switch ($issue_type) {
            case 'FAQPage':
                return $this->fix_duplicate_faq_schema($post_id);
                
            case 'AggregateRating':
                return $this->consolidate_aggregate_ratings($post_id);
                
            default:
                // Generic schema fix via AI
                return $this->fix_generic_schema($post_id, $context);
        }
    }
    
    /**
     * Fix duplicate FAQ schema
     */
    private function fix_duplicate_faq_schema($post_id) {
        $post = get_post($post_id);
        
        if (!$post) {
            return array('action' => 'SKIP', 'reason' => 'Post não encontrado');
        }
        
        // Add meta flag to prevent duplication
        update_post_meta($post_id, '_cfrdm_faq_schema_fixed', true);
        update_post_meta($post_id, '_cfrdm_single_faq_schema', true);
        
        CFRDM_Logger::success('schema_fix', 'FAQ duplicado marcado para correção', array(
            'post_id' => $post_id,
        ));
        
        return array(
            'action' => 'FIXED',
            'reason' => 'FAQPage duplicado marcado para consolidação',
        );
    }
    
    /**
     * Consolidate aggregate ratings
     */
    private function consolidate_aggregate_ratings($post_id) {
        $post = get_post($post_id);
        
        if (!$post) {
            return array('action' => 'SKIP', 'reason' => 'Post não encontrado');
        }
        
        // Extract ratings from content
        preg_match_all('/(\d+(?:\.\d+)?)\s*(?:\/\s*5|estrelas?|stars?)/i', $post->post_content, $matches);
        
        if (!empty($matches[1])) {
            $ratings = array_map('floatval', $matches[1]);
            $avg_rating = array_sum($ratings) / count($ratings);
            $rating_count = count($ratings);
            
            // Store consolidated rating
            update_post_meta($post_id, '_cfrdm_aggregate_rating', array(
                'ratingValue' => round($avg_rating, 1),
                'reviewCount' => $rating_count,
            ));
            
            return array(
                'action' => 'FIXED',
                'reason' => "AggregateRating consolidado: {$avg_rating}/5 ({$rating_count} reviews)",
            );
        }
        
        return array('action' => 'SKIP', 'reason' => 'Nenhum rating encontrado');
    }
    
    /**
     * Fix generic schema issues via AI
     */
    private function fix_generic_schema($post_id, $context) {
        $post = get_post($post_id);
        
        if (!$post) {
            return array('action' => 'SKIP', 'reason' => 'Post não encontrado');
        }
        
        // For now, just log the issue
        CFRDM_Logger::warning('schema_fix', 'Schema issue requer revisão manual', array(
            'post_id' => $post_id,
            'context' => $context,
        ));
        
        return array(
            'action' => 'MANUAL_REVIEW',
            'reason' => 'Schema issue complexo - requer revisão',
        );
    }
    
    /**
     * Get historical data for URL
     */
    private function get_url_historical_data($url) {
        $post_id = url_to_postid($url);
        
        if (!$post_id) {
            return array('pageviews' => 0);
        }
        
        // Try to get from popular posts plugins or analytics
        $pageviews = get_post_meta($post_id, 'post_views_count', true) ?: 0;
        
        return array(
            'pageviews' => intval($pageviews),
            'post_id' => $post_id,
        );
    }
    
    /**
     * Find similar pages based on URL/slug
     */
    private function find_similar_pages($url) {
        $path = parse_url($url, PHP_URL_PATH);
        $slug = basename($path);
        
        // Remove common prefixes/suffixes like years
        $search_term = preg_replace('/[-_]?(20\d{2}|19\d{2})[-_]?/', '', $slug);
        $search_term = preg_replace('/[-_]+/', ' ', $search_term);
        
        $args = array(
            'post_type' => 'post',
            'post_status' => 'publish',
            's' => $search_term,
            'posts_per_page' => 5,
        );
        
        $posts = get_posts($args);
        $similar = array();
        
        foreach ($posts as $post) {
            $similar[] = array(
                'title' => $post->post_title,
                'url' => get_permalink($post->ID),
                'date' => $post->post_date,
            );
        }
        
        return $similar;
    }
    
    /**
     * Create smart redirect using Redirection plugin or .htaccess
     */
    private function create_smart_redirect($source_url, $target_url) {
        $source_path = parse_url($source_url, PHP_URL_PATH);
        
        // Try Redirection plugin first
        if (class_exists('Red_Item')) {
            Red_Item::create(array(
                'url' => $source_path,
                'match_type' => 'url',
                'action_type' => 'url',
                'action_code' => 301,
                'action_data' => array('url' => $target_url),
                'group_id' => 1,
            ));
            
            CFRDM_Logger::success('redirect', 'Redirecionamento 301 criado via Redirection', array(
                'source' => $source_path,
                'target' => $target_url,
            ));
            
            return true;
        }
        
        // Fallback: store in database for manual .htaccess
        $redirects = get_option('cfrdm_redirects', array());
        $redirects[$source_path] = $target_url;
        update_option('cfrdm_redirects', $redirects);
        
        CFRDM_Logger::info('redirect', 'Redirecionamento salvo (requer .htaccess manual)', array(
            'source' => $source_path,
            'target' => $target_url,
        ));
        
        return true;
    }
    
    /**
     * Remove obsolete URL
     */
    private function remove_obsolete_url($url) {
        $post_id = url_to_postid($url);
        
        if ($post_id) {
            // Add noindex meta instead of deleting
            update_post_meta($post_id, '_yoast_wpseo_meta-robots-noindex', '1');
            update_post_meta($post_id, 'rank_math_robots', array('noindex'));
            
            CFRDM_Logger::info('remove_url', 'Post marcado como noindex', array(
                'post_id' => $post_id,
                'url' => $url,
            ));
        }
        
        // Request removal from Google
        if (class_exists('CFRDM_GSC_Integration')) {
            // Note: Removal API requires separate scope
            CFRDM_Logger::info('remove_url', 'URL marcada para remoção do índice', array(
                'url' => $url,
            ));
        }
        
        return true;
    }
    
    /**
     * Extract JSON from AI response
     */
    private function extract_json($text) {
        // Try to find JSON in the response
        if (preg_match('/\{[^{}]*\}/', $text, $matches)) {
            $json = json_decode($matches[0], true);
            if ($json) {
                return $json;
            }
        }
        
        // Try full response
        $json = json_decode($text, true);
        if ($json) {
            return $json;
        }
        
        return null;
    }
    
    /**
     * Get statistics
     */
    public static function get_stats() {
        global $wpdb;
        
        $table = $wpdb->prefix . self::TABLE_NAME;
        
        // Check if table exists
        if ($wpdb->get_var("SHOW TABLES LIKE '$table'") !== $table) {
            return array(
                'total' => 0,
                'pending' => 0,
                'processing' => 0,
                'completed' => 0,
                'failed' => 0,
                'today' => 0,
            );
        }
        
        return array(
            'total' => $wpdb->get_var("SELECT COUNT(*) FROM $table"),
            'pending' => $wpdb->get_var("SELECT COUNT(*) FROM $table WHERE status = 'pending'"),
            'processing' => $wpdb->get_var("SELECT COUNT(*) FROM $table WHERE status = 'processing'"),
            'completed' => $wpdb->get_var("SELECT COUNT(*) FROM $table WHERE status = 'completed'"),
            'failed' => $wpdb->get_var("SELECT COUNT(*) FROM $table WHERE status = 'failed'"),
            'today' => $wpdb->get_var($wpdb->prepare(
                "SELECT COUNT(*) FROM $table WHERE processed_at >= %s AND status = 'completed'",
                date('Y-m-d 00:00:00')
            )),
        );
    }
    
    /**
     * Cleanup old completed items
     */
    public static function cleanup($days = 30) {
        global $wpdb;
        
        $table = $wpdb->prefix . self::TABLE_NAME;
        $date_limit = date('Y-m-d H:i:s', strtotime("-{$days} days"));
        
        return $wpdb->query($wpdb->prepare(
            "DELETE FROM $table WHERE status IN ('completed', 'failed') AND processed_at < %s",
            $date_limit
        ));
    }
}
