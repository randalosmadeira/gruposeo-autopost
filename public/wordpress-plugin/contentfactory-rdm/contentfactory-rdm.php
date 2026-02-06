<?php
/**
 * Plugin Name: ContentFactory RDM
 * Plugin URI: https://gruposeo.marketing/contentfactory
 * Description: Integração avançada com ContentFactory para publicação automática de artigos, sincronização, otimização de imagens, links internos e indexação SEO automática.
 * Version: 2.1.0
 * Author: GRUPO SEO MARKETING
 * Author URI: https://gruposeo.marketing
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: contentfactory-rdm
 * Domain Path: /languages
 * Requires at least: 5.8
 * Requires PHP: 7.4
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

// Plugin constants
define('CFRDM_VERSION', '2.1.0');
define('CFRDM_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('CFRDM_PLUGIN_URL', plugin_dir_url(__FILE__));
define('CFRDM_PLUGIN_BASENAME', plugin_basename(__FILE__));
define('CFRDM_LOG_TABLE', 'cfrdm_logs');
define('CFRDM_NEWS_TABLE', 'cfrdm_news');

// Include required files
require_once CFRDM_PLUGIN_DIR . 'includes/class-cfrdm-api.php';
require_once CFRDM_PLUGIN_DIR . 'includes/class-cfrdm-webhooks.php';
require_once CFRDM_PLUGIN_DIR . 'includes/class-cfrdm-articles.php';
require_once CFRDM_PLUGIN_DIR . 'includes/class-cfrdm-admin.php';
require_once CFRDM_PLUGIN_DIR . 'includes/class-cfrdm-logger.php';
require_once CFRDM_PLUGIN_DIR . 'includes/class-cfrdm-image-optimizer.php';
require_once CFRDM_PLUGIN_DIR . 'includes/class-cfrdm-sync.php';
require_once CFRDM_PLUGIN_DIR . 'includes/class-cfrdm-internal-links.php';
require_once CFRDM_PLUGIN_DIR . 'includes/class-cfrdm-indexing.php';

/**
 * Main plugin class
 */
class ContentFactory_RDM {
    
    private static $instance = null;
    
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    private function __construct() {
        $this->init_hooks();
    }
    
    private function init_hooks() {
        // Activation/Deactivation hooks
        register_activation_hook(__FILE__, array($this, 'activate'));
        register_deactivation_hook(__FILE__, array($this, 'deactivate'));
        
        // Admin hooks
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_assets'));
        add_action('admin_init', array($this, 'register_settings'));
        
        // REST API
        add_action('rest_api_init', array($this, 'register_rest_routes'));
        
        // Webhooks
        add_action('transition_post_status', array('CFRDM_Webhooks', 'on_post_status_change'), 10, 3);
        add_action('before_delete_post', array('CFRDM_Webhooks', 'on_post_delete'));
        
        // Image optimization hooks
        add_action('add_attachment', array('CFRDM_Image_Optimizer', 'optimize_on_upload'));
        add_filter('wp_generate_attachment_metadata', array('CFRDM_Image_Optimizer', 'optimize_thumbnails'), 10, 2);
        
        // Auto-correction hooks
        add_action('save_post', array('CFRDM_Sync', 'auto_correct_post'), 20, 3);
        
        // Internal linking hooks
        new CFRDM_Internal_Links();
        
        // Plugin action links
        add_filter('plugin_action_links_' . CFRDM_PLUGIN_BASENAME, array($this, 'add_action_links'));
        
        // AJAX handlers
        add_action('wp_ajax_cfrdm_clear_logs', array('CFRDM_Admin', 'ajax_clear_logs'));
        add_action('wp_ajax_cfrdm_export_logs', array('CFRDM_Admin', 'ajax_export_logs'));
        add_action('wp_ajax_cfrdm_sync_stats', array('CFRDM_Admin', 'ajax_sync_stats'));
        add_action('wp_ajax_cfrdm_dismiss_news', array('CFRDM_Admin', 'ajax_dismiss_news'));
        add_action('wp_ajax_cfrdm_run_autocorrect', array('CFRDM_Admin', 'ajax_run_autocorrect'));
        add_action('wp_ajax_cfrdm_analyze_links', array('CFRDM_Admin', 'ajax_analyze_links'));
        add_action('wp_ajax_cfrdm_generate_links', array('CFRDM_Admin', 'ajax_generate_links'));
        
        // Cron jobs
        add_action('cfrdm_daily_cleanup', array($this, 'daily_cleanup'));
        add_action('cfrdm_sync_stats', array('CFRDM_Sync', 'sync_stats_to_platform'));
        add_action('cfrdm_fetch_news', array('CFRDM_Sync', 'fetch_platform_news'));
        
        // Schedule cron jobs
        if (!wp_next_scheduled('cfrdm_daily_cleanup')) {
            wp_schedule_event(time(), 'daily', 'cfrdm_daily_cleanup');
        }
        if (!wp_next_scheduled('cfrdm_sync_stats')) {
            wp_schedule_event(time(), 'hourly', 'cfrdm_sync_stats');
        }
        if (!wp_next_scheduled('cfrdm_fetch_news')) {
            wp_schedule_event(time(), 'twicedaily', 'cfrdm_fetch_news');
        }
    }
    
