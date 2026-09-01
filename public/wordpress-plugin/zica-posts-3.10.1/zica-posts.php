<?php
/**
 * Plugin Name: Zica Posts — Conector WordPress Oficial Zica.ai
 * Plugin URI: https://zica.ai
 * Description: Agente leve Zica.ai para publicação, outbox assíncrona, HMAC, GEO/Schema, llms.txt, sitemaps, IndexNow em lote, cards automáticos e sincronização neural 24/7.
 * Version: 3.10.1
 * Author: Equipe Zica.ai
 * Author URI: https://zica.ai
 * License: GPL v2 or later
 * Text Domain: zica-posts
 * Requires at least: 5.8
 * Requires PHP: 7.4
 */

if (!defined('ABSPATH')) exit;

define('ZICA_POSTS_VERSION', '3.10.1');
define('ZICA_POSTS_SOFTWARE_ID', 'zica-posts');
define('ZICA_POSTS_FILE', __FILE__);
define('ZICA_POSTS_DIR', plugin_dir_path(__FILE__));
define('ZICA_POSTS_URL', plugin_dir_url(__FILE__));
define('ZICA_POSTS_TZ', 'America/Sao_Paulo');
define('ZICA_POSTS_CRON_DAILY', 'zica_posts_daily_1500_sync');
define('ZICA_POSTS_CRON_OUTBOX', 'zica_posts_process_outbox');
define('ZICA_POSTS_OUTBOX_TABLE', 'zica_posts_outbox');

final class Zica_Posts_3101 {
    private static $instance = null;
    private static $suppress_outbound = false;

    public static function instance() {
        if (null === self::$instance) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        add_action('init', array($this, 'ensure_schedule'));
        add_action('rest_api_init', array($this, 'register_rest_routes'));
        add_action('template_redirect', array($this, 'serve_discovery_files'), -100);
        add_filter('robots_txt', array($this, 'filter_robots_txt'), 100, 2);
        add_action('wp_head', array($this, 'output_schema'), 20);
        add_filter('the_content', array($this, 'inject_cards'), 30);
        add_shortcode('zica_posts_cards', array($this, 'shortcode_cards'));
        add_action('transition_post_status', array($this, 'on_transition_post_status'), 20, 3);
        add_action('post_updated', array($this, 'on_post_updated'), 20, 3);
        add_action(ZICA_POSTS_CRON_OUTBOX, array($this, 'process_outbox'));
        add_action(ZICA_POSTS_CRON_DAILY, array($this, 'run_daily_sync'));
        add_action('admin_menu', array($this, 'admin_menu'));
        add_action('admin_init', array($this, 'register_settings'));
        add_action('admin_enqueue_scripts', array($this, 'admin_assets'));
    }

    public static function activate() {
        self::ensure_secrets();
        self::create_outbox_table();
        add_option('zica_posts_cards_position', 'after_content');
        add_option('zica_posts_cards_count', 3);
        add_option('zica_posts_ai_crawlers_enabled', '1');
        add_option('zica_posts_physical_files_enabled', '1');
        add_option('zica_posts_hub_enabled', '0');
        add_option('zica_posts_hub_webhook_url', '');
        self::clear_schedules();
        self::schedule_next_daily();
        if (!wp_next_scheduled(ZICA_POSTS_CRON_OUTBOX)) wp_schedule_event(time() + 60, 'five_minutes', ZICA_POSTS_CRON_OUTBOX);
    }

    public static function deactivate() { self::clear_schedules(); }

    private static function ensure_secrets() {
        if (!get_option('zica_posts_api_key')) update_option('zica_posts_api_key', wp_generate_uuid4(), false);
        if (!get_option('zica_posts_hub_secret')) {
            try { update_option('zica_posts_hub_secret', bin2hex(random_bytes(32)), false); }
            catch (Throwable $e) { update_option('zica_posts_hub_secret', wp_generate_password(64, true, true), false); }
        }
        if (!get_option('zica_posts_indexnow_key')) {
            try { update_option('zica_posts_indexnow_key', bin2hex(random_bytes(16)), false); }
            catch (Throwable $e) { update_option('zica_posts_indexnow_key', strtolower(wp_generate_password(32, false, false)), false); }
        }
    }

