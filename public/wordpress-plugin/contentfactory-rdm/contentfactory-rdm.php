<?php
/**
 * Plugin Name: ContentFactory RDM
 * Plugin URI: https://contentfactory.rdm.com.br
 * Description: Integração completa com a plataforma ContentFactory RDM para gestão de artigos SEO, publicação automática e sincronização bidirecional.
 * Version: 1.0.0
 * Author: ContentFactory RDM
 * Author URI: https://contentfactory.rdm.com.br
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
define('CFRDM_VERSION', '1.0.0');
define('CFRDM_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('CFRDM_PLUGIN_URL', plugin_dir_url(__FILE__));
define('CFRDM_PLUGIN_BASENAME', plugin_basename(__FILE__));

// Include required files
require_once CFRDM_PLUGIN_DIR . 'includes/class-cfrdm-api.php';
require_once CFRDM_PLUGIN_DIR . 'includes/class-cfrdm-webhooks.php';
require_once CFRDM_PLUGIN_DIR . 'includes/class-cfrdm-articles.php';
require_once CFRDM_PLUGIN_DIR . 'includes/class-cfrdm-admin.php';

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
        
        // Plugin action links
        add_filter('plugin_action_links_' . CFRDM_PLUGIN_BASENAME, array($this, 'add_action_links'));
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
        );
        
        foreach ($defaults as $key => $value) {
            if (get_option($key) === false) {
                update_option($key, $value);
            }
        }
        
        // Flush rewrite rules
        flush_rewrite_rules();
    }
    
    public function deactivate() {
        flush_rewrite_rules();
    }
    
    public function add_admin_menu() {
        // Main menu
        add_menu_page(
            __('ContentFactory RDM', 'contentfactory-rdm'),
            __('ContentFactory', 'contentfactory-rdm'),
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
            __('Configurações', 'contentfactory-rdm'),
            __('Configurações', 'contentfactory-rdm'),
            'manage_options',
            'cfrdm-settings',
            array('CFRDM_Admin', 'render_settings')
        );
        
        add_submenu_page(
            'cfrdm-dashboard',
            __('Logs', 'contentfactory-rdm'),
            __('Logs', 'contentfactory-rdm'),
            'manage_options',
            'cfrdm-logs',
            array('CFRDM_Admin', 'render_logs')
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
}

// Initialize plugin
ContentFactory_RDM::get_instance();
