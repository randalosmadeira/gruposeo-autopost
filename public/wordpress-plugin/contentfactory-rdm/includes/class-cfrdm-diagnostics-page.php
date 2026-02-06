<?php
/**
 * Diagnostics admin page
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_Diagnostics_Page {

    public static function render() {
        if (!current_user_can('manage_options')) {
            wp_die(__('Você não tem permissão para acessar esta página.', 'contentfactory-rdm'));
        }

        if (!class_exists('CFRDM_Diagnostics')) {
            echo '<div class="wrap"><h1>Diagnóstico</h1><p>Módulo de diagnóstico não carregado.</p></div>';
            return;
        }

        $report = CFRDM_Diagnostics::get_report();
        $status = $report['status'] ?? 'warning';

        $status_label = 'OK';
        $status_color = '#2e7d32';

        if ($status === CFRDM_Diagnostics::STATUS_WARNING) {
            $status_label = 'AVISOS';
            $status_color = '#b26a00';
        } elseif ($status === CFRDM_Diagnostics::STATUS_CRITICAL) {
            $status_label = 'CRÍTICO';
            $status_color = '#c62828';
        }

        $health_url = esc_url(rest_url('cfrdm/v1/healthcheck'));
        $basic_health_url = esc_url(rest_url('cfrdm/v1/health'));

        echo '<div class="wrap cfrdm-wrap">';
        echo '<h1>Diagnóstico <span style="display:inline-block;margin-left:10px;padding:4px 10px;border-radius:999px;background:' . esc_attr($status_color) . ';color:#fff;font-size:12px;">' . esc_html($status_label) . '</span></h1>';

        echo '<div class="notice notice-info"><p><strong>Endpoints:</strong><br>';
        echo '• Health básico: <code>' . $basic_health_url . '</code><br>';
        echo '• Healthcheck completo (requer API Key): <code>' . $health_url . '</code></p></div>';

        // Operational hooks decision
        $op = $report['operational_hooks'] ?? array();
        $enabled = !empty($op['enabled']);
        echo '<h2>Hooks Operacionais</h2>';
        echo '<p><strong>Status:</strong> ' . ($enabled ? '<span style="color:#2e7d32">HABILITADOS</span>' : '<span style="color:#c62828">DESABILITADOS (Modo seguro)</span>') . '</p>';
        if (!empty($op['reason'])) {
            echo '<p>' . esc_html($op['reason']) . '</p>';
        }

        // Issues
        echo '<h2>Problemas Detectados</h2>';
        self::render_issue_list('Críticos', $report['issues']['critical'] ?? array());
        self::render_issue_list('Avisos', $report['issues']['warnings'] ?? array());
        self::render_issue_list('Informações', $report['issues']['info'] ?? array());

        // Environment
        echo '<h2>Ambiente</h2>';
        self::render_kv_table(array(
            'Versão do plugin' => $report['environment']['plugin_version'] ?? '-',
            'WordPress' => $report['environment']['wordpress_version'] ?? '-',
            'PHP' => $report['environment']['php_version'] ?? '-',
            'memory_limit' => $report['environment']['memory_limit'] ?? '-',
            'WP_DEBUG' => !empty($report['environment']['wp_debug']) ? 'true' : 'false',
            'Gerado em' => $report['generated_at'] ?? '-',
        ));

        // Tables
        echo '<h2>Tabelas</h2>';
        self::render_kv_table(array(
            'cfrdm_logs' => !empty($report['tables']['logs_table']) ? 'OK' : 'NÃO ENCONTRADA',
            'cfrdm_news' => !empty($report['tables']['news_table']) ? 'OK' : 'NÃO ENCONTRADA',
        ));

        // Builders
        echo '<h2>Page Builders</h2>';
        if (!empty($report['page_builders'])) {
            echo '<p>Detectados: <strong>' . esc_html(implode(', ', array_values($report['page_builders']))) . '</strong></p>';
        } else {
            echo '<p>Nenhum page builder conhecido detectado.</p>';
        }

        echo '</div>';
    }

    private static function render_issue_list($title, $items) {
        echo '<h3>' . esc_html($title) . '</h3>';
        if (empty($items)) {
            echo '<p><em>Nenhum.</em></p>';
            return;
        }
        echo '<ul style="list-style:disc;padding-left:20px;">';
        foreach ($items as $item) {
            echo '<li>' . esc_html($item) . '</li>';
        }
        echo '</ul>';
    }

    private static function render_kv_table($data) {
        echo '<table class="widefat striped" style="max-width:900px;">';
        echo '<tbody>';
        foreach ($data as $k => $v) {
            echo '<tr>';
            echo '<th style="width:260px;">' . esc_html($k) . '</th>';
            echo '<td>' . esc_html($v) . '</td>';
            echo '</tr>';
        }
        echo '</tbody>';
        echo '</table>';
    }
}
