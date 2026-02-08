<?php
/**
 * Structured Logs - Advanced logging system with custom database table
 * 
 * Features:
 * - Custom database table for detailed logs
 * - Status/step tracking for multi-step processes
 * - Error details with stack traces
 * - Automatic cleanup of old logs
 * - REST API endpoint for log retrieval
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_Structured_Logs {
    
    /**
     * Table name (without prefix) - uses the constant defined in main plugin file
     */
    const TABLE_NAME = 'cfrdm_structured_logs';
    
    /**
     * Maximum days to keep logs
     */
    const LOG_RETENTION_DAYS = 30;
    
    /**
     * Valid log statuses
     */
    const VALID_STATUSES = array(
        'processing',
        'pending',
        'success',
        'warning',
        'error',
        'skipped',
    );
    
    /**
     * Valid log steps
     */
    const VALID_STEPS = array(
        'init',
        'fetch',
        'parse',
        'validate',
        'download_media',
        'create_post',
        'update_post',
        'seo_meta',
        'schema',
        'publish',
        'webhook',
        'cleanup',
        'complete',
    );
    
    /**
     * Check if table exists
     */
    public static function table_exists() {
        global $wpdb;
        
        $table_name = self::get_table_name();
        $result = $wpdb->get_var($wpdb->prepare(
            "SHOW TABLES LIKE %s",
            $table_name
        ));
        
        return !empty($result);
    }
    
    /**
     * Get the full table name with prefix
     */
    public static function get_table_name() {
        global $wpdb;
        // Use constant from main plugin if available, otherwise use class constant
        if (defined('CFRDM_STRUCTURED_LOGS_TABLE')) {
            return $wpdb->prefix . CFRDM_STRUCTURED_LOGS_TABLE;
        }
        return $wpdb->prefix . self::TABLE_NAME;
    }
    
    /**
     * Create the logs table
     */
    public static function create_table() {
        global $wpdb;
        
        $table_name = self::get_table_name();
        $charset_collate = $wpdb->get_charset_collate();
        
        $sql = "CREATE TABLE IF NOT EXISTS {$table_name} (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            article_id varchar(50) DEFAULT NULL,
            post_id bigint(20) DEFAULT NULL,
            source_url varchar(500) DEFAULT NULL,
            source_title varchar(500) DEFAULT NULL,
            status varchar(50) DEFAULT 'processing',
            step varchar(50) DEFAULT 'init',
            message text,
            error_details text,
            metadata longtext,
            duration_ms int DEFAULT NULL,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY article_id (article_id),
            KEY post_id (post_id),
            KEY status (status),
            KEY step (step),
            KEY created_at (created_at)
        ) {$charset_collate};";
        
        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        dbDelta($sql);
        
        CFRDM_Logger::success('structured_logs', 'Tabela de logs estruturados criada/atualizada');
    }
    
    /**
     * Drop the logs table (for uninstall)
     */
    public static function drop_table() {
        global $wpdb;
        $table_name = self::get_table_name();
        $wpdb->query("DROP TABLE IF EXISTS {$table_name}");
    }
    
    /**
     * Insert a new log entry
     * 
     * @param array $data Log data
     * @return int|false Log ID or false on failure
     */
    public static function insert($data) {
        global $wpdb;
        
        $table_name = self::get_table_name();
        
        // Validate status
        $status = isset($data['status']) ? $data['status'] : 'processing';
        if (!in_array($status, self::VALID_STATUSES)) {
            $status = 'processing';
        }
        
        // Validate step
        $step = isset($data['step']) ? $data['step'] : 'init';
        if (!in_array($step, self::VALID_STEPS)) {
            $step = 'init';
        }
        
        // Prepare metadata
        $metadata = isset($data['metadata']) ? $data['metadata'] : array();
        if (is_array($metadata)) {
            $metadata = wp_json_encode($metadata);
        }
        
        $insert_data = array(
            'article_id' => isset($data['article_id']) ? sanitize_text_field($data['article_id']) : null,
            'post_id' => isset($data['post_id']) ? intval($data['post_id']) : null,
            'source_url' => isset($data['source_url']) ? esc_url_raw($data['source_url']) : null,
            'source_title' => isset($data['source_title']) ? sanitize_text_field($data['source_title']) : null,
            'status' => $status,
            'step' => $step,
            'message' => isset($data['message']) ? sanitize_text_field($data['message']) : null,
            'error_details' => isset($data['error_details']) ? wp_kses_post($data['error_details']) : null,
            'metadata' => $metadata,
            'duration_ms' => isset($data['duration_ms']) ? intval($data['duration_ms']) : null,
        );
        
        $result = $wpdb->insert($table_name, $insert_data);
        
        if ($result === false) {
            CFRDM_Logger::error('structured_logs', 'Falha ao inserir log', array(
                'error' => $wpdb->last_error,
            ));
            return false;
        }
        
        return $wpdb->insert_id;
    }
    
    /**
     * Update an existing log entry
     * 
     * @param int $log_id Log ID
     * @param array $data Data to update
     * @return bool Success
     */
    public static function update($log_id, $data) {
        global $wpdb;
        
        $table_name = self::get_table_name();
        $update_data = array();
        
        if (isset($data['status']) && in_array($data['status'], self::VALID_STATUSES)) {
            $update_data['status'] = $data['status'];
        }
        
        if (isset($data['step']) && in_array($data['step'], self::VALID_STEPS)) {
            $update_data['step'] = $data['step'];
        }
        
        if (isset($data['message'])) {
            $update_data['message'] = sanitize_text_field($data['message']);
        }
        
        if (isset($data['error_details'])) {
            $update_data['error_details'] = wp_kses_post($data['error_details']);
        }
        
        if (isset($data['post_id'])) {
            $update_data['post_id'] = intval($data['post_id']);
        }
        
        if (isset($data['duration_ms'])) {
            $update_data['duration_ms'] = intval($data['duration_ms']);
        }
        
        if (isset($data['metadata'])) {
            $metadata = $data['metadata'];
            if (is_array($metadata)) {
                $metadata = wp_json_encode($metadata);
            }
            $update_data['metadata'] = $metadata;
        }
        
        if (empty($update_data)) {
            return false;
        }
        
        $result = $wpdb->update($table_name, $update_data, array('id' => intval($log_id)));
        
        return $result !== false;
    }
    
    /**
     * Get logs with filtering and pagination
     * 
     * @param array $args Query arguments
     * @return array Logs and pagination info
     */
    public static function get_logs($args = array()) {
        global $wpdb;
        
        $table_name = self::get_table_name();
        
        $defaults = array(
            'article_id' => null,
            'post_id' => null,
            'status' => null,
            'step' => null,
            'limit' => 50,
            'offset' => 0,
            'order_by' => 'created_at',
            'order' => 'DESC',
            'date_from' => null,
            'date_to' => null,
        );
        
        $args = wp_parse_args($args, $defaults);
        
        $where = array('1=1');
        $values = array();
        
        if ($args['article_id']) {
            $where[] = 'article_id = %s';
            $values[] = $args['article_id'];
        }
        
        if ($args['post_id']) {
            $where[] = 'post_id = %d';
            $values[] = intval($args['post_id']);
        }
        
        if ($args['status']) {
            if (is_array($args['status'])) {
                $placeholders = implode(',', array_fill(0, count($args['status']), '%s'));
                $where[] = "status IN ({$placeholders})";
                $values = array_merge($values, $args['status']);
            } else {
                $where[] = 'status = %s';
                $values[] = $args['status'];
            }
        }
        
        if ($args['step']) {
            $where[] = 'step = %s';
            $values[] = $args['step'];
        }
        
        if ($args['date_from']) {
            $where[] = 'created_at >= %s';
            $values[] = $args['date_from'];
        }
        
        if ($args['date_to']) {
            $where[] = 'created_at <= %s';
            $values[] = $args['date_to'];
        }
        
        $where_clause = implode(' AND ', $where);
        
        // Validate order_by
        $allowed_order_by = array('id', 'created_at', 'updated_at', 'status', 'step');
        $order_by = in_array($args['order_by'], $allowed_order_by) ? $args['order_by'] : 'created_at';
        $order = strtoupper($args['order']) === 'ASC' ? 'ASC' : 'DESC';
        
        // Get total count
        $count_sql = "SELECT COUNT(*) FROM {$table_name} WHERE {$where_clause}";
        if (!empty($values)) {
            $count_sql = $wpdb->prepare($count_sql, $values);
        }
        $total = intval($wpdb->get_var($count_sql));
        
        // Get logs
        $limit = intval($args['limit']);
        $offset = intval($args['offset']);
        
        $sql = "SELECT * FROM {$table_name} WHERE {$where_clause} ORDER BY {$order_by} {$order} LIMIT %d OFFSET %d";
        $values[] = $limit;
        $values[] = $offset;
        
        $logs = $wpdb->get_results($wpdb->prepare($sql, $values), ARRAY_A);
        
        // Decode metadata
        foreach ($logs as &$log) {
            if (!empty($log['metadata'])) {
                $decoded = json_decode($log['metadata'], true);
                $log['metadata'] = is_array($decoded) ? $decoded : array();
            } else {
                $log['metadata'] = array();
            }
        }
        
        return array(
            'logs' => $logs,
            'total' => $total,
            'limit' => $limit,
            'offset' => $offset,
            'pages' => ceil($total / $limit),
        );
    }
    
    /**
     * Get a single log by ID
     * 
     * @param int $log_id Log ID
     * @return array|null Log data or null
     */
    public static function get_log($log_id) {
        global $wpdb;
        
        $table_name = self::get_table_name();
        
        $log = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$table_name} WHERE id = %d",
            intval($log_id)
        ), ARRAY_A);
        
        if ($log && !empty($log['metadata'])) {
            $decoded = json_decode($log['metadata'], true);
            $log['metadata'] = is_array($decoded) ? $decoded : array();
        }
        
        return $log;
    }
    
    /**
     * Delete logs by article ID
     * 
     * @param string $article_id Article ID
     * @return int Number of deleted rows
     */
    public static function delete_by_article($article_id) {
        global $wpdb;
        
        $table_name = self::get_table_name();
        
        return $wpdb->delete($table_name, array('article_id' => sanitize_text_field($article_id)));
    }
    
    /**
     * Cleanup old logs
     * 
     * @param int $days Number of days to keep
     * @return int Number of deleted rows
     */
    public static function cleanup($days = null) {
        global $wpdb;
        
        if ($days === null) {
            $days = self::LOG_RETENTION_DAYS;
        }
        
        $table_name = self::get_table_name();
        $cutoff_date = date('Y-m-d H:i:s', strtotime("-{$days} days"));
        
        $deleted = $wpdb->query($wpdb->prepare(
            "DELETE FROM {$table_name} WHERE created_at < %s",
            $cutoff_date
        ));
        
        if ($deleted > 0) {
            CFRDM_Logger::info('structured_logs', "Limpeza de logs: {$deleted} registros removidos", array(
                'days' => $days,
                'cutoff_date' => $cutoff_date,
            ));
        }
        
        return $deleted;
    }
    
    /**
     * Get log statistics
     * 
     * @param int $days Number of days to analyze
     * @return array Statistics
     */
    public static function get_stats($days = 7) {
        global $wpdb;
        
        $table_name = self::get_table_name();
        $cutoff_date = date('Y-m-d H:i:s', strtotime("-{$days} days"));
        
        // Count by status
        $status_counts = $wpdb->get_results($wpdb->prepare(
            "SELECT status, COUNT(*) as count FROM {$table_name} 
             WHERE created_at >= %s 
             GROUP BY status",
            $cutoff_date
        ), ARRAY_A);
        
        $by_status = array();
        foreach ($status_counts as $row) {
            $by_status[$row['status']] = intval($row['count']);
        }
        
        // Count by step
        $step_counts = $wpdb->get_results($wpdb->prepare(
            "SELECT step, COUNT(*) as count FROM {$table_name} 
             WHERE created_at >= %s AND status = 'error'
             GROUP BY step",
            $cutoff_date
        ), ARRAY_A);
        
        $errors_by_step = array();
        foreach ($step_counts as $row) {
            $errors_by_step[$row['step']] = intval($row['count']);
        }
        
        // Average duration
        $avg_duration = $wpdb->get_var($wpdb->prepare(
            "SELECT AVG(duration_ms) FROM {$table_name} 
             WHERE created_at >= %s AND duration_ms IS NOT NULL AND status = 'success'",
            $cutoff_date
        ));
        
        // Total count
        $total = $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$table_name} WHERE created_at >= %s",
            $cutoff_date
        ));
        
        return array(
            'period_days' => $days,
            'total_logs' => intval($total),
            'by_status' => $by_status,
            'errors_by_step' => $errors_by_step,
            'avg_duration_ms' => $avg_duration ? round(floatval($avg_duration), 2) : null,
            'success_rate' => $total > 0 ? round((($by_status['success'] ?? 0) / $total) * 100, 2) : 0,
        );
    }
    
    /**
     * Log a sync operation with timing
     * 
     * @param string $article_id Article ID
     * @param callable $callback Operation callback
     * @return mixed Callback result
     */
    public static function log_operation($article_id, $initial_data, $callback) {
        $start_time = microtime(true);
        
        // Create initial log
        $log_id = self::insert(array_merge($initial_data, array(
            'article_id' => $article_id,
            'status' => 'processing',
        )));
        
        try {
            $result = $callback($log_id);
            
            $duration_ms = round((microtime(true) - $start_time) * 1000);
            
            self::update($log_id, array(
                'status' => 'success',
                'step' => 'complete',
                'duration_ms' => $duration_ms,
            ));
            
            return $result;
            
        } catch (Exception $e) {
            $duration_ms = round((microtime(true) - $start_time) * 1000);
            
            self::update($log_id, array(
                'status' => 'error',
                'message' => $e->getMessage(),
                'error_details' => $e->getTraceAsString(),
                'duration_ms' => $duration_ms,
            ));
            
            throw $e;
        }
    }
}
