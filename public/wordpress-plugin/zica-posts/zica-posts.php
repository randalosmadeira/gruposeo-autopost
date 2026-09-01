<?php
/**
 * Plugin Name: Zica Posts — Conector WordPress Oficial Zica.ai
 * Plugin URI: https://zica.ai
 * Description: Conector oficial do software Zica Posts/Zica.ai para publicação, GEO, Schema, llms.txt, sitemaps, IndexNow, descoberta por IAs, cards automáticos e sincronização 24/7.
 * Version: 3.10.0
 * Author: Equipe Zica.ai
 * Author URI: https://zica.ai
 * License: GPL v2 or later
 * Text Domain: zica-posts
 * Requires at least: 5.8
 * Requires PHP: 7.4
 */

if (!defined('ABSPATH')) {
    exit;
}

define('ZICA_POSTS_VERSION', '3.10.0');
define('ZICA_POSTS_SOFTWARE_ID', 'zica-posts');
define('ZICA_POSTS_FILE', __FILE__);
define('ZICA_POSTS_DIR', plugin_dir_path(__FILE__));
define('ZICA_POSTS_URL', plugin_dir_url(__FILE__));
define('ZICA_POSTS_TZ', 'America/Sao_Paulo');
define('ZICA_POSTS_CRON_DAILY', 'zica_posts_daily_1500_sync');
define('ZICA_POSTS_CRON_IMMEDIATE', 'zica_posts_immediate_sync');

final class Zica_Posts_310 {
    private static $instance = null;

    public static function instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
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
        add_action(ZICA_POSTS_CRON_IMMEDIATE, array($this, 'run_immediate_sync'));
        add_action(ZICA_POSTS_CRON_DAILY, array($this, 'run_daily_sync'));

