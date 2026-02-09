<?php
/**
 * AI Meta Description Auditor
 * 
 * Audits all published posts every 6 hours and auto-generates
 * missing or short meta descriptions using AI.
 * 
 * Also checks: SEO title, Open Graph, Twitter Cards, focus keyword
 * 
 * @package ContentFactory_RDM
 * @since 3.1.0
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_Meta_Auditor {
    
    const CRON_HOOK = 'cfrdm_meta_audit';
    const OPTION_ENABLED = 'cfrdm_meta_auditor_enabled';
    const OPTION_BATCH_SIZE = 'cfrdm_meta_auditor_batch_size';
    const OPTION_LAST_RUN = 'cfrdm_meta_auditor_last_run';
    const OPTION_LAST_STATS = 'cfrdm_meta_auditor_last_stats';
    
    private static $instance = null;
    
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    /**
     * Initialize the auditor
     */
    public function init() {
        add_action(self::CRON_HOOK, array($this, 'run_audit'));
        
        if (!wp_next_scheduled(self::CRON_HOOK)) {
            wp_schedule_event(time(), 'every_6_hours', self::CRON_HOOK);
        }
    }
    
    /**
     * Check if auditor is enabled
     */
    public static function is_enabled() {
        return (bool) get_option(self::OPTION_ENABLED, true);
    }
    
    /**
     * Run full SEO audit on all published posts
     */
    public function run_audit() {
        if (!self::is_enabled()) {
            return;
        }
        
        $batch_size = intval(get_option(self::OPTION_BATCH_SIZE, 20));
        $stats = array(
            'total_scanned' => 0,
            'meta_fixed' => 0,
            'og_fixed' => 0,
            'twitter_fixed' => 0,
            'focus_kw_fixed' => 0,
            'errors' => 0,
            'started_at' => current_time('mysql'),
        );
        
        // Get published posts missing meta description
        $posts = $this->get_posts_needing_audit($batch_size);
        
        foreach ($posts as $post) {
            $stats['total_scanned']++;
            $result = $this->audit_single_post($post);
            
            if (is_wp_error($result)) {
                $stats['errors']++;
                continue;
            }
            
            if (!empty($result['meta_fixed'])) $stats['meta_fixed']++;
            if (!empty($result['og_fixed'])) $stats['og_fixed']++;
            if (!empty($result['twitter_fixed'])) $stats['twitter_fixed']++;
            if (!empty($result['focus_kw_fixed'])) $stats['focus_kw_fixed']++;
            
            // Delay between AI calls to avoid rate limiting
            usleep(500000);
        }
        
        $stats['completed_at'] = current_time('mysql');
        update_option(self::OPTION_LAST_RUN, current_time('mysql'));
        update_option(self::OPTION_LAST_STATS, $stats);
        
        if ($stats['meta_fixed'] > 0 || $stats['og_fixed'] > 0) {
            CFRDM_Logger::success('meta_auditor', 'Auditoria SEO concluída', $stats);
        }
        
        return $stats;
    }
    
    /**
     * Get posts that need SEO audit
     */
    private function get_posts_needing_audit($limit = 20) {
        $seo_plugin = class_exists('CFRDM_SEO') ? CFRDM_SEO::detect_seo_plugin() : 'none';
        
        $args = array(
            'post_type' => array('post', 'page'),
            'post_status' => 'publish',
            'posts_per_page' => $limit,
            'orderby' => 'modified',
            'order' => 'DESC',
            'meta_query' => array(
                'relation' => 'OR',
                // Never audited
                array(
                    'key' => '_cfrdm_meta_audited_at',
                    'compare' => 'NOT EXISTS',
                ),
                // Audited more than 7 days ago
                array(
                    'key' => '_cfrdm_meta_audited_at',
                    'value' => date('Y-m-d H:i:s', strtotime('-7 days')),
                    'compare' => '<',
                    'type' => 'DATETIME',
                ),
            ),
        );
        
        return get_posts($args);
    }
    
    /**
     * Audit a single post and fix SEO issues
     */
    public function audit_single_post($post) {
        if (is_int($post)) {
            $post = get_post($post);
        }
        
        if (!$post) {
            return new WP_Error('invalid_post', 'Post não encontrado');
        }
        
        $result = array(
            'post_id' => $post->ID,
            'meta_fixed' => false,
            'og_fixed' => false,
            'twitter_fixed' => false,
            'focus_kw_fixed' => false,
        );
        
        // Get current SEO meta
        $current_meta = array();
        if (class_exists('CFRDM_SEO')) {
            $current_meta = CFRDM_SEO::get_meta($post->ID);
        }
        
        $needs_ai = false;
        $missing = array();
        
        // Check meta description
        $description = $current_meta['description'] ?? '';
        if (empty($description) || mb_strlen($description) < 50) {
            $needs_ai = true;
            $missing[] = 'meta_description';
        }
        
        // Check focus keyword
        $focus_kw = $current_meta['focus_keyword'] ?? '';
        if (empty($focus_kw)) {
            $needs_ai = true;
            $missing[] = 'focus_keyword';
        }
        
        // Check OG data
        $og_title = $current_meta['og_title'] ?? '';
        $og_desc = $current_meta['og_description'] ?? '';
        if (empty($og_title) || empty($og_desc)) {
            $needs_ai = true;
            $missing[] = 'open_graph';
        }
        
        // Check Twitter Cards
        $tw_title = $current_meta['twitter_title'] ?? '';
        $tw_desc = $current_meta['twitter_description'] ?? '';
        if (empty($tw_title) || empty($tw_desc)) {
            $needs_ai = true;
            $missing[] = 'twitter_cards';
        }
        
        if ($needs_ai) {
            $ai_result = $this->generate_seo_meta_via_ai($post, $missing);
            
            if (is_wp_error($ai_result)) {
                update_post_meta($post->ID, '_cfrdm_meta_audited_at', current_time('mysql'));
                return $ai_result;
            }
            
            // Apply fixes
            $seo_meta = array();
            
            if (in_array('meta_description', $missing) && !empty($ai_result['meta_description'])) {
                $seo_meta['description'] = mb_substr($ai_result['meta_description'], 0, 160);
                $result['meta_fixed'] = true;
            }
            
            if (in_array('focus_keyword', $missing) && !empty($ai_result['focus_keyword'])) {
                $seo_meta['focus_keyword'] = $ai_result['focus_keyword'];
                $result['focus_kw_fixed'] = true;
            }
            
            if (in_array('open_graph', $missing)) {
                $seo_meta['og_title'] = !empty($ai_result['og_title']) ? $ai_result['og_title'] : $post->post_title;
                $seo_meta['og_description'] = !empty($ai_result['og_description']) ? mb_substr($ai_result['og_description'], 0, 200) : ($seo_meta['description'] ?? '');
                
                // Use featured image for OG if available
                $thumb = get_the_post_thumbnail_url($post->ID, 'large');
                if ($thumb) {
                    $seo_meta['og_image'] = $thumb;
                }
                $result['og_fixed'] = true;
            }
            
            if (in_array('twitter_cards', $missing)) {
                $seo_meta['twitter_title'] = !empty($ai_result['twitter_title']) ? $ai_result['twitter_title'] : $post->post_title;
                $seo_meta['twitter_description'] = !empty($ai_result['twitter_description']) ? mb_substr($ai_result['twitter_description'], 0, 200) : ($seo_meta['description'] ?? '');
                
                $thumb = get_the_post_thumbnail_url($post->ID, 'large');
                if ($thumb) {
                    $seo_meta['twitter_image'] = $thumb;
                }
                $result['twitter_fixed'] = true;
            }
            
            // Apply via CFRDM_SEO
            if (!empty($seo_meta) && class_exists('CFRDM_SEO')) {
                CFRDM_SEO::set_meta($post->ID, $seo_meta);
            }
            
            // Notify search engines about the update via IndexNow
            if (($result['meta_fixed'] || $result['og_fixed']) && class_exists('CFRDM_IndexNow')) {
                $permalink = get_permalink($post->ID);
                if ($permalink) {
                    CFRDM_IndexNow::get_instance()->submit_indexnow($permalink);
                    CFRDM_Logger::info('meta_auditor', 'IndexNow notificado após correção de meta', array(
                        'post_id' => $post->ID,
                        'url' => $permalink,
                    ), $post->ID);
                }
            }
        }
        
        // Mark as audited
        update_post_meta($post->ID, '_cfrdm_meta_audited_at', current_time('mysql'));
        update_post_meta($post->ID, '_cfrdm_meta_audit_result', $result);
        
        return $result;
    }
    
    /**
     * Generate SEO metadata via AI
     */
    private function generate_seo_meta_via_ai($post, $missing_fields) {
        $content_plain = wp_strip_all_tags($post->post_content);
        $content_plain = trim(preg_replace('/\s+/', ' ', $content_plain));
        $content_plain = mb_substr($content_plain, 0, 3000);
        
        $language = get_option('cfrdm_default_language', 'pt-BR');
        
        $fields_needed = implode(', ', $missing_fields);
        
        $prompt = "Você é um especialista em SEO e marketing digital.\n";
        $prompt .= "Gere metadados SEO otimizados para o seguinte artigo.\n\n";
        $prompt .= "CAMPOS NECESSÁRIOS: {$fields_needed}\n\n";
        $prompt .= "REGRAS:\n";
        $prompt .= "- Responda APENAS com JSON válido\n";
        $prompt .= "- Idioma: {$language}\n";
        $prompt .= "- meta_description: até 160 caracteres, persuasiva, com CTA sutil\n";
        $prompt .= "- focus_keyword: palavra-chave principal de cauda longa\n";
        $prompt .= "- og_title: título atrativo para redes sociais (até 60 chars)\n";
        $prompt .= "- og_description: descrição para Facebook/LinkedIn (até 200 chars)\n";
        $prompt .= "- twitter_title: título para Twitter/X (até 60 chars)\n";
        $prompt .= "- twitter_description: descrição para Twitter/X (até 200 chars)\n\n";
        $prompt .= "FORMATO JSON:\n";
        $prompt .= '{"meta_description":"...","focus_keyword":"...","og_title":"...","og_description":"...","twitter_title":"...","twitter_description":"..."}' . "\n\n";
        $prompt .= "TÍTULO: {$post->post_title}\n\n";
        $prompt .= "CONTEÚDO (resumo): {$content_plain}\n";
        
        // Call AI API (reuse existing infrastructure)
        if (class_exists('CFRDM_AI_SEO')) {
            $reflection = new ReflectionMethod('CFRDM_AI_SEO', 'call_ai_api');
            $reflection->setAccessible(true);
            $response = $reflection->invoke(null, $prompt);
            
            if (is_wp_error($response)) {
                return $response;
            }
            
            // Parse JSON from response
            $reflection2 = new ReflectionMethod('CFRDM_AI_SEO', 'extract_json');
            $reflection2->setAccessible(true);
            $json_str = $reflection2->invoke(null, $response);
            
            if ($json_str === null) {
                return new WP_Error('parse_error', 'IA não retornou JSON válido');
            }
            
            $data = json_decode($json_str, true);
            if (!is_array($data)) {
                return new WP_Error('json_error', 'JSON inválido');
            }
            
            return array_map('sanitize_text_field', $data);
        }
        
        return new WP_Error('no_ai', 'Módulo AI SEO não disponível');
    }
    
    /**
     * Get last audit statistics
     */
    public static function get_last_stats() {
        return get_option(self::OPTION_LAST_STATS, array());
    }
    
    /**
     * Get last run time
     */
    public static function get_last_run() {
        return get_option(self::OPTION_LAST_RUN, '');
    }
    
    /**
     * Manual trigger for audit
     */
    public static function trigger_manual_audit($batch_size = 50) {
        $instance = self::get_instance();
        update_option(self::OPTION_BATCH_SIZE, $batch_size);
        return $instance->run_audit();
    }
}
