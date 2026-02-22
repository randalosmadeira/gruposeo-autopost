<?php
/**
 * ContentFactory RDM - Bulk Meta Update API
 * 
 * REST endpoint for bulk SEO meta updates compatible with Rank Math and Yoast SEO.
 * Inspired by best practices from both plugins.
 * 
 * @since 3.6.0
 */

if (!defined('ABSPATH')) exit;

class CFRDM_Bulk_Meta {

    private static $instance = null;

    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function init() {
        add_action('rest_api_init', array($this, 'register_routes'));
    }

    /**
     * Detect installed SEO plugin
     */
    public static function detect_seo_plugin() {
        if (class_exists('RankMath')) {
            return 'rank_math';
        }
        if (defined('WPSEO_VERSION')) {
            return 'yoast';
        }
        if (class_exists('AIOSEO\\Plugin\\AIOSEO')) {
            return 'aioseo';
        }
        return 'none';
    }

    public function register_routes() {
        register_rest_route('cfrdm/v1', '/bulk-meta-update', array(
            'methods'  => 'POST',
            'callback' => array($this, 'handle_bulk_update'),
            'permission_callback' => array($this, 'check_permission'),
        ));

        register_rest_route('cfrdm/v1', '/seo-plugin-info', array(
            'methods'  => 'GET',
            'callback' => array($this, 'get_seo_plugin_info'),
            'permission_callback' => array($this, 'check_permission'),
        ));

        register_rest_route('cfrdm/v1', '/readability-analysis', array(
            'methods'  => 'POST',
            'callback' => array($this, 'handle_readability_analysis'),
            'permission_callback' => array($this, 'check_permission'),
        ));
    }

    public function check_permission($request) {
        $api_key = $request->get_header('X-CFRDM-API-Key');
        $stored_key = get_option('cfrdm_api_key', '');
        
        if (!empty($api_key) && $api_key === $stored_key) {
            return true;
        }
        
        return current_user_can('edit_posts');
    }

