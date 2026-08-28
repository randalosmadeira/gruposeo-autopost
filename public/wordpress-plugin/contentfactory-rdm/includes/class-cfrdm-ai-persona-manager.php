<?php
/**
 * CFRDM_AI_Persona_Manager
 *
 * Gerencia "personas" de IA — perfis reutilizáveis de prompt/voz/permissão
 * que podem operar sobre o conteúdo do site (ex.: "Madeira Sem Verniz",
 * "ATLAS RDM", "LEXIA", "Vitor - Criminal"). Cada persona define:
 *   - system_prompt: instrução base enviada ao modelo
 *   - tone: registro de voz (técnico, institucional, informal/podcast, etc.)
 *   - scope: em que tipo de conteúdo pode atuar (content, meta, image_alt,
 *            faq, social)
 *   - allowed_actions: lista de ações que a persona pode executar
 *            (rewrite_meta, generate_faq, suggest_alt_text, draft_caption...)
 *
 * Toda execução é registrada em cfrdm_persona_logs para auditoria — essencial
 * quando múltiplas IAs (internas e de terceiros) escrevem no mesmo site.
 *
 * @since 3.9.0
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_AI_Persona_Manager {

    private static $instance = null;

    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function init() {
        // Reserved for future scheduled persona jobs (e.g. nightly meta rewrite pass).
    }

    /**
     * Create the persona tables. Called from plugin activation.
     */
    public static function create_tables() {
        global $wpdb;
        $charset_collate = $wpdb->get_charset_collate();
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';

        $personas_table = $wpdb->prefix . CFRDM_AI_PERSONAS_TABLE;
        dbDelta("CREATE TABLE IF NOT EXISTS $personas_table (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            name varchar(150) NOT NULL,
            slug varchar(150) NOT NULL,
            system_prompt longtext,
            tone varchar(100) DEFAULT NULL,
            scope varchar(50) DEFAULT 'content',
            allowed_actions longtext,
            active tinyint(1) DEFAULT 1,
            created_by bigint(20) DEFAULT NULL,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY slug (slug),
            KEY active (active),
            KEY scope (scope)
        ) $charset_collate;");

        $logs_table = $wpdb->prefix . CFRDM_PERSONA_LOGS_TABLE;
        dbDelta("CREATE TABLE IF NOT EXISTS $logs_table (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            persona_id bigint(20) NOT NULL,
            post_id bigint(20) DEFAULT NULL,
            action varchar(100) NOT NULL,
            input_summary text,
            output_summary longtext,
            status varchar(30) DEFAULT 'success',
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY persona_id (persona_id),
            KEY post_id (post_id),
            KEY status (status),
            KEY created_at (created_at)
        ) $charset_collate;");

        // Seed default personas relevant to this operation, if table is empty.
        self::seed_default_personas();
    }

    private static function seed_default_personas() {
        global $wpdb;
        $table = $wpdb->prefix . CFRDM_AI_PERSONAS_TABLE;
        $count = (int) $wpdb->get_var("SELECT COUNT(*) FROM $table");
        if ($count > 0) {
            return;
        }

        $defaults = array(
            array(
                'name' => 'Dr. Rândalos — Voz Institucional',
                'slug' => 'voz-institucional',
                'system_prompt' => 'Escreva como advogado criminalista sênior, técnico, preciso, citando dispositivos legais quando pertinente (CF/88, CPP). Nunca atribua opiniões a terceiros nem afirme fatos não verificados.',
                'tone' => 'técnico-institucional',
                'scope' => 'content',
                'allowed_actions' => wp_json_encode(array('rewrite_meta', 'generate_faq', 'draft_article')),
            ),
            array(
                'name' => 'Madeira Sem Verniz',
                'slug' => 'madeira-sem-verniz',
                'system_prompt' => 'Escreva no tom direto, bem-humorado e popular do podcast/canal "Madeira Sem Verniz". Linguagem acessível, sem jargão jurídico desnecessário, mantendo sempre precisão factual.',
                'tone' => 'informal-podcast',
                'scope' => 'social',
                'allowed_actions' => wp_json_encode(array('draft_caption', 'suggest_alt_text')),
            ),
            array(
                'name' => 'LEXIA — Marketing Jurídico',
                'slug' => 'lexia',
                'system_prompt' => 'Gere metadados de SEO (title, meta description) otimizados para captação de leads jurídicos, respeitando o Provimento 205/2021 da OAB sobre publicidade.',
                'tone' => 'persuasivo-institucional',
                'scope' => 'meta',
                'allowed_actions' => wp_json_encode(array('rewrite_meta', 'generate_faq')),
            ),
        );

        foreach ($defaults as $persona) {
            $wpdb->insert($table, array_merge($persona, array(
                'active' => 1,
                'created_at' => current_time('mysql'),
                'updated_at' => current_time('mysql'),
            )));
        }
    }

    /**
     * Save (insert or update) a persona.
     *
     * @return int|WP_Error persona id or error
     */
    public function save_persona($data) {
        global $wpdb;
        $table = $wpdb->prefix . CFRDM_AI_PERSONAS_TABLE;

        if (empty($data['name']) || empty($data['system_prompt'])) {
            return new WP_Error('cfrdm_persona_invalid', 'Nome e prompt são obrigatórios.');
        }

        $slug = !empty($data['slug']) ? $data['slug'] : sanitize_title($data['name']);

        $row = array(
            'name' => $data['name'],
            'slug' => $slug,
            'system_prompt' => $data['system_prompt'],
            'tone' => $data['tone'] ?? '',
            'scope' => $data['scope'] ?? 'content',
            'allowed_actions' => wp_json_encode($data['allowed_actions'] ?? array()),
            'active' => !empty($data['active']) ? 1 : 0,
            'updated_at' => current_time('mysql'),
        );

        if (!empty($data['id'])) {
            $wpdb->update($table, $row, array('id' => (int) $data['id']));
            return (int) $data['id'];
        }

        $row['created_by'] = get_current_user_id();
        $row['created_at'] = current_time('mysql');
        $wpdb->insert($table, $row);
        return (int) $wpdb->insert_id;
    }

    public function get_persona($id) {
        global $wpdb;
        $table = $wpdb->prefix . CFRDM_AI_PERSONAS_TABLE;
        return $wpdb->get_row($wpdb->prepare("SELECT * FROM $table WHERE id = %d", $id), ARRAY_A);
    }

    public function get_persona_by_slug($slug) {
        global $wpdb;
        $table = $wpdb->prefix . CFRDM_AI_PERSONAS_TABLE;
        return $wpdb->get_row($wpdb->prepare("SELECT * FROM $table WHERE slug = %s", $slug), ARRAY_A);
    }

    public function list_personas($active_only = false) {
        global $wpdb;
        $table = $wpdb->prefix . CFRDM_AI_PERSONAS_TABLE;
        $sql = "SELECT * FROM $table";
        if ($active_only) {
            $sql .= " WHERE active = 1";
        }
        $sql .= " ORDER BY name ASC";
        return $wpdb->get_results($sql, ARRAY_A);
    }

    /**
     * Run a persona against a post for a given action. Builds the composed
     * prompt (persona system_prompt + post context) and returns it, ready
     * to be sent to an AI provider by the caller (ContentFactory platform,
     * ATLAS RDM agent, etc.) — this class does not call an external LLM API
     * directly, it prepares the governed context and logs the execution so
     * every AI-driven edit on the site is auditable.
     *
     * @return array|WP_Error
     */
    public function run($persona_id, $post_id, $action) {
        $persona = $this->get_persona($persona_id);
        if (!$persona || !$persona['active']) {
            return new WP_Error('cfrdm_persona_not_found', 'Persona não encontrada ou inativa.');
        }

        $allowed = json_decode($persona['allowed_actions'], true) ?: array();
        if (!empty($allowed) && !in_array($action, $allowed, true)) {
            return new WP_Error('cfrdm_persona_action_denied', 'Esta persona não tem permissão para a ação: ' . $action);
        }

        $post = $post_id ? get_post($post_id) : null;
        $context = array(
            'title' => $post ? $post->post_title : '',
            'excerpt' => $post ? wp_strip_all_tags($post->post_excerpt) : '',
            'content_snippet' => $post ? wp_trim_words(wp_strip_all_tags($post->post_content), 120) : '',
            'url' => $post ? get_permalink($post_id) : '',
        );

        $composed_prompt = trim($persona['system_prompt']) . "\n\n" .
            "AÇÃO SOLICITADA: {$action}\n" .
            "CONTEXTO DO ARTIGO:\n" . wp_json_encode($context, JSON_UNESCAPED_UNICODE);

        $this->log_execution($persona_id, $post_id, $action, wp_json_encode($context), '', 'prepared');

        // Returned to the caller (e.g. the AI orchestration layer / ContentFactory
        // platform) to actually execute against an LLM and then persist the
        // result via the appropriate module (meta, FAQ, alt-text, etc.).
        return array(
            'persona' => $persona['name'],
            'scope' => $persona['scope'],
            'composed_prompt' => $composed_prompt,
            'context' => $context,
        );
    }

    public function log_execution($persona_id, $post_id, $action, $input_summary, $output_summary, $status = 'success') {
        global $wpdb;
        $table = $wpdb->prefix . CFRDM_PERSONA_LOGS_TABLE;
        $wpdb->insert($table, array(
            'persona_id' => (int) $persona_id,
            'post_id' => $post_id ? (int) $post_id : null,
            'action' => sanitize_text_field($action),
            'input_summary' => is_string($input_summary) ? mb_substr($input_summary, 0, 2000) : wp_json_encode($input_summary),
            'output_summary' => is_string($output_summary) ? mb_substr($output_summary, 0, 5000) : wp_json_encode($output_summary),
            'status' => $status,
            'created_at' => current_time('mysql'),
        ));
    }

    /**
     * Register REST routes so external AI agents can list/run personas
     * with an API key (same key used by the rest of ContentFactory RDM).
     */
    public function register_rest_routes() {
        register_rest_route('cfrdm/v1', '/personas', array(
            'methods' => 'GET',
            'callback' => array($this, 'rest_list_personas'),
            'permission_callback' => array($this, 'rest_permission_check'),
        ));

        register_rest_route('cfrdm/v1', '/personas/(?P<id>\d+)/run', array(
            'methods' => 'POST',
            'callback' => array($this, 'rest_run_persona'),
            'permission_callback' => array($this, 'rest_permission_check'),
        ));
    }

    public function rest_permission_check($request) {
        $api_key = $request->get_header('X-CFRDM-API-Key');
        return !empty($api_key) && hash_equals((string) get_option('cfrdm_api_key'), (string) $api_key);
    }

    public function rest_list_personas($request) {
        return rest_ensure_response($this->list_personas(true));
    }

    public function rest_run_persona($request) {
        $id = (int) $request['id'];
        $post_id = (int) $request->get_param('post_id');
        $action = sanitize_text_field($request->get_param('action'));

        $result = $this->run($id, $post_id, $action);
        if (is_wp_error($result)) {
            return new WP_Error($result->get_error_code(), $result->get_error_message(), array('status' => 400));
        }
        return rest_ensure_response($result);
    }

    /**
     * Minimal admin page renderer. The full UI (React/JS table + modal
     * editor) lives in assets/js/admin.js and posts to the AJAX handlers
     * registered in the main plugin file.
     */
    public static function render_admin_page() {
        if (!current_user_can('manage_options')) {
            return;
        }
        $personas = self::get_instance()->list_personas();
        echo '<div class="wrap"><h1>Personas & Prompts de IA</h1>';
        echo '<p>Personas controlam como cada IA (interna ou de terceiros) escreve no site — voz, escopo e ações permitidas, com log de auditoria.</p>';
        echo '<div id="cfrdm-personas-app" data-personas="' . esc_attr(wp_json_encode($personas)) . '"></div>';
        echo '</div>';
    }
}