    private static function create_outbox_table() {
        global $wpdb;
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        $table = $wpdb->prefix . ZICA_POSTS_OUTBOX_TABLE;
        $charset = $wpdb->get_charset_collate();
        $sql = "CREATE TABLE {$table} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            event_id char(36) NOT NULL,
            post_id bigint(20) unsigned NOT NULL DEFAULT 0,
            event_type varchar(40) NOT NULL,
            content_hash char(64) NOT NULL,
            correlation_id varchar(80) NOT NULL,
            status varchar(20) NOT NULL DEFAULT 'pending',
            attempts smallint unsigned NOT NULL DEFAULT 0,
            next_attempt_at datetime NULL,
            last_error text NULL,
            created_at datetime NOT NULL,
            delivered_at datetime NULL,
            PRIMARY KEY (id),
            UNIQUE KEY event_id (event_id),
            KEY status_next (status,next_attempt_at),
            KEY post_hash (post_id,content_hash)
        ) {$charset};";
        dbDelta($sql);
    }

    public function add_cron_schedules($schedules) {
        if (!isset($schedules['five_minutes'])) $schedules['five_minutes'] = array('interval' => 300, 'display' => 'Every 5 minutes');
        return $schedules;
    }

    private static function clear_schedules() {
        foreach (array(ZICA_POSTS_CRON_DAILY, ZICA_POSTS_CRON_OUTBOX) as $hook) {
            $ts = wp_next_scheduled($hook);
            while ($ts) { wp_unschedule_event($ts, $hook); $ts = wp_next_scheduled($hook); }
        }
    }

    private static function next_daily_timestamp() {
        $tz = new DateTimeZone(ZICA_POSTS_TZ);
        $now = new DateTimeImmutable('now', $tz);
        $next = $now->setTime(15, 0, 0);
        if ($next <= $now) $next = $next->modify('+1 day');
        return $next->getTimestamp();
    }

    private static function schedule_next_daily() {
        if (!wp_next_scheduled(ZICA_POSTS_CRON_DAILY)) wp_schedule_single_event(self::next_daily_timestamp(), ZICA_POSTS_CRON_DAILY);
    }

    public function ensure_schedule() {
        self::ensure_secrets();
        self::schedule_next_daily();
        if (!wp_next_scheduled(ZICA_POSTS_CRON_OUTBOX)) wp_schedule_event(time() + 60, 'five_minutes', ZICA_POSTS_CRON_OUTBOX);
    }

    private function post_content_hash($post) {
        if (!$post instanceof WP_Post) return hash('sha256', 'missing');
        return hash('sha256', wp_json_encode(array(
            'id' => $post->ID, 'status' => $post->post_status, 'title' => $post->post_title,
            'content' => $post->post_content, 'excerpt' => $post->post_excerpt,
            'slug' => $post->post_name, 'modified' => $post->post_modified_gmt,
        ), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    }

    private function enqueue_outbox($post_id, $event_type, $correlation_id = '') {
        if (self::$suppress_outbound) return false;
        $post = get_post(absint($post_id));
        if (!$post instanceof WP_Post || !in_array($post->post_type, array('post','page'), true)) return false;
        global $wpdb;
        $table = $wpdb->prefix . ZICA_POSTS_OUTBOX_TABLE;
        $hash = $this->post_content_hash($post);
        $existing = $wpdb->get_var($wpdb->prepare("SELECT event_id FROM {$table} WHERE post_id=%d AND content_hash=%s AND status IN ('pending','processing','delivered') ORDER BY id DESC LIMIT 1", $post->ID, $hash));
        if ($existing) return $existing;
        $event_id = wp_generate_uuid4();
        $correlation_id = $correlation_id ? sanitize_text_field($correlation_id) : wp_generate_uuid4();
        $wpdb->insert($table, array(
            'event_id' => $event_id, 'post_id' => $post->ID, 'event_type' => sanitize_key($event_type),
            'content_hash' => $hash, 'correlation_id' => $correlation_id, 'status' => 'pending',
            'attempts' => 0, 'created_at' => current_time('mysql', true), 'next_attempt_at' => current_time('mysql', true),
        ), array('%s','%d','%s','%s','%s','%s','%d','%s','%s'));
        if (!wp_next_scheduled(ZICA_POSTS_CRON_OUTBOX)) wp_schedule_single_event(time() + 20, ZICA_POSTS_CRON_OUTBOX);
        return $event_id;
    }

    public function on_transition_post_status($new, $old, $post) {
        if (self::$suppress_outbound || !$post instanceof WP_Post || 'publish' !== $new || 'publish' === $old) return;
        if (wp_is_post_revision($post->ID) || wp_is_post_autosave($post->ID)) return;
        $this->enqueue_outbox($post->ID, 'published');
    }

    public function on_post_updated($post_id, $after, $before) {
        if (self::$suppress_outbound || !$after instanceof WP_Post || 'publish' !== $after->post_status) return;
        if (!in_array($after->post_type, array('post','page'), true)) return;
        if ($this->post_content_hash($after) === $this->post_content_hash($before)) return;
        $this->enqueue_outbox($post_id, 'updated');
    }

    private function outbox_payload($row) {
        $post = get_post((int) $row->post_id);
        if (!$post instanceof WP_Post) return null;
        return array(
            'event_id' => $row->event_id,
            'event_type' => $row->event_type,
            'content_hash' => $row->content_hash,
            'correlation_id' => $row->correlation_id,
            'site' => home_url('/'),
            'post' => array(
                'id' => $post->ID, 'type' => $post->post_type, 'status' => $post->post_status,
                'title' => $post->post_title, 'slug' => $post->post_name, 'url' => get_permalink($post->ID),
                'modified_gmt' => $post->post_modified_gmt,
            ),
            'software' => array('id' => ZICA_POSTS_SOFTWARE_ID, 'version' => ZICA_POSTS_VERSION),
        );
    }

    private function sign_payload($body, $nonce, $timestamp) {
        $secret = (string) get_option('zica_posts_hub_secret', '');
        return hash_hmac('sha256', $timestamp . "\n" . $nonce . "\n" . hash('sha256', $body), $secret);
    }

    private function dispatch_hub_batch($events) {
        $url = esc_url_raw((string) get_option('zica_posts_hub_webhook_url', ''));
        if ('1' !== (string) get_option('zica_posts_hub_enabled', '0') || !$url) return array('skipped' => true, 'reason' => 'hub_disabled');
        $body = wp_json_encode(array('site' => home_url('/'), 'events' => array_values($events)), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $timestamp = (string) time();
        $nonce = wp_generate_uuid4();
        $response = wp_remote_post($url, array(
            'timeout' => 8,
            'headers' => array(
                'Content-Type' => 'application/json',
                'X-Zica-Software-ID' => ZICA_POSTS_SOFTWARE_ID,
                'X-Zica-Timestamp' => $timestamp,
                'X-Zica-Nonce' => $nonce,
                'X-Zica-Signature' => $this->sign_payload($body, $nonce, $timestamp),
            ),
            'body' => $body,
        ));
        if (is_wp_error($response)) return array('ok' => false, 'error' => $response->get_error_message());
        $code = wp_remote_retrieve_response_code($response);
        return array('ok' => $code >= 200 && $code < 300, 'http' => $code);
    }

    public function process_outbox() {
        if (get_transient('zica_posts_outbox_lock')) return;
        set_transient('zica_posts_outbox_lock', '1', 240);
        global $wpdb;
        $table = $wpdb->prefix . ZICA_POSTS_OUTBOX_TABLE;
        $now = current_time('mysql', true);
        $rows = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$table} WHERE status IN ('pending','retry') AND (next_attempt_at IS NULL OR next_attempt_at<=%s) ORDER BY id ASC LIMIT 100", $now));
        $events = array(); $ids = array(); $urls = array();
        foreach ((array) $rows as $row) {
            $payload = $this->outbox_payload($row);
            if (!$payload) { $wpdb->update($table, array('status'=>'discarded','last_error'=>'post_not_found'), array('id'=>$row->id)); continue; }
            $events[] = $payload; $ids[] = (int) $row->id;
            if (!empty($payload['post']['url'])) $urls[] = $payload['post']['url'];
            $wpdb->update($table, array('status'=>'processing','attempts'=>(int)$row->attempts + 1), array('id'=>$row->id));
        }

        $files = $this->refresh_discovery_files();
        $indexnow = $this->submit_indexnow_batch($urls);
        $hub = $events ? $this->dispatch_hub_batch($events) : array('skipped'=>true,'reason'=>'empty');
        $hub_ok = !empty($hub['ok']) || !empty($hub['skipped']);
        foreach ($ids as $id) {
            if ($hub_ok) $wpdb->update($table, array('status'=>'delivered','delivered_at'=>$now,'last_error'=>null), array('id'=>$id));
            else {
                $attempts = (int) $wpdb->get_var($wpdb->prepare("SELECT attempts FROM {$table} WHERE id=%d", $id));
                $minutes = min(60, max(2, (int) pow(2, min(5, $attempts))));
                $next = gmdate('Y-m-d H:i:s', time() + $minutes * 60);
                $wpdb->update($table, array('status'=>$attempts >= 5 ? 'failed' : 'retry','next_attempt_at'=>$next,'last_error'=>sanitize_text_field(isset($hub['error']) ? $hub['error'] : 'hub_http_' . (isset($hub['http']) ? $hub['http'] : 'unknown'))), array('id'=>$id));
            }
        }
        update_option('zica_posts_last_sync', array('mode'=>'outbox','at'=>$now,'events'=>count($events),'files'=>$files,'indexnow'=>$indexnow,'hub'=>$hub), false);
        delete_transient('zica_posts_outbox_lock');
    }

    public function run_daily_sync() {
        if (get_transient('zica_posts_daily_lock')) { self::schedule_next_daily(); return; }
        set_transient('zica_posts_daily_lock', '1', 300);
        $ids = get_posts(array('post_type'=>array('post','page'),'post_status'=>'publish','posts_per_page'=>1500,'orderby'=>'modified','order'=>'DESC','date_query'=>array(array('column'=>'post_modified_gmt','after'=>'2 days ago')),'fields'=>'ids'));
        foreach ($ids as $id) $this->enqueue_outbox($id, 'daily_reconcile');
        $this->process_outbox();
        delete_transient('zica_posts_daily_lock');
        self::schedule_next_daily();
    }

    private function published_posts($limit) {
        return get_posts(array('post_type'=>array('post','page'),'post_status'=>'publish','posts_per_page'=>absint($limit),'orderby'=>'modified','order'=>'DESC'));
    }

    private function generate_llms($full) {
        $posts = $this->published_posts($full ? 1000 : 80);
        $out = '# ' . get_bloginfo('name') . "\n\n> " . wp_strip_all_tags(get_bloginfo('description')) . "\n\n";
        $out .= 'Website: ' . home_url('/') . "\nLanguage: " . get_bloginfo('language') . "\nUpdated: " . $this->sao_paulo_now_iso() . "\nSoftware: Zica Posts " . ZICA_POSTS_VERSION . "\n\n";
        $out .= "## Discovery resources\n\n- Sitemap: " . home_url('/zica-ai-sitemap.xml') . "\n- AI manifest: " . home_url('/zica-ai-manifest.json') . "\n- AI policy: " . home_url('/ai.txt') . "\n";
        if (!$full) $out .= '- Full content index: ' . home_url('/llms-full.txt') . "\n";
        $out .= "\n## Published content\n\n";
        foreach ($posts as $post) {
            $excerpt = wp_strip_all_tags($post->post_excerpt ?: wp_trim_words($post->post_content, $full ? 80 : 30));
            $out .= '- [' . wp_strip_all_tags($post->post_title) . '](' . get_permalink($post->ID) . ') — modified ' . get_the_modified_date('c', $post) . '. ' . trim($excerpt) . "\n";
        }
        return $out;
    }

    private function ai_bots() {
        return apply_filters('zica_posts_ai_bots', array('OAI-SearchBot','GPTBot','ChatGPT-User','ClaudeBot','Claude-User','anthropic-ai','PerplexityBot','Perplexity-User','Googlebot','Google-Extended','Applebot','Applebot-Extended','CCBot','cohere-ai','meta-externalagent'));
    }

    private function generate_ai_txt() {
        $out = "# Zica Posts AI Discovery Policy\nSite: " . home_url('/') . "\nUpdated: " . $this->sao_paulo_now_iso() . "\n\n";
        $out .= "Public discovery resources:\nLLMs: " . home_url('/llms.txt') . "\nLLMs-Full: " . home_url('/llms-full.txt') . "\nSitemap: " . home_url('/zica-ai-sitemap.xml') . "\nManifest: " . home_url('/zica-ai-manifest.json') . "\n\n";
        $out .= "# Crawler directives are discovery permissions, not a guarantee of ingestion or citation.\n";
        foreach ($this->ai_bots() as $bot) $out .= 'User-agent: ' . sanitize_text_field($bot) . "\nAllow: /\n\n";
        return $out;
    }

    private function manifest_data() {
        $items = array();
        foreach ($this->published_posts(300) as $post) $items[] = array('id'=>$post->ID,'type'=>$post->post_type,'title'=>wp_strip_all_tags($post->post_title),'url'=>get_permalink($post->ID),'published'=>get_the_date('c',$post),'modified'=>get_the_modified_date('c',$post));
        return array('software_id'=>ZICA_POSTS_SOFTWARE_ID,'version'=>ZICA_POSTS_VERSION,'site'=>array('name'=>get_bloginfo('name'),'url'=>home_url('/'),'language'=>get_bloginfo('language')),'generated_at'=>$this->sao_paulo_now_iso(),'resources'=>array('llms'=>home_url('/llms.txt'),'llms_full'=>home_url('/llms-full.txt'),'ai_policy'=>home_url('/ai.txt'),'sitemap'=>home_url('/zica-ai-sitemap.xml'),'wp_sitemap'=>home_url('/wp-sitemap.xml')),'content'=>$items);
    }

    private function generate_sitemap() {
        $xml = '<?xml version="1.0" encoding="UTF-8"?>' . "\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n";
        $xml .= '  <url><loc>' . esc_xml(home_url('/')) . '</loc><lastmod>' . esc_xml(gmdate('c')) . "</lastmod></url>\n";
        foreach ($this->published_posts(5000) as $post) $xml .= '  <url><loc>' . esc_xml(get_permalink($post->ID)) . '</loc><lastmod>' . esc_xml(get_the_modified_date('c',$post)) . "</lastmod></url>\n";
        return $xml . '</urlset>';
    }

    private function write_atomic($path, $content) {
        $dir = dirname($path); if (!is_dir($dir) || !is_writable($dir)) return false;
        $tmp = $path . '.zica-' . wp_generate_password(8,false,false) . '.tmp';
        $bytes = @file_put_contents($tmp, (string)$content, LOCK_EX); if (false === $bytes) { @unlink($tmp); return false; }
        if (!@rename($tmp,$path)) { @unlink($tmp); return false; } @chmod($path,0644); return true;
    }

    public function refresh_discovery_files() {
        $docs = array('llms.txt'=>$this->generate_llms(false),'llms-full.txt'=>$this->generate_llms(true),'ai.txt'=>$this->generate_ai_txt(),'zica-ai-manifest.json'=>wp_json_encode($this->manifest_data(),JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT),'zica-ai-sitemap.xml'=>$this->generate_sitemap());
        $status = array();
        foreach ($docs as $name=>$content) {
            $physical = '1' === (string)get_option('zica_posts_physical_files_enabled','1') ? $this->write_atomic(ABSPATH.$name,$content) : false;
            $status[$name] = array('physical'=>(bool)$physical,'virtual_fallback'=>true,'bytes'=>strlen((string)$content),'url'=>home_url('/'.$name));
        }
        $key = (string)get_option('zica_posts_indexnow_key','');
        if ($key) $status[$key.'.txt'] = array('physical'=>'1' === (string)get_option('zica_posts_physical_files_enabled','1') ? $this->write_atomic(ABSPATH.$key.'.txt',$key) : false,'virtual_fallback'=>true,'bytes'=>strlen($key),'url'=>home_url('/'.$key.'.txt'));
        update_option('zica_posts_discovery_files_status',$status,false); return $status;
    }

    public function serve_discovery_files() {
        $path = parse_url(isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : '', PHP_URL_PATH); if (!$path) return;
        $map = array('/llms.txt'=>array('text/plain; charset=utf-8',$this->generate_llms(false)),'/llms-full.txt'=>array('text/plain; charset=utf-8',$this->generate_llms(true)),'/ai.txt'=>array('text/plain; charset=utf-8',$this->generate_ai_txt()),'/zica-ai-manifest.json'=>array('application/json; charset=utf-8',wp_json_encode($this->manifest_data(),JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT)),'/zica-ai-sitemap.xml'=>array('application/xml; charset=utf-8',$this->generate_sitemap()));
        $key = (string)get_option('zica_posts_indexnow_key',''); if ($key) $map['/'.$key.'.txt'] = array('text/plain; charset=utf-8',$key);
        if (!isset($map[$path])) return;
        status_header(200); header('Content-Type: '.$map[$path][0]); header('Cache-Control: public, max-age=300, stale-while-revalidate=600'); header('X-Robots-Tag: index, follow', false); echo $map[$path][1]; exit;
    }

    public function filter_robots_txt($output,$public) {
        if (!$public) return $output;
        $output .= "\n# Zica Posts " . ZICA_POSTS_VERSION . " discovery\nSitemap: " . home_url('/zica-ai-sitemap.xml') . "\nSitemap: " . home_url('/wp-sitemap.xml') . "\n";
        if ('1' === (string)get_option('zica_posts_ai_crawlers_enabled','1')) foreach ($this->ai_bots() as $bot) $output .= "\nUser-agent: " . sanitize_text_field($bot) . "\nAllow: /\n";
        return $output;
    }

    private function submit_indexnow_batch($urls) {
        $urls = array_values(array_unique(array_filter((array)$urls))); if (!$urls) return array('submitted'=>0,'status'=>'nothing_to_submit');
        $key = (string)get_option('zica_posts_indexnow_key',''); if (!$key) return array('submitted'=>0,'status'=>'missing_key');
        $host = wp_parse_url(home_url('/'),PHP_URL_HOST); $submitted=0; $responses=array();
        foreach (array_chunk(array_slice($urls,0,10000),500) as $batch) {
            $response = wp_remote_post('https://api.indexnow.org/indexnow',array('timeout'=>15,'headers'=>array('Content-Type'=>'application/json; charset=utf-8'),'body'=>wp_json_encode(array('host'=>$host,'key'=>$key,'keyLocation'=>home_url('/'.$key.'.txt'),'urlList'=>$batch))));
            if (is_wp_error($response)) { $responses[]=array('ok'=>false,'error'=>$response->get_error_message(),'count'=>count($batch)); continue; }
            $code=wp_remote_retrieve_response_code($response); $ok=in_array($code,array(200,202),true); if($ok)$submitted+=count($batch); $responses[]=array('ok'=>$ok,'http'=>$code,'count'=>count($batch));
        }
        $result=array('submitted'=>$submitted,'requested'=>count($urls),'responses'=>$responses,'provider'=>'IndexNow','note'=>'submission_received_not_indexing_confirmation'); update_option('zica_posts_last_indexnow',array_merge($result,array('at'=>current_time('mysql',true))),false); return $result;
    }

    private function api_key_from_request($request) {
        $candidates=array($request->get_header('X-ZICA-POSTS-Key'),$request->get_header('X-ZICA-AI-API-Key'),$request->get_header('X-CFRDM-API-Key'),$request->get_param('api_key'));
        $authorization=$request->get_header('Authorization'); if($authorization && 0===stripos($authorization,'Bearer '))$candidates[]=trim(substr($authorization,7));
        foreach($candidates as $candidate)if(is_string($candidate)&&''!==trim($candidate))return trim($candidate); return '';
    }

    public function verify_api_key($request) {
        $stored=(string)get_option('zica_posts_api_key',''); $provided=$this->api_key_from_request($request);
        return (!$stored||!$provided||!hash_equals($stored,$provided)) ? new WP_Error('zica_posts_unauthorized',__('API Key inválida ou ausente.','zica-posts'),array('status'=>401)) : true;
    }

    public function verify_hmac($request) {
        $timestamp=trim((string)$request->get_header('X-Zica-Timestamp')); $nonce=trim((string)$request->get_header('X-Zica-Nonce')); $signature=strtolower(trim((string)$request->get_header('X-Zica-Signature')));
        if(!$timestamp||!ctype_digit($timestamp)||!$nonce||!$signature)return new WP_Error('zica_hmac_missing','Assinatura HMAC incompleta.',array('status'=>401));
        if(abs(time()-(int)$timestamp)>300)return new WP_Error('zica_hmac_expired','Assinatura fora da janela de tempo.',array('status'=>401));
        if(!preg_match('/^[A-Za-z0-9._:-]{12,128}$/',$nonce))return new WP_Error('zica_nonce_invalid','Nonce inválido.',array('status'=>401));
        $nonce_key='zica_posts_nonce_'.hash('sha256',$nonce); if(get_transient($nonce_key))return new WP_Error('zica_replay','Nonce já utilizado.',array('status'=>409));
        $body=(string)$request->get_body(); $expected=hash_hmac('sha256',$timestamp."\n".$nonce."\n".hash('sha256',$body),(string)get_option('zica_posts_hub_secret',''));
        if(!hash_equals($expected,$signature))return new WP_Error('zica_hmac_invalid','Assinatura HMAC inválida.',array('status'=>401)); set_transient($nonce_key,'1',600); return true;
    }

    public function register_rest_routes() {
        $this->register_namespace('zica-posts/v1',true); $this->register_namespace('zica-ai/v1',true); $this->register_namespace('cfrdm/v1',false);
    }

    private function register_namespace($ns,$full) {
        register_rest_route($ns,'/version',array('methods'=>'GET','callback'=>array($this,'rest_version'),'permission_callback'=>'__return_true'));
        register_rest_route($ns,'/health',array('methods'=>'GET','callback'=>array($this,'rest_health'),'permission_callback'=>'__return_true'));
        register_rest_route($ns,'/test',array('methods'=>'GET','callback'=>array($this,'rest_test'),'permission_callback'=>array($this,'verify_api_key')));
        if(!$full)return;
        register_rest_route($ns,'/status',array('methods'=>'GET','callback'=>array($this,'rest_status'),'permission_callback'=>array($this,'verify_api_key')));
        register_rest_route($ns,'/sync',array('methods'=>'POST','callback'=>array($this,'rest_sync'),'permission_callback'=>array($this,'verify_api_key')));
        register_rest_route($ns,'/hub/sync',array('methods'=>'POST','callback'=>array($this,'rest_hub_sync'),'permission_callback'=>array($this,'verify_hmac')));
        register_rest_route($ns,'/files',array('methods'=>'GET','callback'=>array($this,'rest_files'),'permission_callback'=>array($this,'verify_api_key')));
        register_rest_route($ns,'/outbox',array('methods'=>'GET','callback'=>array($this,'rest_outbox'),'permission_callback'=>array($this,'verify_api_key')));
        register_rest_route($ns,'/cards/settings',array(array('methods'=>'GET','callback'=>array($this,'rest_cards_settings'),'permission_callback'=>array($this,'verify_api_key')),array('methods'=>'POST','callback'=>array($this,'rest_cards_settings_update'),'permission_callback'=>array($this,'verify_api_key'))));
        register_rest_route($ns,'/articles',array(array('methods'=>'GET','callback'=>array($this,'rest_articles'),'permission_callback'=>array($this,'verify_api_key')),array('methods'=>'POST','callback'=>array($this,'rest_create_article'),'permission_callback'=>array($this,'verify_api_key'))));
        register_rest_route($ns,'/media',array('methods'=>'POST','callback'=>array($this,'rest_media'),'permission_callback'=>array($this,'verify_api_key')));
    }

    public function rest_version() { return rest_ensure_response(array('success'=>true,'software_id'=>ZICA_POSTS_SOFTWARE_ID,'name'=>'Zica Posts','brand'=>'Zica.ai','version'=>ZICA_POSTS_VERSION,'api'=>'zica-posts/v1','features'=>array('outbox'=>true,'hmac'=>true,'replay_protection'=>true,'idempotency'=>true,'hub_webhook'=>true,'indexnow_batch'=>true,'llms_txt'=>true,'llms_full_txt'=>true,'ai_txt'=>true,'dynamic_sitemap'=>true,'schema'=>true,'automatic_cards'=>true,'daily_1500_sao_paulo'=>true,'physical_file_fallback'=>true))); }
    public function rest_health() { return rest_ensure_response(array('success'=>true,'software_id'=>ZICA_POSTS_SOFTWARE_ID,'version'=>ZICA_POSTS_VERSION,'site'=>home_url('/'),'timezone_job'=>ZICA_POSTS_TZ,'timestamp'=>$this->sao_paulo_now_iso())); }
    public function rest_test() { return rest_ensure_response(array('success'=>true,'message'=>'Zica Posts conectado.','version'=>ZICA_POSTS_VERSION,'site'=>array('name'=>get_bloginfo('name'),'url'=>home_url('/'),'version'=>ZICA_POSTS_VERSION,'wordpress'=>get_bloginfo('version'),'php'=>PHP_VERSION))); }

    private function outbox_counts() {
        global $wpdb; $table=$wpdb->prefix.ZICA_POSTS_OUTBOX_TABLE; $rows=$wpdb->get_results("SELECT status,COUNT(*) total FROM {$table} GROUP BY status",ARRAY_A); $out=array(); foreach((array)$rows as $row)$out[$row['status']]=(int)$row['total']; return $out;
    }

    public function rest_status() {
        $next=wp_next_scheduled(ZICA_POSTS_CRON_DAILY); $next_local=null; if($next)$next_local=(new DateTimeImmutable('@'.$next))->setTimezone(new DateTimeZone(ZICA_POSTS_TZ))->format(DateTime::ATOM);
        return rest_ensure_response(array('success'=>true,'software_id'=>ZICA_POSTS_SOFTWARE_ID,'version'=>ZICA_POSTS_VERSION,'next_daily_sync'=>$next_local,'daily_rule'=>'15:00 America/Sao_Paulo','last_sync'=>get_option('zica_posts_last_sync',null),'last_indexnow'=>get_option('zica_posts_last_indexnow',null),'files'=>get_option('zica_posts_discovery_files_status',array()),'outbox'=>$this->outbox_counts(),'hub'=>array('enabled'=>'1'===(string)get_option('zica_posts_hub_enabled','0'),'configured'=>(bool)get_option('zica_posts_hub_webhook_url','')),'cards'=>array('position'=>get_option('zica_posts_cards_position','after_content'),'count'=>(int)get_option('zica_posts_cards_count',3))));
    }

    public function rest_sync($request) {
        $ids=$request->get_param('post_ids'); $ids=is_array($ids)?array_values(array_unique(array_map('absint',$ids))):array();
        if(!$ids)$ids=get_posts(array('post_type'=>array('post','page'),'post_status'=>'publish','posts_per_page'=>500,'orderby'=>'modified','order'=>'DESC','fields'=>'ids'));
        foreach($ids as $id)$this->enqueue_outbox($id,'api_sync'); $this->process_outbox(); return rest_ensure_response(array('success'=>true,'queued'=>count($ids),'synced_at'=>$this->sao_paulo_now_iso()));
    }
    public function rest_files(){return rest_ensure_response(array('success'=>true,'files'=>get_option('zica_posts_discovery_files_status',array()),'manifest'=>$this->manifest_data()));}
    public function rest_outbox(){return rest_ensure_response(array('success'=>true,'counts'=>$this->outbox_counts(),'last_sync'=>get_option('zica_posts_last_sync',null)));}
    public function rest_cards_settings(){return rest_ensure_response(array('success'=>true,'position'=>get_option('zica_posts_cards_position','after_content'),'count'=>(int)get_option('zica_posts_cards_count',3)));}
    public function rest_cards_settings_update($request){$position=sanitize_key((string)$request->get_param('position'));$allowed=array('before_content','after_p2','after_p4','after_content','disabled');if($position&&in_array($position,$allowed,true))update_option('zica_posts_cards_position',$position,false);$count=absint($request->get_param('count'));if($count>=1&&$count<=6)update_option('zica_posts_cards_count',$count,false);return $this->rest_cards_settings();}

    public function rest_articles($request) {
        $page=max(1,absint($request->get_param('page')));$per=max(1,min(100,absint($request->get_param('per_page'))?:20));$q=new WP_Query(array('post_type'=>array('post','page'),'post_status'=>array('publish','draft','pending','future'),'paged'=>$page,'posts_per_page'=>$per,'orderby'=>'modified','order'=>'DESC'));
        $items=array();foreach($q->posts as $post)$items[]=array('id'=>$post->ID,'title'=>$post->post_title,'status'=>$post->post_status,'type'=>$post->post_type,'link'=>get_permalink($post->ID),'modified'=>get_the_modified_date('c',$post));return rest_ensure_response(array('success'=>true,'data'=>$items,'total'=>(int)$q->found_posts,'pages'=>(int)$q->max_num_pages));
    }

    private function resolve_terms($values,$taxonomy) {
        $ids=array();foreach((array)$values as $value){if(is_numeric($value)){$ids[]=absint($value);continue;}$name=sanitize_text_field($value);if(!$name)continue;$term=term_exists($name,$taxonomy);if(!$term)$term=wp_insert_term($name,$taxonomy);if(!is_wp_error($term))$ids[]=is_array($term)?absint($term['term_id']):absint($term);}return array_values(array_unique(array_filter($ids)));
    }

    public function rest_create_article($request) {
        $p=$request->get_json_params();$p=is_array($p)?$p:array();$title=sanitize_text_field(isset($p['title'])?$p['title']:'');$content=wp_kses_post(isset($p['content'])?$p['content']:'');if(!$title||!$content)return new WP_Error('zica_posts_invalid_article','Título e conteúdo são obrigatórios.',array('status'=>400));
        $external_id=sanitize_text_field(isset($p['zica_ai_id'])?$p['zica_ai_id']:(isset($p['cfrdm_id'])?$p['cfrdm_id']:''));$existing=0;if($external_id){$found=get_posts(array('post_type'=>'post','post_status'=>'any','meta_key'=>'_zica_posts_external_id','meta_value'=>$external_id,'posts_per_page'=>1,'fields'=>'ids'));if($found)$existing=(int)$found[0];}
        $status=isset($p['status'])&&in_array($p['status'],array('publish','draft','pending','future'),true)?$p['status']:'publish';
        $postarr=array('post_type'=>'post','post_status'=>$status,'post_title'=>$title,'post_content'=>$content,'post_excerpt'=>sanitize_textarea_field(isset($p['excerpt'])?$p['excerpt']:''),'post_name'=>sanitize_title(isset($p['slug'])?$p['slug']:$title));if($existing)$postarr['ID']=$existing;
        self::$suppress_outbound=true;$id=wp_insert_post($postarr,true);self::$suppress_outbound=false;if(is_wp_error($id))return $id;
        if($external_id)update_post_meta($id,'_zica_posts_external_id',$external_id);if(!empty($p['json_ld_schemas'])&&is_array($p['json_ld_schemas']))update_post_meta($id,'_zica_posts_json_ld',$p['json_ld_schemas']);
        if(!empty($p['categories']))wp_set_post_categories($id,$this->resolve_terms($p['categories'],'category'));if(!empty($p['tags']))wp_set_post_terms($id,$this->resolve_terms($p['tags'],'post_tag'),'post_tag',false);if(!empty($p['featured_image_id']))set_post_thumbnail($id,absint($p['featured_image_id']));
        $this->enqueue_outbox($id,$existing?'remote_updated':'remote_published',sanitize_text_field((string)$request->get_header('X-Zica-Correlation-ID')));return rest_ensure_response(array('success'=>true,'duplicate'=>(bool)$existing,'data'=>array('id'=>$id,'link'=>get_permalink($id),'status'=>get_post_status($id))));
    }

    public function rest_hub_sync($request) {
        $p=$request->get_json_params();$p=is_array($p)?$p:array();$hash=sanitize_text_field(isset($p['content_hash'])?$p['content_hash']:'');$correlation=sanitize_text_field((string)$request->get_header('X-Zica-Correlation-ID'));if(!$correlation)$correlation=sanitize_text_field(isset($p['correlation_id'])?$p['correlation_id']:wp_generate_uuid4());
        $post_id=absint(isset($p['post_id'])?$p['post_id']:0);if($post_id&&$hash&&hash_equals((string)get_post_meta($post_id,'_zica_posts_last_inbound_hash',true),$hash))return rest_ensure_response(array('success'=>true,'idempotent'=>true,'post_id'=>$post_id,'correlation_id'=>$correlation));
        $title=sanitize_text_field(isset($p['title'])?$p['title']:'');$content=wp_kses_post(isset($p['content'])?$p['content']:'');if(!$title||!$content)return new WP_Error('zica_hub_invalid','Título e conteúdo são obrigatórios.',array('status'=>400));
        $arr=array('post_type'=>'post','post_status'=>'publish','post_title'=>$title,'post_content'=>$content,'post_excerpt'=>sanitize_textarea_field(isset($p['excerpt'])?$p['excerpt']:''),'post_name'=>sanitize_title(isset($p['slug'])?$p['slug']:$title));if($post_id)$arr['ID']=$post_id;
        self::$suppress_outbound=true;$saved=wp_insert_post($arr,true);self::$suppress_outbound=false;if(is_wp_error($saved))return $saved;
        if(!$hash)$hash=$this->post_content_hash(get_post($saved));update_post_meta($saved,'_zica_posts_last_inbound_hash',$hash);update_post_meta($saved,'_zica_posts_last_correlation_id',$correlation);if(!empty($p['schema_json']))update_post_meta($saved,'_zica_posts_json_ld',is_array($p['schema_json'])&&isset($p['schema_json'][0])?$p['schema_json']:array($p['schema_json']));if(!empty($p['featured_media_id']))set_post_thumbnail($saved,absint($p['featured_media_id']));
        $this->enqueue_outbox($saved,'hub_applied',$correlation);return rest_ensure_response(array('success'=>true,'post_id'=>$saved,'permalink'=>get_permalink($saved),'correlation_id'=>$correlation,'content_hash'=>$hash));
    }

    public function rest_media($request) {
        $p=$request->get_json_params();$p=is_array($p)?$p:array();$data=isset($p['image_data'])?(string)$p['image_data']:'';$filename=sanitize_file_name(isset($p['filename'])?$p['filename']:'zica-media.png');if(0!==strpos($data,'data:image/'))return new WP_Error('zica_media_invalid','image_data deve ser Data URL de imagem.',array('status'=>400));
        $parts=explode(',',$data,2);$bytes=isset($parts[1])?base64_decode($parts[1],true):false;if(false===$bytes||strlen($bytes)>8*1024*1024)return new WP_Error('zica_media_size','Imagem inválida ou maior que 8MB.',array('status'=>400));
        $upload=wp_upload_bits($filename,null,$bytes);if(!empty($upload['error']))return new WP_Error('zica_media_upload',$upload['error'],array('status'=>500));$type=wp_check_filetype($upload['file']);$attachment=wp_insert_attachment(array('post_mime_type'=>$type['type'],'post_title'=>sanitize_text_field(pathinfo($filename,PATHINFO_FILENAME)),'post_status'=>'inherit'),$upload['file']);if(is_wp_error($attachment))return $attachment;require_once ABSPATH.'wp-admin/includes/image.php';$meta=wp_generate_attachment_metadata($attachment,$upload['file']);wp_update_attachment_metadata($attachment,$meta);if(!empty($p['alt_text']))update_post_meta($attachment,'_wp_attachment_image_alt',sanitize_text_field($p['alt_text']));return rest_ensure_response(array('success'=>true,'data'=>array('id'=>$attachment,'url'=>wp_get_attachment_url($attachment))));
    }

    public function output_schema() {
        if(!is_singular(array('post','page')))return;global $post;if(!$post instanceof WP_Post||'publish'!==$post->post_status)return;$stored=get_post_meta($post->ID,'_zica_posts_json_ld',true);if(is_array($stored)&&$stored){foreach($stored as $schema)if(is_array($schema))echo '<script type="application/ld+json">'.wp_json_encode($schema,JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE).'</script>' . "\n";return;}if(defined('RANK_MATH_VERSION')||defined('WPSEO_VERSION'))return;
        $schema=array('@context'=>'https://schema.org','@type'=>apply_filters('zica_posts_schema_type','Article',$post),'headline'=>wp_strip_all_tags($post->post_title),'description'=>wp_strip_all_tags($post->post_excerpt?:wp_trim_words($post->post_content,35)),'url'=>get_permalink($post->ID),'datePublished'=>get_the_date('c',$post),'dateModified'=>get_the_modified_date('c',$post),'mainEntityOfPage'=>array('@type'=>'WebPage','@id'=>get_permalink($post->ID)),'author'=>array('@type'=>'Person','name'=>get_the_author_meta('display_name',$post->post_author)),'publisher'=>array('@type'=>'Organization','name'=>get_bloginfo('name'),'url'=>home_url('/')));$thumb=get_the_post_thumbnail_url($post->ID,'full');if($thumb)$schema['image']=$thumb;echo '<script type="application/ld+json">'.wp_json_encode($schema,JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE).'</script>' . "\n";
    }

    private function related_posts($post_id,$count){$cats=wp_get_post_categories($post_id);$args=array('post_type'=>'post','post_status'=>'publish','posts_per_page'=>max(1,min(6,absint($count))),'post__not_in'=>array($post_id),'orderby'=>'date','order'=>'DESC');if($cats)$args['category__in']=$cats;return get_posts($args);}
    private function render_cards($post_id,$count){$posts=$this->related_posts($post_id,$count);if(!$posts)return '';$html='<section class="zica-posts-related" aria-label="Conteúdos relacionados"><div class="zica-posts-related__head"><span>ZICA.AI</span><h2>Continue nesta onda</h2></div><div class="zica-posts-related__grid">';foreach($posts as $item){$html.='<article class="zica-posts-card"><a href="'.esc_url(get_permalink($item->ID)).'">';$thumb=get_the_post_thumbnail_url($item->ID,'medium_large');if($thumb)$html.='<img loading="lazy" decoding="async" src="'.esc_url($thumb).'" alt="'.esc_attr(wp_strip_all_tags($item->post_title)).'">';$html.='<div class="zica-posts-card__body"><h3>'.esc_html($item->post_title).'</h3><p>'.esc_html(wp_trim_words(wp_strip_all_tags($item->post_excerpt?:$item->post_content),18)).'</p><span>Continuar lendo →</span></div></a></article>';}$html.='</div></section>';return $html;}
    private function insert_after_paragraph($content,$insert,$n){$parts=explode('</p>',$content);if(count($parts)<=$n)return $content.$insert;$out='';foreach($parts as $i=>$part){if(''===trim($part)&&$i===count($parts)-1)continue;$out.=$part.'</p>';if(($i+1)===$n)$out.=$insert;}return $out;}
    public function inject_cards($content){if(is_admin()||!is_singular('post')||!in_the_loop()||!is_main_query())return $content;global $post;if(!$post instanceof WP_Post)return $content;$pos=get_option('zica_posts_cards_position','after_content');if('disabled'===$pos)return $content;$cards=$this->render_cards($post->ID,get_option('zica_posts_cards_count',3));if(!$cards)return $content;if('before_content'===$pos)return $cards.$content;if('after_p2'===$pos)return $this->insert_after_paragraph($content,$cards,2);if('after_p4'===$pos)return $this->insert_after_paragraph($content,$cards,4);return $content.$cards;}
    public function shortcode_cards($atts){$atts=shortcode_atts(array('count'=>get_option('zica_posts_cards_count',3)),$atts,'zica_posts_cards');$id=get_the_ID();return $id?$this->render_cards($id,absint($atts['count'])):'';}

    private function sao_paulo_now_iso(){return (new DateTimeImmutable('now',new DateTimeZone(ZICA_POSTS_TZ)))->format(DateTime::ATOM);}

    public function admin_menu(){add_menu_page('Zica Posts','Zica Posts','manage_options','zica-posts',array($this,'admin_page'),'dashicons-networking',58);}
    public function register_settings(){register_setting('zica_posts_settings','zica_posts_cards_position',array('sanitize_callback'=>'sanitize_key'));register_setting('zica_posts_settings','zica_posts_cards_count',array('sanitize_callback'=>'absint'));register_setting('zica_posts_settings','zica_posts_ai_crawlers_enabled',array('sanitize_callback'=>'sanitize_text_field'));register_setting('zica_posts_settings','zica_posts_physical_files_enabled',array('sanitize_callback'=>'sanitize_text_field'));register_setting('zica_posts_settings','zica_posts_hub_enabled',array('sanitize_callback'=>'sanitize_text_field'));register_setting('zica_posts_settings','zica_posts_hub_webhook_url',array('sanitize_callback'=>'esc_url_raw'));}
    public function admin_assets($hook){if('toplevel_page_zica-posts'!==$hook)return;wp_enqueue_style('zica-posts-admin',ZICA_POSTS_URL.'assets/admin.css',array(),ZICA_POSTS_VERSION);}
    public function admin_page(){if(!current_user_can('manage_options'))return;$api=(string)get_option('zica_posts_api_key','');$secret=(string)get_option('zica_posts_hub_secret','');$counts=$this->outbox_counts();echo '<div class="wrap zica-posts-admin"><div class="zica-posts-hero"><div class="zica-neural-core"><span></span><i></i><b></b></div><div class="zica-posts-kicker">ZICA.AI · NEURAL DISTRIBUTION LAYER</div><h1>Zica Posts '.esc_html(ZICA_POSTS_VERSION).'</h1><p>Agente leve: WordPress registra sinais; o Hub processa IA, mídia e distribuição. Outbox, HMAC, IndexNow em lote e discovery operam sem bloquear o salvamento.</p><div class="zica-energy-line"></div></div><div class="zica-posts-grid"><section class="zica-posts-panel"><h2>Conexão segura</h2><p><strong>API Key:</strong> <code>'.esc_html($api).'</code></p><p><strong>Hub Secret:</strong> <code>'.esc_html(substr($secret,0,8).'••••••••'.substr($secret,-6)).'</code></p><p><strong>Namespace:</strong> <code>/wp-json/zica-posts/v1/</code></p></section><section class="zica-posts-panel"><h2>Outbox neural</h2><p>Pending: '.esc_html(isset($counts['pending'])?$counts['pending']:0).' · Retry: '.esc_html(isset($counts['retry'])?$counts['retry']:0).' · Failed: '.esc_html(isset($counts['failed'])?$counts['failed']:0).'</p><p>Reconciliação: 15:00 America/Sao_Paulo</p></section></div><form method="post" action="options.php" class="zica-posts-panel zica-posts-settings">';settings_fields('zica_posts_settings');echo '<h2>Controles</h2><label>Cards <select name="zica_posts_cards_position">';foreach(array('before_content'=>'Antes do conteúdo','after_p2'=>'Após 2º parágrafo','after_p4'=>'Após 4º parágrafo','after_content'=>'Após conteúdo','disabled'=>'Desativado') as $k=>$v)echo '<option value="'.esc_attr($k).'" '.selected(get_option('zica_posts_cards_position','after_content'),$k,false).'>'.esc_html($v).'</option>';echo '</select></label><label>Quantidade <input type="number" min="1" max="6" name="zica_posts_cards_count" value="'.esc_attr((int)get_option('zica_posts_cards_count',3)).'"></label><label><input type="checkbox" name="zica_posts_ai_crawlers_enabled" value="1" '.checked(get_option('zica_posts_ai_crawlers_enabled','1'),'1',false).'> Regras explícitas para crawlers conhecidos</label><label><input type="checkbox" name="zica_posts_physical_files_enabled" value="1" '.checked(get_option('zica_posts_physical_files_enabled','1'),'1',false).'> Gravar discovery files fisicamente quando permitido</label><label><input type="checkbox" name="zica_posts_hub_enabled" value="1" '.checked(get_option('zica_posts_hub_enabled','0'),'1',false).'> Enviar outbox ao Zica Orchestrator</label><label>Webhook Hub <input type="url" class="regular-text" name="zica_posts_hub_webhook_url" value="'.esc_attr(get_option('zica_posts_hub_webhook_url','')).'" placeholder="https://hub.exemplo.com/events"></label>';submit_button('Salvar controles');echo '</form></div>';}
}

add_filter('cron_schedules', function($schedules){if(!isset($schedules['five_minutes']))$schedules['five_minutes']=array('interval'=>300,'display'=>'Every 5 minutes');return $schedules;});
register_activation_hook(__FILE__,array('Zica_Posts_3101','activate'));
register_deactivation_hook(__FILE__,array('Zica_Posts_3101','deactivate'));
Zica_Posts_3101::instance();