    /**
     * Bulk update SEO meta for multiple posts
     * Compatible with Rank Math and Yoast SEO
     */
    public function handle_bulk_update($request) {
        $items = $request->get_param('items');
        
        if (!is_array($items) || empty($items)) {
            return new WP_REST_Response(array(
                'success' => false,
                'error'   => 'items array required (max 100)',
            ), 400);
        }

        if (count($items) > 100) {
            $items = array_slice($items, 0, 100);
        }

        $seo_plugin = self::detect_seo_plugin();
        $results = array();
        $success_count = 0;
        $error_count = 0;

        foreach ($items as $item) {
            $post_id = intval($item['post_id'] ?? 0);
            if (!$post_id || !get_post($post_id)) {
                $results[] = array('post_id' => $post_id, 'success' => false, 'error' => 'Post not found');
                $error_count++;
                continue;
            }

            try {
                $updated = array();

                // SEO Title
                if (!empty($item['seo_title'])) {
                    $title = sanitize_text_field($item['seo_title']);
                    switch ($seo_plugin) {
                        case 'rank_math':
                            update_post_meta($post_id, 'rank_math_title', $title);
                            break;
                        case 'yoast':
                            update_post_meta($post_id, '_yoast_wpseo_title', $title);
                            break;
                        default:
                            update_post_meta($post_id, '_cfrdm_seo_title', $title);
                    }
                    $updated[] = 'seo_title';
                }

                // Meta Description
                if (!empty($item['meta_description'])) {
                    $desc = sanitize_text_field($item['meta_description']);
                    switch ($seo_plugin) {
                        case 'rank_math':
                            update_post_meta($post_id, 'rank_math_description', $desc);
                            break;
                        case 'yoast':
                            update_post_meta($post_id, '_yoast_wpseo_metadesc', $desc);
                            break;
                        default:
                            update_post_meta($post_id, '_cfrdm_meta_description', $desc);
                    }
                    $updated[] = 'meta_description';
                }

                // Focus Keyword
                if (!empty($item['focus_keyword'])) {
                    $kw = sanitize_text_field($item['focus_keyword']);
                    switch ($seo_plugin) {
                        case 'rank_math':
                            update_post_meta($post_id, 'rank_math_focus_keyword', $kw);
                            break;
                        case 'yoast':
                            update_post_meta($post_id, '_yoast_wpseo_focuskw', $kw);
                            break;
                        default:
                            update_post_meta($post_id, '_cfrdm_focus_keyword', $kw);
                    }
                    $updated[] = 'focus_keyword';
                }

                // Canonical URL
                if (!empty($item['canonical_url'])) {
                    $url = esc_url_raw($item['canonical_url']);
                    switch ($seo_plugin) {
                        case 'rank_math':
                            update_post_meta($post_id, 'rank_math_canonical_url', $url);
                            break;
                        case 'yoast':
                            update_post_meta($post_id, '_yoast_wpseo_canonical', $url);
                            break;
                        default:
                            update_post_meta($post_id, '_cfrdm_canonical_url', $url);
                    }
                    $updated[] = 'canonical_url';
                }

                // OG Title & Description
                if (!empty($item['og_title'])) {
                    $og_title = sanitize_text_field($item['og_title']);
                    switch ($seo_plugin) {
                        case 'rank_math':
                            update_post_meta($post_id, 'rank_math_facebook_title', $og_title);
                            break;
                        case 'yoast':
                            update_post_meta($post_id, '_yoast_wpseo_opengraph-title', $og_title);
                            break;
                    }
                    $updated[] = 'og_title';
                }

                if (!empty($item['og_description'])) {
                    $og_desc = sanitize_text_field($item['og_description']);
                    switch ($seo_plugin) {
                        case 'rank_math':
                            update_post_meta($post_id, 'rank_math_facebook_description', $og_desc);
                            break;
                        case 'yoast':
                            update_post_meta($post_id, '_yoast_wpseo_opengraph-description', $og_desc);
                            break;
                    }
                    $updated[] = 'og_description';
                }

                // Schema type (Rank Math only)
                if (!empty($item['schema_type']) && $seo_plugin === 'rank_math') {
                    update_post_meta($post_id, 'rank_math_rich_snippet', sanitize_text_field($item['schema_type']));
                    $updated[] = 'schema_type';
                }

                $results[] = array(
                    'post_id' => $post_id,
                    'success' => true,
                    'updated' => $updated,
                    'seo_plugin' => $seo_plugin,
                );
                $success_count++;

            } catch (\Throwable $e) {
                $results[] = array('post_id' => $post_id, 'success' => false, 'error' => $e->getMessage());
                $error_count++;
            }
        }

        // Log the operation
        if (class_exists('CFRDM_Structured_Logs')) {
            CFRDM_Structured_Logs::log(null, null, null, null, 'completed', 'bulk_meta',
                "Bulk meta update: {$success_count} success, {$error_count} errors",
                null, null, null
            );
        }

        return new WP_REST_Response(array(
            'success'       => true,
            'seo_plugin'    => $seo_plugin,
            'total'         => count($items),
            'success_count' => $success_count,
            'error_count'   => $error_count,
            'results'       => $results,
        ), 200);
    }

    /**
     * Get SEO plugin information
     */
    public function get_seo_plugin_info($request) {
        $plugin = self::detect_seo_plugin();
        $version = '';
        
        switch ($plugin) {
            case 'rank_math':
                $version = defined('RANK_MATH_VERSION') ? RANK_MATH_VERSION : 'unknown';
                break;
            case 'yoast':
                $version = defined('WPSEO_VERSION') ? WPSEO_VERSION : 'unknown';
                break;
            case 'aioseo':
                $version = defined('AIOSEO_VERSION') ? AIOSEO_VERSION : 'unknown';
                break;
        }

        return new WP_REST_Response(array(
            'success'    => true,
            'seo_plugin' => $plugin,
            'version'    => $version,
            'cfrdm_version' => CFRDM_VERSION,
            'capabilities' => array(
                'bulk_meta_update' => true,
                'readability_analysis' => true,
                'schema_injection' => true,
                'og_meta' => ($plugin !== 'none'),
                'focus_keyword' => ($plugin !== 'none'),
                'canonical_url' => true,
            ),
        ), 200);
    }

