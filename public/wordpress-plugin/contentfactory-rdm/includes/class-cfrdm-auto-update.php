<?php
/**
 * Auto-Update System
 * 
 * Sistema de atualização automática do plugin
 * sem necessidade de download/reinstalação manual
 * 
 * @package ContentFactory_RDM
 * @since 3.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_Auto_Update {
    
    const OPTION_ENABLED = 'cfrdm_auto_update_enabled';
    const OPTION_LAST_CHECK = 'cfrdm_auto_update_last_check';
    const OPTION_UPDATE_INFO = 'cfrdm_update_info';
    const BACKUP_DIR = 'cfrdm-backups';
    
    // ContentFactory update server URLs
    const UPDATE_API_URL = 'https://gruposeo-autopost.lovable.app/api/plugin-updates';
    const PLUGIN_DOWNLOAD_URL = 'https://gruposeo-autopost.lovable.app/wordpress-plugin/contentfactory-rdm/';
    
    private static $instance = null;
    
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    public function __construct() {
        // Constructor
    }
    
    /**
     * Initialize auto-update system
     */
    public function init() {
        // Check for updates on admin init
        add_action('admin_init', array($this, 'maybe_check_updates'));
        
        // Register cron job
        add_action('cfrdm_check_updates', array($this, 'check_for_updates'));
        
        // Schedule daily check
        if (!wp_next_scheduled('cfrdm_check_updates')) {
            wp_schedule_event(time(), 'daily', 'cfrdm_check_updates');
        }
        
        // Add update notification
        add_action('admin_notices', array($this, 'show_update_notice'));
        
        // AJAX handlers
        add_action('wp_ajax_cfrdm_apply_update', array($this, 'ajax_apply_update'));
        add_action('wp_ajax_cfrdm_rollback_update', array($this, 'ajax_rollback_update'));
    }
    
    /**
     * Check if auto-update is enabled
     */
    public static function is_enabled() {
        return get_option(self::OPTION_ENABLED, false);
    }
    
    /**
     * Maybe check for updates (rate limited)
     */
    public function maybe_check_updates() {
        $last_check = get_option(self::OPTION_LAST_CHECK, 0);
        
        // Check at most once per hour
        if (time() - $last_check < HOUR_IN_SECONDS) {
            return;
        }
        
        $this->check_for_updates();
    }
    
    /**
     * Check for available updates
     * 
     * @return array|false Update info or false if no update
     */
    public function check_for_updates() {
        // Try remote API first
        $update_info = $this->check_remote_api();
        
        // If remote fails, try local version check against public manifest
        if (!$update_info) {
            $update_info = $this->check_local_manifest();
        }
        
        update_option(self::OPTION_LAST_CHECK, time());
        
        if ($update_info) {
            update_option(self::OPTION_UPDATE_INFO, $update_info);
            
            CFRDM_Logger::info('auto_update', 'Atualização disponível', array(
                'current' => CFRDM_VERSION,
                'new' => $update_info['version'],
            ));
            
            // Auto-apply if enabled
            if (self::is_enabled()) {
                $this->apply_update_patch();
            }
            
            return $update_info;
        }
        
        delete_option(self::OPTION_UPDATE_INFO);
        return false;
    }
    
    /**
     * Check remote API for updates
     */
    private function check_remote_api() {
        $response = wp_remote_get(self::UPDATE_API_URL . '?current_version=' . CFRDM_VERSION, array(
            'timeout' => 15,
            'headers' => array(
                'Accept' => 'application/json',
            ),
        ));
        
        if (is_wp_error($response)) {
            CFRDM_Logger::warning('auto_update', 'Erro ao verificar atualizações via API', array(
                'error' => $response->get_error_message(),
            ));
            return null;
        }
        
        $body = json_decode(wp_remote_retrieve_body($response), true);
        
        if (isset($body['update_available']) && $body['update_available']) {
            return array(
                'version' => $body['version'],
                'download_url' => $body['download_url'] ?? self::PLUGIN_DOWNLOAD_URL,
                'patch_url' => $body['patch_url'] ?? null,
                'changelog' => $body['changelog'] ?? '',
                'requires_php' => $body['requires_php'] ?? '7.4',
                'requires_wp' => $body['requires_wp'] ?? '5.8',
                'checked_at' => current_time('mysql'),
            );
        }
        
        return null;
    }
    
    /**
     * Check local manifest for updates (fallback)
     * Compares against version.json in the ContentFactory server
     */
    private function check_local_manifest() {
        $response = wp_remote_get(self::PLUGIN_DOWNLOAD_URL . 'version.json', array(
            'timeout' => 10,
            'headers' => array('Accept' => 'application/json'),
        ));
        
        if (is_wp_error($response)) {
            return null;
        }
        
        $manifest = json_decode(wp_remote_retrieve_body($response), true);
        
        if (!isset($manifest['version'])) {
            return null;
        }
        
        if (version_compare($manifest['version'], CFRDM_VERSION, '>')) {
            return array(
                'version' => $manifest['version'],
                'download_url' => $manifest['download_url'] ?? self::PLUGIN_DOWNLOAD_URL,
                'patch_url' => null,
                'changelog' => $manifest['changelog'] ?? '',
                'requires_php' => $manifest['requires_php'] ?? '7.4',
                'requires_wp' => $manifest['requires_wp'] ?? '5.8',
                'checked_at' => current_time('mysql'),
            );
        }
        
        return null;
    }
    
    /**
     * Get pending update info
     */
    public static function get_update_info() {
        return get_option(self::OPTION_UPDATE_INFO);
    }
    
    /**
     * Show update notification in admin
     */
    public function show_update_notice() {
        if (!current_user_can('update_plugins')) {
            return;
        }
        
        $update_info = self::get_update_info();
        
        if (!$update_info) {
            return;
        }
        
        $current_screen = get_current_screen();
        if ($current_screen && strpos($current_screen->id, 'cfrdm') !== false) {
            ?>
            <div class="notice notice-info is-dismissible">
                <p>
                    <strong>ContentFactory RDM <?php echo esc_html($update_info['version']); ?> disponível!</strong>
                    Versão atual: <?php echo esc_html(CFRDM_VERSION); ?>
                </p>
                <p>
                    <?php if (self::is_enabled()): ?>
                        A atualização será aplicada automaticamente.
                    <?php else: ?>
                        <a href="<?php echo esc_url(admin_url('admin.php?page=cfrdm-settings&tab=updates')); ?>" class="button button-primary">
                            Atualizar Agora
                        </a>
                    <?php endif; ?>
                </p>
            </div>
            <?php
        }
    }
    
    /**
     * Create backup before update
     * 
     * @return string|false Backup path or false on failure
     */
    public function create_backup() {
        $upload_dir = wp_upload_dir();
        $backup_dir = $upload_dir['basedir'] . '/' . self::BACKUP_DIR;
        
        // Create backup directory
        if (!file_exists($backup_dir)) {
            wp_mkdir_p($backup_dir);
            
            // Protect with .htaccess
            file_put_contents($backup_dir . '/.htaccess', 'deny from all');
        }
        
        $backup_name = 'cfrdm-backup-' . CFRDM_VERSION . '-' . date('Ymd-His') . '.zip';
        $backup_path = $backup_dir . '/' . $backup_name;
        
        // Create ZIP backup
        if (!class_exists('ZipArchive')) {
            CFRDM_Logger::error('auto_update', 'ZipArchive não disponível');
            return false;
        }
        
        $zip = new ZipArchive();
        
        if ($zip->open($backup_path, ZipArchive::CREATE) !== true) {
            CFRDM_Logger::error('auto_update', 'Erro ao criar arquivo de backup');
            return false;
        }
        
        // Add plugin files to backup
        $plugin_dir = CFRDM_PLUGIN_DIR;
        $this->add_folder_to_zip($zip, $plugin_dir, 'contentfactory-rdm');
        
        $zip->close();
        
        // Store backup info
        $backups = get_option('cfrdm_backups', array());
        $backups[] = array(
            'version' => CFRDM_VERSION,
            'path' => $backup_path,
            'created_at' => current_time('mysql'),
        );
        
        // Keep only last 5 backups
        if (count($backups) > 5) {
            $old_backup = array_shift($backups);
            if (file_exists($old_backup['path'])) {
                @unlink($old_backup['path']);
            }
        }
        
        update_option('cfrdm_backups', $backups);
        
        CFRDM_Logger::success('auto_update', 'Backup criado', array(
            'path' => $backup_path,
            'version' => CFRDM_VERSION,
        ));
        
        return $backup_path;
    }
    
    /**
     * Add folder to ZIP recursively
     */
    private function add_folder_to_zip($zip, $folder, $prefix = '') {
        $files = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($folder),
            RecursiveIteratorIterator::LEAVES_ONLY
        );
        
        foreach ($files as $file) {
            if (!$file->isDir()) {
                $filePath = $file->getRealPath();
                $relativePath = $prefix . '/' . substr($filePath, strlen($folder) + 1);
                $zip->addFile($filePath, $relativePath);
            }
        }
    }
    
    /**
     * Apply update patch
     * 
     * @return array Result
     */
    public function apply_update_patch() {
        $update_info = self::get_update_info();
        
        if (!$update_info) {
            return array('success' => false, 'error' => 'Nenhuma atualização disponível');
        }
        
        // Check requirements
        if (version_compare(PHP_VERSION, $update_info['requires_php'], '<')) {
            return array(
                'success' => false,
                'error' => 'Requer PHP ' . $update_info['requires_php'],
            );
        }
        
        // Create backup first
        $backup_path = $this->create_backup();
        
        if (!$backup_path) {
            return array('success' => false, 'error' => 'Falha ao criar backup');
        }
        
        try {
            // Download update
            if (!empty($update_info['patch_url'])) {
                $result = $this->apply_patch($update_info['patch_url']);
            } elseif (!empty($update_info['download_url'])) {
                $result = $this->apply_full_update($update_info['download_url']);
            } else {
                throw new Exception('URL de atualização não disponível');
            }
            
            if (!$result['success']) {
                throw new Exception($result['error']);
            }
            
            // Run database migrations
            $this->run_database_migration($update_info['version']);
            
            // Clear update info
            delete_option(self::OPTION_UPDATE_INFO);
            
            // Notify admin
            $this->notify_admin($update_info);
            
            CFRDM_Logger::success('auto_update', 'Atualização aplicada com sucesso', array(
                'from' => CFRDM_VERSION,
                'to' => $update_info['version'],
            ));
            
            return array(
                'success' => true,
                'from_version' => CFRDM_VERSION,
                'to_version' => $update_info['version'],
            );
            
        } catch (Exception $e) {
            // Rollback on failure
            $this->rollback_update($backup_path);
            
            CFRDM_Logger::error('auto_update', 'Falha na atualização - rollback executado', array(
                'error' => $e->getMessage(),
            ));
            
            return array(
                'success' => false,
                'error' => $e->getMessage(),
                'rollback' => true,
            );
        }
    }
    
    /**
     * Apply patch update (incremental)
     */
    private function apply_patch($patch_url) {
        $response = wp_remote_get($patch_url, array('timeout' => 60));
        
        if (is_wp_error($response)) {
            return array('success' => false, 'error' => $response->get_error_message());
        }
        
        $patch_data = json_decode(wp_remote_retrieve_body($response), true);
        
        if (!isset($patch_data['files'])) {
            return array('success' => false, 'error' => 'Formato de patch inválido');
        }
        
        // Apply file changes
        foreach ($patch_data['files'] as $file_path => $file_data) {
            $full_path = CFRDM_PLUGIN_DIR . $file_path;
            
            switch ($file_data['action']) {
                case 'update':
                case 'create':
                    $dir = dirname($full_path);
                    if (!file_exists($dir)) {
                        wp_mkdir_p($dir);
                    }
                    file_put_contents($full_path, base64_decode($file_data['content']));
                    break;
                    
                case 'delete':
                    if (file_exists($full_path)) {
                        @unlink($full_path);
                    }
                    break;
            }
        }
        
        return array('success' => true);
    }
    
    /**
     * Apply full update (complete replacement)
     */
    private function apply_full_update($download_url) {
        // Download ZIP
        $tmp_file = download_url($download_url);
        
        if (is_wp_error($tmp_file)) {
            return array('success' => false, 'error' => $tmp_file->get_error_message());
        }
        
        // Extract to plugin directory
        $plugin_dir = dirname(CFRDM_PLUGIN_DIR);
        
        $unzip = unzip_file($tmp_file, $plugin_dir);
        
        @unlink($tmp_file);
        
        if (is_wp_error($unzip)) {
            return array('success' => false, 'error' => $unzip->get_error_message());
        }
        
        return array('success' => true);
    }
    
    /**
     * Run database migration for version
     */
    public function run_database_migration($version) {
        // Version-specific migrations
        switch ($version) {
            case '3.0.0':
                // Create new tables for v3.0.0
                if (class_exists('CFRDM_AI_Auto_Fix')) {
                    CFRDM_AI_Auto_Fix::create_table();
                }
                if (class_exists('CFRDM_Ubersuggest_Sync')) {
                    CFRDM_Ubersuggest_Sync::create_table();
                }
                break;
        }
        
        // Update version in database
        update_option('cfrdm_db_version', $version);
        
        CFRDM_Logger::info('auto_update', 'Migração de banco de dados executada', array(
            'version' => $version,
        ));
    }
    
    /**
     * Rollback to previous version
     * 
     * @param string $backup_path Path to backup ZIP
     * @return array Result
     */
    public function rollback_update($backup_path = null) {
        if (!$backup_path) {
            // Get latest backup
            $backups = get_option('cfrdm_backups', array());
            if (empty($backups)) {
                return array('success' => false, 'error' => 'Nenhum backup disponível');
            }
            $backup = end($backups);
            $backup_path = $backup['path'];
        }
        
        if (!file_exists($backup_path)) {
            return array('success' => false, 'error' => 'Arquivo de backup não encontrado');
        }
        
        // Extract backup
        $plugin_dir = dirname(CFRDM_PLUGIN_DIR);
        
        // Remove current plugin files
        $this->remove_directory(CFRDM_PLUGIN_DIR);
        
        // Extract backup
        $unzip = unzip_file($backup_path, $plugin_dir);
        
        if (is_wp_error($unzip)) {
            return array('success' => false, 'error' => $unzip->get_error_message());
        }
        
        CFRDM_Logger::success('auto_update', 'Rollback executado', array(
            'backup' => $backup_path,
        ));
        
        return array('success' => true);
    }
    
    /**
     * Remove directory recursively
     */
    private function remove_directory($dir) {
        if (!is_dir($dir)) {
            return;
        }
        
        $files = array_diff(scandir($dir), array('.', '..'));
        
        foreach ($files as $file) {
            $path = $dir . '/' . $file;
            is_dir($path) ? $this->remove_directory($path) : @unlink($path);
        }
        
        @rmdir($dir);
    }
    
    /**
     * Notify admin about update
     */
    public function notify_admin($update_info) {
        $admin_email = get_option('admin_email');
        
        if (!$admin_email) {
            return;
        }
        
        $subject = 'ContentFactory RDM atualizado para v' . $update_info['version'];
        
        $message = "O plugin ContentFactory RDM foi atualizado automaticamente.\n\n";
        $message .= "Versão anterior: " . CFRDM_VERSION . "\n";
        $message .= "Nova versão: " . $update_info['version'] . "\n\n";
        
        if (!empty($update_info['changelog'])) {
            $message .= "Changelog:\n" . $update_info['changelog'] . "\n\n";
        }
        
        $message .= "Acesse o painel do WordPress para verificar.\n";
        $message .= admin_url('admin.php?page=cfrdm-dashboard');
        
        wp_mail($admin_email, $subject, $message);
    }
    
    /**
     * AJAX handler for applying update
     */
    public function ajax_apply_update() {
        check_ajax_referer('cfrdm_nonce', 'nonce');
        
        if (!current_user_can('update_plugins')) {
            wp_send_json_error('Permissão negada');
        }
        
        $result = $this->apply_update_patch();
        
        if ($result['success']) {
            wp_send_json_success($result);
        } else {
            wp_send_json_error($result['error']);
        }
    }
    
    /**
     * AJAX handler for rollback
     */
    public function ajax_rollback_update() {
        check_ajax_referer('cfrdm_nonce', 'nonce');
        
        if (!current_user_can('update_plugins')) {
            wp_send_json_error('Permissão negada');
        }
        
        $result = $this->rollback_update();
        
        if ($result['success']) {
            wp_send_json_success($result);
        } else {
            wp_send_json_error($result['error']);
        }
    }
    
    /**
     * Get available backups
     */
    public static function get_backups() {
        return get_option('cfrdm_backups', array());
    }
    
    /**
     * Get statistics
     */
    public static function get_stats() {
        return array(
            'current_version' => CFRDM_VERSION,
            'update_available' => !empty(self::get_update_info()),
            'update_info' => self::get_update_info(),
            'auto_update_enabled' => self::is_enabled(),
            'last_check' => get_option(self::OPTION_LAST_CHECK),
            'backups_count' => count(self::get_backups()),
        );
    }
}
