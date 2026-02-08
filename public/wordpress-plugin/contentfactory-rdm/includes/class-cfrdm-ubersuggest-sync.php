<?php
/**
 * Ubersuggest Sync
 * 
 * Importa dados de backlinks e URLs quebradas do Ubersuggest
 * para cruzar com dados do Google Search Console
 * 
 * @package ContentFactory_RDM
 * @since 3.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_Ubersuggest_Sync {
    
    const OPTION_API_KEY = 'cfrdm_ubersuggest_api_key';
    const OPTION_LAST_SYNC = 'cfrdm_ubersuggest_last_sync';
    const TABLE_NAME = 'cfrdm_ubersuggest_data';
    
    private static $instance = null;
    
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    /**
     * Initialize Ubersuggest sync
     */
    public function init() {
        // Register cron job
        add_action('cfrdm_ubersuggest_sync', array($this, 'sync_data'));
        
        // Schedule daily sync (WordPress doesn't have 'weekly' by default)
        if (!wp_next_scheduled('cfrdm_ubersuggest_sync')) {
            wp_schedule_event(time(), 'daily', 'cfrdm_ubersuggest_sync');
        }
    }
    
    /**
     * Create database table
     */
    public static function create_table() {
        global $wpdb;
        
        $table_name = $wpdb->prefix . self::TABLE_NAME;
        $charset_collate = $wpdb->get_charset_collate();
        
        $sql = "CREATE TABLE IF NOT EXISTS $table_name (
            id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            url TEXT NOT NULL,
            data_type VARCHAR(50) NOT NULL,
            domain_authority INT(11) DEFAULT 0,
            page_authority INT(11) DEFAULT 0,
            backlinks_count INT(11) DEFAULT 0,
            referring_domains INT(11) DEFAULT 0,
            http_status INT(11) DEFAULT 0,
            anchor_text TEXT NULL,
            source_url TEXT NULL,
            raw_data LONGTEXT NULL,
            imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY data_type (data_type),
            KEY http_status (http_status)
        ) $charset_collate;";
        
        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        dbDelta($sql);
    }
    
    /**
     * Check if Ubersuggest is configured
     */
    public static function is_configured() {
        return !empty(get_option(self::OPTION_API_KEY));
    }
    
    /**
     * Import broken URLs from CSV file
     * 
     * @param string $file_path Path to CSV file
     * @return array Import results
     */
    public function import_broken_urls_csv($file_path) {
        if (!file_exists($file_path)) {
            return array('success' => false, 'error' => 'Arquivo não encontrado');
        }
        
        $handle = fopen($file_path, 'r');
        
        if (!$handle) {
            return array('success' => false, 'error' => 'Erro ao abrir arquivo');
        }
        
        global $wpdb;
        $table = $wpdb->prefix . self::TABLE_NAME;
        
        $imported = 0;
        $skipped = 0;
        $headers = null;
        
        while (($row = fgetcsv($handle)) !== false) {
            // First row is headers
            if ($headers === null) {
                $headers = array_map('strtolower', $row);
                continue;
            }
            
            // Map row to headers
            $data = array_combine($headers, $row);
            
            if (!isset($data['url']) && !isset($data['broken url'])) {
                $skipped++;
                continue;
            }
            
            $url = $data['url'] ?? $data['broken url'] ?? '';
            
            // Only import URLs from our domain
            $site_url = get_site_url();
            if (strpos($url, parse_url($site_url, PHP_URL_HOST)) === false) {
                $skipped++;
                continue;
            }
            
            // Insert into database
            $wpdb->insert($table, array(
                'url' => $url,
                'data_type' => 'broken_url',
                'http_status' => intval($data['http status'] ?? $data['status'] ?? 404),
                'backlinks_count' => intval($data['backlinks'] ?? $data['linking domains'] ?? 0),
                'referring_domains' => intval($data['referring domains'] ?? 0),
                'domain_authority' => intval($data['da'] ?? $data['domain authority'] ?? 0),
                'raw_data' => json_encode($data),
                'imported_at' => current_time('mysql'),
            ));
            
            $imported++;
            
            // Add to fix queue if it's a 404
            if (class_exists('CFRDM_AI_Auto_Fix')) {
                $priority = $this->calculate_fix_priority($url, $data);
                
                CFRDM_AI_Auto_Fix::add_to_queue(
                    '404',
                    $url,
                    null,
                    $priority,
                    array(
                        'source' => 'ubersuggest',
                        'backlinks' => intval($data['backlinks'] ?? 0),
                        'da' => intval($data['da'] ?? 0),
                    )
                );
            }
        }
        
        fclose($handle);
        
        update_option(self::OPTION_LAST_SYNC, current_time('mysql'));
        
        CFRDM_Logger::success('ubersuggest', 'CSV importado', array(
            'imported' => $imported,
            'skipped' => $skipped,
        ));
        
        return array(
            'success' => true,
            'imported' => $imported,
            'skipped' => $skipped,
        );
    }
    
    /**
     * Import backlinks data from CSV
     */
    public function import_backlinks_csv($file_path) {
        if (!file_exists($file_path)) {
            return array('success' => false, 'error' => 'Arquivo não encontrado');
        }
        
        $handle = fopen($file_path, 'r');
        
        if (!$handle) {
            return array('success' => false, 'error' => 'Erro ao abrir arquivo');
        }
        
        global $wpdb;
        $table = $wpdb->prefix . self::TABLE_NAME;
        
        $imported = 0;
        $headers = null;
        
        while (($row = fgetcsv($handle)) !== false) {
            if ($headers === null) {
                $headers = array_map('strtolower', $row);
                continue;
            }
            
            $data = array_combine($headers, $row);
            
            $target_url = $data['target url'] ?? $data['url'] ?? '';
            $source_url = $data['source url'] ?? $data['referring page'] ?? '';
            
            $wpdb->insert($table, array(
                'url' => $target_url,
                'data_type' => 'backlink',
                'source_url' => $source_url,
                'domain_authority' => intval($data['da'] ?? $data['domain authority'] ?? 0),
                'page_authority' => intval($data['pa'] ?? $data['page authority'] ?? 0),
                'anchor_text' => $data['anchor text'] ?? $data['anchor'] ?? '',
                'raw_data' => json_encode($data),
                'imported_at' => current_time('mysql'),
            ));
            
            $imported++;
        }
        
        fclose($handle);
        
        CFRDM_Logger::success('ubersuggest', 'Backlinks importados', array(
            'imported' => $imported,
        ));
        
        return array(
            'success' => true,
            'imported' => $imported,
        );
    }
    
    /**
     * Get backlinks for a 404 URL
     */
    public static function get_backlinks_for_404($url) {
        global $wpdb;
        
        $table = $wpdb->prefix . self::TABLE_NAME;
        
        // Check if table exists
        if ($wpdb->get_var("SHOW TABLES LIKE '$table'") !== $table) {
            return array();
        }
        
        return $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM $table 
             WHERE url = %s AND data_type = 'backlink'
             ORDER BY domain_authority DESC",
            $url
        ));
    }
    
    /**
     * Get all broken URLs with backlinks
     */
    public static function get_broken_urls_with_backlinks() {
        global $wpdb;
        
        $table = $wpdb->prefix . self::TABLE_NAME;
        
        if ($wpdb->get_var("SHOW TABLES LIKE '$table'") !== $table) {
            return array();
        }
        
        return $wpdb->get_results(
            "SELECT url, MAX(domain_authority) as max_da, 
                    SUM(backlinks_count) as total_backlinks,
                    COUNT(*) as entries
             FROM $table 
             WHERE data_type = 'broken_url' AND backlinks_count > 0
             GROUP BY url
             ORDER BY total_backlinks DESC, max_da DESC
             LIMIT 100"
        );
    }
    
    /**
     * Calculate fix priority based on backlink data
     * 
     * @param string $url The URL to evaluate
     * @param array $data Backlink data
     * @return int Priority (1-10, higher = more urgent)
     */
    public function calculate_fix_priority($url, $data = array()) {
        $priority = 5; // Default priority
        
        $backlinks = intval($data['backlinks'] ?? $data['backlinks_count'] ?? 0);
        $da = intval($data['da'] ?? $data['domain_authority'] ?? 0);
        $referring_domains = intval($data['referring_domains'] ?? 0);
        
        // Boost priority based on backlinks
        if ($backlinks > 100) {
            $priority += 3;
        } elseif ($backlinks > 50) {
            $priority += 2;
        } elseif ($backlinks > 10) {
            $priority += 1;
        }
        
        // Boost based on DA of referring domains
        if ($da > 50) {
            $priority += 2;
        } elseif ($da > 30) {
            $priority += 1;
        }
        
        // Boost based on referring domains diversity
        if ($referring_domains > 20) {
            $priority += 1;
        }
        
        // Cap at 10
        return min($priority, 10);
    }
    
    /**
     * Sync data from Ubersuggest API (if API key is configured)
     */
    public function sync_data() {
        $api_key = get_option(self::OPTION_API_KEY);
        
        if (empty($api_key)) {
            CFRDM_Logger::info('ubersuggest', 'Sync ignorado - API key não configurada');
            return;
        }
        
        // Note: Ubersuggest doesn't have a public API
        // This would require a custom integration or manual CSV imports
        // For now, we'll just log and remind about manual import
        
        CFRDM_Logger::info('ubersuggest', 'Para importar dados do Ubersuggest, use a importação manual de CSV');
        
        update_option(self::OPTION_LAST_SYNC, current_time('mysql'));
    }
    
    /**
     * Get statistics
     */
    public static function get_stats() {
        global $wpdb;
        
        $table = $wpdb->prefix . self::TABLE_NAME;
        
        if ($wpdb->get_var("SHOW TABLES LIKE '$table'") !== $table) {
            return array(
                'broken_urls' => 0,
                'backlinks' => 0,
                'high_priority' => 0,
                'last_sync' => null,
            );
        }
        
        return array(
            'broken_urls' => $wpdb->get_var("SELECT COUNT(*) FROM $table WHERE data_type = 'broken_url'"),
            'backlinks' => $wpdb->get_var("SELECT COUNT(*) FROM $table WHERE data_type = 'backlink'"),
            'high_priority' => $wpdb->get_var("SELECT COUNT(*) FROM $table WHERE data_type = 'broken_url' AND backlinks_count > 10"),
            'last_sync' => get_option(self::OPTION_LAST_SYNC),
        );
    }
    
    /**
     * Cleanup old data
     */
    public static function cleanup($days = 90) {
        global $wpdb;
        
        $table = $wpdb->prefix . self::TABLE_NAME;
        $date_limit = date('Y-m-d H:i:s', strtotime("-{$days} days"));
        
        return $wpdb->query($wpdb->prepare(
            "DELETE FROM $table WHERE imported_at < %s",
            $date_limit
        ));
    }
    
    /**
     * Handle CSV upload via AJAX
     */
    public static function handle_csv_upload() {
        check_ajax_referer('cfrdm_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Permissão negada');
        }
        
        if (!isset($_FILES['csv_file'])) {
            wp_send_json_error('Nenhum arquivo enviado');
        }
        
        $file = $_FILES['csv_file'];
        $upload_type = sanitize_text_field($_POST['upload_type'] ?? 'broken_urls');
        
        // Validate file type
        $file_type = wp_check_filetype($file['name']);
        if ($file_type['ext'] !== 'csv') {
            wp_send_json_error('Apenas arquivos CSV são aceitos');
        }
        
        // Move to temp location
        $upload_dir = wp_upload_dir();
        $temp_path = $upload_dir['basedir'] . '/cfrdm-temp-' . time() . '.csv';
        
        if (!move_uploaded_file($file['tmp_name'], $temp_path)) {
            wp_send_json_error('Erro ao processar arquivo');
        }
        
        $instance = self::get_instance();
        
        if ($upload_type === 'backlinks') {
            $result = $instance->import_backlinks_csv($temp_path);
        } else {
            $result = $instance->import_broken_urls_csv($temp_path);
        }
        
        // Clean up
        @unlink($temp_path);
        
        if ($result['success']) {
            wp_send_json_success($result);
        } else {
            wp_send_json_error($result['error']);
        }
    }
}