    public function activate() {
        // Generate API key if not exists
        if (!get_option('cfrdm_api_key')) {
            update_option('cfrdm_api_key', wp_generate_uuid4());
        }
        
        // Set default options
        $defaults = array(
            'cfrdm_enabled' => true,
            'cfrdm_webhook_enabled' => true,
            'cfrdm_auto_publish' => false,
            'cfrdm_default_status' => 'draft',
            'cfrdm_default_category' => 0,
            'cfrdm_api_url' => '',
            'cfrdm_auto_optimize_images' => true,
            'cfrdm_image_max_width' => 1200,
            'cfrdm_image_quality' => 85,
            'cfrdm_auto_correct' => true,
            'cfrdm_log_retention_days' => 30,
        );
        
        foreach ($defaults as $key => $value) {
            if (get_option($key) === false) {
                update_option($key, $value);
            }
        }
        
        // Create database tables
        $this->create_tables();
        
        // Flush rewrite rules
        flush_rewrite_rules();
        
        // Log activation
        CFRDM_Logger::log('system', 'Plugin ativado', array('version' => CFRDM_VERSION));
    }
    
    public function deactivate() {
        // Clear scheduled events
        wp_clear_scheduled_hook('cfrdm_daily_cleanup');
        wp_clear_scheduled_hook('cfrdm_sync_stats');
        wp_clear_scheduled_hook('cfrdm_fetch_news');
        
        flush_rewrite_rules();
        
        CFRDM_Logger::log('system', 'Plugin desativado');
    }
    
    private function create_tables() {
        global $wpdb;
        
        $charset_collate = $wpdb->get_charset_collate();
        
        // Logs table
        $logs_table = $wpdb->prefix . CFRDM_LOG_TABLE;
        $sql_logs = "CREATE TABLE IF NOT EXISTS $logs_table (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            log_type varchar(50) NOT NULL DEFAULT 'info',
            category varchar(50) NOT NULL DEFAULT 'general',
            message text NOT NULL,
            context longtext,
            post_id bigint(20) DEFAULT NULL,
            user_id bigint(20) DEFAULT NULL,
            ip_address varchar(45) DEFAULT NULL,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY log_type (log_type),
            KEY category (category),
            KEY post_id (post_id),
            KEY created_at (created_at)
        ) $charset_collate;";
        
