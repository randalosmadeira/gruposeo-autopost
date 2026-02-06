<?php
/**
 * Diagnostics System - detects environment issues and plugin conflicts
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_Diagnostics {

    const STATUS_OK = 'ok';
    const STATUS_WARNING = 'warning';
    const STATUS_CRITICAL = 'critical';

    /**
     * Run full diagnostics report
     */
    public static function get_report() {
        $active_plugins = get_option('active_plugins', array());
        $memory_limit = ini_get('memory_limit');
        $memory_bytes = self::to_bytes($memory_limit);

        $tables = self::check_tables();
        $dependencies = self::check_dependencies();
        $builders = self::detect_page_builders($active_plugins);

        $issues = array(
            'critical' => array(),
            'warnings' => array(),
            'info' => array(),
        );

        // PHP/WordPress version checks
        if (version_compare(PHP_VERSION, '7.4.0', '<')) {
            $issues['critical'][] = sprintf('PHP %s detectado (mínimo recomendado: 7.4).', PHP_VERSION);
        }

        $wp_version = get_bloginfo('version');
        if (version_compare($wp_version, '5.8', '<')) {
            $issues['critical'][] = sprintf('WordPress %s detectado (mínimo recomendado: 5.8).', $wp_version);
        }

        // Memory checks
        if ($memory_bytes > 0 && $memory_bytes < 64 * 1024 * 1024) {
            $issues['critical'][] = sprintf('memory_limit muito baixo (%s). Recomendado: 128M+.', $memory_limit);
        } elseif ($memory_bytes > 0 && $memory_bytes < 128 * 1024 * 1024) {
            $issues['warnings'][] = sprintf('memory_limit baixo (%s). Recomendado: 128M+ para evitar conflitos com page builders.', $memory_limit);
        }

        // Tables checks
        if (!$tables['logs_table']) {
            $issues['warnings'][] = 'Tabela de logs (cfrdm_logs) não encontrada. Algumas telas podem ficar sem histórico até reativar o plugin.';
        }
        if (!$tables['news_table']) {
            $issues['warnings'][] = 'Tabela de notícias (cfrdm_news) não encontrada. O painel de notícias pode não funcionar até reativar o plugin.';
        }

        // Dependencies checks
        foreach ($dependencies['missing'] as $missing) {
            $issues['critical'][] = 'Dependência ausente: ' . $missing;
        }

        // Informational: page builders detected
        if (!empty($builders)) {
            $issues['info'][] = 'Page builders detectados: ' . implode(', ', array_values($builders));
            $issues['info'][] = 'O plugin aplica modo de compatibilidade para evitar execução durante salvamentos do builder.';
        }

        // Known high-risk plugins (informational)
        $known = self::detect_known_plugins($active_plugins);
        foreach ($known as $entry) {
            $issues['info'][] = $entry;
        }

        $status = self::STATUS_OK;
        if (!empty($issues['critical'])) {
            $status = self::STATUS_CRITICAL;
        } elseif (!empty($issues['warnings'])) {
            $status = self::STATUS_WARNING;
        }

        $decision = self::operational_hooks_decision($status, $issues);

        return array(
            'success' => true,
            'status' => $status,
            'generated_at' => current_time('c'),
            'environment' => array(
                'plugin_version' => defined('CFRDM_VERSION') ? CFRDM_VERSION : null,
                'wordpress_version' => $wp_version,
                'php_version' => PHP_VERSION,
                'memory_limit' => $memory_limit,
                'wp_debug' => defined('WP_DEBUG') ? (bool) WP_DEBUG : false,
            ),
            'tables' => $tables,
            'dependencies' => $dependencies,
            'page_builders' => $builders,
            'issues' => $issues,
            'operational_hooks' => $decision,
        );
    }

    /**
     * Whether to enable operational hooks (save_post, image optimization, webhooks...)
     */
    public static function should_enable_operational_hooks() {
        $report = self::get_report();
        return !empty($report['operational_hooks']['enabled']);
    }

    private static function operational_hooks_decision($status, $issues) {
        // Conservative: disable operational hooks only on CRITICAL
        if ($status === self::STATUS_CRITICAL) {
            return array(
                'enabled' => false,
                'reason' => 'Diagnóstico crítico detectado. Hooks operacionais desativados para evitar tela branca/conflitos.',
                'critical' => $issues['critical'],
            );
        }

        return array(
            'enabled' => true,
            'reason' => $status === self::STATUS_WARNING
                ? 'Diagnóstico com avisos. Hooks operacionais mantidos, mas recomenda-se revisar os avisos.'
                : 'Ambiente OK. Hooks operacionais habilitados.',
            'warnings' => $issues['warnings'],
        );
    }

    private static function check_tables() {
        global $wpdb;

        $result = array(
            'logs_table' => false,
            'news_table' => false,
        );

        if (!$wpdb) {
            return $result;
        }

        $logs_table = $wpdb->prefix . (defined('CFRDM_LOG_TABLE') ? CFRDM_LOG_TABLE : 'cfrdm_logs');
        $news_table = $wpdb->prefix . (defined('CFRDM_NEWS_TABLE') ? CFRDM_NEWS_TABLE : 'cfrdm_news');

        $result['logs_table'] = !empty($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $logs_table)));
        $result['news_table'] = !empty($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $news_table)));

        return $result;
    }

    private static function check_dependencies() {
        $missing = array();

        // REST API
        if (!class_exists('WP_REST_Response')) {
            $missing[] = 'WP_REST_Response (REST API)';
        }

        // HTTP
        if (!function_exists('wp_remote_post')) {
            $missing[] = 'wp_remote_post (HTTP API)';
        }

        // Media
        if (!function_exists('wp_get_image_editor')) {
            $missing[] = 'wp_get_image_editor (Image Editor)';
        }

        return array(
            'ok' => empty($missing),
            'missing' => $missing,
        );
    }

    private static function detect_page_builders($active_plugins) {
        $builders = array();

        foreach ((array) $active_plugins as $plugin) {
            if (strpos($plugin, 'elementor/elementor.php') !== false) {
                $builders['elementor'] = 'Elementor';
            }
            if (strpos($plugin, 'elementor-pro/elementor-pro.php') !== false) {
                $builders['elementor_pro'] = 'Elementor Pro';
            }
            if (strpos($plugin, 'beaver-builder-lite-version/fl-builder.php') !== false || strpos($plugin, 'bb-plugin/fl-builder.php') !== false) {
                $builders['beaver'] = 'Beaver Builder';
            }
            if (strpos($plugin, 'divi-builder/divi-builder.php') !== false || strpos($plugin, 'et-builder/et-builder.php') !== false) {
                $builders['divi'] = 'Divi Builder';
            }
            if (strpos($plugin, 'js_composer/js_composer.php') !== false) {
                $builders['wpbakery'] = 'WPBakery';
            }
        }

        return $builders;
    }

    private static function detect_known_plugins($active_plugins) {
        $notes = array();

        foreach ((array) $active_plugins as $plugin) {
            // Performance/caching layers that can interfere with REST
            if (strpos($plugin, 'litespeed-cache/litespeed-cache.php') !== false) {
                $notes[] = 'LiteSpeed Cache ativo: se houver falhas na REST API, verifique regras de cache/headers.';
            }
            if (strpos($plugin, 'wp-rocket/wp-rocket.php') !== false) {
                $notes[] = 'WP Rocket ativo: se houver falhas na REST API, verifique minificação/combinação no admin.';
            }
            if (strpos($plugin, 'wordfence/wordfence.php') !== false) {
                $notes[] = 'Wordfence ativo: pode bloquear requests de webhook/REST. Verifique firewall/allowlist.';
            }
        }

        return $notes;
    }

    private static function to_bytes($val) {
        if ($val === false || $val === null) {
            return 0;
        }

        $val = trim((string) $val);

        if ($val === '' || $val === '-1') {
            return 0; // unlimited/unknown
        }

        $last = strtolower(substr($val, -1));
        $num = (int) $val;

        switch ($last) {
            case 'g':
                $num *= 1024;
                // no break
            case 'm':
                $num *= 1024;
                // no break
            case 'k':
                $num *= 1024;
        }

        return $num;
    }
}
