<?php
/**
 * AI SEO Generator - Generate optimized SEO metadata using AI
 * 
 * Features:
 * - Generate optimized slugs
 * - Create meta descriptions (up to 160 chars)
 * - Generate relevant tags (5-10)
 * - Suggest viral titles (5 options)
 * - Multi-language support
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_AI_SEO {
    
    /**
     * API endpoint for AI generation
     */
    private static $api_endpoint = null;
    
    /**
     * Get the AI API endpoint
     */
    private static function get_api_endpoint() {
        if (self::$api_endpoint === null) {
            $api_url = get_option('cfrdm_api_url');
            if (!empty($api_url)) {
                self::$api_endpoint = trailingslashit($api_url) . 'functions/v1/ai-api';
            }
        }
        return self::$api_endpoint;
    }
    
    /**
     * Generate SEO metadata for a post
     * 
     * @param int $post_id Post ID
     * @param array $options Generation options
     * @return array|WP_Error SEO data or error
     */
    public static function generate($post_id, $options = array()) {
        $post = get_post($post_id);
        
        if (!$post) {
            return new WP_Error('invalid_post', __('Post não encontrado.', 'contentfactory-rdm'));
        }
        
        $defaults = array(
            'language' => get_option('cfrdm_default_language', 'pt-BR'),
            'country' => get_option('cfrdm_default_country', 'Brasil'),
            'title' => $post->post_title,
            'content' => $post->post_content,
        );
        
        $options = wp_parse_args($options, $defaults);
        
        // Clean content for API
        $content_plain = wp_strip_all_tags($options['content']);
        $content_plain = trim(preg_replace('/\s+/', ' ', $content_plain));
        $content_plain = mb_substr($content_plain, 0, 4000);
        
        // Build the prompt
        $prompt = self::build_seo_prompt($options['title'], $content_plain, $options['language'], $options['country']);
        
        // Call AI API
        $result = self::call_ai_api($prompt);
        
        if (is_wp_error($result)) {
            return $result;
        }
        
        // Parse and validate response
        $seo_data = self::parse_ai_response($result);
        
        if (is_wp_error($seo_data)) {
            return $seo_data;
        }
        
        // Optionally apply to post
        if (!empty($options['apply_to_post']) && $options['apply_to_post']) {
            self::apply_to_post($post_id, $seo_data);
        }
        
        CFRDM_Logger::success('ai_seo', 'SEO gerado com sucesso via IA', array(
            'post_id' => $post_id,
            'slug' => $seo_data['slug'],
            'tags_count' => count($seo_data['tags']),
        ), $post_id);
        
        return $seo_data;
    }
    
    /**
     * Build the SEO generation prompt
     */
    private static function build_seo_prompt($title, $content, $language, $country) {
        $prompt = "Você é um especialista em SEO.\n";
        $prompt .= "Gere SEO para um post no WordPress.\n\n";
        $prompt .= "REGRAS OBRIGATÓRIAS:\n";
        $prompt .= "- Responda APENAS com JSON válido (sem Markdown, sem explicações)\n";
        $prompt .= "- Idioma: {$language}\n";
        $prompt .= "- País/variante: {$country}\n";
        $prompt .= "- slug: curto, sem acentos, sem stopwords desnecessárias, separado por hífens\n";
        $prompt .= "- meta_description: até 160 caracteres, incluir call-to-action sutil\n";
        $prompt .= "- focus_keyword: palavra-chave principal do conteúdo\n";
        $prompt .= "- tags: 5 a 10 tags curtas e relevantes\n";
        $prompt .= "- viral_titles: 5 sugestões de títulos virais (curtos e clicáveis)\n\n";
        $prompt .= "FORMATO DE RESPOSTA (JSON):\n";
        $prompt .= "{\n";
        $prompt .= "  \"slug\": \"...\",\n";
        $prompt .= "  \"meta_description\": \"...\",\n";
        $prompt .= "  \"focus_keyword\": \"...\",\n";
        $prompt .= "  \"tags\": [\"tag1\", \"tag2\"],\n";
        $prompt .= "  \"viral_titles\": [\"título 1\", \"título 2\", \"título 3\", \"título 4\", \"título 5\"]\n";
        $prompt .= "}\n\n";
        $prompt .= "TÍTULO DO POST: {$title}\n\n";
        $prompt .= "CONTEÚDO DO POST (resumo): {$content}\n";
        
        return $prompt;
    }
    
    /**
     * Call the AI API
     */
    private static function call_ai_api($prompt) {
        $api_endpoint = self::get_api_endpoint();
        
        if (empty($api_endpoint)) {
            return new WP_Error('no_api', __('API URL não configurada.', 'contentfactory-rdm'));
        }
        
        $api_key = get_option('cfrdm_api_key');
        
        if (empty($api_key)) {
            return new WP_Error('no_api_key', __('API Key não configurada.', 'contentfactory-rdm'));
        }
        
        $response = wp_remote_post($api_endpoint, array(
            'timeout' => 60,
            'headers' => array(
                'Content-Type' => 'application/json',
                'Authorization' => 'Bearer ' . $api_key,
            ),
            'body' => wp_json_encode(array(
                'action' => 'generate',
                'model' => get_option('cfrdm_ai_model', 'gemini-2.5-flash'),
                'prompt' => $prompt,
                'max_tokens' => 1000,
                'temperature' => 0.7,
            )),
        ));
        
        if (is_wp_error($response)) {
            CFRDM_Logger::error('ai_seo', 'Erro ao chamar API de IA', array(
                'error' => $response->get_error_message(),
            ));
            return $response;
        }
        
        $status_code = wp_remote_retrieve_response_code($response);
        $body = wp_remote_retrieve_body($response);
        
        if ($status_code !== 200) {
            return new WP_Error('api_error', sprintf(
                __('Erro na API: %s', 'contentfactory-rdm'),
                $body
            ));
        }
        
        $data = json_decode($body, true);
        
        if (isset($data['content'])) {
            return $data['content'];
        }
        
        if (isset($data['text'])) {
            return $data['text'];
        }
        
        return $body;
    }
    
    /**
     * Parse AI response and extract JSON
     */
    private static function parse_ai_response($response) {
        // Try to extract JSON from response
        $json_str = self::extract_json($response);
        
        if ($json_str === null) {
            return new WP_Error('invalid_response', __('A IA não retornou um JSON válido.', 'contentfactory-rdm'));
        }
        
        $data = json_decode($json_str, true);
        
        if (json_last_error() !== JSON_ERROR_NONE || !is_array($data)) {
            return new WP_Error('json_error', __('Falha ao interpretar o JSON retornado.', 'contentfactory-rdm'));
        }
        
        // Sanitize and validate
        $seo_data = array(
            'slug' => isset($data['slug']) ? sanitize_title($data['slug']) : '',
            'meta_description' => isset($data['meta_description']) ? mb_substr(sanitize_text_field($data['meta_description']), 0, 160) : '',
            'focus_keyword' => isset($data['focus_keyword']) ? sanitize_text_field($data['focus_keyword']) : '',
            'tags' => array(),
            'viral_titles' => array(),
        );
        
        // Process tags
        if (isset($data['tags']) && is_array($data['tags'])) {
            $seo_data['tags'] = array_values(array_filter(array_map('sanitize_text_field', $data['tags'])));
        }
        
        // Process viral titles
        if (isset($data['viral_titles']) && is_array($data['viral_titles'])) {
            $seo_data['viral_titles'] = array_values(array_filter(array_map('sanitize_text_field', $data['viral_titles'])));
        }
        
        return $seo_data;
    }
    
    /**
     * Extract JSON from mixed content
     */
    private static function extract_json($text) {
        // Try direct parse first
        $decoded = json_decode($text, true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
            return $text;
        }
        
        // Try to find JSON in response
        $patterns = array(
            '/```json\s*([\s\S]*?)\s*```/',  // Markdown code block
            '/```\s*([\s\S]*?)\s*```/',       // Generic code block
            '/\{[\s\S]*\}/',                   // Raw JSON object
        );
        
        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $text, $matches)) {
                $candidate = isset($matches[1]) ? $matches[1] : $matches[0];
                $decoded = json_decode($candidate, true);
                if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                    return $candidate;
                }
            }
        }
        
        return null;
    }
    
    /**
     * Apply SEO data to a post
     */
    public static function apply_to_post($post_id, $seo_data) {
        // Update slug
        if (!empty($seo_data['slug'])) {
            wp_update_post(array(
                'ID' => $post_id,
                'post_name' => $seo_data['slug'],
            ));
        }
        
        // Add tags
        if (!empty($seo_data['tags'])) {
            wp_set_post_tags($post_id, $seo_data['tags'], true);
        }
        
        // Apply to SEO plugins
        if (class_exists('CFRDM_SEO')) {
            // Meta description
            if (!empty($seo_data['meta_description'])) {
                CFRDM_SEO::set_meta_description($post_id, $seo_data['meta_description']);
            }
            
            // Focus keyword
            if (!empty($seo_data['focus_keyword'])) {
                CFRDM_SEO::set_focus_keyword($post_id, $seo_data['focus_keyword']);
            }
        }
        
        // Store viral titles as post meta for later use
        if (!empty($seo_data['viral_titles'])) {
            update_post_meta($post_id, '_cfrdm_viral_titles', $seo_data['viral_titles']);
        }
        
        // Store AI-generated SEO flag
        update_post_meta($post_id, '_cfrdm_ai_seo_generated', current_time('mysql'));
        
        CFRDM_Logger::success('ai_seo', 'SEO aplicado ao post', array(
            'post_id' => $post_id,
            'slug' => $seo_data['slug'],
        ), $post_id);
    }
    
    /**
     * Get viral title suggestions for a post
     */
    public static function get_viral_titles($post_id) {
        return get_post_meta($post_id, '_cfrdm_viral_titles', true) ?: array();
    }
    
    /**
     * Generate SEO for multiple posts (batch)
     * 
     * @param array $post_ids Post IDs
     * @param array $options Generation options
     * @return array Results by post ID
     */
    public static function batch_generate($post_ids, $options = array()) {
        $results = array();
        
        foreach ($post_ids as $post_id) {
            $results[$post_id] = self::generate($post_id, $options);
            
            // Small delay to avoid rate limiting
            usleep(500000); // 0.5 seconds
        }
        
        return $results;
    }
}
