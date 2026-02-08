<?php
/**
 * Diagnostics admin page - v3.0.0
 * 
 * Enhanced with AI Auto-Fix, GSC Integration, and Cron Jobs monitoring
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
        echo '<h1>Diagnóstico v3.0.0 <span style="display:inline-block;margin-left:10px;padding:4px 10px;border-radius:999px;background:' . esc_attr($status_color) . ';color:#fff;font-size:12px;">' . esc_html($status_label) . '</span></h1>';

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

        // Tables with repair option
        echo '<h2>Tabelas do Banco de Dados</h2>';
        self::render_tables_section();

        // v3.0.0 - Cron Jobs Status
        echo '<h2>Cron Jobs v3.0.0</h2>';
        self::render_cron_jobs_section();

        // v3.0.0 - GSC Integration Status
        echo '<h2>Google Search Console</h2>';
        self::render_gsc_status_section();

        // v3.0.0 - AI Auto-Fix Queue
        echo '<h2>Fila de Correção Automática (AI)</h2>';
        self::render_fix_queue_section();

        // Builders
        echo '<h2>Page Builders</h2>';
        if (!empty($report['page_builders'])) {
            echo '<p>Detectados: <strong>' . esc_html(implode(', ', array_values($report['page_builders']))) . '</strong></p>';
        } else {
            echo '<p>Nenhum page builder conhecido detectado.</p>';
        }

        echo '</div>';
    }

    /**
     * Render tables section with v3.0.0 tables
     */
    private static function render_tables_section() {
        global $wpdb;
        
        $tables = array(
            'cfrdm_logs' => $wpdb->prefix . 'cfrdm_logs',
            'cfrdm_news' => $wpdb->prefix . 'cfrdm_news',
            'cfrdm_structured_logs' => $wpdb->prefix . 'cfrdm_structured_logs',
            'cfrdm_social_queue' => $wpdb->prefix . 'cfrdm_social_queue',
            'cfrdm_social_accounts' => $wpdb->prefix . 'cfrdm_social_accounts',
            'cfrdm_cron_jobs' => $wpdb->prefix . 'cfrdm_cron_jobs',
            'cfrdm_cron_history' => $wpdb->prefix . 'cfrdm_cron_history',
            'cfrdm_content_queue' => $wpdb->prefix . 'cfrdm_content_queue',
            'cfrdm_fix_queue' => $wpdb->prefix . 'cfrdm_fix_queue',
            'cfrdm_ubersuggest_data' => $wpdb->prefix . 'cfrdm_ubersuggest_data',
        );
        
        $table_status = array();
        $missing_tables = array();
        
        foreach ($tables as $name => $full_name) {
            $exists = $wpdb->get_var("SHOW TABLES LIKE '$full_name'") === $full_name;
            $table_status[$name] = $exists ? '✓ OK' : '✗ NÃO ENCONTRADA';
            if (!$exists) {
                $missing_tables[] = $name;
            }
        }
        
        // Add API Key status
        $api_key = get_option('cfrdm_api_key');
        $table_status['API Key'] = !empty($api_key) ? '✓ OK (' . substr($api_key, 0, 8) . '...)' : '✗ NÃO GERADA';
        if (empty($api_key)) {
            $missing_tables[] = 'API Key';
        }
        
        self::render_kv_table($table_status);
        
        // Show repair button if any tables are missing
        if (!empty($missing_tables)) {
            echo '<div style="margin: 15px 0; padding: 15px; background: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107;">';
            echo '<p style="margin:0 0 10px 0;"><strong>⚠️ Problemas detectados:</strong> ' . esc_html(implode(', ', $missing_tables)) . '</p>';
            echo '<button type="button" id="cfrdm-repair-tables" class="button button-primary" onclick="cfrdmRepairTables()">';
            echo '<span class="dashicons dashicons-admin-tools" style="vertical-align:middle;margin-right:5px;"></span>';
            echo 'Reparar Tabelas e Gerar API Key</button>';
            echo '<span id="cfrdm-repair-status" style="margin-left:10px;"></span>';
            echo '</div>';
        }
        
        // Always show the repair script regardless of missing tables
        echo '<script>
        function cfrdmRepairTables() {
            var btn = document.getElementById("cfrdm-repair-tables");
            var status = document.getElementById("cfrdm-repair-status");
            if (!btn || !status) return;
            
            btn.disabled = true;
            btn.innerHTML = "<span class=\"dashicons dashicons-update\" style=\"vertical-align:middle;margin-right:5px;animation:rotation 1s infinite linear;\"></span>Reparando...";
            status.textContent = "";
            
            // Add rotation animation
            var style = document.createElement("style");
            style.textContent = "@keyframes rotation { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }";
            document.head.appendChild(style);
            
            fetch("' . esc_url(rest_url('cfrdm/v1/repair-tables')) . '", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-WP-Nonce": "' . wp_create_nonce('wp_rest') . '"
                },
                credentials: "same-origin"
            })
            .then(function(response) {
                // Check if response is JSON
                var contentType = response.headers.get("content-type");
                if (contentType && contentType.indexOf("application/json") !== -1) {
                    return response.json();
                } else {
                    // Response is not JSON (probably HTML error page)
                    return response.text().then(function(text) {
                        throw new Error("O servidor retornou uma resposta inválida. Isso pode acontecer se sua sessão expirou ou há conflito de cache. Tente recarregar a página e fazer login novamente.");
                    });
                }
            })
            .then(function(data) {
                if (data.success) {
                    status.innerHTML = "<span style=\"color:#2e7d32;\">✓ " + data.message + "</span>";
                    if (data.created && data.created.length > 0) {
                        status.innerHTML += "<br><small>Criadas: " + data.created.join(", ") + "</small>";
                    }
                    setTimeout(function() { location.reload(); }, 2000);
                } else {
                    var errorMsg = data.message || "Erro desconhecido";
                    if (data.errors && data.errors.length > 0) {
                        errorMsg += " - " + data.errors.join("; ");
                    }
                    status.innerHTML = "<span style=\"color:#c62828;\">✗ " + errorMsg + "</span>";
                    btn.disabled = false;
                    btn.innerHTML = "<span class=\"dashicons dashicons-admin-tools\" style=\"vertical-align:middle;margin-right:5px;\"></span>Tentar Novamente";
                }
            })
            .catch(function(e) {
                status.innerHTML = "<span style=\"color:#c62828;\">✗ " + e.message + "</span>";
                status.innerHTML += "<br><small style=\"color:#666;\">Alternativa: Desative e reative o plugin na página de Plugins.</small>";
                btn.disabled = false;
                btn.innerHTML = "<span class=\"dashicons dashicons-admin-tools\" style=\"vertical-align:middle;margin-right:5px;\"></span>Tentar Novamente";
            });
        }
        
        // Alternative: Direct AJAX repair using admin-ajax.php as fallback
        function cfrdmRepairTablesAjax() {
            var btn = document.getElementById("cfrdm-repair-tables");
            var status = document.getElementById("cfrdm-repair-status");
            if (!btn || !status) return;
            
            btn.disabled = true;
            btn.innerHTML = "<span class=\"dashicons dashicons-update\" style=\"vertical-align:middle;margin-right:5px;animation:rotation 1s infinite linear;\"></span>Reparando (AJAX)...";
            
            var formData = new FormData();
            formData.append("action", "cfrdm_repair_tables");
            formData.append("_ajax_nonce", "' . wp_create_nonce('cfrdm_repair_tables') . '");
            
            fetch("' . admin_url('admin-ajax.php') . '", {
                method: "POST",
                body: formData,
                credentials: "same-origin"
            })
            .then(function(response) { return response.json(); })
            .then(function(data) {
                if (data.success) {
                    status.innerHTML = "<span style=\"color:#2e7d32;\">✓ " + data.data.message + "</span>";
                    setTimeout(function() { location.reload(); }, 2000);
                } else {
                    status.innerHTML = "<span style=\"color:#c62828;\">✗ " + (data.data || "Erro") + "</span>";
                    btn.disabled = false;
                    btn.innerHTML = "<span class=\"dashicons dashicons-admin-tools\" style=\"vertical-align:middle;margin-right:5px;\"></span>Tentar Novamente";
                }
            })
            .catch(function(e) {
                status.innerHTML = "<span style=\"color:#c62828;\">✗ " + e.message + "</span>";
                btn.disabled = false;
                btn.innerHTML = "<span class=\"dashicons dashicons-admin-tools\" style=\"vertical-align:middle;margin-right:5px;\"></span>Tentar Novamente";
            });
        }
        </script>';
        
        // Add manual repair button outside the conditional
        if (empty($missing_tables)) {
            echo '<div style="margin: 15px 0;">';
            echo '<button type="button" id="cfrdm-repair-tables" class="button" onclick="cfrdmRepairTables()">';
            echo '<span class="dashicons dashicons-admin-tools" style="vertical-align:middle;margin-right:5px;"></span>';
            echo 'Verificar e Reparar Tabelas</button>';
            echo '<span id="cfrdm-repair-status" style="margin-left:10px;"></span>';
            echo '</div>';
        }
    }

    /**
     * Render cron jobs status section
     */
    private static function render_cron_jobs_section() {
        $cron_jobs = array(
            'cfrdm_daily_cleanup' => 'Limpeza diária',
            'cfrdm_sync_stats' => 'Sincronização de estatísticas',
            'cfrdm_fetch_news' => 'Buscar notícias',
            'cfrdm_process_social_queue' => 'Processar fila social',
            'cfrdm_process_content_queue' => 'Processar fila de conteúdo',
            'cfrdm_cleanup_structured_logs' => 'Limpar logs estruturados',
            'cfrdm_reset_stuck_cron_jobs' => 'Resetar jobs travados',
            'cfrdm_gsc_sync' => 'Sincronização GSC',
            'cfrdm_process_fix_queue' => 'Processar fila de correção AI',
            'cfrdm_ubersuggest_sync' => 'Sincronização Ubersuggest',
            'cfrdm_https_scan' => 'Scan HTTPS',
            'cfrdm_check_updates' => 'Verificar atualizações',
            'cfrdm_enhance_content' => 'Melhorar conteúdo',
        );
        
        $status = array();
        foreach ($cron_jobs as $hook => $label) {
            $next = wp_next_scheduled($hook);
            if ($next) {
                $time_diff = $next - time();
                if ($time_diff > 0) {
                    $human = human_time_diff(time(), $next);
                    $status[$label] = "✓ Próximo em {$human}";
                } else {
                    $status[$label] = '⚠️ Atrasado';
                }
            } else {
                $status[$label] = '✗ Não agendado';
            }
        }
        
        self::render_kv_table($status);
        
        echo '<p><small>Os cron jobs são executados automaticamente pelo WordPress. Se estiverem atrasados, verifique se o WP-Cron está funcionando.</small></p>';
    }

    /**
     * Render GSC status section
     */
    private static function render_gsc_status_section() {
        if (!class_exists('CFRDM_GSC_Integration')) {
            echo '<p>Módulo GSC não carregado.</p>';
            return;
        }
        
        $gsc_status = CFRDM_GSC_Integration::get_connection_status();
        
        $status_data = array(
            'Status' => $gsc_status['connected'] ? '✓ Conectado' : '✗ Não conectado',
            'Site URL' => $gsc_status['site_url'] ?? '-',
            'Credenciais' => $gsc_status['has_credentials'] ? '✓ Configuradas' : '✗ Não configuradas',
            'Última sincronização' => $gsc_status['last_sync'] ?? 'Nunca',
        );
        
        self::render_kv_table($status_data);
        
        if (!$gsc_status['connected']) {
            echo '<div style="margin: 15px 0; padding: 15px; background: #e3f2fd; border-radius: 8px; border-left: 4px solid #2196f3;">';
            echo '<p style="margin:0 0 10px 0;"><strong>Configurar Google Search Console</strong></p>';
            echo '<p>Para ativar a sincronização automática de erros 404 e problemas de indexação:</p>';
            echo '<ol style="margin:10px 0;">';
            echo '<li>Acesse o <a href="https://console.cloud.google.com" target="_blank">Google Cloud Console</a></li>';
            echo '<li>Crie um projeto e ative a API do Search Console</li>';
            echo '<li>Configure as credenciais OAuth 2.0</li>';
            echo '<li>Adicione o Client ID e Client Secret nas <a href="' . admin_url('admin.php?page=cfrdm-settings') . '">Configurações</a></li>';
            echo '</ol>';
            echo '</div>';
        }
    }

    /**
     * Render AI fix queue section
     */
    private static function render_fix_queue_section() {
        if (!class_exists('CFRDM_AI_Auto_Fix')) {
            echo '<p>Módulo AI Auto-Fix não carregado.</p>';
            return;
        }
        
        global $wpdb;
        $table = $wpdb->prefix . 'cfrdm_fix_queue';
        
        // Check if table exists
        if ($wpdb->get_var("SHOW TABLES LIKE '$table'") !== $table) {
            echo '<p>Tabela da fila de correção não encontrada. Execute a reparação de tabelas acima.</p>';
            return;
        }
        
        // Get stats
        $pending = $wpdb->get_var("SELECT COUNT(*) FROM $table WHERE status = 'pending'");
        $processing = $wpdb->get_var("SELECT COUNT(*) FROM $table WHERE status = 'processing'");
        $completed = $wpdb->get_var("SELECT COUNT(*) FROM $table WHERE status = 'completed'");
        $failed = $wpdb->get_var("SELECT COUNT(*) FROM $table WHERE status = 'failed'");
        
        $stats = array(
            'Pendentes' => $pending ?? 0,
            'Processando' => $processing ?? 0,
            'Concluídos' => $completed ?? 0,
            'Falharam' => $failed ?? 0,
            'Auto-Fix habilitado' => CFRDM_AI_Auto_Fix::is_enabled() ? '✓ Sim' : '✗ Não',
            'Confiança mínima' => (CFRDM_AI_Auto_Fix::get_min_confidence() * 100) . '%',
        );
        
        self::render_kv_table($stats);
        
        // Show recent items
        $recent = $wpdb->get_results("SELECT * FROM $table ORDER BY created_at DESC LIMIT 5");
        
        if (!empty($recent)) {
            echo '<h3>Itens Recentes</h3>';
            echo '<table class="widefat striped" style="max-width:900px;">';
            echo '<thead><tr><th>Tipo</th><th>URL</th><th>Status</th><th>Ação</th><th>Data</th></tr></thead>';
            echo '<tbody>';
            foreach ($recent as $item) {
                $status_badge = self::get_status_badge($item->status);
                $url_short = strlen($item->url) > 50 ? substr($item->url, 0, 50) . '...' : $item->url;
                echo '<tr>';
                echo '<td>' . esc_html($item->issue_type) . '</td>';
                echo '<td title="' . esc_attr($item->url) . '">' . esc_html($url_short) . '</td>';
                echo '<td>' . $status_badge . '</td>';
                echo '<td>' . esc_html($item->fix_action ?? '-') . '</td>';
                echo '<td>' . esc_html($item->created_at) . '</td>';
                echo '</tr>';
            }
            echo '</tbody></table>';
        }
    }

    /**
     * Get status badge HTML
     */
    private static function get_status_badge($status) {
        $colors = array(
            'pending' => '#f0ad4e',
            'processing' => '#5bc0de',
            'completed' => '#5cb85c',
            'failed' => '#d9534f',
        );
        $color = $colors[$status] ?? '#999';
        return '<span style="display:inline-block;padding:2px 8px;border-radius:12px;background:' . $color . ';color:#fff;font-size:11px;">' . esc_html($status) . '</span>';
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
            echo '<td>' . $v . '</td>';
            echo '</tr>';
        }
        echo '</tbody>';
        echo '</table>';
    }
}
