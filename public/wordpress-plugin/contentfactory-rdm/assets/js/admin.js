/**
 * ContentFactory RDM v2.0 - Admin JavaScript
 */

(function($) {
    'use strict';

    // Global state
    const CFRDM = {
        isLoading: false,
        charts: {},
        
        init: function() {
            this.bindEvents();
            this.initTabs();
            this.initCharts();
            this.initTooltips();
            this.checkConnectionStatus();
        },

        // Tab Navigation
        initTabs: function() {
            const $tabs = $('.cfrdm-tab');
            const $contents = $('.cfrdm-tab-content');
            
            $tabs.on('click', function(e) {
                e.preventDefault();
                const target = $(this).data('tab');
                
                $tabs.removeClass('active');
                $(this).addClass('active');
                
                $contents.removeClass('active');
                $('#cfrdm-tab-' + target).addClass('active').addClass('cfrdm-fade-in');
                
                // Save active tab
                localStorage.setItem('cfrdm_active_tab', target);
            });
            
            // Restore active tab
            const savedTab = localStorage.getItem('cfrdm_active_tab');
            if (savedTab && $('[data-tab="' + savedTab + '"]').length) {
                $('[data-tab="' + savedTab + '"]').click();
            }
        },

        // Bind all events
        bindEvents: function() {
            // Copy API Key
            $(document).on('click', '#cfrdm-copy-key', this.copyApiKey.bind(this));
            
            // Test Connection
            $(document).on('click', '#cfrdm-test-connection', this.testConnection.bind(this));
            
            // Regenerate API Key
            $(document).on('click', '#cfrdm-regenerate-key', this.regenerateKey.bind(this));
            
            // Manual Sync
            $(document).on('click', '#cfrdm-manual-sync, #cfrdm-sync-now', this.manualSync.bind(this));
            
            // Optimize Images
            $(document).on('click', '#cfrdm-optimize-images', this.optimizeImages.bind(this));
            
            // Run Auto-corrections
            $(document).on('click', '#cfrdm-run-autocorrect', this.runAutocorrect.bind(this));
            
            // Clear Logs
            $(document).on('click', '#cfrdm-clear-logs', this.clearLogs.bind(this));
            
            // Export Logs
            $(document).on('click', '#cfrdm-export-logs', this.exportLogs.bind(this));
            
            // Refresh Stats
            $(document).on('click', '#cfrdm-refresh-stats', this.refreshStats.bind(this));
            
            // Toggle Log Details
            $(document).on('click', '.cfrdm-log-toggle', this.toggleLogDetails);
            
            // Filter Logs
            $(document).on('change', '#cfrdm-log-filter-type, #cfrdm-log-filter-category', this.filterLogs);
            $(document).on('keyup', '#cfrdm-log-search', this.debounce(this.filterLogs, 300));
            
            // Analyze Internal Links
            $(document).on('click', '#cfrdm-analyze-links', this.analyzeInternalLinks.bind(this));
            
            // Generate Internal Links
            $(document).on('click', '#cfrdm-generate-links', this.generateInternalLinks.bind(this));
            
            // Sync Stats to Platform
            $(document).on('click', '#cfrdm-sync-stats', this.syncStatsToPlatform.bind(this));
        },

        // Copy API Key
        copyApiKey: function(e) {
            e.preventDefault();
            const $input = $('#cfrdm-api-key');
            const $btn = $(e.currentTarget);
            
            navigator.clipboard.writeText($input.val()).then(() => {
                this.showButtonSuccess($btn, 'Copiado!');
            }).catch(() => {
                // Fallback for older browsers
                $input.select();
                document.execCommand('copy');
                this.showButtonSuccess($btn, 'Copiado!');
            });
        },

        // Test Connection
        testConnection: function(e) {
            e.preventDefault();
            const $btn = $(e.currentTarget);
            
            this.setButtonLoading($btn, 'Testando...');
            
            $.ajax({
                url: cfrdmAdmin.restUrl + 'test',
                method: 'GET',
                headers: {
                    'X-CFRDM-API-Key': cfrdmAdmin.apiKey
                },
                success: (response) => {
                    if (response.success) {
                        this.showNotice('success', cfrdmAdmin.strings.testSuccess);
                        this.updateConnectionStatus(true);
                    } else {
                        this.showNotice('error', response.message || cfrdmAdmin.strings.testError);
                        this.updateConnectionStatus(false);
                    }
                },
                error: (xhr) => {
                    const message = xhr.responseJSON?.message || cfrdmAdmin.strings.testError;
                    this.showNotice('error', message);
                    this.updateConnectionStatus(false);
                },
                complete: () => {
                    this.resetButton($btn);
                }
            });
        },

        // Regenerate API Key
        regenerateKey: function(e) {
            e.preventDefault();
            
            if (!confirm(cfrdmAdmin.strings.confirm_regenerate)) {
                return;
            }
            
            const $btn = $(e.currentTarget);
            this.setButtonLoading($btn, 'Regenerando...');
            
            $.ajax({
                url: cfrdmAdmin.restUrl + 'regenerate-key',
                method: 'POST',
                headers: {
                    'X-WP-Nonce': cfrdmAdmin.nonce
                },
                success: (response) => {
                    if (response.success) {
                        $('#cfrdm-api-key').val(response.api_key);
                        cfrdmAdmin.apiKey = response.api_key;
                        this.showNotice('success', response.message);
                    } else {
                        this.showNotice('error', response.message || 'Erro ao regenerar API Key');
                    }
                },
                error: (xhr) => {
                    const message = xhr.responseJSON?.message || 'Erro ao regenerar API Key';
                    this.showNotice('error', message);
                },
                complete: () => {
                    this.resetButton($btn);
                }
            });
        },

        // Manual Sync (via AJAX)
        manualSync: function(e) {
            e.preventDefault();
            const $btn = $(e.currentTarget);
            
            this.setButtonLoading($btn, 'Sincronizando...');
            
            $.ajax({
                url: cfrdmAdmin.ajaxUrl,
                method: 'POST',
                data: {
                    action: 'cfrdm_sync_stats',
                    nonce: cfrdmAdmin.nonce
                },
                success: (response) => {
                    if (response.success) {
                        const data = response.data || {};
                        this.showNotice('success', 'Sincronização concluída! ' + (data.synced || 0) + ' artigos sincronizados.');
                        this.refreshStats();
                    } else {
                        this.showNotice('error', response.data || 'Erro na sincronização');
                    }
                },
                error: (xhr) => {
                    const message = xhr.responseJSON?.data || 'Erro na sincronização';
                    this.showNotice('error', message);
                },
                complete: () => {
                    this.resetButton($btn);
                }
            });
        },

        // Optimize Images
        optimizeImages: function(e) {
            e.preventDefault();
            const $btn = $(e.currentTarget);
            
            this.setButtonLoading($btn, 'Otimizando...');
            
            $.ajax({
                url: cfrdmAdmin.restUrl + 'optimize-images',
                method: 'POST',
                headers: {
                    'X-WP-Nonce': cfrdmAdmin.nonce
                },
                success: (response) => {
                    if (response.success) {
                        this.showNotice('success', 'Otimização concluída! ' + (response.optimized || 0) + ' imagens otimizadas.');
                    } else {
                        this.showNotice('error', response.message || 'Erro na otimização');
                    }
                },
                error: (xhr) => {
                    const message = xhr.responseJSON?.message || 'Erro na otimização';
                    this.showNotice('error', message);
                },
                complete: () => {
                    this.resetButton($btn);
                }
            });
        },

        // Run Auto-corrections (via AJAX)
        runAutocorrect: function(e) {
            e.preventDefault();
            const $btn = $(e.currentTarget);
            
            this.setButtonLoading($btn, 'Analisando...');
            
            $.ajax({
                url: cfrdmAdmin.ajaxUrl,
                method: 'POST',
                data: {
                    action: 'cfrdm_run_autocorrect',
                    nonce: cfrdmAdmin.nonce
                },
                success: (response) => {
                    if (response.success) {
                        const data = response.data || {};
                        let message = 'Análise concluída! ';
                        message += (data.issues_found || data.processed || 0) + ' problemas encontrados, ';
                        message += (data.issues_fixed || data.fixed || 0) + ' corrigidos automaticamente.';
                        this.showNotice('success', message);
                        
                        if (data.issues && data.issues.length > 0) {
                            this.displayAutocorrectResults(data.issues);
                        }
                    } else {
                        this.showNotice('error', response.data?.message || response.data || 'Erro na análise');
                    }
                },
                error: (xhr) => {
                    const message = xhr.responseJSON?.data || 'Erro na análise';
                    this.showNotice('error', message);
                },
                complete: () => {
                    this.resetButton($btn);
                }
            });
        },

        // Analyze Internal Links (via AJAX)
        analyzeInternalLinks: function(e) {
            e.preventDefault();
            const $btn = $(e.currentTarget);
            
            this.setButtonLoading($btn, 'Analisando estrutura...');
            
            $.ajax({
                url: cfrdmAdmin.ajaxUrl,
                method: 'POST',
                data: {
                    action: 'cfrdm_analyze_links',
                    nonce: cfrdmAdmin.nonce
                },
                success: (response) => {
                    if (response.success) {
                        this.displayLinkAnalysis(response.data);
                        this.showNotice('success', 'Análise de links concluída!');
                    } else {
                        this.showNotice('error', response.data || 'Erro na análise de links');
                    }
                },
                error: (xhr) => {
                    const message = xhr.responseJSON?.data || 'Erro na análise de links';
                    this.showNotice('error', message);
                },
                complete: () => {
                    this.resetButton($btn);
                }
            });
        },

        // Generate Internal Links (via AJAX)
        generateInternalLinks: function(e) {
            e.preventDefault();
            const $btn = $(e.currentTarget);
            
            if (!confirm('Isso irá adicionar links internos aos artigos selecionados. Deseja continuar?')) {
                return;
            }
            
            this.setButtonLoading($btn, 'Gerando links...');
            
            $.ajax({
                url: cfrdmAdmin.ajaxUrl,
                method: 'POST',
                data: {
                    action: 'cfrdm_generate_links',
                    nonce: cfrdmAdmin.nonce,
                    mode: 'smart',
                    max_links_per_post: 5
                },
                success: (response) => {
                    if (response.success) {
                        const data = response.data || {};
                        let message = 'Links gerados com sucesso! ';
                        message += (data.links_added || 0) + ' links adicionados em ';
                        message += (data.posts_updated || 0) + ' artigos.';
                        this.showNotice('success', message);
                    } else {
                        this.showNotice('error', response.data || 'Erro ao gerar links');
                    }
                },
                error: (xhr) => {
                    const message = xhr.responseJSON?.data || 'Erro ao gerar links';
                    this.showNotice('error', message);
                },
                complete: () => {
                    this.resetButton($btn);
                }
            });
        },

        // Sync Stats to Platform
        syncStatsToPlatform: function(e) {
            e.preventDefault();
            const $btn = $(e.currentTarget);
            
            this.setButtonLoading($btn, 'Enviando estatísticas...');
            
            $.ajax({
                url: cfrdmAdmin.restUrl + 'sync-stats',
                method: 'POST',
                headers: {
                    'X-CFRDM-API-Key': cfrdmAdmin.apiKey,
                    'X-WP-Nonce': cfrdmAdmin.nonce
                },
                success: (response) => {
                    if (response.success) {
                        this.showNotice('success', 'Estatísticas enviadas para a plataforma!');
                    } else {
                        this.showNotice('error', response.message || 'Erro ao enviar estatísticas');
                    }
                },
                error: (xhr) => {
                    const message = xhr.responseJSON?.message || 'Erro ao enviar estatísticas';
                    this.showNotice('error', message);
                },
                complete: () => {
                    this.resetButton($btn);
                }
            });
        },

        // Display Link Analysis Results
        displayLinkAnalysis: function(data) {
            const $container = $('#cfrdm-link-analysis-results');
            if (!$container.length) return;
            
            let html = '<div class="cfrdm-grid cfrdm-grid-2">';
            
            // Orphan pages (no incoming links)
            html += '<div class="cfrdm-card">';
            html += '<div class="cfrdm-card-header"><h2><span class="dashicons dashicons-warning"></span> Páginas Órfãs</h2></div>';
            html += '<div class="cfrdm-card-body">';
            if (data.orphan_pages && data.orphan_pages.length > 0) {
                html += '<ul class="cfrdm-simple-list">';
                data.orphan_pages.forEach(function(page) {
                    html += '<li><a href="' + page.url + '" target="_blank">' + page.title + '</a></li>';
                });
                html += '</ul>';
            } else {
                html += '<p class="cfrdm-text-muted">Nenhuma página órfã encontrada!</p>';
            }
            html += '</div></div>';
            
            // Link opportunities
            html += '<div class="cfrdm-card">';
            html += '<div class="cfrdm-card-header"><h2><span class="dashicons dashicons-admin-links"></span> Oportunidades de Links</h2></div>';
            html += '<div class="cfrdm-card-body">';
            if (data.opportunities && data.opportunities.length > 0) {
                data.opportunities.slice(0, 10).forEach(function(opp) {
                    html += '<div class="cfrdm-link-card">';
                    html += '<div class="link-icon"><span class="dashicons dashicons-admin-links"></span></div>';
                    html += '<div class="link-content">';
                    html += '<div class="link-title">' + opp.from_title + '</div>';
                    html += '<div class="link-meta">→ ' + opp.to_title + ' (' + opp.relevance + '% relevância)</div>';
                    html += '</div>';
                    html += '</div>';
                });
            } else {
                html += '<p class="cfrdm-text-muted">Nenhuma oportunidade encontrada.</p>';
            }
            html += '</div></div>';
            
            html += '</div>';
            
            $container.html(html).addClass('cfrdm-fade-in');
        },

        // Clear Logs (via AJAX)
        clearLogs: function(e) {
            e.preventDefault();
            
            if (!confirm('Isso irá excluir todos os logs. Deseja continuar?')) {
                return;
            }
            
            const $btn = $(e.currentTarget);
            this.setButtonLoading($btn, 'Limpando...');
            
            $.ajax({
                url: cfrdmAdmin.ajaxUrl,
                method: 'POST',
                data: {
                    action: 'cfrdm_clear_logs',
                    nonce: cfrdmAdmin.nonce
                },
                success: (response) => {
                    if (response.success) {
                        this.showNotice('success', 'Logs limpos com sucesso!');
                        $('#cfrdm-logs-container').html(
                            '<div class="cfrdm-empty-state">' +
                            '<span class="dashicons dashicons-marker"></span>' +
                            '<h3>Nenhum log registrado</h3>' +
                            '<p>Os logs aparecerão aqui conforme as atividades ocorrerem.</p>' +
                            '</div>'
                        );
                    } else {
                        this.showNotice('error', response.data || 'Erro ao limpar logs');
                    }
                },
                error: (xhr) => {
                    const message = xhr.responseJSON?.data || 'Erro ao limpar logs';
                    this.showNotice('error', message);
                },
                complete: () => {
                    this.resetButton($btn);
                }
            });
        },

        // Export Logs (via AJAX)
        exportLogs: function(e) {
            e.preventDefault();
            const $btn = $(e.currentTarget);
            
            this.setButtonLoading($btn, 'Exportando...');
            
            $.ajax({
                url: cfrdmAdmin.ajaxUrl,
                method: 'POST',
                data: {
                    action: 'cfrdm_export_logs',
                    nonce: cfrdmAdmin.nonce
                },
                xhrFields: {
                    responseType: 'blob'
                },
                success: (blob) => {
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = url;
                    a.download = 'cfrdm-logs-' + new Date().toISOString().split('T')[0] + '.csv';
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    a.remove();
                    this.showNotice('success', 'Logs exportados com sucesso!');
                },
                error: () => {
                    this.showNotice('error', 'Erro ao exportar logs');
                },
                complete: () => {
                    this.resetButton($btn);
                }
            });
        },

        // Refresh Stats
        refreshStats: function(e) {
            if (e) e.preventDefault();
            const $btn = $('#cfrdm-refresh-stats');
            
            if ($btn.length) {
                this.setButtonLoading($btn, '');
            }
            
            $.ajax({
                url: cfrdmAdmin.restUrl + 'stats',
                method: 'GET',
                headers: {
                    'X-CFRDM-API-Key': cfrdmAdmin.apiKey
                },
                success: (response) => {
                    if (response.success && response.data) {
                        this.updateStatsDisplay(response.data);
                    }
                },
                complete: () => {
                    if ($btn.length) {
                        this.resetButton($btn);
                    }
                }
            });
        },

        // Update Stats Display
        updateStatsDisplay: function(stats) {
            const animateValue = function($el, newValue) {
                const currentValue = parseInt($el.text()) || 0;
                $({ value: currentValue }).animate({ value: newValue }, {
                    duration: 500,
                    step: function() {
                        $el.text(Math.round(this.value));
                    },
                    complete: function() {
                        $el.text(newValue);
                    }
                });
            };
            
            if (stats.total !== undefined) {
                animateValue($('#stat-total'), stats.total);
            }
            if (stats.published !== undefined) {
                animateValue($('#stat-published'), stats.published);
            }
            if (stats.draft !== undefined) {
                animateValue($('#stat-draft'), stats.draft);
            }
            if (stats.synced !== undefined) {
                animateValue($('#stat-synced'), stats.synced);
            }
            if (stats.errors !== undefined) {
                animateValue($('#stat-errors'), stats.errors);
            }
            if (stats.internal_links !== undefined) {
                animateValue($('#stat-internal-links'), stats.internal_links);
            }
        },

        // Filter Logs
        filterLogs: function() {
            const type = $('#cfrdm-log-filter-type').val();
            const category = $('#cfrdm-log-filter-category').val();
            const search = $('#cfrdm-log-search').val().toLowerCase();
            
            $('.cfrdm-log-item').each(function() {
                const $item = $(this);
                const itemType = $item.data('type');
                const itemCategory = $item.data('category');
                const itemMessage = $item.find('.cfrdm-log-message').text().toLowerCase();
                
                let visible = true;
                
                if (type && itemType !== type) visible = false;
                if (category && itemCategory !== category) visible = false;
                if (search && itemMessage.indexOf(search) === -1) visible = false;
                
                $item.toggle(visible);
            });
        },

        // Toggle Log Details
        toggleLogDetails: function() {
            $(this).closest('.cfrdm-log-item').find('.cfrdm-log-context').slideToggle();
        },

        // Initialize Charts
        initCharts: function() {
            const $chartCanvas = $('#cfrdm-activity-chart');
            if (!$chartCanvas.length || typeof Chart === 'undefined') return;
            
            const ctx = $chartCanvas[0].getContext('2d');
            const chartData = $chartCanvas.data('chart');
            
            if (!chartData) return;
            
            this.charts.activity = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: chartData.labels || [],
                    datasets: [{
                        label: 'Publicados',
                        data: chartData.published || [],
                        borderColor: '#22c55e',
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        fill: true,
                        tension: 0.4
                    }, {
                        label: 'Sincronizados',
                        data: chartData.synced || [],
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: {
                                color: 'rgba(0, 0, 0, 0.05)'
                            }
                        },
                        x: {
                            grid: {
                                display: false
                            }
                        }
                    }
                }
            });
        },

        // Check Connection Status
        checkConnectionStatus: function() {
            $.ajax({
                url: cfrdmAdmin.restUrl + 'health',
                method: 'GET',
                timeout: 5000,
                success: (response) => {
                    this.updateConnectionStatus(response.success === true);
                },
                error: () => {
                    this.updateConnectionStatus(false);
                }
            });
        },

        // Update Connection Status
        updateConnectionStatus: function(isConnected) {
            const $card = $('.cfrdm-connection-card');
            const $indicator = $('.status-indicator');
            const $text = $('.status-text');
            
            $card.removeClass('connected disconnected')
                 .addClass(isConnected ? 'connected' : 'disconnected');
            
            $indicator.removeClass('online offline')
                      .addClass(isConnected ? 'online' : 'offline');
            
            $text.text(isConnected ? 'Conectado' : 'Desconectado');
        },

        // Initialize Tooltips
        initTooltips: function() {
            $('[data-tooltip]').each(function() {
                const $el = $(this);
                $el.attr('title', $el.data('tooltip'));
            });
        },

        // Display Autocorrect Results
        displayAutocorrectResults: function(issues) {
            const $container = $('#cfrdm-autocorrect-results');
            if (!$container.length) return;
            
            let html = '<div class="cfrdm-table-container"><table class="cfrdm-table">';
            html += '<thead><tr><th>Artigo</th><th>Problema</th><th>Status</th></tr></thead>';
            html += '<tbody>';
            
            issues.forEach(function(issue) {
                const statusClass = issue.fixed ? 'success' : 'warning';
                const statusText = issue.fixed ? 'Corrigido' : 'Pendente';
                
                html += '<tr>';
                html += '<td><a href="' + issue.edit_url + '" target="_blank">' + issue.title + '</a></td>';
                html += '<td>' + issue.description + '</td>';
                html += '<td><span class="cfrdm-status-badge ' + statusClass + '">' + statusText + '</span></td>';
                html += '</tr>';
            });
            
            html += '</tbody></table></div>';
            
            $container.html(html).addClass('cfrdm-fade-in');
        },

        // Helper Functions
        setButtonLoading: function($btn, text) {
            $btn.data('original-html', $btn.html());
            $btn.prop('disabled', true);
            $btn.html('<span class="dashicons dashicons-update spin"></span> ' + text);
        },

        resetButton: function($btn) {
            const originalHtml = $btn.data('original-html');
            $btn.prop('disabled', false);
            $btn.html(originalHtml);
        },

        showButtonSuccess: function($btn, text) {
            const originalHtml = $btn.html();
            $btn.html('<span class="dashicons dashicons-yes"></span> ' + text);
            setTimeout(function() {
                $btn.html(originalHtml);
            }, 2000);
        },

        showNotice: function(type, message) {
            const $notice = $(
                '<div class="notice notice-' + type + ' is-dismissible cfrdm-fade-in">' +
                '<p>' + message + '</p>' +
                '<button type="button" class="notice-dismiss">' +
                '<span class="screen-reader-text">Dispensar este aviso.</span>' +
                '</button></div>'
            );
            
            // Remove existing notices
            $('.cfrdm-wrap > .notice').remove();
            
            // Add new notice
            $('.cfrdm-wrap h1').after($notice);
            
            // Bind dismiss button
            $notice.find('.notice-dismiss').on('click', function() {
                $notice.fadeOut(function() { $(this).remove(); });
            });
            
            // Auto-dismiss after 5 seconds
            setTimeout(function() {
                $notice.fadeOut(function() { $(this).remove(); });
            }, 5000);
        },

        debounce: function(func, wait) {
            let timeout;
            return function(...args) {
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(this, args), wait);
            };
        }
    };

    // Initialize on document ready
    $(document).ready(function() {
        CFRDM.init();
    });

})(jQuery);
