<?php
/**
 * Logger Class - Complete logging system with safety checks
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_Logger {
    
    const TYPE_INFO = 'info';
    const TYPE_SUCCESS = 'success';
    const TYPE_WARNING = 'warning';
    const TYPE_ERROR = 'error';
    const TYPE_DEBUG = 'debug';
    
    const CATEGORY_GENERAL = 'general';
    const CATEGORY_API = 'api';
    const CATEGORY_SYNC = 'sync';
    const CATEGORY_PUBLISH = 'publish';
    const CATEGORY_IMAGE = 'image';
    const CATEGORY_WEBHOOK = 'webhook';
    const CATEGORY_AUTOCORRECT = 'autocorrect';
    const CATEGORY_SYSTEM = 'system';
    
    /**
     * Check if log table exists
     */
    private static function table_exists() {
        global $wpdb;
        
        static $exists = null;
        
        // Cache the result to avoid repeated queries
        if ($exists !== null) {
            return $exists;
        }
        
        $table = $wpdb->prefix . CFRDM_LOG_TABLE;
        $result = $wpdb->get_var($wpdb->prepare(
            "SHOW TABLES LIKE %s",
            $table
        ));
        
        $exists = !empty($result);
        return $exists;
    }
    
    /**
     * Log a message
     */
    public static function log($category, $message, $context = array(), $type = self::TYPE_INFO, $post_id = null) {
        // Safety check - don't try to log if table doesn't exist
        if (!self::table_exists()) {
            // Fallback to error_log if table doesn't exist
            if (defined('WP_DEBUG') && WP_DEBUG) {
                error_log(sprintf('[CFRDM %s] %s: %s', strtoupper($type), $category, $message));
            }
            return false;
        }
        
        global $wpdb;
        
        $table = $wpdb->prefix . CFRDM_LOG_TABLE;
        
        // Get current user safely
        $user_id = function_exists('get_current_user_id') ? get_current_user_id() : null;
        
        // Get IP address
        $ip_address = self::get_client_ip();
        
        // Suppress errors during insert to prevent white screen
        $wpdb->suppress_errors(true);
        
        $result = $wpdb->insert(
            $table,
            array(
                'log_type' => $type,
                'category' => $category,
                'message' => $message,
                'context' => !empty($context) ? wp_json_encode($context, JSON_UNESCAPED_UNICODE) : null,
                'post_id' => $post_id,
                'user_id' => $user_id ?: null,
                'ip_address' => $ip_address,
                'created_at' => current_time('mysql'),
            ),
            array('%s', '%s', '%s', '%s', '%d', '%d', '%s', '%s')
        );
        
        $wpdb->suppress_errors(false);
        
        if ($result === false) {
            // Log to PHP error log as fallback
            if (defined('WP_DEBUG') && WP_DEBUG) {
                error_log(sprintf('[CFRDM %s] %s: %s (DB insert failed)', strtoupper($type), $category, $message));
            }
            return false;
        }
        
        return $wpdb->insert_id;
    }
    
    /**
     * Log info message
     */
    public static function info($category, $message, $context = array(), $post_id = null) {
        return self::log($category, $message, $context, self::TYPE_INFO, $post_id);
    }
    
    /**
     * Log success message
     */
    public static function success($category, $message, $context = array(), $post_id = null) {
        return self::log($category, $message, $context, self::TYPE_SUCCESS, $post_id);
    }
    
    /**
     * Log warning message
     */
    public static function warning($category, $message, $context = array(), $post_id = null) {
        return self::log($category, $message, $context, self::TYPE_WARNING, $post_id);
    }
    
    /**
     * Log error message
     */
    public static function error($category, $message, $context = array(), $post_id = null) {
        return self::log($category, $message, $context, self::TYPE_ERROR, $post_id);
    }
    
    /**
     * Log debug message
     */
    public static function debug($category, $message, $context = array(), $post_id = null) {
        if (defined('WP_DEBUG') && WP_DEBUG) {
            return self::log($category, $message, $context, self::TYPE_DEBUG, $post_id);
        }
        return false;
    }
    
    /**
     * Get logs with pagination and filtering
     */
    public static function get_logs($args = array()) {
        if (!self::table_exists()) {
            return array(
                'logs' => array(),
                'total' => 0,
                'pages' => 0,
                'page' => 1,
            );
        }
        
        global $wpdb;
        
        $defaults = array(
            'per_page' => 50,
            'page' => 1,
            'type' => '',
            'category' => '',
            'search' => '',
            'post_id' => '',
            'date_from' => '',
            'date_to' => '',
            'orderby' => 'created_at',
            'order' => 'DESC',
        );
        
        $args = wp_parse_args($args, $defaults);
        $table = $wpdb->prefix . CFRDM_LOG_TABLE;
        
        $where = array('1=1');
        $values = array();
        
        if (!empty($args['type'])) {
            $where[] = 'log_type = %s';
            $values[] = $args['type'];
        }
        
        if (!empty($args['category'])) {
            $where[] = 'category = %s';
            $values[] = $args['category'];
        }
        
        if (!empty($args['search'])) {
            $where[] = 'message LIKE %s';
            $values[] = '%' . $wpdb->esc_like($args['search']) . '%';
        }
        
        if (!empty($args['post_id'])) {
            $where[] = 'post_id = %d';
            $values[] = intval($args['post_id']);
        }
        
        if (!empty($args['date_from'])) {
            $where[] = 'created_at >= %s';
            $values[] = $args['date_from'] . ' 00:00:00';
        }
        
        if (!empty($args['date_to'])) {
            $where[] = 'created_at <= %s';
            $values[] = $args['date_to'] . ' 23:59:59';
        }
        
        $where_sql = implode(' AND ', $where);
        
        // Sanitize orderby
        $allowed_orderby = array('id', 'log_type', 'category', 'created_at');
        $orderby = in_array($args['orderby'], $allowed_orderby) ? $args['orderby'] : 'created_at';
        $order = strtoupper($args['order']) === 'ASC' ? 'ASC' : 'DESC';
        
        $offset = ($args['page'] - 1) * $args['per_page'];
        
        // Count total
        $count_sql = "SELECT COUNT(*) FROM $table WHERE $where_sql";
        if (!empty($values)) {
            $count_sql = $wpdb->prepare($count_sql, $values);
        }
        $total = $wpdb->get_var($count_sql);
        
        // Get logs
        $query_values = array_merge($values, array($args['per_page'], $offset));
        $sql = "SELECT * FROM $table WHERE $where_sql ORDER BY $orderby $order LIMIT %d OFFSET %d";
        
        $logs = $wpdb->get_results($wpdb->prepare($sql, $query_values));
        
        return array(
            'logs' => $logs ?: array(),
            'total' => intval($total),
            'pages' => ceil($total / $args['per_page']),
            'page' => $args['page'],
        );
    }
    
    /**
     * Get log stats
     */
    public static function get_stats($days = 7) {
        if (!self::table_exists()) {
            return array(
                'total' => 0,
                'by_type' => array(),
                'by_category' => array(),
                'by_day' => array(),
            );
        }
        
        global $wpdb;
        
        $table = $wpdb->prefix . CFRDM_LOG_TABLE;
        $date_limit = date('Y-m-d H:i:s', strtotime("-$days days"));
        
        // By type
        $by_type = $wpdb->get_results($wpdb->prepare(
            "SELECT log_type, COUNT(*) as count 
             FROM $table 
             WHERE created_at >= %s 
             GROUP BY log_type",
            $date_limit
        ), OBJECT_K);
        
        // By category
        $by_category = $wpdb->get_results($wpdb->prepare(
            "SELECT category, COUNT(*) as count 
             FROM $table 
             WHERE created_at >= %s 
             GROUP BY category",
            $date_limit
        ), OBJECT_K);
        
        // By day
        $by_day = $wpdb->get_results($wpdb->prepare(
            "SELECT DATE(created_at) as date, log_type, COUNT(*) as count 
             FROM $table 
             WHERE created_at >= %s 
             GROUP BY DATE(created_at), log_type
             ORDER BY date ASC",
            $date_limit
        ));
        
        // Total count
        $total = $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM $table WHERE created_at >= %s",
            $date_limit
        ));
        
        return array(
            'total' => intval($total),
            'by_type' => $by_type ?: array(),
            'by_category' => $by_category ?: array(),
            'by_day' => $by_day ?: array(),
        );
    }
    
    /**
     * Cleanup old logs
     */
    public static function cleanup_old_logs($days = 30) {
        if (!self::table_exists()) {
            return 0;
        }
        
        global $wpdb;
        
        $table = $wpdb->prefix . CFRDM_LOG_TABLE;
        $date_limit = date('Y-m-d H:i:s', strtotime("-$days days"));
        
        $deleted = $wpdb->query($wpdb->prepare(
            "DELETE FROM $table WHERE created_at < %s",
            $date_limit
        ));
        
        return $deleted;
    }
    
    /**
     * Clear all logs
     */
    public static function clear_all_logs() {
        if (!self::table_exists()) {
            return false;
        }
        
        global $wpdb;
        
        $table = $wpdb->prefix . CFRDM_LOG_TABLE;
        return $wpdb->query("TRUNCATE TABLE $table");
    }
    
    /**
     * Export logs to CSV
     */
    public static function export_to_csv($args = array()) {
        $result = self::get_logs(array_merge($args, array('per_page' => 10000)));
        
        $csv_data = array();
        $csv_data[] = array('ID', 'Tipo', 'Categoria', 'Mensagem', 'Contexto', 'Post ID', 'Usuário', 'IP', 'Data');
        
        foreach ($result['logs'] as $log) {
            $csv_data[] = array(
                $log->id,
                $log->log_type,
                $log->category,
                $log->message,
                $log->context,
                $log->post_id,
                $log->user_id,
                $log->ip_address,
                $log->created_at,
            );
        }
        
        return $csv_data;
    }
    
    /**
     * Get client IP address
     */
    private static function get_client_ip() {
        $ip_keys = array(
            'HTTP_CLIENT_IP',
            'HTTP_X_FORWARDED_FOR',
            'HTTP_X_FORWARDED',
            'HTTP_X_CLUSTER_CLIENT_IP',
            'HTTP_FORWARDED_FOR',
            'HTTP_FORWARDED',
            'REMOTE_ADDR'
        );
        
        foreach ($ip_keys as $key) {
            if (!empty($_SERVER[$key])) {
                $ip = $_SERVER[$key];
                if (strpos($ip, ',') !== false) {
                    $ip = trim(explode(',', $ip)[0]);
                }
                if (filter_var($ip, FILTER_VALIDATE_IP)) {
                    return $ip;
                }
            }
        }
        
        return '0.0.0.0';
    }
}
