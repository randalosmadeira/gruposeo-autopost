<?php
/**
 * Method Signature Validator
 * 
 * Validates that cross-class method calls have matching signatures at boot time,
 * preventing fatal "undefined method" or "wrong parameter count" errors in production.
 * 
 * Runs once per request (on admin_init) and caches results in a transient.
 * If a mismatch is found, logs a structured warning instead of crashing.
 *
 * @package Zica.ai_RDM
 * @since 3.2.4
 */

if (!defined('ABSPATH')) {
    exit;
}

class ZICA_AI_Method_Validator {

    /**
     * Cross-class method contracts.
     * Format: 'ClassName::method' => ['min_params' => int, 'max_params' => int|null]
     * max_params = null means variadic / unlimited.
     */
    private static function get_contracts() {
        return array(
            // Social module
            'ZICA_AI_Social_Poster::get_queue_items'  => array('min' => 0, 'max' => 1),
            'ZICA_AI_Social_Poster::add_account'      => array('min' => 1, 'max' => 1),
            'ZICA_AI_Social_Poster::remove_account'    => array('min' => 1, 'max' => 1),
            'ZICA_AI_Social_Poster::get_accounts'      => array('min' => 0, 'max' => 1),
            'ZICA_AI_Social_Poster::schedule_post'     => array('min' => 1, 'max' => 1),

            // AI Auto-Fix
            'ZICA_AI_AI_Auto_Fix::add_to_queue'        => array('min' => 1, 'max' => 5),
            'ZICA_AI_AI_Auto_Fix::get_queue'           => array('min' => 0, 'max' => 1),

            // IndexNow
            'ZICA_AI_IndexNow::get_key'                => array('min' => 0, 'max' => 0),
            'ZICA_AI_IndexNow::submit_indexnow'        => array('min' => 1, 'max' => 1),
            'ZICA_AI_IndexNow::submit_batch'           => array('min' => 1, 'max' => 1),

            // Meta Auditor
            'ZICA_AI_Meta_Auditor::audit_single_post'  => array('min' => 1, 'max' => 1),
            'ZICA_AI_Meta_Auditor::is_enabled'         => array('min' => 0, 'max' => 0),

            // Content Queue
            'ZICA_AI_Content_Queue::add_item'          => array('min' => 1, 'max' => 1),
            'ZICA_AI_Content_Queue::get_pending'       => array('min' => 0, 'max' => 1),

            // Cron Scheduler
            'ZICA_AI_Cron_Scheduler::register_job'     => array('min' => 1, 'max' => 5),

            // LLMS Txt
            'ZICA_AI_LLMS_Txt::invalidate_cache'       => array('min' => 0, 'max' => 0),

            // Logger
            'ZICA_AI_Logger::success'                  => array('min' => 2, 'max' => 4),
            'ZICA_AI_Logger::error'                    => array('min' => 2, 'max' => 4),
            'ZICA_AI_Logger::warning'                  => array('min' => 2, 'max' => 4),

            // SEO Checklist
            'ZICA_AI_SEO_Checklist::get_results'       => array('min' => 0, 'max' => 0),

            // AI Traffic Detector
            'ZICA_AI_AI_Traffic_Detector::get_stats'   => array('min' => 0, 'max' => 1),

            // Social Poster - queue management
            'ZICA_AI_Social_Poster::get_queue_stats'   => array('min' => 0, 'max' => 0),
            'ZICA_AI_Social_Poster::process_queue'     => array('min' => 0, 'max' => 1),
        );
    }

    /**
     * Run validation (called once on admin_init, cached for 1 hour)
     */
    public static function validate() {
        $cache_key = 'cfrdm_method_validation_' . ZICA_AI_VERSION;
        $cached = get_transient($cache_key);

        if ($cached !== false) {
            return $cached;
        }

        $contracts = self::get_contracts();
        $issues = array();

        foreach ($contracts as $signature => $expected) {
            list($class, $method) = explode('::', $signature, 2);

            // Skip if class not loaded (optional module)
            if (!class_exists($class)) {
                continue;
            }

            // Check method exists
            if (!method_exists($class, $method)) {
                $issues[] = array(
                    'type'    => 'missing_method',
                    'class'   => $class,
                    'method'  => $method,
                    'message' => sprintf('%s::%s() não existe. Será necessário implementar.', $class, $method),
                );
                continue;
            }

            // Check parameter count
            try {
                $ref = new ReflectionMethod($class, $method);
                $actual_min = $ref->getNumberOfRequiredParameters();
                $actual_max = $ref->getNumberOfParameters();

                // Validate: the actual method should accept at least expected min params
                if ($expected['max'] !== null && $actual_min > $expected['max']) {
                    $issues[] = array(
                        'type'    => 'param_mismatch',
                        'class'   => $class,
                        'method'  => $method,
                        'message' => sprintf(
                            '%s::%s() exige no mínimo %d parâmetros, mas chamadores enviam até %d.',
                            $class, $method, $actual_min, $expected['max']
                        ),
                    );
                }
            } catch (ReflectionException $e) {
                // Silently skip reflection errors
            }
        }

        $result = array(
            'valid'      => empty($issues),
            'issues'     => $issues,
            'checked_at' => current_time('c'),
            'version'    => ZICA_AI_VERSION,
        );

        // Cache for 1 hour (cleared on plugin update via version key)
        set_transient($cache_key, $result, HOUR_IN_SECONDS);

        // Log issues if found
        if (!empty($issues) && class_exists('ZICA_AI_Logger')) {
            foreach ($issues as $issue) {
                ZICA_AI_Logger::warning('method_validator', $issue['message'], $issue);
            }
        }

        return $result;
    }

    /**
     * Get last validation result (from cache or run fresh)
     */
    public static function get_report() {
        return self::validate();
    }

    /**
     * Clear validation cache (called on plugin update)
     */
    public static function clear_cache() {
        delete_transient('cfrdm_method_validation_' . ZICA_AI_VERSION);
    }

    /**
     * Safe static call wrapper - prevents fatal errors from missing/incompatible methods.
     * Usage: ZICA_AI_Method_Validator::safe_call('ZICA_AI_Social_Poster', 'get_queue_items', array($args))
     *
     * @param string $class  Class name
     * @param string $method Method name
     * @param array  $args   Arguments to pass
     * @param mixed  $fallback Value to return if call fails
     * @return mixed
     */
    public static function safe_call($class, $method, $args = array(), $fallback = null) {
        if (!class_exists($class)) {
            if (class_exists('ZICA_AI_Logger')) {
                ZICA_AI_Logger::warning('method_validator', sprintf('Classe %s não encontrada.', $class));
            }
            return $fallback;
        }

        if (!method_exists($class, $method)) {
            if (class_exists('ZICA_AI_Logger')) {
                ZICA_AI_Logger::warning('method_validator', sprintf('%s::%s() não existe.', $class, $method));
            }
            return $fallback;
        }

        try {
            return call_user_func_array(array($class, $method), $args);
        } catch (\Throwable $e) {
            if (class_exists('ZICA_AI_Logger')) {
                ZICA_AI_Logger::error('method_validator', sprintf('Erro em %s::%s(): %s', $class, $method, $e->getMessage()));
            }
            return $fallback;
        }
    }
}
