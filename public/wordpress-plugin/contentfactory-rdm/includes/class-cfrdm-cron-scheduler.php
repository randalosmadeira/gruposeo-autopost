<?php
/**
 * Advanced Cron Scheduler - Internal scheduling system with diagnostics
 * 
 * Features:
 * - Custom cron intervals
 * - Job monitoring and diagnostics
 * - Retry on failure
 * - Job history
 * - Manual trigger support
 * - Lock mechanism to prevent overlapping
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_Cron_Scheduler {
    
    /**
     * Jobs table name
     */
    const JOBS_TABLE = 'cfrdm_cron_jobs';
    
    /**
     * History table name
     */
    const HISTORY_TABLE = 'cfrdm_cron_history';
    
    /**
     * Lock option prefix
     */
    const LOCK_PREFIX = 'cfrdm_cron_lock_';
    
    /**
     * Custom intervals
     */
    public static function get_intervals() {
        return array(
            'every_minute' => array(
                'interval' => 60,
                'display' => 'A cada minuto',
            ),
            'every_2_minutes' => array(
                'interval' => 120,
                'display' => 'A cada 2 minutos',
            ),
            'every_5_minutes' => array(
                'interval' => 300,
                'display' => 'A cada 5 minutos',
            ),
            'every_15_minutes' => array(
                'interval' => 900,
                'display' => 'A cada 15 minutos',
            ),
            'every_30_minutes' => array(
                'interval' => 1800,
                'display' => 'A cada 30 minutos',
            ),
            'hourly' => array(
                'interval' => 3600,
                'display' => 'A cada hora',
            ),
            'every_2_hours' => array(
                'interval' => 7200,
                'display' => 'A cada 2 horas',
            ),
            'every_6_hours' => array(
                'interval' => 21600,
                'display' => 'A cada 6 horas',
            ),
            'twice_daily' => array(
                'interval' => 43200,
                'display' => 'Duas vezes ao dia',
            ),
            'daily' => array(
                'interval' => 86400,
                'display' => 'Diariamente',
            ),
            'weekly' => array(
                'interval' => 604800,
                'display' => 'Semanalmente',
            ),
        );
    }
    
    /**
     * Register custom intervals with WordPress
     */
    public static function register_intervals($schedules) {
        foreach (self::get_intervals() as $key => $interval) {
            if (!isset($schedules[$key])) {
                $schedules[$key] = $interval;
            }
        }
        return $schedules;
    }
    
    /**
     * Create required tables
     */
    public static function create_tables() {
        global $wpdb;
        
        $charset_collate = $wpdb->get_charset_collate();
        
        // Jobs table
        $jobs_table = $wpdb->prefix . self::JOBS_TABLE;
        $sql_jobs = "CREATE TABLE IF NOT EXISTS {$jobs_table} (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            job_name varchar(100) NOT NULL,
            job_hook varchar(100) NOT NULL,
            job_args longtext,
            schedule_interval varchar(50) NOT NULL,
            is_enabled tinyint(1) DEFAULT 1,
            next_run datetime DEFAULT NULL,
            last_run datetime DEFAULT NULL,
            last_status varchar(50) DEFAULT NULL,
            last_duration_ms int DEFAULT NULL,
            run_count int DEFAULT 0,
            error_count int DEFAULT 0,
            consecutive_errors int DEFAULT 0,
            last_error text,
            max_retries int DEFAULT 3,
            timeout_seconds int DEFAULT 300,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY job_name (job_name),
            KEY job_hook (job_hook),
            KEY is_enabled (is_enabled),
            KEY next_run (next_run)
        ) {$charset_collate};";
        
        // History table
        $history_table = $wpdb->prefix . self::HISTORY_TABLE;
        $sql_history = "CREATE TABLE IF NOT EXISTS {$history_table} (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            job_id bigint(20) NOT NULL,
            job_name varchar(100) NOT NULL,
            started_at datetime NOT NULL,
            finished_at datetime DEFAULT NULL,
            status varchar(50) DEFAULT 'running',
            duration_ms int DEFAULT NULL,
            result text,
            error_message text,
            memory_peak int DEFAULT NULL,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY job_id (job_id),
            KEY job_name (job_name),
            KEY started_at (started_at),
            KEY status (status)
        ) {$charset_collate};";
        
        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        dbDelta($sql_jobs);
        dbDelta($sql_history);
        
        CFRDM_Logger::success('cron_scheduler', 'Tabelas de agendamento criadas/atualizadas');
    }
    
    /**
     * Register a new cron job
     */
    public static function register_job($name, $hook, $interval, $args = array(), $options = array()) {
        global $wpdb;
        
        $table = $wpdb->prefix . self::JOBS_TABLE;
        
        // Check if job exists
        $existing = $wpdb->get_row($wpdb->prepare(
            "SELECT id FROM {$table} WHERE job_name = %s",
            $name
        ));
        
        $data = array(
            'job_name' => $name,
            'job_hook' => $hook,
            'job_args' => wp_json_encode($args),
            'schedule_interval' => $interval,
            'is_enabled' => isset($options['enabled']) ? intval($options['enabled']) : 1,
            'max_retries' => isset($options['max_retries']) ? intval($options['max_retries']) : 3,
            'timeout_seconds' => isset($options['timeout']) ? intval($options['timeout']) : 300,
        );
        
        if (!$existing) {
            // Calculate next run
            $intervals = self::get_intervals();
            $interval_seconds = $intervals[$interval]['interval'] ?? 3600;
            $data['next_run'] = date('Y-m-d H:i:s', time() + $interval_seconds);
            
            $wpdb->insert($table, $data);
            $job_id = $wpdb->insert_id;
        } else {
            $wpdb->update($table, $data, array('id' => $existing->id));
            $job_id = $existing->id;
        }
        
        // Schedule WordPress cron if not exists
        if (!wp_next_scheduled($hook, $args)) {
            wp_schedule_event(time(), $interval, $hook, $args);
        }
        
        return $job_id;
    }
    
    /**
     * Unregister a job
     */
    public static function unregister_job($name) {
        global $wpdb;
        
        $table = $wpdb->prefix . self::JOBS_TABLE;
        
        $job = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$table} WHERE job_name = %s",
            $name
        ));
        
        if ($job) {
            $args = json_decode($job->job_args, true) ?: array();
            wp_clear_scheduled_hook($job->job_hook, $args);
            $wpdb->delete($table, array('job_name' => $name));
        }
        
        return true;
    }
    
    /**
     * Enable/disable a job
     */
    public static function toggle_job($job_id, $enabled) {
        global $wpdb;
        
        $table = $wpdb->prefix . self::JOBS_TABLE;
        
        return $wpdb->update(
            $table,
            array('is_enabled' => $enabled ? 1 : 0),
            array('id' => intval($job_id))
        );
    }
    
    /**
     * Get all jobs
     */
    public static function get_jobs($enabled_only = false) {
        global $wpdb;
        
        $table = $wpdb->prefix . self::JOBS_TABLE;
        $where = $enabled_only ? 'WHERE is_enabled = 1' : '';
        
        return $wpdb->get_results(
            "SELECT * FROM {$table} {$where} ORDER BY job_name",
            ARRAY_A
        );
    }
    
    /**
     * Get a job by name
     */
    public static function get_job($name) {
        global $wpdb;
        
        $table = $wpdb->prefix . self::JOBS_TABLE;
        
        return $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$table} WHERE job_name = %s",
            $name
        ), ARRAY_A);
    }
    
    /**
     * Acquire lock for a job
     */
    private static function acquire_lock($job_name, $timeout = 300) {
        $lock_key = self::LOCK_PREFIX . $job_name;
        $lock_value = get_transient($lock_key);
        
        if ($lock_value !== false) {
            return false; // Already locked
        }
        
        set_transient($lock_key, time(), $timeout);
        return true;
    }
    
    /**
     * Release lock for a job
     */
    private static function release_lock($job_name) {
        delete_transient(self::LOCK_PREFIX . $job_name);
    }
    
    /**
     * Run a job
     */
    public static function run_job($job_name, $manual = false) {
        global $wpdb;
        
        $table = $wpdb->prefix . self::JOBS_TABLE;
        
        $job = self::get_job($job_name);
        
        if (!$job) {
            return new WP_Error('job_not_found', 'Job não encontrado: ' . $job_name);
        }
        
        if (!$job['is_enabled'] && !$manual) {
            return new WP_Error('job_disabled', 'Job desabilitado: ' . $job_name);
        }
        
        // Try to acquire lock
        if (!self::acquire_lock($job_name, $job['timeout_seconds'])) {
            return new WP_Error('job_locked', 'Job já está em execução: ' . $job_name);
        }
        
        // Start history entry
        $history_id = self::start_history($job);
        
        $start_time = microtime(true);
        $start_memory = memory_get_usage(true);
        
        try {
            // Execute the hook
            $args = json_decode($job['job_args'], true) ?: array();
            
            ob_start();
            do_action($job['job_hook'], ...$args);
            $output = ob_get_clean();
            
            $duration_ms = round((microtime(true) - $start_time) * 1000);
            $memory_peak = memory_get_peak_usage(true) - $start_memory;
            
            // Update job stats
            $intervals = self::get_intervals();
            $interval_seconds = $intervals[$job['schedule_interval']]['interval'] ?? 3600;
            
            $wpdb->update($table, array(
                'last_run' => current_time('mysql'),
                'last_status' => 'success',
                'last_duration_ms' => $duration_ms,
                'run_count' => $job['run_count'] + 1,
                'consecutive_errors' => 0,
                'last_error' => null,
                'next_run' => date('Y-m-d H:i:s', time() + $interval_seconds),
            ), array('id' => $job['id']));
            
            // Complete history
            self::complete_history($history_id, 'success', $duration_ms, $output, null, $memory_peak);
            
            self::release_lock($job_name);
            
            return array(
                'success' => true,
                'duration_ms' => $duration_ms,
                'output' => $output,
            );
            
        } catch (Exception $e) {
            $duration_ms = round((microtime(true) - $start_time) * 1000);
            $memory_peak = memory_get_peak_usage(true) - $start_memory;
            
            // Update job error stats
            $wpdb->update($table, array(
                'last_run' => current_time('mysql'),
                'last_status' => 'error',
                'last_duration_ms' => $duration_ms,
                'error_count' => $job['error_count'] + 1,
                'consecutive_errors' => $job['consecutive_errors'] + 1,
                'last_error' => $e->getMessage(),
            ), array('id' => $job['id']));
            
            // Complete history with error
            self::complete_history($history_id, 'error', $duration_ms, null, $e->getMessage(), $memory_peak);
            
            self::release_lock($job_name);
            
            CFRDM_Logger::error('cron_scheduler', 'Job falhou: ' . $job_name, array(
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ));
            
            return new WP_Error('job_failed', $e->getMessage());
        }
    }
    
    /**
     * Start history entry
     */
    private static function start_history($job) {
        global $wpdb;
        
        $table = $wpdb->prefix . self::HISTORY_TABLE;
        
        $wpdb->insert($table, array(
            'job_id' => $job['id'],
            'job_name' => $job['job_name'],
            'started_at' => current_time('mysql'),
            'status' => 'running',
        ));
        
        return $wpdb->insert_id;
    }
    
    /**
     * Complete history entry
     */
    private static function complete_history($history_id, $status, $duration_ms, $result = null, $error = null, $memory_peak = null) {
        global $wpdb;
        
        $table = $wpdb->prefix . self::HISTORY_TABLE;
        
        $wpdb->update($table, array(
            'finished_at' => current_time('mysql'),
            'status' => $status,
            'duration_ms' => $duration_ms,
            'result' => $result ? substr($result, 0, 10000) : null,
            'error_message' => $error,
            'memory_peak' => $memory_peak,
        ), array('id' => $history_id));
    }
    
    /**
     * Get job history
     */
    public static function get_history($job_name = null, $limit = 50) {
        global $wpdb;
        
        $table = $wpdb->prefix . self::HISTORY_TABLE;
        
        if ($job_name) {
            return $wpdb->get_results($wpdb->prepare(
                "SELECT * FROM {$table} WHERE job_name = %s ORDER BY started_at DESC LIMIT %d",
                $job_name,
                $limit
            ), ARRAY_A);
        }
        
        return $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$table} ORDER BY started_at DESC LIMIT %d",
            $limit
        ), ARRAY_A);
    }
    
    /**
     * Get diagnostics
     */
    public static function get_diagnostics() {
        global $wpdb;
        
        $jobs_table = $wpdb->prefix . self::JOBS_TABLE;
        $history_table = $wpdb->prefix . self::HISTORY_TABLE;
        
        // Get job stats
        $jobs = self::get_jobs();
        
        $job_stats = array(
            'total' => count($jobs),
            'enabled' => 0,
            'disabled' => 0,
            'with_errors' => 0,
            'overdue' => 0,
        );
        
        $now = time();
        
        foreach ($jobs as $job) {
            if ($job['is_enabled']) {
                $job_stats['enabled']++;
            } else {
                $job_stats['disabled']++;
            }
            
            if ($job['consecutive_errors'] > 0) {
                $job_stats['with_errors']++;
            }
            
            if ($job['next_run'] && strtotime($job['next_run']) < $now) {
                $job_stats['overdue']++;
            }
        }
        
        // Get recent history stats
        $history_stats = $wpdb->get_row(
            "SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
                SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error,
                AVG(duration_ms) as avg_duration
             FROM {$history_table}
             WHERE started_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)",
            ARRAY_A
        );
        
        // Check WordPress cron health
        $wp_cron_status = array(
            'doing_cron' => defined('DOING_CRON') && DOING_CRON,
            'disabled' => defined('DISABLE_WP_CRON') && DISABLE_WP_CRON,
            'next_scheduled' => wp_next_scheduled('wp_cron'),
        );
        
        return array(
            'jobs' => $job_stats,
            'history_24h' => array(
                'total' => intval($history_stats['total']),
                'success' => intval($history_stats['success']),
                'error' => intval($history_stats['error']),
                'success_rate' => $history_stats['total'] > 0 
                    ? round(($history_stats['success'] / $history_stats['total']) * 100, 2) 
                    : 0,
                'avg_duration_ms' => round(floatval($history_stats['avg_duration']), 2),
            ),
            'wp_cron' => $wp_cron_status,
            'server_time' => current_time('c'),
        );
    }
    
    /**
     * Cleanup old history
     */
    public static function cleanup_history($days = 30) {
        global $wpdb;
        
        $table = $wpdb->prefix . self::HISTORY_TABLE;
        $cutoff = date('Y-m-d H:i:s', strtotime("-{$days} days"));
        
        $deleted = $wpdb->query($wpdb->prepare(
            "DELETE FROM {$table} WHERE started_at < %s",
            $cutoff
        ));
        
        if ($deleted > 0) {
            CFRDM_Logger::info('cron_scheduler', "Histórico limpo: {$deleted} registros removidos");
        }
        
        return $deleted;
    }
    
    /**
     * Reset stuck jobs + repair truncated history
     */
    public static function reset_stuck_jobs($timeout_minutes = 30) {
        global $wpdb;
        
        $cutoff = date('Y-m-d H:i:s', strtotime("-{$timeout_minutes} minutes"));
        
        // Find running history entries that are too old
        $history_table = $wpdb->prefix . self::HISTORY_TABLE;
        
        $stuck = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$history_table} WHERE status = 'running' AND started_at < %s",
            $cutoff
        ), ARRAY_A);
        
        foreach ($stuck as $entry) {
            // Mark as timeout
            $wpdb->update($history_table, array(
                'status' => 'timeout',
                'finished_at' => current_time('mysql'),
                'error_message' => 'Job excedeu o tempo limite - auto-recuperado v3.6.0',
            ), array('id' => $entry['id']));
            
            // Release lock
            self::release_lock($entry['job_name']);
            
            CFRDM_Logger::warning('cron_scheduler', 'Job travado resetado: ' . $entry['job_name']);
        }
        
        // Repair truncated history (null finished_at, non-running status)
        $truncated = $wpdb->query(
            "UPDATE {$history_table} SET 
                finished_at = COALESCE(finished_at, NOW()),
                status = CASE 
                    WHEN status = 'running' AND started_at < DATE_SUB(NOW(), INTERVAL 60 MINUTE) THEN 'timeout'
                    WHEN status IS NULL OR status = '' THEN 'unknown'
                    ELSE status 
                END,
                error_message = CASE 
                    WHEN (status = 'running' AND started_at < DATE_SUB(NOW(), INTERVAL 60 MINUTE)) 
                         OR status IS NULL OR status = '' 
                    THEN CONCAT(COALESCE(error_message, ''), ' [auto-repair v3.6.0]')
                    ELSE error_message 
                END
            WHERE (finished_at IS NULL AND status != 'running')
               OR (status = 'running' AND started_at < DATE_SUB(NOW(), INTERVAL 60 MINUTE))
               OR status IS NULL 
               OR status = ''"
        );
        
        if ($truncated > 0) {
            CFRDM_Logger::info('cron_scheduler', "Histórico truncado reparado: {$truncated} registros");
        }
        
        // Reset maintenance mode locks (WordPress transients)
        self::clear_stale_maintenance_locks();
        
        // Auto-re-enable jobs disabled by consecutive errors (if errors are old)
        $jobs_table = $wpdb->prefix . self::JOBS_TABLE;
        $auto_recovered = $wpdb->query(
            "UPDATE {$jobs_table} SET 
                is_enabled = 1, 
                consecutive_errors = 0,
                last_error = CONCAT(COALESCE(last_error, ''), ' [auto-recovered v3.6.0]')
            WHERE is_enabled = 0 
              AND consecutive_errors > 0
              AND last_run < DATE_SUB(NOW(), INTERVAL 2 HOUR)"
        );
        
        if ($auto_recovered > 0) {
            CFRDM_Logger::success('cron_scheduler', "Jobs auto-recuperados: {$auto_recovered}");
        }
        
        return count($stuck) + $truncated + $auto_recovered;
    }
    
    /**
     * Clear stale maintenance/lock transients
     */
    private static function clear_stale_maintenance_locks() {
        global $wpdb;
        
        // Delete expired CFRDM lock transients
        $wpdb->query(
            "DELETE FROM {$wpdb->options} 
             WHERE option_name LIKE '_transient_cfrdm_cron_lock_%' 
               AND option_name NOT LIKE '_transient_timeout_%'"
        );
        
        // Delete expired timeout transients older than 1 hour
        $wpdb->query($wpdb->prepare(
            "DELETE a, b FROM {$wpdb->options} a
             LEFT JOIN {$wpdb->options} b ON b.option_name = REPLACE(a.option_name, '_transient_timeout_', '_transient_')
             WHERE a.option_name LIKE '_transient_timeout_cfrdm_%%'
               AND a.option_value < %d",
            time() - 3600
        ));
        
        // Remove WordPress maintenance mode file if stale (>15 min)
        $maintenance_file = ABSPATH . '.maintenance';
        if (file_exists($maintenance_file)) {
            $mtime = filemtime($maintenance_file);
            if ($mtime && (time() - $mtime) > 900) {
                @unlink($maintenance_file);
                CFRDM_Logger::warning('cron_scheduler', 'Arquivo .maintenance travado removido (>15min)');
            }
        }
    }
    
    /**
     * Full self-healing diagnostic run
     */
    public static function run_self_healing() {
        $result = array(
            'stuck_reset' => self::reset_stuck_jobs(15),
            'history_cleaned' => self::cleanup_history(30),
            'tables_ok' => true,
        );
        
        // Verify tables exist
        global $wpdb;
        $jobs_table = $wpdb->prefix . self::JOBS_TABLE;
        $exists = $wpdb->get_var("SHOW TABLES LIKE '{$jobs_table}'");
        if (!$exists) {
            self::create_tables();
            $result['tables_ok'] = false;
            CFRDM_Logger::warning('cron_scheduler', 'Tabelas de cron recriadas pelo self-healing');
        }
        
        // Re-register missing default jobs
        $jobs = self::get_jobs();
        $job_names = array_column($jobs, 'job_name');
        $defaults = array(
            'cfrdm_process_social_queue',
            'cfrdm_sync_stats', 
            'cfrdm_daily_cleanup',
            'cfrdm_cleanup_logs',
            'cfrdm_reset_stuck_jobs',
            'cfrdm_self_healing',
        );
        
        $missing = array_diff($defaults, $job_names);
        if (!empty($missing)) {
            self::register_default_jobs();
            $result['jobs_restored'] = count($missing);
            CFRDM_Logger::info('cron_scheduler', 'Jobs faltantes restaurados: ' . implode(', ', $missing));
        }
        
        return $result;
    }
    
    /**
     * Register default ContentFactory jobs
     */
    public static function register_default_jobs() {
        // Social queue processor
        self::register_job(
            'cfrdm_process_social_queue',
            'cfrdm_process_social_queue',
            'every_5_minutes',
            array(),
            array('timeout' => 180)
        );
        
        // Stats sync
        self::register_job(
            'cfrdm_sync_stats',
            'cfrdm_sync_stats',
            'hourly',
            array(),
            array('timeout' => 120)
        );
        
        // Daily cleanup
        self::register_job(
            'cfrdm_daily_cleanup',
            'cfrdm_daily_cleanup',
            'daily',
            array(),
            array('timeout' => 300)
        );
        
        // Log cleanup
        self::register_job(
            'cfrdm_cleanup_logs',
            'cfrdm_cleanup_structured_logs',
            'daily',
            array(),
            array('timeout' => 60)
        );
        
        // Reset stuck jobs (every 15 minutes)
        self::register_job(
            'cfrdm_reset_stuck_jobs',
            'cfrdm_reset_stuck_cron_jobs',
            'every_15_minutes',
            array(),
            array('timeout' => 30)
        );
        
        // Self-healing (every 2 hours)
        self::register_job(
            'cfrdm_self_healing',
            'cfrdm_run_self_healing',
            'every_2_hours',
            array(),
            array('timeout' => 120)
        );
    }
}
