<?php
/**
 * Content Queue - Advanced queue system for content processing
 * 
 * Features:
 * - Priority-based queue
 * - Parallel processing support
 * - Retry with exponential backoff
 * - Status tracking
 * - Webhook notifications
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_Content_Queue {
    
    /**
     * Queue table name
     */
    const TABLE_NAME = 'cfrdm_content_queue';
    
    /**
     * Queue statuses
     */
    const STATUS_PENDING = 'pending';
    const STATUS_PROCESSING = 'processing';
    const STATUS_COMPLETED = 'completed';
    const STATUS_FAILED = 'failed';
    const STATUS_CANCELLED = 'cancelled';
    const STATUS_PAUSED = 'paused';
    
    /**
     * Priority levels
     */
    const PRIORITY_LOW = 0;
    const PRIORITY_NORMAL = 5;
    const PRIORITY_HIGH = 10;
    const PRIORITY_URGENT = 15;
    
    /**
     * Create queue table
     */
    public static function create_table() {
        global $wpdb;
        
        $table_name = $wpdb->prefix . self::TABLE_NAME;
        $charset_collate = $wpdb->get_charset_collate();
        
        $sql = "CREATE TABLE IF NOT EXISTS {$table_name} (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            queue_type varchar(50) NOT NULL,
            action varchar(100) NOT NULL,
            payload longtext NOT NULL,
            priority int DEFAULT 5,
            status varchar(50) DEFAULT 'pending',
            attempts int DEFAULT 0,
            max_attempts int DEFAULT 3,
            next_retry_at datetime DEFAULT NULL,
            started_at datetime DEFAULT NULL,
            completed_at datetime DEFAULT NULL,
            result longtext,
            error_message text,
            error_trace text,
            worker_id varchar(50) DEFAULT NULL,
            post_id bigint(20) DEFAULT NULL,
            article_id varchar(50) DEFAULT NULL,
            project_id varchar(50) DEFAULT NULL,
            metadata longtext,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY queue_type (queue_type),
            KEY action (action),
            KEY status (status),
            KEY priority (priority),
            KEY next_retry_at (next_retry_at),
            KEY post_id (post_id),
            KEY article_id (article_id),
            KEY project_id (project_id)
        ) {$charset_collate};";
        
        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        dbDelta($sql);
        
        CFRDM_Logger::success('content_queue', 'Tabela de fila de conteúdo criada/atualizada');
    }
    
    /**
     * Add item to queue
     */
    public static function push($queue_type, $action, $payload, $options = array()) {
        global $wpdb;
        
        $table_name = $wpdb->prefix . self::TABLE_NAME;
        
        $data = array(
            'queue_type' => sanitize_text_field($queue_type),
            'action' => sanitize_text_field($action),
            'payload' => wp_json_encode($payload),
            'priority' => isset($options['priority']) ? intval($options['priority']) : self::PRIORITY_NORMAL,
            'status' => self::STATUS_PENDING,
            'max_attempts' => isset($options['max_attempts']) ? intval($options['max_attempts']) : 3,
            'post_id' => isset($options['post_id']) ? intval($options['post_id']) : null,
            'article_id' => isset($options['article_id']) ? sanitize_text_field($options['article_id']) : null,
            'project_id' => isset($options['project_id']) ? sanitize_text_field($options['project_id']) : null,
            'metadata' => isset($options['metadata']) ? wp_json_encode($options['metadata']) : null,
        );
        
        // Schedule for later if delay specified
        if (!empty($options['delay_seconds'])) {
            $data['next_retry_at'] = date('Y-m-d H:i:s', time() + intval($options['delay_seconds']));
        }
        
        $result = $wpdb->insert($table_name, $data);
        
        if ($result === false) {
            CFRDM_Logger::error('content_queue', 'Falha ao adicionar item à fila', array(
                'error' => $wpdb->last_error,
                'action' => $action,
            ));
            return false;
        }
        
        $queue_id = $wpdb->insert_id;
        
        CFRDM_Logger::debug('content_queue', 'Item adicionado à fila', array(
            'id' => $queue_id,
            'type' => $queue_type,
            'action' => $action,
            'priority' => $data['priority'],
        ));
        
        // Trigger immediate processing if urgent
        if ($data['priority'] >= self::PRIORITY_URGENT) {
            self::trigger_process();
        }
        
        return $queue_id;
    }
    
    /**
     * Push multiple items at once
     */
    public static function push_batch($items) {
        $ids = array();
        
        foreach ($items as $item) {
            $id = self::push(
                $item['queue_type'],
                $item['action'],
                $item['payload'],
                $item['options'] ?? array()
            );
            
            if ($id) {
                $ids[] = $id;
            }
        }
        
        return $ids;
    }
    
    /**
     * Get next items to process
     */
    public static function pop($queue_type = null, $limit = 1) {
        global $wpdb;
        
        $table_name = $wpdb->prefix . self::TABLE_NAME;
        $now = current_time('mysql');
        $worker_id = self::generate_worker_id();
        
        $where = array(
            'status = %s',
            '(next_retry_at IS NULL OR next_retry_at <= %s)',
            'attempts < max_attempts',
        );
        $values = array(self::STATUS_PENDING, $now);
        
        if ($queue_type) {
            $where[] = 'queue_type = %s';
            $values[] = $queue_type;
        }
        
        $where_clause = implode(' AND ', $where);
        
        // Lock items for processing (atomic update)
        $sql = "UPDATE {$table_name} SET 
                    status = %s, 
                    worker_id = %s, 
                    started_at = %s,
                    attempts = attempts + 1
                WHERE {$where_clause}
                ORDER BY priority DESC, created_at ASC
                LIMIT %d";
        
        $values = array_merge(
            array(self::STATUS_PROCESSING, $worker_id, $now),
            $values,
            array($limit)
        );
        
        $wpdb->query($wpdb->prepare($sql, $values));
        
        // Fetch locked items
        $items = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$table_name} WHERE worker_id = %s AND status = %s",
            $worker_id,
            self::STATUS_PROCESSING
        ), ARRAY_A);
        
        // Decode payloads
        foreach ($items as &$item) {
            $item['payload'] = json_decode($item['payload'], true);
            if (!empty($item['metadata'])) {
                $item['metadata'] = json_decode($item['metadata'], true);
            }
        }
        
        return $limit === 1 ? ($items[0] ?? null) : $items;
    }
    
    /**
     * Mark item as completed
     */
    public static function complete($id, $result = null) {
        global $wpdb;
        
        $table_name = $wpdb->prefix . self::TABLE_NAME;
        
        $wpdb->update(
            $table_name,
            array(
                'status' => self::STATUS_COMPLETED,
                'completed_at' => current_time('mysql'),
                'result' => $result ? wp_json_encode($result) : null,
                'error_message' => null,
            ),
            array('id' => intval($id))
        );
        
        // Trigger webhook if configured
        $item = self::get($id);
        if ($item) {
            do_action('cfrdm_queue_completed', $item, $result);
        }
        
        return true;
    }
    
    /**
     * Mark item as failed
     */
    public static function fail($id, $error_message, $error_trace = null) {
        global $wpdb;
        
        $table_name = $wpdb->prefix . self::TABLE_NAME;
        
        $item = self::get($id);
        
        if (!$item) {
            return false;
        }
        
        $should_retry = $item['attempts'] < $item['max_attempts'];
        
        $update_data = array(
            'error_message' => $error_message,
            'error_trace' => $error_trace,
        );
        
        if ($should_retry) {
            // Exponential backoff: 1min, 5min, 25min...
            $delay = pow(5, $item['attempts']) * 60;
            $update_data['status'] = self::STATUS_PENDING;
            $update_data['next_retry_at'] = date('Y-m-d H:i:s', time() + $delay);
            $update_data['worker_id'] = null;
        } else {
            $update_data['status'] = self::STATUS_FAILED;
            $update_data['completed_at'] = current_time('mysql');
        }
        
        $wpdb->update($table_name, $update_data, array('id' => intval($id)));
        
        // Log the failure
        CFRDM_Logger::error('content_queue', 'Item falhou', array(
            'id' => $id,
            'action' => $item['action'],
            'attempts' => $item['attempts'],
            'will_retry' => $should_retry,
            'error' => $error_message,
        ));
        
        // Trigger webhook if final failure
        if (!$should_retry) {
            do_action('cfrdm_queue_failed', $item, $error_message);
        }
        
        return true;
    }
    
    /**
     * Get a queue item
     */
    public static function get($id) {
        global $wpdb;
        
        $table_name = $wpdb->prefix . self::TABLE_NAME;
        
        $item = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$table_name} WHERE id = %d",
            intval($id)
        ), ARRAY_A);
        
        if ($item) {
            $item['payload'] = json_decode($item['payload'], true);
            if (!empty($item['metadata'])) {
                $item['metadata'] = json_decode($item['metadata'], true);
            }
            if (!empty($item['result'])) {
                $item['result'] = json_decode($item['result'], true);
            }
        }
        
        return $item;
    }
    
    /**
     * Get items by criteria
     */
    public static function get_items($args = array()) {
        global $wpdb;
        
        $table_name = $wpdb->prefix . self::TABLE_NAME;
        
        $defaults = array(
            'queue_type' => null,
            'action' => null,
            'status' => null,
            'post_id' => null,
            'article_id' => null,
            'project_id' => null,
            'limit' => 50,
            'offset' => 0,
            'order_by' => 'created_at',
            'order' => 'DESC',
        );
        
        $args = wp_parse_args($args, $defaults);
        
        $where = array('1=1');
        $values = array();
        
        if ($args['queue_type']) {
            $where[] = 'queue_type = %s';
            $values[] = $args['queue_type'];
        }
        
        if ($args['action']) {
            $where[] = 'action = %s';
            $values[] = $args['action'];
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
        
        if ($args['post_id']) {
            $where[] = 'post_id = %d';
            $values[] = intval($args['post_id']);
        }
        
        if ($args['article_id']) {
            $where[] = 'article_id = %s';
            $values[] = $args['article_id'];
        }
        
        if ($args['project_id']) {
            $where[] = 'project_id = %s';
            $values[] = $args['project_id'];
        }
        
        $where_clause = implode(' AND ', $where);
        
        // Validate order_by
        $allowed_order_by = array('id', 'created_at', 'updated_at', 'priority', 'status');
        $order_by = in_array($args['order_by'], $allowed_order_by) ? $args['order_by'] : 'created_at';
        $order = strtoupper($args['order']) === 'ASC' ? 'ASC' : 'DESC';
        
        $sql = "SELECT * FROM {$table_name} WHERE {$where_clause} ORDER BY {$order_by} {$order} LIMIT %d OFFSET %d";
        $values[] = intval($args['limit']);
        $values[] = intval($args['offset']);
        
        $items = $wpdb->get_results($wpdb->prepare($sql, $values), ARRAY_A);
        
        // Decode JSON fields
        foreach ($items as &$item) {
            $item['payload'] = json_decode($item['payload'], true);
            if (!empty($item['metadata'])) {
                $item['metadata'] = json_decode($item['metadata'], true);
            }
            if (!empty($item['result'])) {
                $item['result'] = json_decode($item['result'], true);
            }
        }
        
        return $items;
    }
    
    /**
     * Get queue statistics
     */
    public static function get_stats($queue_type = null) {
        global $wpdb;
        
        $table_name = $wpdb->prefix . self::TABLE_NAME;
        
        $where = $queue_type ? $wpdb->prepare("WHERE queue_type = %s", $queue_type) : '';
        
        $stats = $wpdb->get_results(
            "SELECT status, COUNT(*) as count, AVG(attempts) as avg_attempts 
             FROM {$table_name} {$where} 
             GROUP BY status",
            ARRAY_A
        );
        
        $result = array(
            'pending' => 0,
            'processing' => 0,
            'completed' => 0,
            'failed' => 0,
            'cancelled' => 0,
            'paused' => 0,
            'total' => 0,
            'avg_attempts' => 0,
        );
        
        $total_attempts = 0;
        $total_items = 0;
        
        foreach ($stats as $row) {
            $result[$row['status']] = intval($row['count']);
            $result['total'] += intval($row['count']);
            $total_attempts += floatval($row['avg_attempts']) * intval($row['count']);
            $total_items += intval($row['count']);
        }
        
        if ($total_items > 0) {
            $result['avg_attempts'] = round($total_attempts / $total_items, 2);
        }
        
        // Get processing rate (last hour)
        $result['completed_last_hour'] = intval($wpdb->get_var(
            "SELECT COUNT(*) FROM {$table_name} 
             WHERE status = 'completed' AND completed_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)"
        ));
        
        return $result;
    }
    
    /**
     * Cancel a queue item
     */
    public static function cancel($id) {
        global $wpdb;
        
        $table_name = $wpdb->prefix . self::TABLE_NAME;
        
        return $wpdb->update(
            $table_name,
            array('status' => self::STATUS_CANCELLED),
            array(
                'id' => intval($id),
                'status' => array(self::STATUS_PENDING, self::STATUS_PAUSED),
            )
        );
    }
    
    /**
     * Pause a queue item
     */
    public static function pause($id) {
        global $wpdb;
        
        $table_name = $wpdb->prefix . self::TABLE_NAME;
        
        return $wpdb->update(
            $table_name,
            array('status' => self::STATUS_PAUSED),
            array('id' => intval($id), 'status' => self::STATUS_PENDING)
        );
    }
    
    /**
     * Resume a paused item
     */
    public static function resume($id) {
        global $wpdb;
        
        $table_name = $wpdb->prefix . self::TABLE_NAME;
        
        return $wpdb->update(
            $table_name,
            array('status' => self::STATUS_PENDING),
            array('id' => intval($id), 'status' => self::STATUS_PAUSED)
        );
    }
    
    /**
     * Retry a failed item
     */
    public static function retry($id) {
        global $wpdb;
        
        $table_name = $wpdb->prefix . self::TABLE_NAME;
        
        return $wpdb->update(
            $table_name,
            array(
                'status' => self::STATUS_PENDING,
                'attempts' => 0,
                'next_retry_at' => null,
                'error_message' => null,
                'error_trace' => null,
                'worker_id' => null,
            ),
            array('id' => intval($id), 'status' => self::STATUS_FAILED)
        );
    }
    
    /**
     * Cleanup old completed/cancelled items
     */
    public static function cleanup($days = 7) {
        global $wpdb;
        
        $table_name = $wpdb->prefix . self::TABLE_NAME;
        $cutoff = date('Y-m-d H:i:s', strtotime("-{$days} days"));
        
        $deleted = $wpdb->query($wpdb->prepare(
            "DELETE FROM {$table_name} 
             WHERE status IN ('completed', 'cancelled') 
             AND updated_at < %s",
            $cutoff
        ));
        
        if ($deleted > 0) {
            CFRDM_Logger::info('content_queue', "Limpeza: {$deleted} itens removidos da fila");
        }
        
        return $deleted;
    }
    
    /**
     * Reset stuck processing items
     */
    public static function reset_stuck($timeout_minutes = 30) {
        global $wpdb;
        
        $table_name = $wpdb->prefix . self::TABLE_NAME;
        $cutoff = date('Y-m-d H:i:s', strtotime("-{$timeout_minutes} minutes"));
        
        $reset = $wpdb->query($wpdb->prepare(
            "UPDATE {$table_name} SET 
                status = 'pending',
                worker_id = NULL,
                error_message = 'Reset: item travado em processamento'
             WHERE status = 'processing' 
             AND started_at < %s",
            $cutoff
        ));
        
        if ($reset > 0) {
            CFRDM_Logger::warning('content_queue', "{$reset} itens travados foram resetados");
        }
        
        return $reset;
    }
    
    /**
     * Generate unique worker ID
     */
    private static function generate_worker_id() {
        return sprintf(
            'worker_%s_%s',
            gethostname() ?: 'unknown',
            substr(md5(uniqid('', true)), 0, 8)
        );
    }
    
    /**
     * Trigger async processing
     */
    private static function trigger_process() {
        if (!wp_next_scheduled('cfrdm_process_content_queue')) {
            wp_schedule_single_event(time(), 'cfrdm_process_content_queue');
        }
    }
    
    /**
     * Process queue items
     */
    public static function process($queue_type = null, $limit = 5) {
        $results = array(
            'processed' => 0,
            'completed' => 0,
            'failed' => 0,
        );
        
        $items = self::pop($queue_type, $limit);
        
        if (!is_array($items)) {
            $items = $items ? array($items) : array();
        }
        
        foreach ($items as $item) {
            $results['processed']++;
            
            try {
                // Execute the action
                $action_result = apply_filters(
                    "cfrdm_queue_process_{$item['action']}",
                    null,
                    $item['payload'],
                    $item
                );
                
                if (is_wp_error($action_result)) {
                    self::fail($item['id'], $action_result->get_error_message());
                    $results['failed']++;
                } else {
                    self::complete($item['id'], $action_result);
                    $results['completed']++;
                }
            } catch (Exception $e) {
                self::fail($item['id'], $e->getMessage(), $e->getTraceAsString());
                $results['failed']++;
            }
        }
        
        return $results;
    }
}
