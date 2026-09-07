<?php
if (!defined('ABSPATH')) exit;

final class Zica_Posts_Curator {
    const META_FINGERPRINT = '_zica_posts_content_fingerprint';
    const META_WARNINGS = '_zica_posts_editorial_warnings';
    const META_LAST_AUDIT = '_zica_posts_last_audit';
    private static $correcting = false;

    public function __construct() {
        add_action('save_post_post', array($this, 'audit_on_save'), 5, 3);
        add_action(ZICA_POSTS_CRON_CURATOR, array($this, 'audit_batch'));
        add_action('admin_post_zica_posts_curator_action', array($this, 'handle_admin_action'));
    }
    public function ensure_schedule() { if (!wp_next_scheduled(ZICA_POSTS_CRON_CURATOR)) wp_schedule_event(time() + HOUR_IN_SECONDS, 'daily', ZICA_POSTS_CRON_CURATOR); }
    public static function sanitize_title($title) {
        $title = wp_strip_all_tags((string) $title, true);
        $title = preg_replace('/[\x{200B}-\x{200D}\x{FEFF}]/u', '', $title);
        $title = preg_replace('/^\s*(?:#{1,6}|[-*+]\s+)\s*/u', '', $title);
        $title = preg_replace('/\s{2,}/u', ' ', $title);
        return trim((string) $title, " \t\n\r\0\x0B*_`");
    }
    public function audit_on_save($post_id, $post, $update) {
        if (self::$correcting || wp_is_post_revision($post_id) || wp_is_post_autosave($post_id)) return;
        if (!in_array($post->post_status, array('publish', 'future', 'draft', 'pending'), true)) return;
        $this->audit_post($post_id, '1' === (string) get_option('zica_posts_auto_correction_enabled', '1'));
    }
    public function audit_post($post_id, $apply_safe_correction = false) {
        $post = get_post($post_id); if (!$post || 'post' !== $post->post_type) return array();
        $clean_title = self::sanitize_title($post->post_title);
        $normalized_title = $this->normalize($clean_title);
        $normalized_content = $this->normalize(wp_strip_all_tags(strip_shortcodes($post->post_content), true));
        $fingerprint = hash('sha256', $normalized_title . '|' . $normalized_content);
        update_post_meta($post_id, self::META_FINGERPRINT, $fingerprint);
        $warnings = array();
        if ($clean_title !== $post->post_title) {
            $warnings[] = array('code' => 'title_symbols', 'message' => 'Caracteres ou símbolos editoriais indevidos foram encontrados no título.');
            if ($apply_safe_correction && $clean_title) {
                self::$correcting = true; wp_save_post_revision($post_id);
                wp_update_post(array('ID' => $post_id, 'post_title' => $clean_title)); self::$correcting = false;
            }
        }
        $duplicate_ids = $this->find_duplicates($post_id, $normalized_title, $fingerprint);
        if ($duplicate_ids) $warnings[] = array('code' => 'possible_duplicate', 'message' => 'Possível conteúdo duplicado. Revise antes de mover ou excluir.', 'post_ids' => array_values($duplicate_ids));
        if (!has_post_thumbnail($post_id)) $warnings[] = array('code' => 'missing_featured_media', 'message' => 'Imagem destacada ausente.');
        if (in_array(1, wp_get_post_categories($post_id), true)) $warnings[] = array('code' => 'uncategorized', 'message' => 'Categoria padrão sem classificação editorial.');
        update_post_meta($post_id, self::META_WARNINGS, $warnings);
        update_post_meta($post_id, self::META_LAST_AUDIT, current_time('mysql', true));
        return $warnings;
    }
    private function normalize($value) {
        $value = strtolower(remove_accents((string) $value));
        return trim(preg_replace('/\s+/u', ' ', (string) preg_replace('/[^a-z0-9]+/u', ' ', $value)));
    }
    private function find_duplicates($post_id, $normalized_title, $fingerprint) {
        global $wpdb;
        $ids = $wpdb->get_col($wpdb->prepare("SELECT DISTINCT p.ID FROM {$wpdb->posts} p LEFT JOIN {$wpdb->postmeta} pm ON pm.post_id=p.ID AND pm.meta_key=%s WHERE p.post_type='post' AND p.post_status NOT IN ('trash','auto-draft','inherit') AND p.ID<>%d AND (pm.meta_value=%s OR LOWER(TRIM(p.post_title))=%s) LIMIT 10", self::META_FINGERPRINT, $post_id, $fingerprint, strtolower($normalized_title)));
        return array_map('absint', $ids ?: array());
    }
    public function audit_batch() {
        $ids = get_posts(array('post_type'=>'post','post_status'=>array('publish','future','draft','pending'),'posts_per_page'=>50,'fields'=>'ids','orderby'=>'modified','order'=>'DESC'));
        foreach ($ids as $post_id) $this->audit_post($post_id, false);
    }
    public function recent_findings($limit = 30) {
        return get_posts(array('post_type'=>'post','post_status'=>array('publish','future','draft','pending','trash'),'posts_per_page'=>absint($limit),'meta_query'=>array(array('key'=>self::META_WARNINGS,'compare'=>'EXISTS')),'orderby'=>'modified','order'=>'DESC'));
    }
    public function handle_admin_action() {
        if (!current_user_can('manage_options')) wp_die(esc_html__('Permissão insuficiente.', 'zica-posts'));
        $post_id = isset($_POST['post_id']) ? absint($_POST['post_id']) : 0;
        $operation = isset($_POST['operation']) ? sanitize_key(wp_unslash($_POST['operation'])) : '';
        check_admin_referer('zica_posts_curator_' . $operation . '_' . $post_id);
        if (!$post_id || !current_user_can('edit_post', $post_id)) wp_die(esc_html__('Artigo inválido ou sem permissão.', 'zica-posts'));
        if ('correct' === $operation) $this->audit_post($post_id, true);
        elseif ('trash' === $operation && current_user_can('delete_post', $post_id)) wp_trash_post($post_id);
        elseif ('delete' === $operation && current_user_can('delete_post', $post_id) && 'trash' === get_post_status($post_id)) wp_delete_post($post_id, true);
        else wp_die(esc_html__('Operação não permitida.', 'zica-posts'));
        wp_safe_redirect(add_query_arg(array('page'=>'zica-posts','zica_notice'=>$operation), admin_url('admin.php'))); exit;
    }
}
