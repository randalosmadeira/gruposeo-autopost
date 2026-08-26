<?php
/**
 * CFRDM_GEO_Optimizer
 *
 * Camada de "Generative Engine Optimization": prepara o conteúdo para ser
 * lido, resumido e CITADO corretamente por buscadores de IA (ChatGPT Search,
 * Perplexity, Google AI Overviews, Gemini, etc.), além do SEO tradicional.
 *
 *   - extract_answers(): identifica blocos de pergunta/resposta no conteúdo
 *     (H2/H3 terminando em "?", ou parágrafos-resumo) e grava em
 *     cfrdm_geo_answers para gerar FAQPage schema.
 *   - build_faq_schema() / build_speakable_schema(): geram os fragmentos
 *     JSON-LD consumidos pelo Entity Graph.
 *   - index_url_for_post() / rebuild_url_index(): mantém uma tabela central
 *     de URLs com canonical, hreflang, prioridade e status de indexação —
 *     usada pelo sitemap, IndexNow e llms.txt.
 *
 * @since 3.9.0
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_GEO_Optimizer {

    private static $instance = null;

    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function init() {
        // Canonical + hreflang tags rendered directly (in addition to whatever
        // an SEO plugin like Rank Math/Yoast already outputs — harmless if
        // duplicated since WP only keeps the first canonical tag rendered).
        add_action('wp_head', array($this, 'output_hreflang'), 4);
    }

    public static function create_tables() {
        global $wpdb;
        $charset_collate = $wpdb->get_charset_collate();
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';

        $answers_table = $wpdb->prefix . CFRDM_GEO_ANSWERS_TABLE;
        dbDelta("CREATE TABLE IF NOT EXISTS $answers_table (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            post_id bigint(20) NOT NULL,
            question text NOT NULL,
            answer_summary text NOT NULL,
            schema_type varchar(50) DEFAULT 'FAQPage',
            confidence float DEFAULT 0,
            source varchar(50) DEFAULT 'ai',
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY post_id (post_id),
            KEY schema_type (schema_type)
        ) $charset_collate;");

        $url_table = $wpdb->prefix . CFRDM_URL_INDEX_TABLE;
        dbDelta("CREATE TABLE IF NOT EXISTS $url_table (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            url varchar(500) NOT NULL,
            object_type varchar(50) DEFAULT 'post',
            object_id bigint(20) DEFAULT NULL,
            canonical_url varchar(500) DEFAULT NULL,
            hreflang varchar(20) DEFAULT 'pt-BR',
            last_indexed_at datetime DEFAULT NULL,
            last_modified_at datetime DEFAULT NULL,
            index_status varchar(30) DEFAULT 'pending',
            priority float DEFAULT 0.5,
            changefreq varchar(20) DEFAULT 'weekly',
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY url (url(191)),
            KEY object_type (object_type),
            KEY object_id (object_id),
            KEY index_status (index_status)
        ) $charset_collate;");
    }

    /**
     * Scan a post's content for question/answer style blocks and store them
     * as candidate FAQ entries. Heuristic-based (headings ending in "?" plus
     * the paragraph that follows); an AI persona (scope=faq) can later
     * refine/replace these via generate_faq.
     */
    public function extract_answers($post_id) {
        if (!get_option('cfrdm_faq_autoextract_enabled', true)) {
            return array();
        }

        $post = get_post($post_id);
        if (!$post) return array();

        global $wpdb;
        $table = $wpdb->prefix . CFRDM_GEO_ANSWERS_TABLE;

        // Clear previous heuristic-sourced answers for this post before re-extracting
        $wpdb->delete($table, array('post_id' => $post_id, 'source' => 'heuristic'));

        $found = array();

        if (preg_match_all('/<h[23][^>]*>(.*?\?)\s*<\/h[23]>(.*?)(?=<h[23]|$)/is', $post->post_content, $matches, PREG_SET_ORDER)) {
            foreach ($matches as $match) {
                $question = trim(wp_strip_all_tags($match[1]));
                $answer = trim(wp_strip_all_tags($match[2]));
                $answer = wp_trim_words($answer, 60);

                if (mb_strlen($question) < 8 || mb_strlen($answer) < 20) {
                    continue;
                }

                $wpdb->insert($table, array(
                    'post_id' => $post_id,
                    'question' => $question,
                    'answer_summary' => $answer,
                    'schema_type' => 'FAQPage',
                    'confidence' => 0.6,
                    'source' => 'heuristic',
                    'created_at' => current_time('mysql'),
                ));

                $found[] = array('question' => $question, 'answer' => $answer);
            }
        }

        return $found;
    }

    /**
     * Batch version used by the cron job: sweeps recently modified posts.
     */
    public function extract_answers_batch($limit = 25) {
        $posts = get_posts(array(
            'post_type' => 'post',
            'post_status' => 'publish',
            'posts_per_page' => $limit,
            'orderby' => 'modified',
            'order' => 'DESC',
            'fields' => 'ids',
        ));

        $total = 0;
        foreach ($posts as $post_id) {
            $total += count($this->extract_answers($post_id));
        }
        return array('posts_scanned' => count($posts), 'answers_found' => $total);
    }

    /**
     * Build a FAQPage schema fragment for a post from stored answers.
     */
    public function build_faq_schema($post_id) {
        global $wpdb;
        $table = $wpdb->prefix . CFRDM_GEO_ANSWERS_TABLE;
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT question, answer_summary FROM $table WHERE post_id = %d ORDER BY confidence DESC LIMIT 8",
            $post_id
        ), ARRAY_A);

        if (empty($rows)) {
            return null;
        }

        $main_entity = array();
        foreach ($rows as $row) {
            $main_entity[] = array(
                '@type' => 'Question',
                'name' => $row['question'],
                'acceptedAnswer' => array(
                    '@type' => 'Answer',
                    'text' => $row['answer_summary'],
                ),
            );
        }

        return array(
            '@type' => 'FAQPage',
            'mainEntity' => $main_entity,
        );
    }

    /**
     * "Speakable" schema — marks the title + excerpt as suitable for voice
     * assistants / read-aloud, and gives generative engines a clean, short
     * span to quote directly.
     */
    public function build_speakable_schema($post_id) {
        return array(
            '@type' => 'WebPage',
            '@id' => get_permalink($post_id) . '#speakable',
            'speakable' => array(
                '@type' => 'SpeakableSpecification',
                'cssSelector' => array('h1.entry-title', '.entry-summary', '.geo-answer-block'),
            ),
            'url' => get_permalink($post_id),
        );
    }

    /**
     * Keep the central URL index in sync for a single post (canonical,
     * hreflang, last modified, priority weighted by recency).
     */
    public function index_url_for_post($post_id) {
        $post = get_post($post_id);
        if (!$post || $post->post_status !== 'publish') {
            return;
        }

        global $wpdb;
        $table = $wpdb->prefix . CFRDM_URL_INDEX_TABLE;
        $url = get_permalink($post_id);

        $days_old = (time() - get_post_time('U', false, $post_id)) / DAY_IN_SECONDS;
        $priority = $days_old < 30 ? 0.9 : ($days_old < 180 ? 0.6 : 0.4);

        $row = array(
            'object_type' => 'post',
            'object_id' => $post_id,
            'canonical_url' => $url,
            'hreflang' => 'pt-BR',
            'last_modified_at' => get_the_modified_date('Y-m-d H:i:s', $post_id),
            'index_status' => 'pending',
            'priority' => $priority,
            'changefreq' => $days_old < 7 ? 'daily' : 'weekly',
        );

        $existing = $wpdb->get_var($wpdb->prepare("SELECT id FROM $table WHERE url = %s", $url));
        if ($existing) {
            $wpdb->update($table, $row, array('url' => $url));
        } else {
            $row['url'] = $url;
            $row['created_at'] = current_time('mysql');
            $wpdb->insert($table, $row);
        }
    }

    /**
     * Full rebuild of the URL index across all published posts/pages.
     */
    public function rebuild_url_index() {
        $ids = get_posts(array(
            'post_type' => array('post', 'page'),
            'post_status' => 'publish',
            'posts_per_page' => -1,
            'fields' => 'ids',
        ));

        foreach ($ids as $id) {
            $this->index_url_for_post($id);
        }

        return array('urls_indexed' => count($ids));
    }

    /**
     * Mark a URL as successfully submitted/indexed (called by the
     * IndexNow / Google Indexing Submitter modules once they confirm).
     */
    public function mark_indexed($url) {
        global $wpdb;
        $table = $wpdb->prefix . CFRDM_URL_INDEX_TABLE;
        $wpdb->update($table, array(
            'index_status' => 'indexed',
            'last_indexed_at' => current_time('mysql'),
        ), array('url' => $url));
    }

    public function output_hreflang() {
        if (!is_singular()) return;
        echo '<link rel="alternate" hreflang="pt-BR" href="' . esc_url(get_permalink()) . '" />' . "\n";
    }

    public function register_rest_routes() {
        register_rest_route('cfrdm/v1', '/geo/answers/(?P<post_id>\d+)', array(
            'methods' => 'GET',
            'callback' => array($this, 'rest_get_answers'),
            'permission_callback' => array($this, 'rest_permission_check'),
        ));

        register_rest_route('cfrdm/v1', '/geo/answers', array(
            'methods' => 'POST',
            'callback' => array($this, 'rest_add_answer'),
            'permission_callback' => array($this, 'rest_permission_check'),
        ));

        register_rest_route('cfrdm/v1', '/geo/url-index', array(
            'methods' => 'GET',
            'callback' => array($this, 'rest_url_index'),
            'permission_callback' => array($this, 'rest_permission_check'),
        ));
    }

    public function rest_permission_check($request) {
        $api_key = $request->get_header('X-CFRDM-API-Key');
        return !empty($api_key) && hash_equals((string) get_option('cfrdm_api_key'), (string) $api_key);
    }

    public function rest_get_answers($request) {
        global $wpdb;
        $table = $wpdb->prefix . CFRDM_GEO_ANSWERS_TABLE;
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM $table WHERE post_id = %d ORDER BY confidence DESC",
            (int) $request['post_id']
        ), ARRAY_A);
        return rest_ensure_response($rows);
    }

    /**
     * Lets an AI persona (scope=faq, action=generate_faq) submit a
     * high-confidence, human/AI-authored Q&A pair for a post.
     */
    public function rest_add_answer($request) {
        global $wpdb;
        $table = $wpdb->prefix . CFRDM_GEO_ANSWERS_TABLE;

        $post_id = (int) $request->get_param('post_id');
        $question = sanitize_text_field($request->get_param('question'));
        $answer = sanitize_textarea_field($request->get_param('answer'));

        if (!$post_id || !$question || !$answer) {
            return new WP_Error('cfrdm_geo_invalid', 'post_id, question e answer são obrigatórios.', array('status' => 400));
        }

        $wpdb->insert($table, array(
            'post_id' => $post_id,
            'question' => $question,
            'answer_summary' => $answer,
            'schema_type' => 'FAQPage',
            'confidence' => 0.9,
            'source' => 'ai',
            'created_at' => current_time('mysql'),
        ));

        return rest_ensure_response(array('inserted' => true, 'id' => $wpdb->insert_id));
    }

    public function rest_url_index($request) {
        global $wpdb;
        $table = $wpdb->prefix . CFRDM_URL_INDEX_TABLE;
        $rows = $wpdb->get_results("SELECT * FROM $table ORDER BY priority DESC LIMIT 500", ARRAY_A);
        return rest_ensure_response($rows);
    }

    public static function render_admin_page() {
        if (!current_user_can('manage_options')) {
            return;
        }
        global $wpdb;
        $answers_table = $wpdb->prefix . CFRDM_GEO_ANSWERS_TABLE;
        $url_table = $wpdb->prefix . CFRDM_URL_INDEX_TABLE;
        $answer_count = (int) $wpdb->get_var("SELECT COUNT(*) FROM $answers_table");
        $url_count = (int) $wpdb->get_var("SELECT COUNT(*) FROM $url_table");

        echo '<div class="wrap"><h1>GEO — Otimização para Buscadores de IA</h1>';
        echo '<p>Respostas extraídas para FAQPage: <strong>' . esc_html($answer_count) . '</strong> · URLs no índice canônico: <strong>' . esc_html($url_count) . '</strong></p>';
        echo '<p>Ative/edite Organization, Person e sameAs em Configurações → GEO / Entidades.</p>';
        echo '</div>';
    }
}