    /**
     * Advanced readability analysis (Yoast-inspired + Coleman-Liau + Gunning Fog)
     */
    public function handle_readability_analysis($request) {
        $post_ids = $request->get_param('post_ids');
        
        if (!is_array($post_ids) || empty($post_ids)) {
            return new WP_REST_Response(array('success' => false, 'error' => 'post_ids required'), 400);
        }

        $results = array();

        foreach (array_slice($post_ids, 0, 50) as $post_id) {
            $post = get_post(intval($post_id));
            if (!$post) continue;

            $content = wp_strip_all_tags($post->post_content);
            $words = preg_split('/\s+/', $content, -1, PREG_SPLIT_NO_EMPTY);
            $word_count = count($words);
            
            if ($word_count < 10) {
                $results[] = array('post_id' => $post_id, 'error' => 'Content too short');
                continue;
            }

            // Sentences
            $sentences = preg_split('/[.!?]+/', $content, -1, PREG_SPLIT_NO_EMPTY);
            $sentences = array_filter($sentences, function($s) { return strlen(trim($s)) > 5; });
            $sentence_count = max(count($sentences), 1);

            // Syllables (Portuguese)
            $total_syllables = 0;
            $complex_words = 0;
            $long_words = 0;
            foreach ($words as $w) {
                $syls = $this->count_syllables_pt($w);
                $total_syllables += $syls;
                if ($syls >= 3) $complex_words++;
                if (mb_strlen($w) > 12) $long_words++;
            }

            $avg_words_sentence = $word_count / $sentence_count;
            $avg_syllables_word = $total_syllables / $word_count;

            // Flesch Reading Ease (PT-BR adapted)
            $flesch = max(0, min(100, round(206.835 - 1.015 * $avg_words_sentence - 84.6 * $avg_syllables_word)));

            // Coleman-Liau Index
            $chars = mb_strlen(preg_replace('/\s+/', '', $content));
            $L = ($chars / $word_count) * 100;
            $S = ($sentence_count / $word_count) * 100;
            $coleman_liau = max(0, round(0.0588 * $L - 0.296 * $S - 15.8, 1));

            // Gunning Fog Index
            $fog = max(0, round(0.4 * ($avg_words_sentence + 100 * ($complex_words / $word_count)), 1));

            // Passive voice detection (Portuguese patterns)
            $passive_patterns = array(
                '/\b(?:foi|foram|é|são|era|eram|será|serão|sido|sendo)\s+\w+(?:ado|ada|ados|adas|ido|ida|idos|idas|to|ta|tos|tas)\b/ui',
                '/\b(?:foi|foram|é|são)\s+(?:feito|feita|dito|dita|visto|vista|posto|posta|escrito|escrita)\b/ui',
            );
            $passive_count = 0;
            foreach ($passive_patterns as $pattern) {
                $passive_count += preg_match_all($pattern, $content);
            }
            $passive_percentage = round(($passive_count / $sentence_count) * 100, 1);

            // Transition words (Portuguese)
            $transitions = array(
                'além disso', 'portanto', 'contudo', 'entretanto', 'porém', 'todavia',
                'no entanto', 'assim', 'dessa forma', 'por isso', 'consequentemente',
                'em primeiro lugar', 'em segundo lugar', 'finalmente', 'por exemplo',
                'ou seja', 'isto é', 'em resumo', 'em conclusão', 'por outro lado',
                'além do mais', 'sobretudo', 'principalmente', 'especialmente',
                'de fato', 'na verdade', 'certamente', 'sem dúvida', 'evidentemente',
            );
            $transition_count = 0;
            $content_lower = mb_strtolower($content);
            foreach ($transitions as $t) {
                $transition_count += substr_count($content_lower, $t);
            }
            $transition_percentage = round(($transition_count / $sentence_count) * 100, 1);

            // Long sentences (>25 words)
            $long_sentences = 0;
            foreach ($sentences as $s) {
                $s_words = preg_split('/\s+/', trim($s), -1, PREG_SPLIT_NO_EMPTY);
                if (count($s_words) > 25) $long_sentences++;
            }
            $long_sentence_pct = round(($long_sentences / $sentence_count) * 100, 1);

            // Long paragraphs
            preg_match_all('/<p[^>]*>(.*?)<\/p>/si', $post->post_content, $para_matches);
            $long_paragraphs = 0;
            foreach ($para_matches[1] ?? array() as $p) {
                $p_words = str_word_count(wp_strip_all_tags($p));
                if ($p_words > 60) $long_paragraphs++;
            }

            // Traffic light scoring (Yoast-style)
            $traffic_light = 'green';
            $issues = array();

            if ($flesch < 60) {
                $traffic_light = 'red';
                $issues[] = 'Flesch abaixo de 60 — texto muito difícil';
            } elseif ($flesch < 70) {
                if ($traffic_light !== 'red') $traffic_light = 'orange';
                $issues[] = 'Flesch entre 60-70 — pode melhorar';
            }

            if ($passive_percentage > 15) {
                if ($traffic_light !== 'red') $traffic_light = 'orange';
                $issues[] = "Voz passiva em {$passive_percentage}% das frases (máx 15%)";
            }
            if ($passive_percentage > 25) {
                $traffic_light = 'red';
            }

            if ($transition_percentage < 30) {
                if ($traffic_light !== 'red') $traffic_light = 'orange';
                $issues[] = "Apenas {$transition_percentage}% de frases com palavras de transição (mín 30%)";
            }

            if ($long_sentence_pct > 25) {
                if ($traffic_light !== 'red') $traffic_light = 'orange';
                $issues[] = "{$long_sentence_pct}% de frases longas (>25 palavras, máx 25%)";
            }
            if ($long_sentence_pct > 40) {
                $traffic_light = 'red';
            }

            $results[] = array(
                'post_id'        => intval($post_id),
                'title'          => $post->post_title,
                'word_count'     => $word_count,
                'sentence_count' => $sentence_count,
                'scores' => array(
                    'flesch'        => $flesch,
                    'coleman_liau'  => $coleman_liau,
                    'gunning_fog'   => $fog,
                    'composite'     => round(($flesch * 0.5 + (100 - $fog * 5) * 0.25 + (100 - $coleman_liau * 5) * 0.25), 1),
                ),
                'readability' => array(
                    'passive_voice_pct'   => $passive_percentage,
                    'passive_count'       => $passive_count,
                    'transition_words_pct' => $transition_percentage,
                    'transition_count'    => $transition_count,
                    'long_sentences_pct'  => $long_sentence_pct,
                    'long_sentences'      => $long_sentences,
                    'long_paragraphs'     => $long_paragraphs,
                    'avg_words_sentence'  => round($avg_words_sentence, 1),
                    'complex_words_pct'   => round(($complex_words / $word_count) * 100, 1),
                ),
                'traffic_light' => $traffic_light,
                'issues'        => $issues,
            );
        }

        return new WP_REST_Response(array(
            'success' => true,
            'results' => $results,
            'seo_plugin' => self::detect_seo_plugin(),
        ), 200);
    }

    /**
     * Count syllables for Portuguese words
     */
    private function count_syllables_pt($word) {
        $word = mb_strtolower($word);
        $vowels = 'aeiouáéíóúâêîôûãõàè';
        $count = 0;
        $prev_vowel = false;
        
        for ($i = 0; $i < mb_strlen($word); $i++) {
            $char = mb_substr($word, $i, 1);
            $is_vowel = (mb_strpos($vowels, $char) !== false);
            if ($is_vowel && !$prev_vowel) $count++;
            $prev_vowel = $is_vowel;
        }
        
        return max($count, 1);
    }
}
