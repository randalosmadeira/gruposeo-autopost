<?php
/**
 * Plugin Name: Zica Posts — Conector WordPress Oficial Zica.ai
 * Plugin URI: https://zica.ai
 * Description: Agente WordPress leve da Zica.ai com outbox persistente, HMAC, idempotência, GEO/Schema, discovery LLM, IndexNow em lote, cards e integração com Zica Orchestrator.
 * Version: 3.10.2
 * Author: Equipe Zica.ai
 * Author URI: https://zica.ai
 * License: GPL v2 or later
 * Text Domain: zica-posts
 * Requires at least: 5.8
 * Requires PHP: 7.4
 */

if (!defined('ABSPATH')) exit;

define('ZICA_POSTS_VERSION', '3.10.2');
define('ZICA_POSTS_SOFTWARE_ID', 'zica-posts');
define('ZICA_POSTS_FILE', __FILE__);
define('ZICA_POSTS_DIR', plugin_dir_path(__FILE__));
define('ZICA_POSTS_URL', plugin_dir_url(__FILE__));
define('ZICA_POSTS_TZ', 'America/Sao_Paulo');
define('ZICA_POSTS_CRON_DAILY', 'zica_posts_daily_1500_sync');
define('ZICA_POSTS_CRON_OUTBOX', 'zica_posts_process_outbox');
define('ZICA_POSTS_CRON_DISCOVERY', 'zica_posts_refresh_discovery');
define('ZICA_POSTS_OUTBOX_TABLE', 'zica_posts_outbox');

require_once ZICA_POSTS_DIR . 'includes/class-zica-posts-auth.php';
require_once ZICA_POSTS_DIR . 'includes/class-zica-posts-discovery.php';
require_once ZICA_POSTS_DIR . 'includes/class-zica-posts-outbox.php';
require_once ZICA_POSTS_DIR . 'includes/class-zica-posts-cards.php';
require_once ZICA_POSTS_DIR . 'includes/class-zica-posts-rest.php';
require_once ZICA_POSTS_DIR . 'includes/class-zica-posts-admin.php';

final class Zica_Posts_3102 {
    private static $instance = null;
    public $auth;
    public $discovery;
    public $outbox;
    public $cards;
    public $rest;
    public $admin;

    public static function instance() {
        if (null === self::$instance) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        $this->auth = new Zica_Posts_Auth();
        $this->discovery = new Zica_Posts_Discovery($this->auth);
        $this->outbox = new Zica_Posts_Outbox($this->auth, $this->discovery);
        $this->cards = new Zica_Posts_Cards();
        $this->rest = new Zica_Posts_REST($this->auth, $this->discovery, $this->outbox, $this->cards);
        $this->admin = new Zica_Posts_Admin($this->auth, $this->discovery, $this->outbox);

        add_filter('cron_schedules', array($this, 'cron_schedules'));
        add_action('init', array($this, 'ensure_runtime'));
    }

    public function cron_schedules($schedules) {
        if (!isset($schedules['five_minutes'])) {
            $schedules['five_minutes'] = array('interval' => 300, 'display' => 'A cada 5 minutos');
        }
        return $schedules;
    }

    public function ensure_runtime() {
        $this->auth->ensure_secrets();
        $this->outbox->ensure_table();
        $this->outbox->ensure_schedules();
    }

    public static function activate() {
        $auth = new Zica_Posts_Auth();
        $discovery = new Zica_Posts_Discovery($auth);
        $outbox = new Zica_Posts_Outbox($auth, $discovery);

        $auth->ensure_secrets();
        $outbox->ensure_table();

        add_option('zica_posts_cards_position', 'after_content');
        add_option('zica_posts_cards_count', 3);
        add_option('zica_posts_ai_crawlers_enabled', '1');
        add_option('zica_posts_physical_files_enabled', '1');
        add_option('zica_posts_hub_enabled', '0');
        add_option('zica_posts_hub_webhook_url', '');
        add_option('zica_posts_hub_delegates_indexing', '1');
        add_option('zica_posts_hub_delegates_discovery', '0');

        $outbox->clear_schedules();
        $outbox->ensure_schedules();
        wp_schedule_single_event(time() + 10, ZICA_POSTS_CRON_DISCOVERY);
    }

    public static function deactivate() {
        $auth = new Zica_Posts_Auth();
        $discovery = new Zica_Posts_Discovery($auth);
        $outbox = new Zica_Posts_Outbox($auth, $discovery);
        $outbox->clear_schedules();
    }
}

register_activation_hook(__FILE__, array('Zica_Posts_3102', 'activate'));
register_deactivation_hook(__FILE__, array('Zica_Posts_3102', 'deactivate'));
Zica_Posts_3102::instance();