        // News/Updates table
        $news_table = $wpdb->prefix . CFRDM_NEWS_TABLE;
        $sql_news = "CREATE TABLE IF NOT EXISTS $news_table (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            news_id varchar(100) NOT NULL,
            title varchar(255) NOT NULL,
            content text,
            news_type varchar(50) DEFAULT 'update',
            priority int(11) DEFAULT 0,
            link varchar(500) DEFAULT NULL,
            is_read tinyint(1) DEFAULT 0,
            is_dismissed tinyint(1) DEFAULT 0,
            published_at datetime DEFAULT NULL,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY news_id (news_id),
            KEY news_type (news_type),
            KEY is_dismissed (is_dismissed)
        ) $charset_collate;";
        
        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        dbDelta($sql_logs);
        dbDelta($sql_news);
    }
    
    public function add_admin_menu() {
        // Get unread news count
        $unread_count = CFRDM_Sync::get_unread_news_count();
        $menu_title = __('ContentFactory', 'contentfactory-rdm');
        if ($unread_count > 0) {
            $menu_title .= ' <span class="awaiting-mod">' . $unread_count . '</span>';
        }
        
        // Main menu
        add_menu_page(
            __('ContentFactory RDM', 'contentfactory-rdm'),
            $menu_title,
            'manage_options',
            'cfrdm-dashboard',
            array('CFRDM_Admin', 'render_dashboard'),
            'dashicons-edit-page',
            30
        );
        
        // Submenus
        add_submenu_page(
            'cfrdm-dashboard',
            __('Dashboard', 'contentfactory-rdm'),
            __('Dashboard', 'contentfactory-rdm'),
            'manage_options',
            'cfrdm-dashboard',
            array('CFRDM_Admin', 'render_dashboard')
        );
        
        add_submenu_page(
            'cfrdm-dashboard',
            __('Artigos', 'contentfactory-rdm'),
            __('Artigos', 'contentfactory-rdm'),
            'manage_options',
            'cfrdm-articles',
            array('CFRDM_Admin', 'render_articles')
        );
        
        add_submenu_page(
            'cfrdm-dashboard',
            __('Sincronização', 'contentfactory-rdm'),
            __('Sincronização', 'contentfactory-rdm'),
            'manage_options',
            'cfrdm-sync',
            array('CFRDM_Admin', 'render_sync')
        );
        
        $news_title = __('Notícias', 'contentfactory-rdm');
        if ($unread_count > 0) {
            $news_title .= ' <span class="awaiting-mod">' . $unread_count . '</span>';
        }
        add_submenu_page(
            'cfrdm-dashboard',
            __('Notícias e Atualizações', 'contentfactory-rdm'),
            $news_title,
            'manage_options',
            'cfrdm-news',
            array('CFRDM_Admin', 'render_news')
        );
        
        add_submenu_page(
            'cfrdm-dashboard',
            __('Logs', 'contentfactory-rdm'),
            __('Logs', 'contentfactory-rdm'),
            'manage_options',
            'cfrdm-logs',
            array('CFRDM_Admin', 'render_logs')
        );
        
        add_submenu_page(
            'cfrdm-dashboard',
            __('Configurações', 'contentfactory-rdm'),
            __('Configurações', 'contentfactory-rdm'),
            'manage_options',
            'cfrdm-settings',
            array('CFRDM_Admin', 'render_settings')
        );
    }
    
    public function enqueue_admin_assets($hook) {
        if (strpos($hook, 'cfrdm') === false) {
            return;
        }
        
        wp_enqueue_style(
            'cfrdm-admin',
            CFRDM_PLUGIN_URL . 'assets/css/admin.css',
            array(),
            CFRDM_VERSION
        );
        
        wp_enqueue_script(
            'cfrdm-admin',
            CFRDM_PLUGIN_URL . 'assets/js/admin.js',
            array('jquery'),
            CFRDM_VERSION,
            true
        );
        
        // Chart.js for stats
        wp_enqueue_script(
            'chartjs',
            'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
            array(),
            '4.4.1',
            true
        );
        
        wp_localize_script('cfrdm-admin', 'cfrdmAdmin', array(
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'restUrl' => rest_url('cfrdm/v1/'),
            'nonce' => wp_create_nonce('cfrdm_nonce'),
            'apiKey' => get_option('cfrdm_api_key'),
            'siteUrl' => get_site_url(),
            'strings' => array(
                'testSuccess' => __('Conexão estabelecida com sucesso!', 'contentfactory-rdm'),
                'testError' => __('Erro ao testar conexão.', 'contentfactory-rdm'),
                'copied' => __('Copiado!', 'contentfactory-rdm'),
                'confirm_regenerate' => __('Tem certeza que deseja regenerar a API Key? Você precisará atualizar a configuração no ContentFactory.', 'contentfactory-rdm'),
                'confirm_clear_logs' => __('Tem certeza que deseja limpar todos os logs?', 'contentfactory-rdm'),
                'logs_cleared' => __('Logs limpos com sucesso!', 'contentfactory-rdm'),
                'syncing' => __('Sincronizando...', 'contentfactory-rdm'),
                'sync_complete' => __('Sincronização concluída!', 'contentfactory-rdm'),
                'auto_correcting' => __('Executando autocorreções...', 'contentfactory-rdm'),
                'auto_correct_complete' => __('Autocorreções concluídas!', 'contentfactory-rdm'),
            ),
        ));
    }
    
    public function register_settings() {
        // Connection settings
        register_setting('cfrdm_settings', 'cfrdm_enabled');
        register_setting('cfrdm_settings', 'cfrdm_api_url');
        register_setting('cfrdm_settings', 'cfrdm_api_key');
        
        // Webhook settings
        register_setting('cfrdm_settings', 'cfrdm_webhook_enabled');
        register_setting('cfrdm_settings', 'cfrdm_webhook_secret');
        
        // Publishing settings
        register_setting('cfrdm_settings', 'cfrdm_auto_publish');
        register_setting('cfrdm_settings', 'cfrdm_default_status');
        register_setting('cfrdm_settings', 'cfrdm_default_category');
        register_setting('cfrdm_settings', 'cfrdm_default_author');
        
        // Image settings
        register_setting('cfrdm_settings', 'cfrdm_auto_optimize_images');
        register_setting('cfrdm_settings', 'cfrdm_image_max_width');
        register_setting('cfrdm_settings', 'cfrdm_image_quality');
        
        // Auto-correction settings
        register_setting('cfrdm_settings', 'cfrdm_auto_correct');
        register_setting('cfrdm_settings', 'cfrdm_auto_correct_seo');
        register_setting('cfrdm_settings', 'cfrdm_auto_correct_images');
        register_setting('cfrdm_settings', 'cfrdm_auto_correct_links');
        
        // Logging settings
        register_setting('cfrdm_settings', 'cfrdm_log_retention_days');
        register_setting('cfrdm_settings', 'cfrdm_log_api_calls');
        register_setting('cfrdm_settings', 'cfrdm_log_webhooks');
    }
    
    public function register_rest_routes() {
        CFRDM_API::register_routes();
    }
    
    public function add_action_links($links) {
        $plugin_links = array(
            '<a href="' . admin_url('admin.php?page=cfrdm-settings') . '">' . __('Configurações', 'contentfactory-rdm') . '</a>',
        );
        return array_merge($plugin_links, $links);
    }
    
    public function daily_cleanup() {
        // Clean old logs
        $retention_days = get_option('cfrdm_log_retention_days', 30);
        CFRDM_Logger::cleanup_old_logs($retention_days);
        
        // Clean old dismissed news
        CFRDM_Sync::cleanup_old_news(60);
        
        CFRDM_Logger::log('system', 'Limpeza diária executada', array(
            'log_retention_days' => $retention_days
        ));
    }
}

// Initialize plugin
ContentFactory_RDM::get_instance();
