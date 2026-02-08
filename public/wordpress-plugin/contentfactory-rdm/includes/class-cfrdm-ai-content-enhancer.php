<?php
/**
 * AI Content Enhancement
 * 
 * Melhora automaticamente conteúdo de artigos para resolver
 * problemas de indexação usando a edge function ai-api
 * 
 * @package ContentFactory_RDM
 * @since 3.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_AI_Content_Enhancer {
    
    const OPTION_ENABLED = 'cfrdm_content_enhancer_enabled';
    const OPTION_MIN_WORDS = 'cfrdm_content_enhancer_min_words';
    const OPTION_TARGET_WORDS = 'cfrdm_content_enhancer_target_words';
    
    private static $instance = null;
    
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    /**
     * Initialize content enhancer
     */
    public function init() {
        // Register cron job for batch processing
        add_action('cfrdm_enhance_content', array($this, 'process_enhancement_queue'));
        
        // Schedule hourly processing
        if (!wp_next_scheduled('cfrdm_enhance_content')) {
            wp_schedule_event(time(), 'hourly', 'cfrdm_enhance_content');
        }
    }
    
    /**
     * Check if enhancer is enabled
     */
    public static function is_enabled() {
        return get_option(self::OPTION_ENABLED, false);
    }
    
    /**
     * Get minimum words threshold
     */
    public static function get_min_words() {
        return intval(get_option(self::OPTION_MIN_WORDS, 300));
    }
    
    /**
     * Get target words count
     */
    public static function get_target_words() {
        return intval(get_option(self::OPTION_TARGET_WORDS, 800));
    }
    
    /**
     * Queue URL for content recreation
     */
    public static function queue_recreation($url, $context = array()) {
        $post_id = url_to_postid($url);
        
        if ($post_id && class_exists('CFRDM_AI_Auto_Fix')) {
            CFRDM_AI_Auto_Fix::add_to_queue(
                'content_recreation',
                $url,
                $post_id,
                6,
                $context
            );
        }
    }
    
    /**
     * Analyze content quality
     * 
     * @param int $post_id Post ID
     * @return array Quality analysis
     */
    public function analyze_content_quality($post_id) {
        $post = get_post($post_id);
        
        if (!$post) {
            return array('error' => 'Post não encontrado');
        }
        
        $content = $post->post_content;
        $text = strip_tags($content);
        $word_count = str_word_count($text);
        
        // Calculate various metrics
        $analysis = array(
            'post_id' => $post_id,
            'title' => $post->post_title,
            'word_count' => $word_count,
            'has_headings' => $this->count_headings($content),
            'has_images' => $this->count_images($content),
            'has_lists' => $this->count_lists($content),
            'has_links' => $this->count_links($content),
            'reading_time' => ceil($word_count / 200), // 200 words per minute
            'issues' => array(),
            'score' => 0,
        );
        
        // Identify issues
        if ($word_count < self::get_min_words()) {
            $analysis['issues'][] = 'thin_content';
        }
        
        if ($analysis['has_headings']['h2'] < 2) {
            $analysis['issues'][] = 'few_headings';
        }
        
        if ($analysis['has_images'] < 1) {
            $analysis['issues'][] = 'no_images';
        }
        
        if ($analysis['has_lists'] < 1 && $word_count > 500) {
            $analysis['issues'][] = 'no_lists';
        }
        
        if ($analysis['has_links']['internal'] < 2) {
            $analysis['issues'][] = 'few_internal_links';
        }
        
        // Calculate quality score (0-100)
        $score = 100;
        $score -= count($analysis['issues']) * 15;
        $score = max(0, min(100, $score));
        $analysis['score'] = $score;
        
        return $analysis;
    }
    
    /**
     * Count headings in content
     */
    private function count_headings($content) {
        return array(
            'h2' => preg_match_all('/<h2[^>]*>/i', $content, $m),
            'h3' => preg_match_all('/<h3[^>]*>/i', $content, $m),
            'h4' => preg_match_all('/<h4[^>]*>/i', $content, $m),
        );
    }
    
    /**
     * Count images in content
     */
    private function count_images($content) {
        return preg_match_all('/<img[^>]+>/i', $content, $m);
    }
    
    /**
     * Count lists in content
     */
    private function count_lists($content) {
        $ul = preg_match_all('/<ul[^>]*>/i', $content, $m1);
        $ol = preg_match_all('/<ol[^>]*>/i', $content, $m2);
        return $ul + $ol;
    }
    
    /**
     * Count links in content
     */
    private function count_links($content) {
        $site_host = parse_url(get_site_url(), PHP_URL_HOST);
        
        preg_match_all('/<a[^>]+href=["\']([^"\']+)["\'][^>]*>/i', $content, $matches);
        
        $internal = 0;
        $external = 0;
        
        foreach ($matches[1] as $url) {
            if (strpos($url, $site_host) !== false || strpos($url, '/') === 0) {
                $internal++;
            } else {
                $external++;
            }
        }
        
        return array('internal' => $internal, 'external' => $external);
    }
    
    /**
     * Enhance thin content
     * 
     * @param int $post_id Post ID
     * @param int $target_words Target word count
     * @return array Enhancement result
     */
    public function enhance_thin_content($post_id, $target_words = null) {
        if ($target_words === null) {
            $target_words = self::get_target_words();
        }
        
        $post = get_post($post_id);
        
        if (!$post) {
            return array('action' => 'SKIP', 'reason' => 'Post não encontrado');
        }
        
        $current_content = $post->post_content;
        $current_word_count = str_word_count(strip_tags($current_content));
        
        if ($current_word_count >= $target_words) {
            return array(
                'action' => 'SKIP',
                'reason' => 'Conteúdo já tem ' . $current_word_count . ' palavras',
            );
        }
        
        $title = $post->post_title;
        $categories = wp_get_post_categories($post_id, array('fields' => 'names'));
        $tags = wp_get_post_tags($post_id, array('fields' => 'names'));
        
        // Build prompt for AI
        $prompt = "Você é um redator SEO especializado. Expanda o conteúdo abaixo para pelo menos {$target_words} palavras, mantendo a qualidade e relevância.

TÍTULO: {$title}

CATEGORIAS: " . implode(', ', $categories) . "

TAGS: " . implode(', ', $tags) . "

CONTEÚDO ATUAL ({$current_word_count} palavras):
{$current_content}

INSTRUÇÕES:
1. Mantenha o HTML existente
2. Adicione seções relevantes como: FAQ, Dicas Práticas, Comparações
3. Use <h2> e <h3> para estruturar
4. Adicione listas (<ul>, <ol>) quando apropriado
5. Mantenha densidade de palavra-chave natural (2-3%)
6. Adicione parágrafos de transição fluidos
7. O conteúdo expandido deve fluir naturalmente com o existente

Retorne APENAS o HTML do conteúdo expandido, sem explicações.";

        try {
            $enhanced_content = $this->call_ai_api($prompt);
            
            // Validate response
            if (empty($enhanced_content)) {
                throw new Exception('Resposta vazia da IA');
            }
            
            $new_word_count = str_word_count(strip_tags($enhanced_content));
            
            if ($new_word_count < $current_word_count) {
                throw new Exception('Conteúdo retornado é menor que o original');
            }
            
            // Update post
            wp_update_post(array(
                'ID' => $post_id,
                'post_content' => $enhanced_content,
            ));
            
            // Update meta
            update_post_meta($post_id, '_cfrdm_enhanced_at', current_time('mysql'));
            update_post_meta($post_id, '_cfrdm_words_before', $current_word_count);
            update_post_meta($post_id, '_cfrdm_words_after', $new_word_count);
            
            CFRDM_Logger::success('content_enhance', 'Conteúdo expandido', array(
                'post_id' => $post_id,
                'before' => $current_word_count,
                'after' => $new_word_count,
            ));
            
            // Request re-indexing
            if (class_exists('CFRDM_GSC_Integration')) {
                $gsc = CFRDM_GSC_Integration::get_instance();
                $gsc->request_indexing(get_permalink($post_id));
            }
            
            return array(
                'action' => 'ENHANCED',
                'before' => $current_word_count,
                'after' => $new_word_count,
                'added' => $new_word_count - $current_word_count,
            );
            
        } catch (Exception $e) {
            CFRDM_Logger::error('content_enhance', 'Erro ao expandir conteúdo', array(
                'post_id' => $post_id,
                'error' => $e->getMessage(),
            ));
            
            return array(
                'action' => 'FAILED',
                'reason' => $e->getMessage(),
            );
        }
    }
    
    /**
     * Add content sections (FAQ, comparison, etc.)
     * 
     * @param int $post_id Post ID
     * @param array $sections Sections to add
     * @return array Result
     */
    public function add_content_sections($post_id, $sections = array('faq')) {
        $post = get_post($post_id);
        
        if (!$post) {
            return array('success' => false, 'error' => 'Post não encontrado');
        }
        
        $title = $post->post_title;
        $content = $post->post_content;
        $sections_added = array();
        
        foreach ($sections as $section_type) {
            $section_content = $this->generate_section($title, $content, $section_type);
            
            if ($section_content) {
                $content .= "\n\n" . $section_content;
                $sections_added[] = $section_type;
            }
        }
        
        if (!empty($sections_added)) {
            wp_update_post(array(
                'ID' => $post_id,
                'post_content' => $content,
            ));
            
            update_post_meta($post_id, '_cfrdm_sections_added', $sections_added);
            
            CFRDM_Logger::success('content_enhance', 'Seções adicionadas', array(
                'post_id' => $post_id,
                'sections' => $sections_added,
            ));
        }
        
        return array(
            'success' => true,
            'sections_added' => $sections_added,
        );
    }
    
    /**
     * Generate content section
     */
    private function generate_section($title, $existing_content, $section_type) {
        $prompts = array(
            'faq' => "Crie uma seção FAQ com 5 perguntas e respostas relevantes para o artigo '{$title}'. 
                      Use formato HTML com <h2>Perguntas Frequentes</h2> e cada pergunta em <h3>.
                      As respostas devem ser informativas e úteis, com 2-3 parágrafos cada.",
            
            'comparison' => "Crie uma seção de comparação/tabela para o artigo '{$title}'.
                            Use formato HTML com <h2>Comparação</h2> e uma <table> com dados relevantes.
                            Inclua pelo menos 3-5 itens para comparar.",
            
            'tips' => "Crie uma seção com 5-7 dicas práticas para o artigo '{$title}'.
                      Use formato HTML com <h2>Dicas Práticas</h2> e uma lista ordenada <ol>.
                      Cada dica deve ter 1-2 parágrafos de explicação.",
            
            'summary' => "Crie um resumo/conclusão para o artigo '{$title}'.
                         Use formato HTML com <h2>Conclusão</h2>.
                         Inclua os principais pontos abordados e um call-to-action.",
        );
        
        if (!isset($prompts[$section_type])) {
            return null;
        }
        
        $prompt = $prompts[$section_type] . "\n\nContexto do artigo existente:\n" . 
                  substr(strip_tags($existing_content), 0, 1000) . "...";
        
        try {
            return $this->call_ai_api($prompt);
        } catch (Exception $e) {
            CFRDM_Logger::error('content_enhance', 'Erro ao gerar seção', array(
                'section' => $section_type,
                'error' => $e->getMessage(),
            ));
            return null;
        }
    }
    
    /**
     * Improve readability
     * 
     * @param int $post_id Post ID
     * @return array Result
     */
    public function improve_readability($post_id) {
        $post = get_post($post_id);
        
        if (!$post) {
            return array('success' => false, 'error' => 'Post não encontrado');
        }
        
        $prompt = "Melhore a legibilidade do seguinte conteúdo HTML mantendo o significado original:

1. Divida parágrafos muito longos (mais de 3 frases)
2. Simplifique frases complexas
3. Adicione palavras de transição entre parágrafos
4. Mantenha todas as tags HTML existentes
5. Não remova nenhum conteúdo, apenas reformule

CONTEÚDO:
{$post->post_content}

Retorne APENAS o HTML melhorado, sem explicações.";

        try {
            $improved_content = $this->call_ai_api($prompt);
            
            if (empty($improved_content)) {
                throw new Exception('Resposta vazia');
            }
            
            wp_update_post(array(
                'ID' => $post_id,
                'post_content' => $improved_content,
            ));
            
            update_post_meta($post_id, '_cfrdm_readability_improved', current_time('mysql'));
            
            return array('success' => true);
            
        } catch (Exception $e) {
            return array('success' => false, 'error' => $e->getMessage());
        }
    }
    
    /**
     * Optimize keyword density
     * 
     * @param int $post_id Post ID
     * @param string $target_keyword Target keyword
     * @return array Result
     */
    public function optimize_keyword_density($post_id, $target_keyword) {
        $post = get_post($post_id);
        
        if (!$post) {
            return array('success' => false, 'error' => 'Post não encontrado');
        }
        
        $content = $post->post_content;
        $text = strtolower(strip_tags($content));
        $word_count = str_word_count($text);
        
        // Count current keyword occurrences
        $keyword_count = substr_count($text, strtolower($target_keyword));
        $current_density = ($keyword_count / $word_count) * 100;
        
        // Target density: 1.5-2.5%
        if ($current_density >= 1.5 && $current_density <= 2.5) {
            return array(
                'success' => true,
                'message' => 'Densidade já está ótima',
                'density' => round($current_density, 2),
            );
        }
        
        $prompt = "Otimize a densidade da palavra-chave '{$target_keyword}' no seguinte conteúdo HTML.

Densidade atual: {$current_density}%
Densidade alvo: 1.5-2.5%

REGRAS:
1. Se densidade muito baixa, adicione a palavra-chave naturalmente em mais lugares
2. Se densidade muito alta, remova algumas ocorrências ou use sinônimos
3. Mantenha a leitura natural e fluida
4. Preserve todo o HTML original

CONTEÚDO:
{$content}

Retorne APENAS o HTML otimizado, sem explicações.";

        try {
            $optimized_content = $this->call_ai_api($prompt);
            
            if (empty($optimized_content)) {
                throw new Exception('Resposta vazia');
            }
            
            wp_update_post(array(
                'ID' => $post_id,
                'post_content' => $optimized_content,
            ));
            
            // Calculate new density
            $new_text = strtolower(strip_tags($optimized_content));
            $new_word_count = str_word_count($new_text);
            $new_keyword_count = substr_count($new_text, strtolower($target_keyword));
            $new_density = ($new_keyword_count / $new_word_count) * 100;
            
            update_post_meta($post_id, '_cfrdm_keyword_optimized', array(
                'keyword' => $target_keyword,
                'before' => round($current_density, 2),
                'after' => round($new_density, 2),
                'date' => current_time('mysql'),
            ));
            
            return array(
                'success' => true,
                'before' => round($current_density, 2),
                'after' => round($new_density, 2),
            );
            
        } catch (Exception $e) {
            return array('success' => false, 'error' => $e->getMessage());
        }
    }
    
    /**
     * Call AI API via edge function
     */
    private function call_ai_api($prompt) {
        $api_url = get_option('cfrdm_api_url');
        $api_key = get_option('cfrdm_api_key');
        
        if (empty($api_url)) {
            throw new Exception('API URL não configurada');
        }
        
        $endpoint = rtrim($api_url, '/') . '/functions/v1/ai-api';
        
        $response = wp_remote_post($endpoint, array(
            'headers' => array(
                'Content-Type' => 'application/json',
                'X-CFRDM-API-Key' => $api_key,
            ),
            'body' => json_encode(array(
                'action' => 'generate-text',
                'model' => 'pro', // Use pro model for content enhancement
                'prompt' => $prompt,
                'maxTokens' => 8000,
                'temperature' => 0.7,
            )),
            'timeout' => 120, // 2 minutes for long content
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
     * Process enhancement queue
     */
    public function process_enhancement_queue($limit = 5) {
        if (!self::is_enabled()) {
            return;
        }
        
        // Find posts needing enhancement
        $args = array(
            'post_type' => 'post',
            'post_status' => 'publish',
            'posts_per_page' => $limit,
            'meta_query' => array(
                'relation' => 'AND',
                array(
                    'key' => '_cfrdm_enhanced_at',
                    'compare' => 'NOT EXISTS',
                ),
                array(
                    'key' => '_cfrdm_skip_enhancement',
                    'compare' => 'NOT EXISTS',
                ),
            ),
            'orderby' => 'date',
            'order' => 'ASC', // Oldest first
        );
        
        $posts = get_posts($args);
        
        foreach ($posts as $post) {
            $word_count = str_word_count(strip_tags($post->post_content));
            
            if ($word_count < self::get_min_words()) {
                $this->enhance_thin_content($post->ID);
            } else {
                // Mark as not needing enhancement
                update_post_meta($post->ID, '_cfrdm_skip_enhancement', true);
            }
            
            // Rate limiting
            sleep(2);
        }
    }
    
    /**
     * Get statistics
     */
    public static function get_stats() {
        global $wpdb;
        
        $total_enhanced = $wpdb->get_var(
            "SELECT COUNT(*) FROM {$wpdb->postmeta} WHERE meta_key = '_cfrdm_enhanced_at'"
        );
        
        $avg_words_added = $wpdb->get_var(
            "SELECT AVG(CAST(after_meta.meta_value AS UNSIGNED) - CAST(before_meta.meta_value AS UNSIGNED))
             FROM {$wpdb->postmeta} before_meta
             JOIN {$wpdb->postmeta} after_meta ON before_meta.post_id = after_meta.post_id
             WHERE before_meta.meta_key = '_cfrdm_words_before'
             AND after_meta.meta_key = '_cfrdm_words_after'"
        );
        
        $thin_content_count = $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->posts} 
             WHERE post_type = 'post' 
             AND post_status = 'publish'
             AND LENGTH(post_content) - LENGTH(REPLACE(post_content, ' ', '')) < %d",
            self::get_min_words()
        ));
        
        return array(
            'total_enhanced' => $total_enhanced,
            'avg_words_added' => round($avg_words_added ?? 0),
            'thin_content_remaining' => $thin_content_count,
            'enabled' => self::is_enabled(),
            'min_words' => self::get_min_words(),
            'target_words' => self::get_target_words(),
        );
    }
}