        add_action('admin_menu', array($this, 'admin_menu'));
        add_action('admin_init', array($this, 'register_settings'));
        add_action('admin_enqueue_scripts', array($this, 'admin_assets'));
    }

    public static function activate() {
        if (!get_option('zica_posts_api_key')) {
            update_option('zica_posts_api_key', wp_generate_uuid4(), false);
        }
        if (!get_option('zica_posts_indexnow_key')) {
            try {
                update_option('zica_posts_indexnow_key', bin2hex(random_bytes(16)), false);
            } catch (Throwable $e) {
                update_option('zica_posts_indexnow_key', strtolower(wp_generate_password(32, false, false)), false);
            }
        }

        add_option('zica_posts_cards_position', 'after_content');
        add_option('zica_posts_cards_count', 3);
        add_option('zica_posts_ai_crawlers_enabled', '1');
        add_option('zica_posts_physical_files_enabled', '1');

        self::clear_schedules();
        self::schedule_next_daily();
        wp_schedule_single_event(time() + 10, ZICA_POSTS_CRON_IMMEDIATE);
    }

    public static function deactivate() {
        self::clear_schedules();
    }

    private static function clear_schedules() {
        $ts = wp_next_scheduled(ZICA_POSTS_CRON_DAILY);
        while ($ts) {
            wp_unschedule_event($ts, ZICA_POSTS_CRON_DAILY);
            $ts = wp_next_scheduled(ZICA_POSTS_CRON_DAILY);
        }
        $ts = wp_next_scheduled(ZICA_POSTS_CRON_IMMEDIATE);
        while ($ts) {
            wp_unschedule_event($ts, ZICA_POSTS_CRON_IMMEDIATE);
            $ts = wp_next_scheduled(ZICA_POSTS_CRON_IMMEDIATE);
        }
    }

    private static function next_daily_timestamp() {
        $tz = new DateTimeZone(ZICA_POSTS_TZ);
        $now = new DateTimeImmutable('now', $tz);
        $next = $now->setTime(15, 0, 0);
        if ($next <= $now) {
            $next = $next->modify('+1 day');
        }
        return $next->getTimestamp();
    }

    private static function schedule_next_daily() {
        if (!wp_next_scheduled(ZICA_POSTS_CRON_DAILY)) {
            wp_schedule_single_event(self::next_daily_timestamp(), ZICA_POSTS_CRON_DAILY);
        }
    }

    public function ensure_schedule() {
        self::schedule_next_daily();
    }

    private function queue_sync($post_id) {
        $pending = get_option('zica_posts_pending_post_ids', array());
        if (!is_array($pending)) {
            $pending = array();
        }
        $pending[] = absint($post_id);
        $pending = array_values(array_unique(array_filter($pending)));
        update_option('zica_posts_pending_post_ids', array_slice($pending, -200), false);

        if (!wp_next_scheduled(ZICA_POSTS_CRON_IMMEDIATE)) {
            wp_schedule_single_event(time() + 20, ZICA_POSTS_CRON_IMMEDIATE);
        }
    }

    public function on_transition_post_status($new_status, $old_status, $post) {
        if (!$post instanceof WP_Post || 'publish' !== $new_status || 'publish' === $old_status) {
            return;
        }
        if (wp_is_post_revision($post->ID) || wp_is_post_autosave($post->ID)) {
            return;
        }
        if (!in_array($post->post_type, array('post', 'page'), true)) {
            return;
        }
        $this->queue_sync($post->ID);
    }

    public function on_post_updated($post_id, $post_after, $post_before) {
        if (!$post_after instanceof WP_Post || 'publish' !== $post_after->post_status) {
            return;
        }
        if (!in_array($post_after->post_type, array('post', 'page'), true)) {
            return;
        }
        if ($post_after->post_modified_gmt === $post_before->post_modified_gmt) {
            return;
        }
        $this->queue_sync($post_id);
    }

    public function run_immediate_sync() {
        if (get_transient('zica_posts_sync_lock')) {
            return;
        }
        set_transient('zica_posts_sync_lock', '1', 90);
        $ids = get_option('zica_posts_pending_post_ids', array());
        delete_option('zica_posts_pending_post_ids');
        $ids = is_array($ids) ? array_values(array_unique(array_map('absint', $ids))) : array();

        $files = $this->refresh_discovery_files();
        $urls = $this->urls_from_post_ids($ids);
        $indexnow = $this->submit_indexnow($urls);

        update_option('zica_posts_last_sync', array(
            'mode' => 'immediate',
            'at' => current_time('mysql', true),
            'post_ids' => $ids,
            'files' => $files,
            'indexnow' => $indexnow,
        ), false);
        delete_transient('zica_posts_sync_lock');
    }

    public function run_daily_sync() {
        if (get_transient('zica_posts_sync_lock')) {
            self::schedule_next_daily();
            return;
        }
        set_transient('zica_posts_sync_lock', '1', 180);

        $posts = get_posts(array(
            'post_type' => array('post', 'page'),
            'post_status' => 'publish',
            'posts_per_page' => 500,
            'orderby' => 'modified',
            'order' => 'DESC',
            'date_query' => array(array('column' => 'post_modified_gmt', 'after' => '2 days ago')),
            'fields' => 'ids',
        ));

        $files = $this->refresh_discovery_files();
        $urls = $this->urls_from_post_ids($posts);
        $indexnow = $this->submit_indexnow($urls);

        update_option('zica_posts_last_sync', array(
            'mode' => 'daily_1500_sao_paulo',
            'at' => current_time('mysql', true),
            'post_count' => count($posts),
            'files' => $files,
            'indexnow' => $indexnow,
        ), false);

        delete_transient('zica_posts_sync_lock');
        self::schedule_next_daily();
    }

    private function urls_from_post_ids($ids) {
        $urls = array();
        foreach ((array) $ids as $id) {
            $url = get_permalink(absint($id));
            if ($url) {
                $urls[] = $url;
            }
        }
        return array_values(array_unique($urls));
    }

    public function refresh_discovery_files() {
        $documents = array(
            'llms.txt' => $this->generate_llms(false),
            'llms-full.txt' => $this->generate_llms(true),
            'ai.txt' => $this->generate_ai_txt(),
            'zica-ai-manifest.json' => wp_json_encode($this->manifest_data(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT),
            'zica-ai-sitemap.xml' => $this->generate_sitemap(),
        );

        $status = array();
        foreach ($documents as $name => $content) {
            $written = false;
            if ('1' === (string) get_option('zica_posts_physical_files_enabled', '1')) {
                $written = $this->write_atomic(ABSPATH . $name, $content);
            }
            $status[$name] = array(
                'physical' => (bool) $written,
                'virtual_fallback' => true,
                'bytes' => strlen((string) $content),
                'url' => home_url('/' . $name),
            );
        }

        $key = get_option('zica_posts_indexnow_key', '');
        if ($key && '1' === (string) get_option('zica_posts_physical_files_enabled', '1')) {
            $status[$key . '.txt'] = array(
                'physical' => $this->write_atomic(ABSPATH . $key . '.txt', $key),
                'virtual_fallback' => true,
                'bytes' => strlen($key),
                'url' => home_url('/' . $key . '.txt'),
            );
        }

        update_option('zica_posts_discovery_files_status', $status, false);
        return $status;
    }

    private function write_atomic($path, $content) {
        $dir = dirname($path);
        if (!is_dir($dir) || !is_writable($dir)) {
            return false;
        }
        $tmp = $path . '.zica-' . wp_generate_password(8, false, false) . '.tmp';
        $bytes = @file_put_contents($tmp, (string) $content, LOCK_EX);
        if (false === $bytes) {
            @unlink($tmp);
            return false;
        }
        if (!@rename($tmp, $path)) {
            @unlink($tmp);
            return false;
        }
        @chmod($path, 0644);
        return true;
    }

    private function published_posts($limit) {
        return get_posts(array(
            'post_type' => array('post', 'page'),
            'post_status' => 'publish',
            'posts_per_page' => absint($limit),
            'orderby' => 'modified',
            'order' => 'DESC',
        ));
    }

    private function generate_llms($full) {
        $posts = $this->published_posts($full ? 500 : 60);
        $out = '# ' . get_bloginfo('name') . "\n\n";
        $out .= '> ' . wp_strip_all_tags(get_bloginfo('description')) . "\n\n";
        $out .= 'Website: ' . home_url('/') . "\n";
        $out .= 'Language: ' . get_bloginfo('language') . "\n";
        $out .= 'Updated: ' . $this->sao_paulo_now_iso() . "\n";
        $out .= 'Software: Zica Posts ' . ZICA_POSTS_VERSION . "\n\n";
        $out .= "## Discovery resources\n\n";
        $out .= '- Sitemap: ' . home_url('/zica-ai-sitemap.xml') . "\n";
        $out .= '- AI manifest: ' . home_url('/zica-ai-manifest.json') . "\n";
        $out .= '- AI crawler policy: ' . home_url('/ai.txt') . "\n";
        if (!$full) {
            $out .= '- Full content index: ' . home_url('/llms-full.txt') . "\n";
        }
        $out .= "\n## Published content\n\n";
        foreach ($posts as $post) {
            $url = get_permalink($post->ID);
            $excerpt = wp_strip_all_tags($post->post_excerpt ? $post->post_excerpt : wp_trim_words($post->post_content, $full ? 80 : 28));
            $out .= '- [' . wp_strip_all_tags($post->post_title) . '](' . $url . ')';
            $out .= ' — modified ' . get_the_modified_date('c', $post) . '. ' . trim($excerpt) . "\n";
        }
        return $out;
    }

    private function ai_bots() {
        $bots = array(
            'GPTBot', 'OAI-SearchBot', 'ChatGPT-User',
            'ClaudeBot', 'Claude-User', 'anthropic-ai',
            'PerplexityBot', 'Perplexity-User',
            'Google-Extended', 'Googlebot', 'GoogleOther',
            'Applebot', 'Applebot-Extended',
            'CCBot', 'Bytespider', 'cohere-ai', 'meta-externalagent'
        );
        return apply_filters('zica_posts_ai_bots', $bots);
    }

    private function generate_ai_txt() {
        $out = "# Zica Posts AI Discovery Policy\n";
        $out .= 'Site: ' . home_url('/') . "\n";
        $out .= 'Updated: ' . $this->sao_paulo_now_iso() . "\n\n";
        $out .= "The site exposes public, indexable content through the resources below.\n";
        $out .= 'LLMs: ' . home_url('/llms.txt') . "\n";
        $out .= 'LLMs-Full: ' . home_url('/llms-full.txt') . "\n";
        $out .= 'Sitemap: ' . home_url('/zica-ai-sitemap.xml') . "\n";
        $out .= 'Manifest: ' . home_url('/zica-ai-manifest.json') . "\n\n";
        $out .= "# Known AI/Search crawlers explicitly allowed by this plugin\n";
        foreach ($this->ai_bots() as $bot) {
            $out .= 'User-agent: ' . sanitize_text_field($bot) . "\nAllow: /\n\n";
        }
        return $out;
    }

    private function manifest_data() {
        $items = array();
        foreach ($this->published_posts(150) as $post) {
            $items[] = array(
                'id' => $post->ID,
                'type' => $post->post_type,
                'title' => wp_strip_all_tags($post->post_title),
                'url' => get_permalink($post->ID),
                'published' => get_the_date('c', $post),
                'modified' => get_the_modified_date('c', $post),
            );
        }
        return array(
            'software_id' => ZICA_POSTS_SOFTWARE_ID,
            'version' => ZICA_POSTS_VERSION,
            'site' => array('name' => get_bloginfo('name'), 'url' => home_url('/'), 'language' => get_bloginfo('language')),
            'generated_at' => $this->sao_paulo_now_iso(),
            'resources' => array(
                'llms' => home_url('/llms.txt'),
                'llms_full' => home_url('/llms-full.txt'),
                'ai_policy' => home_url('/ai.txt'),
                'sitemap' => home_url('/zica-ai-sitemap.xml'),
                'wp_sitemap' => home_url('/wp-sitemap.xml'),
            ),
            'content' => $items,
        );
    }

    private function generate_sitemap() {
        $items = $this->published_posts(1000);
        $xml = '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
        $xml .= '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
        $xml .= "  <url><loc>" . esc_xml(home_url('/')) . "</loc><lastmod>" . esc_xml(gmdate('c')) . "</lastmod></url>\n";
        foreach ($items as $post) {
            $xml .= '  <url><loc>' . esc_xml(get_permalink($post->ID)) . '</loc><lastmod>' . esc_xml(get_the_modified_date('c', $post)) . "</lastmod></url>\n";
        }
        $xml .= '</urlset>';
        return $xml;
    }

    private function sao_paulo_now_iso() {
        $dt = new DateTimeImmutable('now', new DateTimeZone(ZICA_POSTS_TZ));
        return $dt->format(DateTime::ATOM);
    }

    public function serve_discovery_files() {
        $path = parse_url(isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : '', PHP_URL_PATH);
        if (!$path) {
            return;
        }
        $map = array(
            '/llms.txt' => array('text/plain; charset=utf-8', $this->generate_llms(false)),
            '/llms-full.txt' => array('text/plain; charset=utf-8', $this->generate_llms(true)),
            '/ai.txt' => array('text/plain; charset=utf-8', $this->generate_ai_txt()),
            '/zica-ai-manifest.json' => array('application/json; charset=utf-8', wp_json_encode($this->manifest_data(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)),
            '/zica-ai-sitemap.xml' => array('application/xml; charset=utf-8', $this->generate_sitemap()),
        );
        $key = get_option('zica_posts_indexnow_key', '');
        if ($key) {
            $map['/' . $key . '.txt'] = array('text/plain; charset=utf-8', $key);
        }
        if (!isset($map[$path])) {
            return;
        }
        status_header(200);
        nocache_headers();
        header('Content-Type: ' . $map[$path][0]);
        echo $map[$path][1];
        exit;
    }

    public function filter_robots_txt($output, $public) {
        if (!$public) {
            return $output;
        }
        $output .= "\n# Zica Posts 3.10.0 discovery\n";
        $output .= 'Sitemap: ' . home_url('/zica-ai-sitemap.xml') . "\n";
        $output .= 'Sitemap: ' . home_url('/wp-sitemap.xml') . "\n";
        if ('1' === (string) get_option('zica_posts_ai_crawlers_enabled', '1')) {
            foreach ($this->ai_bots() as $bot) {
                $output .= "\nUser-agent: " . sanitize_text_field($bot) . "\nAllow: /\n";
            }
        }
        return $output;
    }

    public function output_schema() {
        if (!is_singular(array('post', 'page'))) {
            return;
        }
        global $post;
        if (!$post instanceof WP_Post || 'publish' !== $post->post_status) {
            return;
        }

        $stored = get_post_meta($post->ID, '_zica_posts_json_ld', true);
        if (is_array($stored) && !empty($stored)) {
            foreach ($stored as $schema) {
                if (is_array($schema)) {
                    echo '<script type="application/ld+json">' . wp_json_encode($schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . '</script>' . "\n";
                }
            }
            return;
        }

        if (defined('RANK_MATH_VERSION') || defined('WPSEO_VERSION')) {
            return;
        }

        $schema = array(
            '@context' => 'https://schema.org',
            '@type' => apply_filters('zica_posts_schema_type', 'Article', $post),
            'headline' => wp_strip_all_tags($post->post_title),
            'description' => wp_strip_all_tags($post->post_excerpt ? $post->post_excerpt : wp_trim_words($post->post_content, 35)),
            'url' => get_permalink($post->ID),
            'datePublished' => get_the_date('c', $post),
            'dateModified' => get_the_modified_date('c', $post),
            'mainEntityOfPage' => array('@type' => 'WebPage', '@id' => get_permalink($post->ID)),
            'author' => array('@type' => 'Person', 'name' => get_the_author_meta('display_name', $post->post_author)),
            'publisher' => array('@type' => 'Organization', 'name' => get_bloginfo('name'), 'url' => home_url('/')),
        );
        $thumb = get_the_post_thumbnail_url($post->ID, 'full');
        if ($thumb) {
            $schema['image'] = $thumb;
        }
        echo '<script type="application/ld+json">' . wp_json_encode($schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . '</script>' . "\n";
    }

    private function related_posts($post_id, $count) {
        $cats = wp_get_post_categories($post_id);
        $args = array(
            'post_type' => 'post',
            'post_status' => 'publish',
            'posts_per_page' => max(1, min(6, absint($count))),
            'post__not_in' => array($post_id),
            'orderby' => 'date',
            'order' => 'DESC',
        );
        if ($cats) {
            $args['category__in'] = $cats;
        }
        return get_posts($args);
    }

    private function render_cards($post_id, $count) {
        $posts = $this->related_posts($post_id, $count);
        if (!$posts) {
            return '';
        }
        $html = '<section class="zica-posts-related" aria-label="Conteúdos relacionados"><div class="zica-posts-related__head"><span>ZICA.AI</span><h2>Continue nesta onda</h2></div><div class="zica-posts-related__grid">';
        foreach ($posts as $item) {
            $html .= '<article class="zica-posts-card"><a href="' . esc_url(get_permalink($item->ID)) . '">';
            $thumb = get_the_post_thumbnail_url($item->ID, 'medium_large');
            if ($thumb) {
                $html .= '<img loading="lazy" decoding="async" src="' . esc_url($thumb) . '" alt="' . esc_attr(wp_strip_all_tags($item->post_title)) . '">';
            }
            $html .= '<div class="zica-posts-card__body"><h3>' . esc_html($item->post_title) . '</h3><p>' . esc_html(wp_trim_words(wp_strip_all_tags($item->post_excerpt ? $item->post_excerpt : $item->post_content), 18)) . '</p><span>Continuar lendo →</span></div></a></article>';
        }
        $html .= '</div></section>';
        return $html;
    }

    private function insert_after_paragraph($content, $insert, $paragraph_number) {
        $closing = '</p>';
        $parts = explode($closing, $content);
        if (count($parts) <= $paragraph_number) {
            return $content . $insert;
        }
        $output = '';
        foreach ($parts as $index => $part) {
            if ('' === trim($part) && $index === count($parts) - 1) {
                continue;
            }
            $output .= $part . $closing;
            if (($index + 1) === $paragraph_number) {
                $output .= $insert;
            }
        }
        return $output;
    }

    public function inject_cards($content) {
        if (is_admin() || !is_singular('post') || !in_the_loop() || !is_main_query()) {
            return $content;
        }
        global $post;
        if (!$post instanceof WP_Post) {
            return $content;
        }
        $position = get_option('zica_posts_cards_position', 'after_content');
        if ('disabled' === $position) {
            return $content;
        }
        $cards = $this->render_cards($post->ID, get_option('zica_posts_cards_count', 3));
        if (!$cards) {
            return $content;
        }
        if ('before_content' === $position) {
            return $cards . $content;
        }
        if ('after_p2' === $position) {
            return $this->insert_after_paragraph($content, $cards, 2);
        }
        if ('after_p4' === $position) {
            return $this->insert_after_paragraph($content, $cards, 4);
        }
        return $content . $cards;
    }

    public function shortcode_cards($atts) {
        $atts = shortcode_atts(array('count' => get_option('zica_posts_cards_count', 3)), $atts, 'zica_posts_cards');
        $post_id = get_the_ID();
        return $post_id ? $this->render_cards($post_id, absint($atts['count'])) : '';
    }

    private function submit_indexnow($urls) {
        $urls = array_values(array_unique(array_filter((array) $urls)));
        if (!$urls) {
            return array('submitted' => 0, 'status' => 'nothing_to_submit');
        }
        $key = get_option('zica_posts_indexnow_key', '');
        if (!$key) {
            return array('submitted' => 0, 'status' => 'missing_key');
        }
        $host = wp_parse_url(home_url('/'), PHP_URL_HOST);
        $submitted = 0;
        $responses = array();
        foreach (array_chunk($urls, 200) as $batch) {
            $response = wp_remote_post('https://api.indexnow.org/indexnow', array(
                'timeout' => 15,
                'headers' => array('Content-Type' => 'application/json; charset=utf-8'),
                'body' => wp_json_encode(array(
                    'host' => $host,
                    'key' => $key,
                    'keyLocation' => home_url('/' . $key . '.txt'),
                    'urlList' => $batch,
                )),
            ));
            if (is_wp_error($response)) {
                $responses[] = array('ok' => false, 'error' => $response->get_error_message());
                continue;
            }
            $code = wp_remote_retrieve_response_code($response);
            $ok = in_array($code, array(200, 202), true);
            if ($ok) {
                $submitted += count($batch);
            }
            $responses[] = array('ok' => $ok, 'http' => $code, 'count' => count($batch));
        }
        $result = array('submitted' => $submitted, 'requested' => count($urls), 'responses' => $responses, 'provider' => 'IndexNow');
        update_option('zica_posts_last_indexnow', array_merge($result, array('at' => current_time('mysql', true))), false);
        return $result;
    }

    private function api_key_from_request($request) {
        $candidates = array(
            $request->get_header('X-ZICA-POSTS-Key'),
            $request->get_header('X-ZICA-AI-API-Key'),
            $request->get_header('X-CFRDM-API-Key'),
            $request->get_param('api_key'),
        );
        $authorization = $request->get_header('Authorization');
        if ($authorization && 0 === stripos($authorization, 'Bearer ')) {
            $candidates[] = trim(substr($authorization, 7));
        }
        foreach ($candidates as $candidate) {
            if (is_string($candidate) && '' !== trim($candidate)) {
                return trim($candidate);
            }
        }
        return '';
    }

    public function verify_api_key($request) {
        $stored = (string) get_option('zica_posts_api_key', '');
        $provided = $this->api_key_from_request($request);
        if (!$stored || !$provided || !hash_equals($stored, $provided)) {
            return new WP_Error('zica_posts_unauthorized', __('API Key inválida ou ausente.', 'zica-posts'), array('status' => 401));
        }
        return true;
    }

    public function register_rest_routes() {
        $this->register_namespace('zica-posts/v1', true);
        $this->register_namespace('zica-ai/v1', true);
        $this->register_namespace('cfrdm/v1', false);
    }

    private function register_namespace($namespace, $full) {
        register_rest_route($namespace, '/version', array(
            'methods' => 'GET',
            'callback' => array($this, 'rest_version'),
            'permission_callback' => '__return_true',
        ));
        register_rest_route($namespace, '/health', array(
            'methods' => 'GET',
            'callback' => array($this, 'rest_health'),
            'permission_callback' => '__return_true',
        ));
        register_rest_route($namespace, '/test', array(
            'methods' => 'GET',
            'callback' => array($this, 'rest_test'),
            'permission_callback' => array($this, 'verify_api_key'),
        ));

        if (!$full) {
            return;
        }

        register_rest_route($namespace, '/status', array(
            'methods' => 'GET',
            'callback' => array($this, 'rest_status'),
            'permission_callback' => array($this, 'verify_api_key'),
        ));
        register_rest_route($namespace, '/sync', array(
            'methods' => 'POST',
            'callback' => array($this, 'rest_sync'),
            'permission_callback' => array($this, 'verify_api_key'),
        ));
        register_rest_route($namespace, '/files', array(
            'methods' => 'GET',
            'callback' => array($this, 'rest_files'),
            'permission_callback' => array($this, 'verify_api_key'),
        ));
        register_rest_route($namespace, '/cards/settings', array(
            array('methods' => 'GET', 'callback' => array($this, 'rest_cards_settings'), 'permission_callback' => array($this, 'verify_api_key')),
            array('methods' => 'POST', 'callback' => array($this, 'rest_cards_settings_update'), 'permission_callback' => array($this, 'verify_api_key')),
        ));
        register_rest_route($namespace, '/articles', array(
            array('methods' => 'GET', 'callback' => array($this, 'rest_articles'), 'permission_callback' => array($this, 'verify_api_key')),
            array('methods' => 'POST', 'callback' => array($this, 'rest_create_article'), 'permission_callback' => array($this, 'verify_api_key')),
        ));
        register_rest_route($namespace, '/media', array(
            'methods' => 'POST',
            'callback' => array($this, 'rest_media'),
            'permission_callback' => array($this, 'verify_api_key'),
        ));
    }

    public function rest_version() {
        return rest_ensure_response(array(
            'success' => true,
            'software_id' => ZICA_POSTS_SOFTWARE_ID,
            'name' => 'Zica Posts',
            'brand' => 'Zica.ai',
            'version' => ZICA_POSTS_VERSION,
            'api' => 'zica-posts/v1',
            'features' => array(
                'authenticated_endpoints' => true,
                'articles' => true,
                'media' => true,
                'indexnow' => true,
                'llms_txt' => true,
                'llms_full_txt' => true,
                'ai_txt' => true,
                'dynamic_sitemap' => true,
                'schema' => true,
                'automatic_cards' => true,
                'position_controls' => true,
                'daily_1500_sao_paulo' => true,
                'physical_file_fallback' => true,
            ),
        ));
    }

    public function rest_health() {
        return rest_ensure_response(array(
            'success' => true,
            'software_id' => ZICA_POSTS_SOFTWARE_ID,
            'version' => ZICA_POSTS_VERSION,
            'site' => home_url('/'),
            'timezone_job' => ZICA_POSTS_TZ,
            'timestamp' => $this->sao_paulo_now_iso(),
        ));
    }

    public function rest_test() {
        return rest_ensure_response(array(
            'success' => true,
            'message' => 'Zica Posts conectado.',
            'version' => ZICA_POSTS_VERSION,
            'site' => array(
                'name' => get_bloginfo('name'),
                'url' => home_url('/'),
                'version' => ZICA_POSTS_VERSION,
                'wordpress' => get_bloginfo('version'),
                'php' => PHP_VERSION,
            ),
        ));
    }

    public function rest_status() {
        $next = wp_next_scheduled(ZICA_POSTS_CRON_DAILY);
        $next_local = null;
        if ($next) {
            $dt = (new DateTimeImmutable('@' . $next))->setTimezone(new DateTimeZone(ZICA_POSTS_TZ));
            $next_local = $dt->format(DateTime::ATOM);
        }
        return rest_ensure_response(array(
            'success' => true,
            'software_id' => ZICA_POSTS_SOFTWARE_ID,
            'version' => ZICA_POSTS_VERSION,
            'next_daily_sync' => $next_local,
            'daily_rule' => '15:00 America/Sao_Paulo',
            'last_sync' => get_option('zica_posts_last_sync', null),
            'last_indexnow' => get_option('zica_posts_last_indexnow', null),
            'files' => get_option('zica_posts_discovery_files_status', array()),
            'cards' => array('position' => get_option('zica_posts_cards_position', 'after_content'), 'count' => (int) get_option('zica_posts_cards_count', 3)),
        ));
    }

    public function rest_sync($request) {
        $post_ids = $request->get_param('post_ids');
        $post_ids = is_array($post_ids) ? array_values(array_unique(array_map('absint', $post_ids))) : array();
        $files = $this->refresh_discovery_files();
        $urls = $post_ids ? $this->urls_from_post_ids($post_ids) : $this->urls_from_post_ids(get_posts(array('post_type' => array('post', 'page'), 'post_status' => 'publish', 'posts_per_page' => 200, 'orderby' => 'modified', 'order' => 'DESC', 'fields' => 'ids')));
        $indexnow = $this->submit_indexnow($urls);
        $result = array('success' => true, 'files' => $files, 'indexnow' => $indexnow, 'synced_at' => $this->sao_paulo_now_iso());
        update_option('zica_posts_last_sync', array_merge(array('mode' => 'api'), $result), false);
        return rest_ensure_response($result);
    }

    public function rest_files() {
        return rest_ensure_response(array('success' => true, 'files' => get_option('zica_posts_discovery_files_status', array()), 'manifest' => $this->manifest_data()));
    }

    public function rest_cards_settings() {
        return rest_ensure_response(array('success' => true, 'position' => get_option('zica_posts_cards_position', 'after_content'), 'count' => (int) get_option('zica_posts_cards_count', 3)));
    }

    public function rest_cards_settings_update($request) {
        $position = sanitize_key((string) $request->get_param('position'));
        $allowed = array('before_content', 'after_p2', 'after_p4', 'after_content', 'disabled');
        if ($position && in_array($position, $allowed, true)) {
            update_option('zica_posts_cards_position', $position, false);
        }
        $count = absint($request->get_param('count'));
        if ($count >= 1 && $count <= 6) {
            update_option('zica_posts_cards_count', $count, false);
        }
        return $this->rest_cards_settings();
    }

    public function rest_articles($request) {
        $page = max(1, absint($request->get_param('page')));
        $per_page = max(1, min(100, absint($request->get_param('per_page')) ?: 20));
        $query = new WP_Query(array('post_type' => array('post', 'page'), 'post_status' => array('publish', 'draft', 'pending', 'future'), 'paged' => $page, 'posts_per_page' => $per_page, 'orderby' => 'modified', 'order' => 'DESC'));
        $items = array();
        foreach ($query->posts as $post) {
            $items[] = array('id' => $post->ID, 'title' => $post->post_title, 'status' => $post->post_status, 'type' => $post->post_type, 'link' => get_permalink($post->ID), 'modified' => get_the_modified_date('c', $post));
        }
        return rest_ensure_response(array('success' => true, 'data' => $items, 'total' => (int) $query->found_posts, 'pages' => (int) $query->max_num_pages));
    }

    private function resolve_category_ids($values) {
        $ids = array();
        foreach ((array) $values as $value) {
            if (is_numeric($value)) {
                $ids[] = absint($value);
                continue;
            }
            $name = sanitize_text_field($value);
            if (!$name) {
                continue;
            }
            $term = term_exists($name, 'category');
            if (!$term) {
                $term = wp_insert_term($name, 'category');
            }
            if (!is_wp_error($term)) {
                $ids[] = is_array($term) ? absint($term['term_id']) : absint($term);
            }
        }
        return array_values(array_unique(array_filter($ids)));
    }

    public function rest_create_article($request) {
        $payload = $request->get_json_params();
        $payload = is_array($payload) ? $payload : array();
        $title = isset($payload['title']) ? sanitize_text_field($payload['title']) : '';
        $content = isset($payload['content']) ? wp_kses_post($payload['content']) : '';
        if (!$title || !$content) {
            return new WP_Error('zica_posts_invalid_article', __('Título e conteúdo são obrigatórios.', 'zica-posts'), array('status' => 400));
        }
        $allowed_status = array('publish', 'draft', 'pending', 'future');
        $status = isset($payload['status']) && in_array($payload['status'], $allowed_status, true) ? $payload['status'] : 'publish';
        $postarr = array(
            'post_type' => 'post',
            'post_status' => $status,
            'post_title' => $title,
            'post_content' => $content,
            'post_excerpt' => isset($payload['excerpt']) ? sanitize_textarea_field($payload['excerpt']) : '',
            'post_name' => isset($payload['slug']) ? sanitize_title($payload['slug']) : '',
        );
        if (isset($payload['categories']) && is_array($payload['categories'])) {
            $postarr['post_category'] = $this->resolve_category_ids($payload['categories']);
        }
        if (isset($payload['date_gmt'])) {
            $postarr['post_date_gmt'] = sanitize_text_field($payload['date_gmt']);
        }
        $post_id = wp_insert_post($postarr, true);
        if (is_wp_error($post_id)) {
            return $post_id;
        }
        if (!empty($payload['tags']) && is_array($payload['tags'])) {
            wp_set_post_tags($post_id, array_map('sanitize_text_field', $payload['tags']), false);
        }
        if (!empty($payload['featured_image_id'])) {
            set_post_thumbnail($post_id, absint($payload['featured_image_id']));
        }
        if (!empty($payload['zica_ai_id'])) {
            update_post_meta($post_id, '_zica_ai_id', sanitize_text_field($payload['zica_ai_id']));
        }
        if (!empty($payload['cfrdm_id'])) {
            update_post_meta($post_id, '_cfrdm_id', sanitize_text_field($payload['cfrdm_id']));
        }
        if (!empty($payload['json_ld_schemas']) && is_array($payload['json_ld_schemas'])) {
            $schemas = array_values(array_filter($payload['json_ld_schemas'], 'is_array'));
            update_post_meta($post_id, '_zica_posts_json_ld', $schemas);
        }
        $this->apply_seo_meta($post_id, $payload);
        if ('publish' === $status) {
            $this->queue_sync($post_id);
        }
        return new WP_REST_Response(array('success' => true, 'data' => array('id' => $post_id, 'link' => get_permalink($post_id), 'status' => get_post_status($post_id))), 201);
    }

    private function apply_seo_meta($post_id, $payload) {
        $title = isset($payload['seo_title']) ? sanitize_text_field($payload['seo_title']) : '';
        $description = isset($payload['seo_description']) ? sanitize_textarea_field($payload['seo_description']) : '';
        $keyword = isset($payload['focus_keyword']) ? sanitize_text_field($payload['focus_keyword']) : '';
        if ($title) {
            update_post_meta($post_id, 'rank_math_title', $title);
            update_post_meta($post_id, '_yoast_wpseo_title', $title);
        }
        if ($description) {
            update_post_meta($post_id, 'rank_math_description', $description);
            update_post_meta($post_id, '_yoast_wpseo_metadesc', $description);
        }
        if ($keyword) {
            update_post_meta($post_id, 'rank_math_focus_keyword', $keyword);
            update_post_meta($post_id, '_yoast_wpseo_focuskw', $keyword);
        }
    }

    public function rest_media($request) {
        $payload = $request->get_json_params();
        $payload = is_array($payload) ? $payload : array();
        $data = isset($payload['image_data']) ? (string) $payload['image_data'] : '';
        if (!preg_match('#^data:image/(png|jpe?g|webp|gif);base64,(.+)$#i', $data, $matches)) {
            return new WP_Error('zica_posts_invalid_media', __('Imagem base64 inválida.', 'zica-posts'), array('status' => 400));
        }
        $binary = base64_decode($matches[2], true);
        if (false === $binary || strlen($binary) > 8 * 1024 * 1024) {
            return new WP_Error('zica_posts_media_too_large', __('Imagem inválida ou maior que 8 MB.', 'zica-posts'), array('status' => 413));
        }
        $ext = strtolower($matches[1]);
        if ('jpeg' === $ext) {
            $ext = 'jpg';
        }
        $filename = isset($payload['filename']) ? sanitize_file_name($payload['filename']) : ('zica-' . time() . '.' . $ext);
        if (false === strpos($filename, '.')) {
            $filename .= '.' . $ext;
        }
        $upload = wp_upload_bits($filename, null, $binary);
        if (!empty($upload['error'])) {
            return new WP_Error('zica_posts_upload_error', $upload['error'], array('status' => 500));
        }
        $mime_map = array('png' => 'image/png', 'jpg' => 'image/jpeg', 'webp' => 'image/webp', 'gif' => 'image/gif');
        $attachment_id = wp_insert_attachment(array('post_mime_type' => $mime_map[$ext], 'post_title' => sanitize_text_field(pathinfo($filename, PATHINFO_FILENAME)), 'post_status' => 'inherit'), $upload['file']);
        if (is_wp_error($attachment_id)) {
            return $attachment_id;
        }
        require_once ABSPATH . 'wp-admin/includes/image.php';
        $metadata = wp_generate_attachment_metadata($attachment_id, $upload['file']);
        wp_update_attachment_metadata($attachment_id, $metadata);
        if (!empty($payload['alt_text'])) {
            update_post_meta($attachment_id, '_wp_attachment_image_alt', sanitize_text_field($payload['alt_text']));
        }
        return new WP_REST_Response(array('success' => true, 'data' => array('id' => $attachment_id, 'url' => wp_get_attachment_url($attachment_id))), 201);
    }

    public function register_settings() {
        register_setting('zica_posts_settings', 'zica_posts_cards_position', array('sanitize_callback' => array($this, 'sanitize_position')));
        register_setting('zica_posts_settings', 'zica_posts_cards_count', array('sanitize_callback' => array($this, 'sanitize_count')));
        register_setting('zica_posts_settings', 'zica_posts_ai_crawlers_enabled', array('sanitize_callback' => array($this, 'sanitize_checkbox')));
        register_setting('zica_posts_settings', 'zica_posts_physical_files_enabled', array('sanitize_callback' => array($this, 'sanitize_checkbox')));
    }

    public function sanitize_position($value) {
        $allowed = array('before_content', 'after_p2', 'after_p4', 'after_content', 'disabled');
        return in_array($value, $allowed, true) ? $value : 'after_content';
    }

    public function sanitize_count($value) {
        return max(1, min(6, absint($value)));
    }

    public function sanitize_checkbox($value) {
        return $value ? '1' : '0';
    }

    public function admin_menu() {
        add_menu_page('Zica Posts', 'Zica Posts', 'manage_options', 'zica-posts', array($this, 'admin_page'), 'dashicons-networking', 58);
    }

    public function admin_assets($hook) {
        if ('toplevel_page_zica-posts' !== $hook) {
            return;
        }
        wp_enqueue_style('zica-posts-admin', ZICA_POSTS_URL . 'assets/admin.css', array(), ZICA_POSTS_VERSION);
    }

    public function admin_page() {
        if (!current_user_can('manage_options')) {
            return;
        }
        $last = get_option('zica_posts_last_sync', array());
        $next = wp_next_scheduled(ZICA_POSTS_CRON_DAILY);
        $next_local = 'não agendado';
        if ($next) {
            $next_local = (new DateTimeImmutable('@' . $next))->setTimezone(new DateTimeZone(ZICA_POSTS_TZ))->format('d/m/Y H:i:s T');
        }
        $key = (string) get_option('zica_posts_api_key', '');
        ?>
        <div class="wrap zica-posts-admin">
            <div class="zica-posts-hero"><span class="zica-posts-kicker">ZICA.AI • SOFTWARE ID: <?php echo esc_html(ZICA_POSTS_SOFTWARE_ID); ?></span><h1>Zica Posts 3.10.0</h1><p>WordPress conectado ao Cérebro de Tráfego: conteúdo, GEO, Schema, LLMs, sitemaps e IndexNow em um único fluxo.</p></div>
            <div class="zica-posts-grid">
                <section class="zica-posts-panel"><h2>Conexão</h2><p><strong>API:</strong> <code>/wp-json/zica-posts/v1/</code></p><p><strong>Header:</strong> <code>X-ZICA-POSTS-Key</code> ou <code>X-ZICA-AI-API-Key</code></p><p><strong>API Key:</strong> <code><?php echo esc_html($key); ?></code></p></section>
                <section class="zica-posts-panel"><h2>Automação 15h</h2><p><strong>Fuso:</strong> America/Sao_Paulo</p><p><strong>Próxima execução:</strong> <?php echo esc_html($next_local); ?></p><p><strong>Último sync:</strong> <?php echo esc_html(isset($last['at']) ? $last['at'] : 'ainda não executado'); ?></p></section>
            </div>
            <form method="post" action="options.php" class="zica-posts-panel zica-posts-settings">
                <?php settings_fields('zica_posts_settings'); ?>
                <h2>Cards automáticos e descoberta</h2>
                <label>Posição dos cards
                    <select name="zica_posts_cards_position">
                        <?php foreach (array('before_content' => 'Antes do conteúdo', 'after_p2' => 'Após o 2º parágrafo', 'after_p4' => 'Após o 4º parágrafo', 'after_content' => 'Após o conteúdo', 'disabled' => 'Desativado') as $value => $label) : ?>
                            <option value="<?php echo esc_attr($value); ?>" <?php selected(get_option('zica_posts_cards_position', 'after_content'), $value); ?>><?php echo esc_html($label); ?></option>
                        <?php endforeach; ?>
                    </select>
                </label>
                <label>Quantidade <input type="number" min="1" max="6" name="zica_posts_cards_count" value="<?php echo esc_attr(get_option('zica_posts_cards_count', 3)); ?>"></label>
                <label><input type="checkbox" name="zica_posts_ai_crawlers_enabled" value="1" <?php checked(get_option('zica_posts_ai_crawlers_enabled', '1'), '1'); ?>> Permitir crawlers de IA conhecidos no robots.txt</label>
                <label><input type="checkbox" name="zica_posts_physical_files_enabled" value="1" <?php checked(get_option('zica_posts_physical_files_enabled', '1'), '1'); ?>> Gravar arquivos físicos quando o File Manager permitir</label>
                <?php submit_button('Salvar configurações'); ?>
            </form>
            <div class="zica-posts-panel"><h2>Documentos mantidos pelo plugin</h2><p><code>/llms.txt</code> • <code>/llms-full.txt</code> • <code>/ai.txt</code> • <code>/zica-ai-manifest.json</code> • <code>/zica-ai-sitemap.xml</code></p><p>Se o diretório raiz não for gravável, o plugin entrega os mesmos documentos dinamicamente via WordPress, sem interromper o site.</p></div>
        </div>
        <?php
    }
}

register_activation_hook(__FILE__, array('Zica_Posts_310', 'activate'));
register_deactivation_hook(__FILE__, array('Zica_Posts_310', 'deactivate'));
Zica_Posts_310::instance();
