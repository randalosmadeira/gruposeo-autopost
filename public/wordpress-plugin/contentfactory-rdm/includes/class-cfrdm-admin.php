<?php
/**
 * Admin Pages - Enhanced with new features
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_Admin {
    
    /**
     * Dashboard page - Enhanced
     */
    public static function render_dashboard() {
        $stats = CFRDM_Articles::get_stats();
        $api_key = get_option('cfrdm_api_key');
        
        // Auto-generate API key if missing
        if (empty($api_key)) {
            $api_key = wp_generate_uuid4();
            update_option('cfrdm_api_key', $api_key);
        }
        
        $is_connected = !empty(get_option('cfrdm_api_url'));
        $synced_articles = CFRDM_Articles::get_synced_articles(5);
        $attention_articles = CFRDM_Articles::get_attention_articles(5);
        $image_stats = CFRDM_Image_Optimizer::get_stats();
        $log_stats = CFRDM_Logger::get_stats(7);
        $unread_news = CFRDM_Sync::get_unread_news(3);
        $comments_stats = CFRDM_Articles::get_comments_stats();
        
        ?>
        <div class="wrap cfrdm-wrap">
            <h1>
                <span class="dashicons dashicons-edit-page"></span>
                <?php _e('ContentFactory RDM', 'contentfactory-rdm'); ?>
                <span class="cfrdm-version">v<?php echo CFRDM_VERSION; ?></span>
            </h1>
            
            <?php if (!empty($unread_news)): ?>
            <!-- News Alert -->
            <div class="cfrdm-news-alert">
                <?php foreach ($unread_news as $news): ?>
                <div class="cfrdm-news-item <?php echo esc_attr($news->news_type); ?>" data-news-id="<?php echo $news->id; ?>">
                    <div class="news-icon">
                        <?php if ($news->news_type === 'update'): ?>
                            <span class="dashicons dashicons-megaphone"></span>
                        <?php elseif ($news->news_type === 'warning'): ?>
                            <span class="dashicons dashicons-warning"></span>
                        <?php else: ?>
                            <span class="dashicons dashicons-info"></span>
                        <?php endif; ?>
                    </div>
                    <div class="news-content">
                        <strong><?php echo esc_html($news->title); ?></strong>
                        <?php if (!empty($news->link)): ?>
                            <a href="<?php echo esc_url($news->link); ?>" target="_blank"><?php _e('Saiba mais', 'contentfactory-rdm'); ?></a>
                        <?php endif; ?>
                    </div>
                    <button type="button" class="cfrdm-dismiss-news" title="<?php _e('Dispensar', 'contentfactory-rdm'); ?>">
                        <span class="dashicons dashicons-no-alt"></span>
                    </button>
                </div>
                <?php endforeach; ?>
            </div>
            <?php endif; ?>
            
            <div class="cfrdm-dashboard">
                <!-- Connection Status -->
                <div class="cfrdm-card cfrdm-connection-card <?php echo $is_connected ? 'connected' : 'disconnected'; ?>">
                    <div class="cfrdm-card-header">
                        <h2>
                            <span class="dashicons dashicons-admin-plugins"></span>
                            <?php _e('Status da Conexão', 'contentfactory-rdm'); ?>
                        </h2>
                    </div>
                    <div class="cfrdm-card-body">
                        <div class="cfrdm-connection-status">
                            <span class="status-indicator <?php echo $is_connected ? 'online' : 'offline'; ?>"></span>
                            <span class="status-text">
                                <?php echo $is_connected 
                                    ? __('Conectado ao ContentFactory', 'contentfactory-rdm')
                                    : __('Não conectado', 'contentfactory-rdm'); 
                                ?>
                            </span>
                        </div>
                        
                        <div class="cfrdm-api-key-box">
                            <label><?php _e('Sua API Key:', 'contentfactory-rdm'); ?></label>
                            <div class="api-key-field">
                                <input type="text" readonly value="<?php echo esc_attr($api_key); ?>" id="cfrdm-api-key" />
                                <button type="button" class="button" id="cfrdm-copy-key" title="<?php _e('Copiar', 'contentfactory-rdm'); ?>">
                                    <span class="dashicons dashicons-admin-page"></span>
                                </button>
                            </div>
                            <p class="description">
                                <?php _e('Cole esta API Key nas configurações do projeto no ContentFactory.', 'contentfactory-rdm'); ?>
                            </p>
                        </div>
                        
                        <div class="cfrdm-site-info">
                            <p><strong><?php _e('URL da REST API:', 'contentfactory-rdm'); ?></strong></p>
                            <code><?php echo esc_url(rest_url('cfrdm/v1/')); ?></code>
                        </div>
                        
                        <div class="cfrdm-actions">
                            <button type="button" class="button button-primary" id="cfrdm-test-connection">
                                <span class="dashicons dashicons-update"></span>
                                <?php _e('Testar Conexão', 'contentfactory-rdm'); ?>
                            </button>
                            <a href="<?php echo admin_url('admin.php?page=cfrdm-settings'); ?>" class="button">
                                <span class="dashicons dashicons-admin-generic"></span>
                                <?php _e('Configurações', 'contentfactory-rdm'); ?>
                            </a>
                        </div>
                    </div>
                </div>
                
                <!-- Stats Cards - Enhanced -->
                <div class="cfrdm-stats-grid cfrdm-stats-grid-6">
                    <div class="cfrdm-stat-card">
                        <div class="stat-icon"><span class="dashicons dashicons-admin-post"></span></div>
                        <div class="stat-content">
                            <span class="stat-value"><?php echo number_format_i18n($stats['total']); ?></span>
                            <span class="stat-label"><?php _e('Total de Artigos', 'contentfactory-rdm'); ?></span>
                        </div>
                    </div>
                    
                    <div class="cfrdm-stat-card published">
                        <div class="stat-icon"><span class="dashicons dashicons-visibility"></span></div>
                        <div class="stat-content">
                            <span class="stat-value"><?php echo number_format_i18n($stats['published']); ?></span>
                            <span class="stat-label"><?php _e('Publicados', 'contentfactory-rdm'); ?></span>
                        </div>
                    </div>
                    
                    <div class="cfrdm-stat-card draft">
                        <div class="stat-icon"><span class="dashicons dashicons-edit"></span></div>
                        <div class="stat-content">
                            <span class="stat-value"><?php echo number_format_i18n($stats['draft']); ?></span>
                            <span class="stat-label"><?php _e('Rascunhos', 'contentfactory-rdm'); ?></span>
                        </div>
                    </div>
                    
                    <div class="cfrdm-stat-card synced">
                        <div class="stat-icon"><span class="dashicons dashicons-update-alt"></span></div>
                        <div class="stat-content">
                            <span class="stat-value"><?php echo number_format_i18n($stats['synced']); ?></span>
                            <span class="stat-label"><?php _e('Sincronizados', 'contentfactory-rdm'); ?></span>
                        </div>
                    </div>
                    
                    <div class="cfrdm-stat-card <?php echo $stats['errors'] > 0 ? 'error' : ''; ?>">
                        <div class="stat-icon"><span class="dashicons dashicons-warning"></span></div>
                        <div class="stat-content">
                            <span class="stat-value"><?php echo number_format_i18n($stats['errors']); ?></span>
                            <span class="stat-label"><?php _e('Com Erros', 'contentfactory-rdm'); ?></span>
                        </div>
                    </div>
                    
                    <div class="cfrdm-stat-card <?php echo $stats['needs_attention'] > 0 ? 'warning' : ''; ?>">
                        <div class="stat-icon"><span class="dashicons dashicons-flag"></span></div>
                        <div class="stat-content">
                            <span class="stat-value"><?php echo number_format_i18n($stats['needs_attention']); ?></span>
                            <span class="stat-label"><?php _e('Precisam Atenção', 'contentfactory-rdm'); ?></span>
                        </div>
                    </div>
                </div>
                
                <!-- Secondary Stats Row -->
                <div class="cfrdm-stats-grid cfrdm-stats-grid-4">
                    <div class="cfrdm-stat-card small">
                        <div class="stat-content">
                            <span class="stat-value"><?php echo number_format_i18n($stats['today']); ?></span>
                            <span class="stat-label"><?php _e('Publicados Hoje', 'contentfactory-rdm'); ?></span>
                        </div>
                    </div>
                    <div class="cfrdm-stat-card small">
                        <div class="stat-content">
                            <span class="stat-value"><?php echo number_format_i18n($stats['this_week']); ?></span>
                            <span class="stat-label"><?php _e('Esta Semana', 'contentfactory-rdm'); ?></span>
                        </div>
                    </div>
                    <div class="cfrdm-stat-card small">
                        <div class="stat-content">
                            <span class="stat-value"><?php echo number_format_i18n($stats['this_month']); ?></span>
                            <span class="stat-label"><?php _e('Este Mês', 'contentfactory-rdm'); ?></span>
                        </div>
                    </div>
                    <div class="cfrdm-stat-card small">
                        <div class="stat-content">
                            <span class="stat-value"><?php echo number_format_i18n($comments_stats['pending']); ?></span>
                            <span class="stat-label"><?php _e('Comentários Pendentes', 'contentfactory-rdm'); ?></span>
                        </div>
                    </div>
                </div>
                
                <!-- Charts Row -->
                <div class="cfrdm-charts-row">
                    <div class="cfrdm-card cfrdm-chart-card">
                        <div class="cfrdm-card-header">
                            <h2>
                                <span class="dashicons dashicons-chart-area"></span>
                                <?php _e('Publicações (últimos 30 dias)', 'contentfactory-rdm'); ?>
                            </h2>
                        </div>
                        <div class="cfrdm-card-body">
                            <canvas id="cfrdm-publishing-chart" height="200"></canvas>
                        </div>
                    </div>
                    
                    <div class="cfrdm-card cfrdm-chart-card">
                        <div class="cfrdm-card-header">
                            <h2>
                                <span class="dashicons dashicons-chart-pie"></span>
                                <?php _e('Logs por Tipo (7 dias)', 'contentfactory-rdm'); ?>
                            </h2>
                        </div>
                        <div class="cfrdm-card-body">
                            <canvas id="cfrdm-logs-chart" height="200"></canvas>
                        </div>
                    </div>
                </div>
                
                <!-- Image Optimization Stats -->
                <div class="cfrdm-card">
                    <div class="cfrdm-card-header">
                        <h2>
                            <span class="dashicons dashicons-format-image"></span>
                            <?php _e('Otimização de Imagens', 'contentfactory-rdm'); ?>
                        </h2>
                    </div>
                    <div class="cfrdm-card-body">
                        <div class="cfrdm-image-stats">
                            <div class="image-stat">
                                <span class="stat-number"><?php echo number_format_i18n($image_stats['optimized']); ?></span>
                                <span class="stat-label"><?php _e('Otimizadas', 'contentfactory-rdm'); ?></span>
                            </div>
                            <div class="image-stat">
                                <span class="stat-number"><?php echo number_format_i18n($image_stats['pending']); ?></span>
                                <span class="stat-label"><?php _e('Pendentes', 'contentfactory-rdm'); ?></span>
                            </div>
                            <div class="image-stat">
                                <span class="stat-number"><?php echo esc_html($image_stats['total_savings_formatted']); ?></span>
                                <span class="stat-label"><?php _e('Economia Total', 'contentfactory-rdm'); ?></span>
                            </div>
                            <div class="image-stat">
                                <span class="stat-number"><?php echo number_format_i18n($stats['missing_images']); ?></span>
                                <span class="stat-label"><?php _e('Sem Imagem Destacada', 'contentfactory-rdm'); ?></span>
                            </div>
                        </div>
                        <?php if ($image_stats['pending'] > 0): ?>
                        <div class="cfrdm-actions" style="margin-top: 15px;">
                            <button type="button" class="button" id="cfrdm-bulk-optimize">
                                <span class="dashicons dashicons-images-alt2"></span>
                                <?php _e('Otimizar Imagens Pendentes', 'contentfactory-rdm'); ?>
                            </button>
                        </div>
                        <?php endif; ?>
                    </div>
                </div>
                
                <!-- Articles Needing Attention -->
                <?php if (!empty($attention_articles)): ?>
                <div class="cfrdm-card cfrdm-attention-card">
                    <div class="cfrdm-card-header">
                        <h2>
                            <span class="dashicons dashicons-flag"></span>
                            <?php _e('Artigos que Precisam de Atenção', 'contentfactory-rdm'); ?>
                        </h2>
                        <a href="<?php echo admin_url('admin.php?page=cfrdm-sync'); ?>" class="button button-small">
                            <?php _e('Ver Todos', 'contentfactory-rdm'); ?>
                        </a>
                    </div>
                    <div class="cfrdm-card-body">
                        <table class="wp-list-table widefat fixed striped">
                            <thead>
                                <tr>
                                    <th><?php _e('Título', 'contentfactory-rdm'); ?></th>
                                    <th><?php _e('Problemas', 'contentfactory-rdm'); ?></th>
                                    <th><?php _e('Ações', 'contentfactory-rdm'); ?></th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach ($attention_articles as $article): ?>
                                <tr>
                                    <td>
                                        <a href="<?php echo get_edit_post_link($article->ID); ?>">
                                            <?php echo esc_html($article->post_title); ?>
                                        </a>
                                    </td>
                                    <td>
                                        <?php
                                        $issues = array();
                                        if (!empty($article->seo_issues)) {
                                            $seo = maybe_unserialize($article->seo_issues);
                                            if (is_array($seo)) {
                                                $issues[] = sprintf(__('%d problemas SEO', 'contentfactory-rdm'), count($seo));
                                            }
                                        }
                                        if (!empty($article->broken_links)) {
                                            $links = maybe_unserialize($article->broken_links);
                                            if (is_array($links)) {
                                                $issues[] = sprintf(__('%d links quebrados', 'contentfactory-rdm'), count($links));
                                            }
                                        }
                                        if (!empty($article->needs_image)) {
                                            $issues[] = __('Sem imagem destacada', 'contentfactory-rdm');
                                        }
                                        echo esc_html(implode(', ', $issues));
                                        ?>
                                    </td>
                                    <td>
                                        <a href="<?php echo get_edit_post_link($article->ID); ?>" class="button button-small">
                                            <?php _e('Editar', 'contentfactory-rdm'); ?>
                                        </a>
                                    </td>
                                </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                    </div>
                </div>
                <?php endif; ?>
                
                <!-- Recent Synced Articles -->
                <div class="cfrdm-card">
                    <div class="cfrdm-card-header">
                        <h2>
                            <span class="dashicons dashicons-update-alt"></span>
                            <?php _e('Artigos Sincronizados Recentes', 'contentfactory-rdm'); ?>
                        </h2>
                    </div>
                    <div class="cfrdm-card-body">
                        <?php if (!empty($synced_articles)): ?>
                            <table class="wp-list-table widefat fixed striped">
                                <thead>
                                    <tr>
                                        <th><?php _e('Título', 'contentfactory-rdm'); ?></th>
                                        <th><?php _e('Status', 'contentfactory-rdm'); ?></th>
                                        <th><?php _e('Data', 'contentfactory-rdm'); ?></th>
                                        <th><?php _e('ID ContentFactory', 'contentfactory-rdm'); ?></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <?php foreach ($synced_articles as $article): ?>
                                        <tr class="<?php echo !empty($article->sync_error) ? 'has-error' : ''; ?>">
                                            <td>
                                                <a href="<?php echo get_edit_post_link($article->ID); ?>">
                                                    <?php echo esc_html($article->post_title); ?>
                                                </a>
                                                <?php if (!empty($article->sync_error)): ?>
                                                    <span class="cfrdm-error-badge" title="<?php echo esc_attr($article->sync_error); ?>">
                                                        <span class="dashicons dashicons-warning"></span>
                                                    </span>
                                                <?php endif; ?>
                                            </td>
                                            <td>
                                                <span class="cfrdm-status-badge <?php echo esc_attr($article->post_status); ?>">
                                                    <?php echo esc_html(get_post_status_object($article->post_status)->label); ?>
                                                </span>
                                            </td>
                                            <td><?php echo get_the_date('', $article->ID); ?></td>
                                            <td><code><?php echo esc_html(substr($article->cfrdm_id, 0, 8)); ?>...</code></td>
                                        </tr>
                                    <?php endforeach; ?>
                                </tbody>
                            </table>
                        <?php else: ?>
                            <p class="cfrdm-empty-state">
                                <span class="dashicons dashicons-info"></span>
                                <?php _e('Nenhum artigo sincronizado ainda.', 'contentfactory-rdm'); ?>
                            </p>
                        <?php endif; ?>
                    </div>
                </div>
                
                <!-- AI Traffic Detection -->
                <?php 
                if (class_exists('CFRDM_AI_Traffic_Detector') && CFRDM_AI_Traffic_Detector::is_enabled()):
                    $ai_stats = CFRDM_AI_Traffic_Detector::get_dashboard_stats();
                ?>
                <div class="cfrdm-card">
                    <div class="cfrdm-card-header">
                        <h2>
                            <span class="dashicons dashicons-visibility"></span>
                            <?php _e('Tráfego de IA', 'contentfactory-rdm'); ?>
                        </h2>
                        <span class="cfrdm-version-badge"><?php echo number_format_i18n($ai_stats['total']); ?> visitas</span>
                    </div>
                    <div class="cfrdm-card-body">
                        <div class="cfrdm-stats-grid cfrdm-stats-grid-3" style="margin-bottom: 16px;">
                            <div class="cfrdm-stat-card small">
                                <div class="stat-content">
                                    <span class="stat-value"><?php echo number_format_i18n($ai_stats['today']); ?></span>
                                    <span class="stat-label"><?php _e('Hoje', 'contentfactory-rdm'); ?></span>
                                </div>
                            </div>
                            <div class="cfrdm-stat-card small">
                                <div class="stat-content">
                                    <span class="stat-value"><?php echo number_format_i18n($ai_stats['yesterday']); ?></span>
                                    <span class="stat-label"><?php _e('Ontem', 'contentfactory-rdm'); ?></span>
                                </div>
                            </div>
                            <div class="cfrdm-stat-card small">
                                <div class="stat-content">
                                    <span class="stat-value"><?php echo $ai_stats['trend'] >= 0 ? '+' : ''; ?><?php echo $ai_stats['trend']; ?>%</span>
                                    <span class="stat-label"><?php _e('Tendência', 'contentfactory-rdm'); ?></span>
                                </div>
                            </div>
                        </div>
                        <?php if (!empty($ai_stats['bots'])): ?>
                        <div class="cfrdm-ai-bots-list">
                            <?php foreach (array_slice($ai_stats['bots'], 0, 6) as $bot): ?>
                            <div class="cfrdm-ai-bot-item">
                                <span class="bot-indicator <?php echo strtotime($bot['last_seen']) >= strtotime('-1 day') ? 'active' : 'inactive'; ?>"></span>
                                <span class="bot-label"><?php echo esc_html($bot['label']); ?></span>
                                <span class="bot-visits"><?php echo number_format_i18n($bot['visits']); ?></span>
                            </div>
                            <?php endforeach; ?>
                        </div>
                        <?php else: ?>
                        <p class="cfrdm-empty-state">
                            <span class="dashicons dashicons-info"></span>
                            <?php _e('Nenhum bot de IA detectado ainda. Os dados aparecerão à medida que bots visitarem seu site.', 'contentfactory-rdm'); ?>
                        </p>
                        <?php endif; ?>
                    </div>
                </div>
                <?php endif; ?>
                
                <!-- SEO Foundation Checklist -->
                <?php 
                if (class_exists('CFRDM_SEO_Checklist')) {
                    CFRDM_SEO_Checklist::render_panel();
                }
                ?>
                
                <!-- Quick Actions -->
                <div class="cfrdm-card">
                    <div class="cfrdm-card-header">
                        <h2>
                            <span class="dashicons dashicons-admin-tools"></span>
                            <?php _e('Ações Rápidas', 'contentfactory-rdm'); ?>
                        </h2>
                    </div>
                    <div class="cfrdm-card-body">
                        <div class="cfrdm-quick-actions">
                            <button type="button" class="button" id="cfrdm-run-autocorrect">
                                <span class="dashicons dashicons-admin-tools"></span>
                                <?php _e('Executar Autocorreções', 'contentfactory-rdm'); ?>
                            </button>
                            <button type="button" class="button" id="cfrdm-sync-now">
                                <span class="dashicons dashicons-update"></span>
                                <?php _e('Sincronizar Agora', 'contentfactory-rdm'); ?>
                            </button>
                            <a href="<?php echo admin_url('admin.php?page=cfrdm-logs'); ?>" class="button">
                                <span class="dashicons dashicons-list-view"></span>
                                <?php _e('Ver Logs', 'contentfactory-rdm'); ?>
                            </a>
                            <a href="<?php echo admin_url('edit.php'); ?>" class="button">
                                <span class="dashicons dashicons-admin-post"></span>
                                <?php _e('Todos os Posts', 'contentfactory-rdm'); ?>
                            </a>
                        </div>
                    </div>
                </div>
            </div>
            
            <script>
            // Chart data
            var publishingData = <?php echo json_encode(CFRDM_Articles::get_publishing_trends(30)); ?>;
            var logStats = <?php echo json_encode($log_stats['by_type']); ?>;
            </script>
        </div>
        <?php
    }
    
    /**
     * Sync page
     */
    public static function render_sync() {
        $stats = CFRDM_Articles::get_stats();
        $error_articles = CFRDM_Articles::get_error_articles(20);
        $attention_articles = CFRDM_Articles::get_attention_articles(20);
        
        ?>
        <div class="wrap cfrdm-wrap">
            <h1>
                <span class="dashicons dashicons-update-alt"></span>
                <?php _e('Sincronização', 'contentfactory-rdm'); ?>
            </h1>
            
            <!-- Sync Stats -->
            <div class="cfrdm-stats-grid cfrdm-stats-grid-4">
                <div class="cfrdm-stat-card synced">
                    <div class="stat-icon"><span class="dashicons dashicons-yes-alt"></span></div>
                    <div class="stat-content">
                        <span class="stat-value"><?php echo number_format_i18n($stats['synced']); ?></span>
                        <span class="stat-label"><?php _e('Sincronizados', 'contentfactory-rdm'); ?></span>
                    </div>
                </div>
                <div class="cfrdm-stat-card <?php echo $stats['errors'] > 0 ? 'error' : ''; ?>">
                    <div class="stat-icon"><span class="dashicons dashicons-dismiss"></span></div>
                    <div class="stat-content">
                        <span class="stat-value"><?php echo number_format_i18n($stats['errors']); ?></span>
                        <span class="stat-label"><?php _e('Com Erros', 'contentfactory-rdm'); ?></span>
                    </div>
                </div>
                <div class="cfrdm-stat-card <?php echo $stats['needs_attention'] > 0 ? 'warning' : ''; ?>">
                    <div class="stat-icon"><span class="dashicons dashicons-flag"></span></div>
                    <div class="stat-content">
                        <span class="stat-value"><?php echo number_format_i18n($stats['needs_attention']); ?></span>
                        <span class="stat-label"><?php _e('Precisam Atenção', 'contentfactory-rdm'); ?></span>
                    </div>
                </div>
                <div class="cfrdm-stat-card">
                    <div class="stat-icon"><span class="dashicons dashicons-clock"></span></div>
                    <div class="stat-content">
                        <span class="stat-value"><?php echo esc_html(get_option('cfrdm_last_sync', '-')); ?></span>
                        <span class="stat-label"><?php _e('Última Sincronização', 'contentfactory-rdm'); ?></span>
                    </div>
                </div>
            </div>
            
            <!-- Actions -->
            <div class="cfrdm-card">
                <div class="cfrdm-card-header">
                    <h2><?php _e('Ações de Sincronização', 'contentfactory-rdm'); ?></h2>
                </div>
                <div class="cfrdm-card-body">
                    <div class="cfrdm-actions">
                        <button type="button" class="button button-primary" id="cfrdm-run-autocorrect">
                            <span class="dashicons dashicons-admin-tools"></span>
                            <?php _e('Executar Autocorreções', 'contentfactory-rdm'); ?>
                        </button>
                        <button type="button" class="button" id="cfrdm-sync-now">
                            <span class="dashicons dashicons-update"></span>
                            <?php _e('Sincronizar Estatísticas', 'contentfactory-rdm'); ?>
                        </button>
                    </div>
                </div>
            </div>
            
            <!-- Articles with Errors -->
            <?php if (!empty($error_articles)): ?>
            <div class="cfrdm-card cfrdm-error-card">
                <div class="cfrdm-card-header">
                    <h2>
                        <span class="dashicons dashicons-warning"></span>
                        <?php _e('Artigos com Erros de Sincronização', 'contentfactory-rdm'); ?>
                    </h2>
                </div>
                <div class="cfrdm-card-body">
                    <table class="wp-list-table widefat fixed striped">
                        <thead>
                            <tr>
                                <th><?php _e('Título', 'contentfactory-rdm'); ?></th>
                                <th><?php _e('Erro', 'contentfactory-rdm'); ?></th>
                                <th><?php _e('Ações', 'contentfactory-rdm'); ?></th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($error_articles as $article): ?>
                            <tr>
                                <td>
                                    <a href="<?php echo get_edit_post_link($article->ID); ?>">
                                        <?php echo esc_html($article->post_title); ?>
                                    </a>
                                </td>
                                <td><?php echo esc_html($article->error_message); ?></td>
                                <td>
                                    <button type="button" class="button button-small cfrdm-retry-sync" data-post-id="<?php echo $article->ID; ?>">
                                        <?php _e('Tentar Novamente', 'contentfactory-rdm'); ?>
                                    </button>
                                </td>
                            </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
            </div>
            <?php endif; ?>
            
            <!-- Articles Needing Attention -->
            <?php if (!empty($attention_articles)): ?>
            <div class="cfrdm-card cfrdm-attention-card">
                <div class="cfrdm-card-header">
                    <h2>
                        <span class="dashicons dashicons-flag"></span>
                        <?php _e('Artigos que Precisam de Atenção', 'contentfactory-rdm'); ?>
                    </h2>
                </div>
                <div class="cfrdm-card-body">
                    <table class="wp-list-table widefat fixed striped">
                        <thead>
                            <tr>
                                <th><?php _e('Título', 'contentfactory-rdm'); ?></th>
                                <th><?php _e('Problemas', 'contentfactory-rdm'); ?></th>
                                <th><?php _e('Ações', 'contentfactory-rdm'); ?></th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($attention_articles as $article): 
                                $issues = array();
                                if (!empty($article->seo_issues)) {
                                    $seo = maybe_unserialize($article->seo_issues);
                                    if (is_array($seo)) {
                                        $issues = array_merge($issues, $seo);
                                    }
                                }
                                if (!empty($article->broken_links)) {
                                    $links = maybe_unserialize($article->broken_links);
                                    if (is_array($links)) {
                                        $issues[] = 'broken_links';
                                    }
                                }
                                if (!empty($article->needs_image)) {
                                    $issues[] = 'missing_featured_image';
                                }
                            ?>
                            <tr>
                                <td>
                                    <a href="<?php echo get_edit_post_link($article->ID); ?>">
                                        <?php echo esc_html($article->post_title); ?>
                                    </a>
                                </td>
                                <td>
                                    <div class="cfrdm-issues-list">
                                        <?php foreach ($issues as $issue): ?>
                                        <span class="cfrdm-issue-badge"><?php echo esc_html(self::get_issue_label($issue)); ?></span>
                                        <?php endforeach; ?>
                                    </div>
                                </td>
                                <td>
                                    <a href="<?php echo get_edit_post_link($article->ID); ?>" class="button button-small">
                                        <?php _e('Corrigir', 'contentfactory-rdm'); ?>
                                    </a>
                                </td>
                            </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
            </div>
            <?php endif; ?>
        </div>
        <?php
    }
    
    /**
     * News page
     */
    public static function render_news() {
        $news = CFRDM_Sync::get_unread_news(50);
        
        // Mark all as read
        global $wpdb;
        $wpdb->update(
            $wpdb->prefix . CFRDM_NEWS_TABLE,
            array('is_read' => 1),
            array('is_read' => 0)
        );
        
        ?>
        <div class="wrap cfrdm-wrap">
            <h1>
                <span class="dashicons dashicons-megaphone"></span>
                <?php _e('Notícias e Atualizações', 'contentfactory-rdm'); ?>
            </h1>
            
            <div class="cfrdm-news-page">
                <?php if (!empty($news)): ?>
                    <?php foreach ($news as $item): ?>
                    <div class="cfrdm-card cfrdm-news-card <?php echo esc_attr($item->news_type); ?>">
                        <div class="cfrdm-card-header">
                            <h2>
                                <?php if ($item->news_type === 'update'): ?>
                                    <span class="dashicons dashicons-update"></span>
                                <?php elseif ($item->news_type === 'warning'): ?>
                                    <span class="dashicons dashicons-warning"></span>
                                <?php elseif ($item->news_type === 'feature'): ?>
                                    <span class="dashicons dashicons-star-filled"></span>
                                <?php else: ?>
                                    <span class="dashicons dashicons-info"></span>
                                <?php endif; ?>
                                <?php echo esc_html($item->title); ?>
                            </h2>
                            <span class="news-date"><?php echo date_i18n(get_option('date_format'), strtotime($item->published_at)); ?></span>
                        </div>
                        <div class="cfrdm-card-body">
                            <p><?php echo wp_kses_post($item->content); ?></p>
                            <?php if (!empty($item->link)): ?>
                            <a href="<?php echo esc_url($item->link); ?>" target="_blank" class="button">
                                <?php _e('Saiba Mais', 'contentfactory-rdm'); ?>
                                <span class="dashicons dashicons-external"></span>
                            </a>
                            <?php endif; ?>
                        </div>
                        <div class="cfrdm-card-footer">
                            <button type="button" class="button button-small cfrdm-dismiss-news-btn" data-news-id="<?php echo $item->id; ?>">
                                <?php _e('Dispensar', 'contentfactory-rdm'); ?>
                            </button>
                        </div>
                    </div>
                    <?php endforeach; ?>
                <?php else: ?>
                    <div class="cfrdm-card">
                        <div class="cfrdm-card-body">
                            <p class="cfrdm-empty-state">
                                <span class="dashicons dashicons-smiley"></span>
                                <?php _e('Você está em dia! Nenhuma nova notícia ou atualização.', 'contentfactory-rdm'); ?>
                            </p>
                        </div>
                    </div>
                <?php endif; ?>
            </div>
        </div>
        <?php
    }
    
    /**
     * Logs page - Enhanced
     */
    public static function render_logs() {
        $page = isset($_GET['paged']) ? max(1, intval($_GET['paged'])) : 1;
        $type = isset($_GET['type']) ? sanitize_text_field($_GET['type']) : '';
        $category = isset($_GET['category']) ? sanitize_text_field($_GET['category']) : '';
        $search = isset($_GET['s']) ? sanitize_text_field($_GET['s']) : '';
        
        $result = CFRDM_Logger::get_logs(array(
            'page' => $page,
            'per_page' => 50,
            'type' => $type,
            'category' => $category,
            'search' => $search,
        ));
        
        $stats = CFRDM_Logger::get_stats(7);
        
        ?>
        <div class="wrap cfrdm-wrap">
            <h1>
                <span class="dashicons dashicons-list-view"></span>
                <?php _e('Logs do Sistema', 'contentfactory-rdm'); ?>
            </h1>
            
            <!-- Stats Cards -->
            <div class="cfrdm-stats-grid cfrdm-stats-grid-5">
                <div class="cfrdm-stat-card small">
                    <span class="stat-value"><?php echo number_format_i18n($stats['total']); ?></span>
                    <span class="stat-label"><?php _e('Total (7 dias)', 'contentfactory-rdm'); ?></span>
                </div>
                <div class="cfrdm-stat-card small success">
                    <span class="stat-value"><?php echo number_format_i18n($stats['by_type']['success']->count ?? 0); ?></span>
                    <span class="stat-label"><?php _e('Sucesso', 'contentfactory-rdm'); ?></span>
                </div>
                <div class="cfrdm-stat-card small info">
                    <span class="stat-value"><?php echo number_format_i18n($stats['by_type']['info']->count ?? 0); ?></span>
                    <span class="stat-label"><?php _e('Info', 'contentfactory-rdm'); ?></span>
                </div>
                <div class="cfrdm-stat-card small warning">
                    <span class="stat-value"><?php echo number_format_i18n($stats['by_type']['warning']->count ?? 0); ?></span>
                    <span class="stat-label"><?php _e('Avisos', 'contentfactory-rdm'); ?></span>
                </div>
                <div class="cfrdm-stat-card small error">
                    <span class="stat-value"><?php echo number_format_i18n($stats['by_type']['error']->count ?? 0); ?></span>
                    <span class="stat-label"><?php _e('Erros', 'contentfactory-rdm'); ?></span>
                </div>
            </div>
            
            <!-- Filters & Actions -->
            <div class="cfrdm-card">
                <div class="cfrdm-card-body">
                    <form method="get" class="cfrdm-logs-filter">
                        <input type="hidden" name="page" value="cfrdm-logs" />
                        
                        <select name="type">
                            <option value=""><?php _e('Todos os tipos', 'contentfactory-rdm'); ?></option>
                            <option value="info" <?php selected($type, 'info'); ?>><?php _e('Info', 'contentfactory-rdm'); ?></option>
                            <option value="success" <?php selected($type, 'success'); ?>><?php _e('Sucesso', 'contentfactory-rdm'); ?></option>
                            <option value="warning" <?php selected($type, 'warning'); ?>><?php _e('Aviso', 'contentfactory-rdm'); ?></option>
                            <option value="error" <?php selected($type, 'error'); ?>><?php _e('Erro', 'contentfactory-rdm'); ?></option>
                        </select>
                        
                        <select name="category">
                            <option value=""><?php _e('Todas as categorias', 'contentfactory-rdm'); ?></option>
                            <option value="general" <?php selected($category, 'general'); ?>><?php _e('Geral', 'contentfactory-rdm'); ?></option>
                            <option value="api" <?php selected($category, 'api'); ?>><?php _e('API', 'contentfactory-rdm'); ?></option>
                            <option value="sync" <?php selected($category, 'sync'); ?>><?php _e('Sincronização', 'contentfactory-rdm'); ?></option>
                            <option value="publish" <?php selected($category, 'publish'); ?>><?php _e('Publicação', 'contentfactory-rdm'); ?></option>
                            <option value="image" <?php selected($category, 'image'); ?>><?php _e('Imagem', 'contentfactory-rdm'); ?></option>
                            <option value="webhook" <?php selected($category, 'webhook'); ?>><?php _e('Webhook', 'contentfactory-rdm'); ?></option>
                            <option value="autocorrect" <?php selected($category, 'autocorrect'); ?>><?php _e('Autocorreção', 'contentfactory-rdm'); ?></option>
                            <option value="system" <?php selected($category, 'system'); ?>><?php _e('Sistema', 'contentfactory-rdm'); ?></option>
                        </select>
                        
                        <input type="text" name="s" value="<?php echo esc_attr($search); ?>" placeholder="<?php _e('Buscar...', 'contentfactory-rdm'); ?>" />
                        
                        <button type="submit" class="button"><?php _e('Filtrar', 'contentfactory-rdm'); ?></button>
                        
                        <div class="cfrdm-logs-actions">
                            <button type="button" class="button" id="cfrdm-export-logs">
                                <span class="dashicons dashicons-download"></span>
                                <?php _e('Exportar CSV', 'contentfactory-rdm'); ?>
                            </button>
                            <button type="button" class="button button-link-delete" id="cfrdm-clear-logs">
                                <span class="dashicons dashicons-trash"></span>
                                <?php _e('Limpar Logs', 'contentfactory-rdm'); ?>
                            </button>
                        </div>
                    </form>
                </div>
            </div>
            
            <!-- Logs Table -->
            <div class="cfrdm-card">
                <div class="cfrdm-card-body">
                    <?php if (!empty($result['logs'])): ?>
                    <table class="wp-list-table widefat fixed striped cfrdm-logs-table">
                        <thead>
                            <tr>
                                <th class="column-type"><?php _e('Tipo', 'contentfactory-rdm'); ?></th>
                                <th class="column-category"><?php _e('Categoria', 'contentfactory-rdm'); ?></th>
                                <th class="column-message"><?php _e('Mensagem', 'contentfactory-rdm'); ?></th>
                                <th class="column-date"><?php _e('Data', 'contentfactory-rdm'); ?></th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($result['logs'] as $log): ?>
                            <tr class="log-<?php echo esc_attr($log->log_type); ?>">
                                <td>
                                    <span class="cfrdm-log-type <?php echo esc_attr($log->log_type); ?>">
                                        <?php echo esc_html(ucfirst($log->log_type)); ?>
                                    </span>
                                </td>
                                <td><?php echo esc_html(ucfirst($log->category)); ?></td>
                                <td>
                                    <?php echo esc_html($log->message); ?>
                                    <?php if (!empty($log->context)): ?>
                                    <button type="button" class="cfrdm-show-context" data-context="<?php echo esc_attr($log->context); ?>">
                                        <span class="dashicons dashicons-info-outline"></span>
                                    </button>
                                    <?php endif; ?>
                                    <?php if ($log->post_id): ?>
                                    <a href="<?php echo get_edit_post_link($log->post_id); ?>" class="cfrdm-log-post-link">
                                        #<?php echo $log->post_id; ?>
                                    </a>
                                    <?php endif; ?>
                                </td>
                                <td><?php echo esc_html(date_i18n('d/m/Y H:i:s', strtotime($log->created_at))); ?></td>
                            </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                    
                    <!-- Pagination -->
                    <?php if ($result['pages'] > 1): ?>
                    <div class="tablenav bottom">
                        <div class="tablenav-pages">
                            <span class="displaying-num"><?php printf(__('%s itens', 'contentfactory-rdm'), number_format_i18n($result['total'])); ?></span>
                            <?php
                            echo paginate_links(array(
                                'base' => add_query_arg('paged', '%#%'),
                                'format' => '',
                                'prev_text' => '&laquo;',
                                'next_text' => '&raquo;',
                                'total' => $result['pages'],
                                'current' => $page,
                            ));
                            ?>
                        </div>
                    </div>
                    <?php endif; ?>
                    
                    <?php else: ?>
                    <p class="cfrdm-empty-state">
                        <span class="dashicons dashicons-info"></span>
                        <?php _e('Nenhum log encontrado.', 'contentfactory-rdm'); ?>
                    </p>
                    <?php endif; ?>
                </div>
            </div>
        </div>
        <?php
    }
    
    /**
     * Articles page
     */
    public static function render_articles() {
        ?>
        <div class="wrap cfrdm-wrap">
            <h1>
                <span class="dashicons dashicons-admin-post"></span>
                <?php _e('Artigos ContentFactory', 'contentfactory-rdm'); ?>
            </h1>
            
            <div class="cfrdm-articles-page">
                <div class="cfrdm-card">
                    <div class="cfrdm-card-header">
                        <h2><?php _e('Gerenciar Artigos', 'contentfactory-rdm'); ?></h2>
                    </div>
                    <div class="cfrdm-card-body">
                        <p>
                            <?php _e('Os artigos são gerenciados diretamente pela plataforma ContentFactory RDM.', 'contentfactory-rdm'); ?>
                        </p>
                        <p>
                            <?php _e('Artigos criados no ContentFactory serão automaticamente publicados aqui quando você usar a função de publicação.', 'contentfactory-rdm'); ?>
                        </p>
                        
                        <div class="cfrdm-actions" style="margin-top: 20px;">
                            <a href="<?php echo admin_url('edit.php'); ?>" class="button button-primary">
                                <span class="dashicons dashicons-admin-post"></span>
                                <?php _e('Ver Todos os Posts', 'contentfactory-rdm'); ?>
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <?php
    }
    
    /**
     * Settings page - Include from original file
     */
    public static function render_settings() {
        // Handle form submission
        if (isset($_POST['cfrdm_save_settings']) && check_admin_referer('cfrdm_settings_nonce')) {
            update_option('cfrdm_enabled', isset($_POST['cfrdm_enabled']));
            update_option('cfrdm_api_url', esc_url_raw($_POST['cfrdm_api_url']));
            update_option('cfrdm_webhook_enabled', isset($_POST['cfrdm_webhook_enabled']));
            update_option('cfrdm_webhook_secret', sanitize_text_field($_POST['cfrdm_webhook_secret']));
            update_option('cfrdm_auto_publish', isset($_POST['cfrdm_auto_publish']));
            update_option('cfrdm_default_status', sanitize_text_field($_POST['cfrdm_default_status']));
            update_option('cfrdm_default_category', intval($_POST['cfrdm_default_category']));
            update_option('cfrdm_default_author', intval($_POST['cfrdm_default_author']));
            
            // New settings
            update_option('cfrdm_auto_optimize_images', isset($_POST['cfrdm_auto_optimize_images']));
            update_option('cfrdm_image_max_width', intval($_POST['cfrdm_image_max_width']));
            update_option('cfrdm_image_quality', intval($_POST['cfrdm_image_quality']));
            update_option('cfrdm_auto_correct', isset($_POST['cfrdm_auto_correct']));
            update_option('cfrdm_auto_correct_seo', isset($_POST['cfrdm_auto_correct_seo']));
            update_option('cfrdm_auto_correct_images', isset($_POST['cfrdm_auto_correct_images']));
            update_option('cfrdm_auto_correct_links', isset($_POST['cfrdm_auto_correct_links']));
            update_option('cfrdm_log_retention_days', intval($_POST['cfrdm_log_retention_days']));
            
            // v3.0.0 - GSC settings
            update_option('cfrdm_gsc_client_id', sanitize_text_field($_POST['cfrdm_gsc_client_id'] ?? ''));
            update_option('cfrdm_gsc_client_secret', sanitize_text_field($_POST['cfrdm_gsc_client_secret'] ?? ''));
            
            // v3.0.0 - AI Auto-Fix settings
            update_option('cfrdm_ai_auto_fix_enabled', isset($_POST['cfrdm_ai_auto_fix_enabled']));
            update_option('cfrdm_ai_auto_fix_min_confidence', intval($_POST['cfrdm_ai_auto_fix_min_confidence'] ?? 80));
            update_option('cfrdm_content_enhancer_enabled', isset($_POST['cfrdm_content_enhancer_enabled']));
            update_option('cfrdm_https_enforcer_enabled', isset($_POST['cfrdm_https_enforcer_enabled']));
            
            // v3.0.0 - Auto-update settings
            update_option('cfrdm_auto_update_enabled', isset($_POST['cfrdm_auto_update_enabled']));
            update_option('cfrdm_update_notification_email', sanitize_email($_POST['cfrdm_update_notification_email'] ?? get_option('admin_email')));
            
            // v3.1.0 - Module toggles
            update_option('cfrdm_meta_auditor_enabled', isset($_POST['cfrdm_meta_auditor_enabled']));
            update_option('cfrdm_meta_auditor_og_enabled', isset($_POST['cfrdm_meta_auditor_og_enabled']));
            update_option('cfrdm_indexnow_enabled', isset($_POST['cfrdm_indexnow_enabled']));
            update_option('cfrdm_llms_txt_enabled', isset($_POST['cfrdm_llms_txt_enabled']));
            update_option('cfrdm_sitemap_optimizer_enabled', isset($_POST['cfrdm_sitemap_optimizer_enabled']));
            update_option('cfrdm_news_sitemap_enabled', isset($_POST['cfrdm_news_sitemap_enabled']));
            update_option('cfrdm_post_duplicator_enabled', isset($_POST['cfrdm_post_duplicator_enabled']));
            update_option('cfrdm_ai_robots_txt_enabled', isset($_POST['cfrdm_ai_robots_txt_enabled']));
            
            echo '<div class="notice notice-success"><p>' . __('Configurações salvas com sucesso!', 'contentfactory-rdm') . '</p></div>';
        }
        
        $categories = get_categories(array('hide_empty' => false));
        $users = get_users(array('role__in' => array('administrator', 'editor', 'author')));
        
        ?>
        <div class="wrap cfrdm-wrap">
            <h1>
                <span class="dashicons dashicons-admin-generic"></span>
                <?php _e('Configurações', 'contentfactory-rdm'); ?>
            </h1>
            
            <form method="post" class="cfrdm-settings-form">
                <?php wp_nonce_field('cfrdm_settings_nonce'); ?>
                
                <!-- Connection Settings -->
                <div class="cfrdm-card">
                    <div class="cfrdm-card-header">
                        <h2>
                            <span class="dashicons dashicons-admin-plugins"></span>
                            <?php _e('Conexão', 'contentfactory-rdm'); ?>
                        </h2>
                    </div>
                    <div class="cfrdm-card-body">
                        <table class="form-table">
                            <tr>
                                <th><label for="cfrdm_enabled"><?php _e('Plugin Ativo', 'contentfactory-rdm'); ?></label></th>
                                <td>
                                    <label>
                                        <input type="checkbox" name="cfrdm_enabled" id="cfrdm_enabled" value="1" 
                                            <?php checked(get_option('cfrdm_enabled', true)); ?> />
                                        <?php _e('Habilitar integração com ContentFactory', 'contentfactory-rdm'); ?>
                                    </label>
                                </td>
                            </tr>
                            <tr>
                                <th><label for="cfrdm_api_url"><?php _e('URL da API ContentFactory', 'contentfactory-rdm'); ?></label></th>
                                <td>
                                    <input type="url" name="cfrdm_api_url" id="cfrdm_api_url" class="regular-text"
                                        value="<?php echo esc_attr(get_option('cfrdm_api_url')); ?>"
                                        placeholder="https://seu-projeto.supabase.co" />
                                </td>
                            </tr>
                            <tr>
                                <th><label><?php _e('API Key', 'contentfactory-rdm'); ?></label></th>
                                <td>
                                    <input type="text" readonly value="<?php echo esc_attr(get_option('cfrdm_api_key')); ?>" class="regular-text" />
                                    <button type="button" class="button" id="cfrdm-regenerate-key">
                                        <span class="dashicons dashicons-update"></span>
                                        <?php _e('Regenerar', 'contentfactory-rdm'); ?>
                                    </button>
                                </td>
                            </tr>
                        </table>
                    </div>
                </div>
                
                <!-- Publishing Settings -->
                <div class="cfrdm-card">
                    <div class="cfrdm-card-header">
                        <h2>
                            <span class="dashicons dashicons-upload"></span>
                            <?php _e('Publicação', 'contentfactory-rdm'); ?>
                        </h2>
                    </div>
                    <div class="cfrdm-card-body">
                        <table class="form-table">
                            <tr>
                                <th><label for="cfrdm_default_status"><?php _e('Status Padrão', 'contentfactory-rdm'); ?></label></th>
                                <td>
                                    <select name="cfrdm_default_status" id="cfrdm_default_status">
                                        <option value="draft" <?php selected(get_option('cfrdm_default_status'), 'draft'); ?>><?php _e('Rascunho', 'contentfactory-rdm'); ?></option>
                                        <option value="pending" <?php selected(get_option('cfrdm_default_status'), 'pending'); ?>><?php _e('Pendente', 'contentfactory-rdm'); ?></option>
                                        <option value="publish" <?php selected(get_option('cfrdm_default_status'), 'publish'); ?>><?php _e('Publicado', 'contentfactory-rdm'); ?></option>
                                    </select>
                                </td>
                            </tr>
                            <tr>
                                <th><label for="cfrdm_default_category"><?php _e('Categoria Padrão', 'contentfactory-rdm'); ?></label></th>
                                <td>
                                    <select name="cfrdm_default_category" id="cfrdm_default_category">
                                        <option value="0"><?php _e('-- Nenhuma --', 'contentfactory-rdm'); ?></option>
                                        <?php foreach ($categories as $cat): ?>
                                        <option value="<?php echo $cat->term_id; ?>" <?php selected(get_option('cfrdm_default_category'), $cat->term_id); ?>>
                                            <?php echo esc_html($cat->name); ?>
                                        </option>
                                        <?php endforeach; ?>
                                    </select>
                                </td>
                            </tr>
                            <tr>
                                <th><label for="cfrdm_default_author"><?php _e('Autor Padrão', 'contentfactory-rdm'); ?></label></th>
                                <td>
                                    <select name="cfrdm_default_author" id="cfrdm_default_author">
                                        <option value="0"><?php _e('-- Atual --', 'contentfactory-rdm'); ?></option>
                                        <?php foreach ($users as $user): ?>
                                        <option value="<?php echo $user->ID; ?>" <?php selected(get_option('cfrdm_default_author'), $user->ID); ?>>
                                            <?php echo esc_html($user->display_name); ?>
                                        </option>
                                        <?php endforeach; ?>
                                    </select>
                                </td>
                            </tr>
                        </table>
                    </div>
                </div>
                
                <!-- Image Optimization Settings -->
                <div class="cfrdm-card">
                    <div class="cfrdm-card-header">
                        <h2>
                            <span class="dashicons dashicons-format-image"></span>
                            <?php _e('Otimização de Imagens', 'contentfactory-rdm'); ?>
                        </h2>
                    </div>
                    <div class="cfrdm-card-body">
                        <table class="form-table">
                            <tr>
                                <th><label for="cfrdm_auto_optimize_images"><?php _e('Otimização Automática', 'contentfactory-rdm'); ?></label></th>
                                <td>
                                    <label>
                                        <input type="checkbox" name="cfrdm_auto_optimize_images" id="cfrdm_auto_optimize_images" value="1" 
                                            <?php checked(get_option('cfrdm_auto_optimize_images', true)); ?> />
                                        <?php _e('Otimizar imagens automaticamente no upload', 'contentfactory-rdm'); ?>
                                    </label>
                                </td>
                            </tr>
                            <tr>
                                <th><label for="cfrdm_image_max_width"><?php _e('Largura Máxima (px)', 'contentfactory-rdm'); ?></label></th>
                                <td>
                                    <input type="number" name="cfrdm_image_max_width" id="cfrdm_image_max_width" 
                                        value="<?php echo esc_attr(get_option('cfrdm_image_max_width', 1200)); ?>" min="600" max="2400" />
                                </td>
                            </tr>
                            <tr>
                                <th><label for="cfrdm_image_quality"><?php _e('Qualidade (%)', 'contentfactory-rdm'); ?></label></th>
                                <td>
                                    <input type="number" name="cfrdm_image_quality" id="cfrdm_image_quality" 
                                        value="<?php echo esc_attr(get_option('cfrdm_image_quality', 85)); ?>" min="50" max="100" />
                                </td>
                            </tr>
                        </table>
                    </div>
                </div>
                
                <!-- Auto-Correction Settings -->
                <div class="cfrdm-card">
                    <div class="cfrdm-card-header">
                        <h2>
                            <span class="dashicons dashicons-admin-tools"></span>
                            <?php _e('Autocorreções', 'contentfactory-rdm'); ?>
                        </h2>
                    </div>
                    <div class="cfrdm-card-body">
                        <table class="form-table">
                            <tr>
                                <th><label for="cfrdm_auto_correct"><?php _e('Autocorreção Ativa', 'contentfactory-rdm'); ?></label></th>
                                <td>
                                    <label>
                                        <input type="checkbox" name="cfrdm_auto_correct" id="cfrdm_auto_correct" value="1" 
                                            <?php checked(get_option('cfrdm_auto_correct', true)); ?> />
                                        <?php _e('Detectar e corrigir problemas automaticamente', 'contentfactory-rdm'); ?>
                                    </label>
                                </td>
                            </tr>
                            <tr>
                                <th><?php _e('Verificações', 'contentfactory-rdm'); ?></th>
                                <td>
                                    <label>
                                        <input type="checkbox" name="cfrdm_auto_correct_seo" value="1" 
                                            <?php checked(get_option('cfrdm_auto_correct_seo', true)); ?> />
                                        <?php _e('Verificar problemas de SEO', 'contentfactory-rdm'); ?>
                                    </label><br />
                                    <label>
                                        <input type="checkbox" name="cfrdm_auto_correct_images" value="1" 
                                            <?php checked(get_option('cfrdm_auto_correct_images', true)); ?> />
                                        <?php _e('Verificar imagens destacadas', 'contentfactory-rdm'); ?>
                                    </label><br />
                                    <label>
                                        <input type="checkbox" name="cfrdm_auto_correct_links" value="1" 
                                            <?php checked(get_option('cfrdm_auto_correct_links', true)); ?> />
                                        <?php _e('Verificar links quebrados', 'contentfactory-rdm'); ?>
                                    </label>
                                </td>
                            </tr>
                        </table>
                    </div>
                </div>
                
                <!-- Logging Settings -->
                <div class="cfrdm-card">
                    <div class="cfrdm-card-header">
                        <h2>
                            <span class="dashicons dashicons-list-view"></span>
                            <?php _e('Logs', 'contentfactory-rdm'); ?>
                        </h2>
                    </div>
                    <div class="cfrdm-card-body">
                        <table class="form-table">
                            <tr>
                                <th><label for="cfrdm_log_retention_days"><?php _e('Retenção de Logs (dias)', 'contentfactory-rdm'); ?></label></th>
                                <td>
                                    <input type="number" name="cfrdm_log_retention_days" id="cfrdm_log_retention_days" 
                                        value="<?php echo esc_attr(get_option('cfrdm_log_retention_days', 30)); ?>" min="7" max="365" />
                                    <p class="description"><?php _e('Logs mais antigos serão automaticamente removidos.', 'contentfactory-rdm'); ?></p>
                                </td>
                            </tr>
                        </table>
                    </div>
                </div>
                
                <!-- v3.0.0 - Google Search Console Settings -->
                <div class="cfrdm-card">
                    <div class="cfrdm-card-header">
                        <h2>
                            <span class="dashicons dashicons-google"></span>
                            <?php _e('Google Search Console (v3.0.0)', 'contentfactory-rdm'); ?>
                        </h2>
                    </div>
                    <div class="cfrdm-card-body">
                        <?php 
                        $gsc_connected = false;
                        if (class_exists('CFRDM_GSC_Integration')) {
                            $gsc_status = CFRDM_GSC_Integration::get_connection_status();
                            $gsc_connected = $gsc_status['connected'];
                        }
                        ?>
                        
                        <?php if ($gsc_connected): ?>
                        <div class="notice notice-success inline" style="margin:0 0 15px;">
                            <p><strong>✓ Conectado ao Google Search Console</strong></p>
                            <p>Site: <?php echo esc_html($gsc_status['site_url']); ?><br>
                            Última sincronização: <?php echo esc_html($gsc_status['last_sync'] ?? 'Nunca'); ?></p>
                        </div>
                        <p>
                            <button type="button" class="button" id="cfrdm-gsc-sync" onclick="cfrdmGSCSync()">
                                <span class="dashicons dashicons-update"></span>
                                <?php _e('Sincronizar Agora', 'contentfactory-rdm'); ?>
                            </button>
                            <button type="button" class="button button-link-delete" id="cfrdm-gsc-disconnect" onclick="cfrdmGSCDisconnect()">
                                <?php _e('Desconectar', 'contentfactory-rdm'); ?>
                            </button>
                        </p>
                        <?php else: ?>
                        <p class="description" style="margin-bottom:15px;">
                            <?php _e('Conecte o Google Search Console para sincronizar automaticamente erros 404, páginas não indexadas e problemas de schema.', 'contentfactory-rdm'); ?>
                        </p>
                        <table class="form-table">
                            <tr>
                                <th><label for="cfrdm_gsc_client_id"><?php _e('Client ID (OAuth)', 'contentfactory-rdm'); ?></label></th>
                                <td>
                                    <input type="text" name="cfrdm_gsc_client_id" id="cfrdm_gsc_client_id" class="regular-text"
                                        value="<?php echo esc_attr(get_option('cfrdm_gsc_client_id')); ?>"
                                        placeholder="xxxxx.apps.googleusercontent.com" />
                                </td>
                            </tr>
                            <tr>
                                <th><label for="cfrdm_gsc_client_secret"><?php _e('Client Secret', 'contentfactory-rdm'); ?></label></th>
                                <td>
                                    <input type="password" name="cfrdm_gsc_client_secret" id="cfrdm_gsc_client_secret" class="regular-text"
                                        value="<?php echo esc_attr(get_option('cfrdm_gsc_client_secret')); ?>" />
                                </td>
                            </tr>
                            <tr>
                                <th><label for="cfrdm_gsc_site_url"><?php _e('Site URL no GSC', 'contentfactory-rdm'); ?></label></th>
                                <td>
                                    <input type="url" name="cfrdm_gsc_site_url" id="cfrdm_gsc_site_url" class="regular-text"
                                        value="<?php echo esc_attr(get_option('cfrdm_gsc_site_url', get_site_url())); ?>" />
                                    <p class="description"><?php _e('URL exata configurada no Search Console (com ou sem www)', 'contentfactory-rdm'); ?></p>
                                </td>
                            </tr>
                        </table>
                        
                        <?php if (get_option('cfrdm_gsc_client_id') && get_option('cfrdm_gsc_client_secret')): ?>
                        <p style="margin-top:15px;">
                            <?php if (class_exists('CFRDM_GSC_Integration')): ?>
                            <a href="<?php echo esc_url(CFRDM_GSC_Integration::get_instance()->get_auth_url()); ?>" class="button button-primary">
                                <span class="dashicons dashicons-admin-links"></span>
                                <?php _e('Conectar ao Google Search Console', 'contentfactory-rdm'); ?>
                            </a>
                            <?php endif; ?>
                        </p>
                        <?php endif; ?>
                        
                        <div class="notice notice-info inline" style="margin:15px 0 0;">
                            <p><strong><?php _e('Como obter as credenciais:', 'contentfactory-rdm'); ?></strong></p>
                            <ol style="margin:5px 0 0 20px;">
                                <li><?php _e('Acesse o', 'contentfactory-rdm'); ?> <a href="https://console.cloud.google.com" target="_blank">Google Cloud Console</a></li>
                                <li><?php _e('Crie um novo projeto ou selecione um existente', 'contentfactory-rdm'); ?></li>
                                <li><?php _e('Ative as APIs: Search Console API e Indexing API', 'contentfactory-rdm'); ?></li>
                                <li><?php _e('Em Credenciais, crie um Client ID OAuth 2.0 (tipo: Web Application)', 'contentfactory-rdm'); ?></li>
                                <li><?php _e('Adicione como URI de redirecionamento:', 'contentfactory-rdm'); ?> <code><?php echo admin_url('admin.php?page=cfrdm-gsc-auth'); ?></code></li>
                            </ol>
                        </div>
                        <?php endif; ?>
                    </div>
                </div>
                
                <!-- v3.0.0 - AI Auto-Fix Settings -->
                <div class="cfrdm-card">
                    <div class="cfrdm-card-header">
                        <h2>
                            <span class="dashicons dashicons-superhero-alt"></span>
                            <?php _e('Correção Automática por IA (v3.0.0)', 'contentfactory-rdm'); ?>
                        </h2>
                    </div>
                    <div class="cfrdm-card-body">
                        <p class="description" style="margin-bottom:15px;">
                            <?php _e('O motor de IA analisa problemas detectados pelo GSC e aplica correções automaticamente quando a confiança é alta o suficiente.', 'contentfactory-rdm'); ?>
                        </p>
                        <table class="form-table">
                            <tr>
                                <th><label for="cfrdm_ai_auto_fix_enabled"><?php _e('Auto-Fix Habilitado', 'contentfactory-rdm'); ?></label></th>
                                <td>
                                    <label>
                                        <input type="checkbox" name="cfrdm_ai_auto_fix_enabled" id="cfrdm_ai_auto_fix_enabled" value="1" 
                                            <?php checked(get_option('cfrdm_ai_auto_fix_enabled', false)); ?> />
                                        <?php _e('Permitir correções automáticas por IA', 'contentfactory-rdm'); ?>
                                    </label>
                                    <p class="description"><?php _e('⚠️ Ações serão executadas automaticamente. Desative para apenas receber sugestões.', 'contentfactory-rdm'); ?></p>
                                </td>
                            </tr>
                            <tr>
                                <th><label for="cfrdm_ai_auto_fix_min_confidence"><?php _e('Confiança Mínima (%)', 'contentfactory-rdm'); ?></label></th>
                                <td>
                                    <input type="number" name="cfrdm_ai_auto_fix_min_confidence" id="cfrdm_ai_auto_fix_min_confidence" 
                                        value="<?php echo esc_attr(get_option('cfrdm_ai_auto_fix_min_confidence', 80)); ?>" min="50" max="100" style="width:80px;" />
                                    <p class="description"><?php _e('Correções só serão aplicadas se a IA tiver confiança acima deste valor.', 'contentfactory-rdm'); ?></p>
                                </td>
                            </tr>
                            <tr>
                                <th><label for="cfrdm_content_enhancer_enabled"><?php _e('Melhoria de Conteúdo', 'contentfactory-rdm'); ?></label></th>
                                <td>
                                    <label>
                                        <input type="checkbox" name="cfrdm_content_enhancer_enabled" id="cfrdm_content_enhancer_enabled" value="1" 
                                            <?php checked(get_option('cfrdm_content_enhancer_enabled', false)); ?> />
                                        <?php _e('Expandir automaticamente conteúdo fino (thin content)', 'contentfactory-rdm'); ?>
                                    </label>
                                </td>
                            </tr>
                            <tr>
                                <th><label for="cfrdm_https_enforcer_enabled"><?php _e('HTTPS Enforcer', 'contentfactory-rdm'); ?></label></th>
                                <td>
                                    <label>
                                        <input type="checkbox" name="cfrdm_https_enforcer_enabled" id="cfrdm_https_enforcer_enabled" value="1" 
                                            <?php checked(get_option('cfrdm_https_enforcer_enabled', false)); ?> />
                                        <?php _e('Converter links HTTP para HTTPS automaticamente', 'contentfactory-rdm'); ?>
                                    </label>
                                </td>
                            </tr>
                        </table>
                        
                        <p style="margin-top:15px;">
                            <a href="<?php echo admin_url('admin.php?page=cfrdm-diagnostics'); ?>" class="button">
                                <span class="dashicons dashicons-chart-bar"></span>
                                <?php _e('Ver Fila de Correções', 'contentfactory-rdm'); ?>
                            </a>
                        </p>
                    </div>
                </div>
                
                <!-- v3.0.0 - Auto-Update Settings -->
                <?php 
                $update_stats = class_exists('CFRDM_Auto_Update') ? CFRDM_Auto_Update::get_stats() : null;
                $update_info = class_exists('CFRDM_Auto_Update') ? CFRDM_Auto_Update::get_update_info() : null;
                $backups = class_exists('CFRDM_Auto_Update') ? CFRDM_Auto_Update::get_backups() : array();
                ?>
                <div class="cfrdm-card">
                    <div class="cfrdm-card-header">
                        <h2>
                            <span class="dashicons dashicons-update"></span>
                            <?php _e('Atualizações Automáticas (v3.0.0)', 'contentfactory-rdm'); ?>
                        </h2>
                    </div>
                    <div class="cfrdm-card-body">
                        <!-- Current Version Info -->
                        <div class="cfrdm-update-status" style="background:#f8f9fa;padding:15px;border-radius:6px;margin-bottom:20px;">
                            <div style="display:flex;align-items:center;gap:15px;flex-wrap:wrap;">
                                <div>
                                    <strong><?php _e('Versão Instalada:', 'contentfactory-rdm'); ?></strong>
                                    <span class="cfrdm-version-badge" style="background:#0073aa;color:#fff;padding:3px 10px;border-radius:3px;margin-left:8px;">
                                        v<?php echo CFRDM_VERSION; ?>
                                    </span>
                                </div>
                                <?php if ($update_stats && $update_stats['last_check']): ?>
                                <div style="color:#666;font-size:12px;">
                                    <?php _e('Última verificação:', 'contentfactory-rdm'); ?> 
                                    <?php echo human_time_diff($update_stats['last_check'], time()) . ' ' . __('atrás', 'contentfactory-rdm'); ?>
                                </div>
                                <?php endif; ?>
                                <button type="button" class="button" id="cfrdm-check-updates" style="margin-left:auto;">
                                    <span class="dashicons dashicons-update"></span>
                                    <?php _e('Verificar Atualizações', 'contentfactory-rdm'); ?>
                                </button>
                            </div>
                        </div>
                        
                        <!-- Update Available Alert -->
                        <?php if ($update_info): ?>
                        <div class="cfrdm-update-alert" style="background:#fff3cd;border:1px solid #ffc107;padding:15px;border-radius:6px;margin-bottom:20px;">
                            <div style="display:flex;align-items:flex-start;gap:15px;">
                                <span class="dashicons dashicons-megaphone" style="color:#856404;font-size:24px;"></span>
                                <div style="flex:1;">
                                    <h4 style="margin:0 0 8px 0;color:#856404;">
                                        <?php printf(__('Nova versão disponível: v%s', 'contentfactory-rdm'), esc_html($update_info['version'])); ?>
                                    </h4>
                                    <?php if (!empty($update_info['changelog'])): ?>
                                    <p style="margin:0 0 10px 0;color:#666;font-size:13px;">
                                        <?php echo esc_html($update_info['changelog']); ?>
                                    </p>
                                    <?php endif; ?>
                                    <div style="display:flex;gap:10px;flex-wrap:wrap;">
                                        <button type="button" class="button button-primary" id="cfrdm-apply-update">
                                            <span class="dashicons dashicons-download"></span>
                                            <?php _e('Atualizar Agora', 'contentfactory-rdm'); ?>
                                        </button>
                                        <span style="color:#666;font-size:12px;align-self:center;">
                                            <?php printf(__('Requer PHP %s+ e WP %s+', 'contentfactory-rdm'), 
                                                esc_html($update_info['requires_php']), 
                                                esc_html($update_info['requires_wp'])); ?>
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <?php else: ?>
                        <div style="background:#d4edda;border:1px solid #28a745;padding:12px 15px;border-radius:6px;margin-bottom:20px;display:flex;align-items:center;gap:10px;">
                            <span class="dashicons dashicons-yes-alt" style="color:#28a745;"></span>
                            <span style="color:#155724;"><?php _e('Você está usando a versão mais recente do plugin.', 'contentfactory-rdm'); ?></span>
                        </div>
                        <?php endif; ?>
                        
                        <!-- Settings -->
                        <table class="form-table">
                            <tr>
                                <th><label for="cfrdm_auto_update_enabled"><?php _e('Atualização Automática', 'contentfactory-rdm'); ?></label></th>
                                <td>
                                    <label>
                                        <input type="checkbox" name="cfrdm_auto_update_enabled" id="cfrdm_auto_update_enabled" value="1" 
                                            <?php checked(get_option('cfrdm_auto_update_enabled', false)); ?> />
                                        <?php _e('Atualizar plugin automaticamente quando houver nova versão', 'contentfactory-rdm'); ?>
                                    </label>
                                    <p class="description"><?php _e('⚠️ Backups são criados automaticamente antes de cada atualização. A verificação ocorre diariamente.', 'contentfactory-rdm'); ?></p>
                                </td>
                            </tr>
                            <tr>
                                <th><label for="cfrdm_update_notification_email"><?php _e('Email de Notificação', 'contentfactory-rdm'); ?></label></th>
                                <td>
                                    <input type="email" name="cfrdm_update_notification_email" id="cfrdm_update_notification_email" 
                                        value="<?php echo esc_attr(get_option('cfrdm_update_notification_email', get_option('admin_email'))); ?>" 
                                        class="regular-text" />
                                    <p class="description"><?php _e('Receba notificações quando atualizações forem aplicadas.', 'contentfactory-rdm'); ?></p>
                                </td>
                            </tr>
                        </table>
                        
                        <!-- Backups Section -->
                        <?php if (!empty($backups)): ?>
                        <div style="margin-top:25px;padding-top:20px;border-top:1px solid #ddd;">
                            <h4 style="margin:0 0 15px 0;">
                                <span class="dashicons dashicons-backup"></span>
                                <?php _e('Backups Disponíveis', 'contentfactory-rdm'); ?>
                                <span style="font-weight:normal;color:#666;font-size:12px;margin-left:10px;">
                                    (<?php echo count($backups); ?>/5)
                                </span>
                            </h4>
                            <table class="widefat striped" style="max-width:600px;">
                                <thead>
                                    <tr>
                                        <th><?php _e('Versão', 'contentfactory-rdm'); ?></th>
                                        <th><?php _e('Data', 'contentfactory-rdm'); ?></th>
                                        <th><?php _e('Ação', 'contentfactory-rdm'); ?></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <?php foreach (array_reverse($backups) as $backup): ?>
                                    <tr>
                                        <td><code>v<?php echo esc_html($backup['version']); ?></code></td>
                                        <td><?php echo esc_html($backup['created_at']); ?></td>
                                        <td>
                                            <?php if (file_exists($backup['path'])): ?>
                                            <button type="button" class="button button-small cfrdm-rollback-btn" 
                                                data-version="<?php echo esc_attr($backup['version']); ?>">
                                                <span class="dashicons dashicons-undo"></span>
                                                <?php _e('Restaurar', 'contentfactory-rdm'); ?>
                                            </button>
                                            <?php else: ?>
                                            <span style="color:#999;"><?php _e('Arquivo não encontrado', 'contentfactory-rdm'); ?></span>
                                            <?php endif; ?>
                                        </td>
                                    </tr>
                                    <?php endforeach; ?>
                                </tbody>
                            </table>
                        </div>
                        <?php endif; ?>
                    </div>
                </div>
                
                <!-- v3.1.0 - SEO Discovery & Automation Modules -->
                <div class="cfrdm-card">
                    <div class="cfrdm-card-header">
                        <h2>
                            <span class="dashicons dashicons-search"></span>
                            <?php _e('Módulos v3.1.0 – SEO Discovery & Automação', 'contentfactory-rdm'); ?>
                        </h2>
                    </div>
                    <div class="cfrdm-card-body">
                        <p class="description" style="margin-bottom:15px;">
                            <?php _e('Ative ou desative individualmente cada módulo de SEO e descoberta por buscadores e IAs.', 'contentfactory-rdm'); ?>
                        </p>
                        <table class="form-table">
                            <tr>
                                <th><label for="cfrdm_meta_auditor_enabled"><?php _e('Meta Auditor IA', 'contentfactory-rdm'); ?></label></th>
                                <td>
                                    <label>
                                        <input type="checkbox" name="cfrdm_meta_auditor_enabled" id="cfrdm_meta_auditor_enabled" value="1" 
                                            <?php checked(get_option('cfrdm_meta_auditor_enabled', true)); ?> />
                                        <?php _e('Auditoria automática de meta descriptions a cada 6 horas', 'contentfactory-rdm'); ?>
                                    </label>
                                    <p class="description"><?php _e('Verifica e corrige meta descriptions ausentes ou curtas usando IA.', 'contentfactory-rdm'); ?></p>
                                </td>
                            </tr>
                            <tr>
                                <th><label for="cfrdm_meta_auditor_og_enabled"><?php _e('Open Graph / Twitter Cards', 'contentfactory-rdm'); ?></label></th>
                                <td>
                                    <label>
                                        <input type="checkbox" name="cfrdm_meta_auditor_og_enabled" id="cfrdm_meta_auditor_og_enabled" value="1" 
                                            <?php checked(get_option('cfrdm_meta_auditor_og_enabled', true)); ?> />
                                        <?php _e('Auto-preencher og:title, og:description e twitter:card', 'contentfactory-rdm'); ?>
                                    </label>
                                </td>
                            </tr>
                            <tr>
                                <th><label for="cfrdm_indexnow_enabled"><?php _e('IndexNow', 'contentfactory-rdm'); ?></label></th>
                                <td>
                                    <label>
                                        <input type="checkbox" name="cfrdm_indexnow_enabled" id="cfrdm_indexnow_enabled" value="1" 
                                            <?php checked(get_option('cfrdm_indexnow_enabled', true)); ?> />
                                        <?php _e('Notificar Google, Bing e Yandex instantaneamente ao publicar/atualizar', 'contentfactory-rdm'); ?>
                                    </label>
                                    <?php $indexnow_key = get_option('cfrdm_indexnow_key', ''); ?>
                                    <?php if ($indexnow_key): ?>
                                    <p class="description"><?php printf(__('IndexNow Key: %s', 'contentfactory-rdm'), '<code>' . esc_html(substr($indexnow_key, 0, 12)) . '...</code>'); ?></p>
                                    <?php endif; ?>
                                </td>
                            </tr>
                            <tr>
                                <th><label for="cfrdm_llms_txt_enabled"><?php _e('Descoberta por IA (llms.txt)', 'contentfactory-rdm'); ?></label></th>
                                <td>
                                    <label>
                                        <input type="checkbox" name="cfrdm_llms_txt_enabled" id="cfrdm_llms_txt_enabled" value="1" 
                                            <?php checked(get_option('cfrdm_llms_txt_enabled', true)); ?> />
                                        <?php _e('Expor /llms.txt e headers AI-friendly para ChatGPT, Claude e Gemini', 'contentfactory-rdm'); ?>
                                    </label>
                                </td>
                            </tr>
                            <tr>
                                <th><label for="cfrdm_sitemap_optimizer_enabled"><?php _e('Sitemap Optimizer', 'contentfactory-rdm'); ?></label></th>
                                <td>
                                    <label>
                                        <input type="checkbox" name="cfrdm_sitemap_optimizer_enabled" id="cfrdm_sitemap_optimizer_enabled" value="1" 
                                            <?php checked(get_option('cfrdm_sitemap_optimizer_enabled', true)); ?> />
                                        <?php _e('Gerar sitemap com prioridades dinâmicas e frequências otimizadas', 'contentfactory-rdm'); ?>
                                    </label>
                                </td>
                            </tr>
                            <tr>
                                <th><label for="cfrdm_news_sitemap_enabled"><?php _e('News Sitemap', 'contentfactory-rdm'); ?></label></th>
                                <td>
                                    <label>
                                        <input type="checkbox" name="cfrdm_news_sitemap_enabled" id="cfrdm_news_sitemap_enabled" value="1" 
                                            <?php checked(get_option('cfrdm_news_sitemap_enabled', true)); ?> />
                                        <?php _e('Gerar sitemap de notícias para Google News (últimas 48h)', 'contentfactory-rdm'); ?>
                                    </label>
                                </td>
                            </tr>
                            <tr>
                                <th><label for="cfrdm_post_duplicator_enabled"><?php _e('Duplicador de Posts', 'contentfactory-rdm'); ?></label></th>
                                <td>
                                    <label>
                                        <input type="checkbox" name="cfrdm_post_duplicator_enabled" id="cfrdm_post_duplicator_enabled" value="1" 
                                            <?php checked(get_option('cfrdm_post_duplicator_enabled', true)); ?> />
                                        <?php _e('Botão para clonar posts/páginas (individual e em lote)', 'contentfactory-rdm'); ?>
                                    </label>
                                </td>
                            </tr>
                            <tr>
                                <th><label for="cfrdm_ai_robots_txt_enabled"><?php _e('robots.txt para IA', 'contentfactory-rdm'); ?></label></th>
                                <td>
                                    <label>
                                        <input type="checkbox" name="cfrdm_ai_robots_txt_enabled" id="cfrdm_ai_robots_txt_enabled" value="1" 
                                            <?php checked(get_option('cfrdm_ai_robots_txt_enabled', true)); ?> />
                                        <?php _e('Adicionar regras no robots.txt para permitir crawlers de IA (GPTBot, Claude-Web, etc.)', 'contentfactory-rdm'); ?>
                                    </label>
                                </td>
                            </tr>
                        </table>
                    </div>
                </div>
                
                <p class="submit">
                    <button type="submit" name="cfrdm_save_settings" class="button button-primary button-large">
                        <?php _e('Salvar Configurações', 'contentfactory-rdm'); ?>
                    </button>
                </p>
                
                <script>
                function cfrdmGSCSync() {
                    var btn = document.getElementById('cfrdm-gsc-sync');
                    btn.disabled = true;
                    btn.innerHTML = '<span class="dashicons dashicons-update spin"></span> Sincronizando...';
                    
                    fetch('<?php echo esc_url(rest_url('cfrdm/v1/gsc-sync')); ?>', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-WP-Nonce': '<?php echo wp_create_nonce('wp_rest'); ?>'
                        },
                        credentials: 'same-origin'
                    })
                    .then(r => r.json())
                    .then(data => {
                        alert(data.success ? 'Sincronização concluída!' : 'Erro: ' + data.message);
                        location.reload();
                    })
                    .catch(e => {
                        alert('Erro: ' + e.message);
                        btn.disabled = false;
                    });
                }
                
                function cfrdmGSCDisconnect() {
                    if (!confirm('Tem certeza que deseja desconectar o Google Search Console?')) return;
                    
                    fetch('<?php echo esc_url(rest_url('cfrdm/v1/gsc-disconnect')); ?>', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-WP-Nonce': '<?php echo wp_create_nonce('wp_rest'); ?>'
                        },
                        credentials: 'same-origin'
                    })
                    .then(r => r.json())
                    .then(data => {
                        location.reload();
                    });
                }
                
                // Auto-Update Functions
                document.addEventListener('DOMContentLoaded', function() {
                    // Check for updates button
                    var checkBtn = document.getElementById('cfrdm-check-updates');
                    if (checkBtn) {
                        checkBtn.addEventListener('click', function() {
                            this.disabled = true;
                            this.innerHTML = '<span class="dashicons dashicons-update spin"></span> Verificando...';
                            
                            fetch('<?php echo esc_url(rest_url('cfrdm/v1/updates/check')); ?>', {
                                method: 'GET',
                                headers: {
                                    'X-CFRDM-API-Key': '<?php echo esc_attr(get_option('cfrdm_api_key')); ?>',
                                    'Accept': 'application/json'
                                }
                            })
                            .then(r => r.json())
                            .then(data => {
                                if (data.update_available) {
                                    alert('Nova versão encontrada: v' + data.update_info.version);
                                } else {
                                    alert('Você já está na versão mais recente!');
                                }
                                location.reload();
                            })
                            .catch(e => {
                                alert('Erro ao verificar: ' + e.message);
                                checkBtn.disabled = false;
                                checkBtn.innerHTML = '<span class="dashicons dashicons-update"></span> Verificar Atualizações';
                            });
                        });
                    }
                    
                    // Apply update button
                    var applyBtn = document.getElementById('cfrdm-apply-update');
                    if (applyBtn) {
                        applyBtn.addEventListener('click', function() {
                            if (!confirm('Deseja aplicar a atualização agora? Um backup será criado automaticamente.')) return;
                            
                            this.disabled = true;
                            this.innerHTML = '<span class="dashicons dashicons-update spin"></span> Atualizando...';
                            
                            fetch('<?php echo esc_url(rest_url('cfrdm/v1/updates/apply')); ?>', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'X-WP-Nonce': '<?php echo wp_create_nonce('wp_rest'); ?>'
                                },
                                credentials: 'same-origin'
                            })
                            .then(r => r.json())
                            .then(data => {
                                if (data.success) {
                                    alert('Atualização aplicada com sucesso! De v' + data.from_version + ' para v' + data.to_version);
                                } else {
                                    alert('Erro: ' + data.message + (data.rollback ? ' (Rollback executado)' : ''));
                                }
                                location.reload();
                            })
                            .catch(e => {
                                alert('Erro: ' + e.message);
                                location.reload();
                            });
                        });
                    }
                    
                    // Rollback buttons
                    document.querySelectorAll('.cfrdm-rollback-btn').forEach(function(btn) {
                        btn.addEventListener('click', function() {
                            var version = this.dataset.version;
                            if (!confirm('Restaurar para a versão v' + version + '? Esta ação irá substituir a versão atual.')) return;
                            
                            this.disabled = true;
                            this.innerHTML = '<span class="dashicons dashicons-update spin"></span>';
                            
                            fetch('<?php echo esc_url(rest_url('cfrdm/v1/updates/rollback')); ?>', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'X-WP-Nonce': '<?php echo wp_create_nonce('wp_rest'); ?>'
                                },
                                credentials: 'same-origin'
                            })
                            .then(r => r.json())
                            .then(data => {
                                if (data.success) {
                                    alert('Rollback executado com sucesso!');
                                } else {
                                    alert('Erro: ' + data.message);
                                }
                                location.reload();
                            })
                            .catch(e => {
                                alert('Erro: ' + e.message);
                                location.reload();
                            });
                        });
                    });
                });
                </script>
            </form>
        </div>
        <?php
    }
    
    /**
     * Get issue label
     */
    private static function get_issue_label($issue) {
        $labels = array(
            'title_too_short' => __('Título muito curto', 'contentfactory-rdm'),
            'title_too_long' => __('Título muito longo', 'contentfactory-rdm'),
            'missing_excerpt' => __('Sem resumo', 'contentfactory-rdm'),
            'excerpt_too_short' => __('Resumo muito curto', 'contentfactory-rdm'),
            'excerpt_too_long' => __('Resumo muito longo', 'contentfactory-rdm'),
            'content_too_short' => __('Conteúdo muito curto', 'contentfactory-rdm'),
            'missing_headings' => __('Sem subtítulos', 'contentfactory-rdm'),
            'no_images_in_content' => __('Sem imagens no conteúdo', 'contentfactory-rdm'),
            'missing_seo_title' => __('Sem título SEO', 'contentfactory-rdm'),
            'missing_meta_description' => __('Sem meta descrição', 'contentfactory-rdm'),
            'missing_featured_image' => __('Sem imagem destacada', 'contentfactory-rdm'),
            'broken_links' => __('Links quebrados', 'contentfactory-rdm'),
        );
        
        return $labels[$issue] ?? $issue;
    }
    
    // AJAX Handlers
    public static function ajax_clear_logs() {
        check_ajax_referer('cfrdm_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Permissão negada');
        }
        
        CFRDM_Logger::clear_all_logs();
        CFRDM_Logger::info('system', 'Logs limpos manualmente');
        
        wp_send_json_success('Logs limpos');
    }
    
    public static function ajax_export_logs() {
        check_ajax_referer('cfrdm_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Permissão negada');
        }
        
        $csv = CFRDM_Logger::export_to_csv();
        wp_send_json_success(array('data' => $csv));
    }
    
    public static function ajax_sync_stats() {
        check_ajax_referer('cfrdm_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Permissão negada');
        }
        
        CFRDM_Sync::sync_stats_to_platform();
        update_option('cfrdm_last_sync', current_time('mysql'));
        
        wp_send_json_success('Sincronizado');
    }
    
    public static function ajax_dismiss_news() {
        check_ajax_referer('cfrdm_nonce', 'nonce');
        
        $news_id = intval($_POST['news_id']);
        CFRDM_Sync::dismiss_news($news_id);
        
        wp_send_json_success();
    }
    
    public static function ajax_run_autocorrect() {
        check_ajax_referer('cfrdm_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Permissão negada');
        }
        
        $results = CFRDM_Sync::run_bulk_autocorrect(50);
        
        wp_send_json_success($results);
    }
    
    public static function ajax_validate_schema() {
        check_ajax_referer('cfrdm_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Permissão negada');
        }
        
        $post_id = intval($_POST['post_id'] ?? 0);
        
        if (!$post_id) {
            wp_send_json_error(array('message' => 'ID do artigo não fornecido'));
        }
        
        $validation = CFRDM_Schema_Validator::validate_post_schemas($post_id);
        
        // Add Google Rich Results Test URL
        $validation['test_url'] = 'https://search.google.com/test/rich-results?url=' . urlencode(get_permalink($post_id));
        $validation['schema_validator_url'] = 'https://validator.schema.org/';
        
        wp_send_json_success($validation);
    }
    
    public static function ajax_generate_links() {
        check_ajax_referer('cfrdm_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Permissão negada');
        }
        
        $post_id = intval($_POST['post_id'] ?? 0);
        
        if (!$post_id) {
            wp_send_json_error(array('message' => 'ID do artigo não fornecido'));
        }
        
        $links = CFRDM_Internal_Links::get_link_suggestions($post_id);
        
        wp_send_json_success($links);
    }
    
    public static function ajax_analyze_links() {
        check_ajax_referer('cfrdm_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Permissão negada');
        }
        
        $results = CFRDM_Internal_Links::analyze_all_posts();
        
        wp_send_json_success($results);
    }
    
    /**
     * Render Article Indexation page - Full sitemap of all published posts
     * This data is used for AI-powered internal linking and SEO optimization
     */
    public static function render_article_indexation() {
        // Get pagination params
        $current_page = isset($_GET['paged']) ? max(1, intval($_GET['paged'])) : 1;
        $per_page = 50;
        $offset = ($current_page - 1) * $per_page;
        $orderby = isset($_GET['orderby']) ? sanitize_text_field($_GET['orderby']) : 'date';
        $order = isset($_GET['order']) ? strtoupper(sanitize_text_field($_GET['order'])) : 'DESC';
        $search = isset($_GET['s']) ? sanitize_text_field($_GET['s']) : '';
        $category_filter = isset($_GET['category']) ? intval($_GET['category']) : 0;
        
        // Query all published posts
        $args = array(
            'post_type' => array('post', 'page'),
            'post_status' => 'publish',
            'posts_per_page' => $per_page,
            'offset' => $offset,
            'orderby' => $orderby,
            'order' => $order,
        );
        
        if ($search) {
            $args['s'] = $search;
        }
        
        if ($category_filter) {
            $args['cat'] = $category_filter;
        }
        
        $query = new WP_Query($args);
        $total_posts = $query->found_posts;
        $total_pages = ceil($total_posts / $per_page);
        
        // Get all categories for filter
        $categories = get_categories(array('hide_empty' => true));
        
        // Get sync status
        $last_sync = get_option('cfrdm_last_article_sync', 'Nunca');
        $sync_progress = get_option('cfrdm_sync_progress', array('status' => 'idle'));
        
        ?>
        <div class="wrap cfrdm-wrap">
            <h1>
                <span class="dashicons dashicons-database"></span>
                <?php _e('Indexação de Artigos para SEO', 'contentfactory-rdm'); ?>
            </h1>
            
            <p class="description">
                Esta página exibe todos os artigos publicados do seu site. Esses dados são utilizados pela IA 
                para criar links internos inteligentes, cruzar referências de conteúdo e otimizar sua estratégia de SEO.
            </p>
            
            <!-- Sync Status Card -->
            <div class="cfrdm-card" style="margin-bottom: 20px;">
                <div class="cfrdm-card-header">
                    <h2>
                        <span class="dashicons dashicons-update-alt"></span>
                        <?php _e('Status da Indexação', 'contentfactory-rdm'); ?>
                    </h2>
                </div>
                <div class="cfrdm-card-body">
                    <div class="cfrdm-stats-grid cfrdm-stats-grid-4" style="margin-bottom: 15px;">
                        <div class="cfrdm-stat-card small">
                            <div class="stat-content">
                                <span class="stat-value"><?php echo number_format_i18n($total_posts); ?></span>
                                <span class="stat-label"><?php _e('Artigos Indexáveis', 'contentfactory-rdm'); ?></span>
                            </div>
                        </div>
                        <div class="cfrdm-stat-card small published">
                            <div class="stat-content">
                                <span class="stat-value"><?php echo number_format_i18n(wp_count_posts('post')->publish); ?></span>
                                <span class="stat-label"><?php _e('Posts Publicados', 'contentfactory-rdm'); ?></span>
                            </div>
                        </div>
                        <div class="cfrdm-stat-card small">
                            <div class="stat-content">
                                <span class="stat-value"><?php echo number_format_i18n(wp_count_posts('page')->publish); ?></span>
                                <span class="stat-label"><?php _e('Páginas Publicadas', 'contentfactory-rdm'); ?></span>
                            </div>
                        </div>
                        <div class="cfrdm-stat-card small synced">
                            <div class="stat-content">
                                <span class="stat-value"><?php echo esc_html(is_string($last_sync) ? $last_sync : 'Nunca'); ?></span>
                                <span class="stat-label"><?php _e('Última Sincronização', 'contentfactory-rdm'); ?></span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="cfrdm-actions">
                        <button type="button" class="button button-primary" id="cfrdm-start-full-sync" <?php echo ($sync_progress['status'] === 'running') ? 'disabled' : ''; ?>>
                            <span class="dashicons dashicons-update"></span>
                            <?php _e('Sincronizar com ContentFactory', 'contentfactory-rdm'); ?>
                        </button>
                        <button type="button" class="button" id="cfrdm-export-sitemap">
                            <span class="dashicons dashicons-download"></span>
                            <?php _e('Exportar CSV', 'contentfactory-rdm'); ?>
                        </button>
                        <span id="cfrdm-sync-status" style="margin-left: 10px;">
                            <?php if ($sync_progress['status'] === 'running'): ?>
                                <span class="spinner is-active" style="float:none;"></span>
                                <?php echo sprintf(__('Processando %d/%d...', 'contentfactory-rdm'), $sync_progress['processed'] ?? 0, $sync_progress['total'] ?? 0); ?>
                            <?php endif; ?>
                        </span>
                    </div>
                </div>
            </div>
            
            <!-- Filters -->
            <div class="tablenav top">
                <form method="get" action="">
                    <input type="hidden" name="page" value="cfrdm-indexation">
                    
                    <div class="alignleft actions">
                        <select name="category">
                            <option value=""><?php _e('Todas as Categorias', 'contentfactory-rdm'); ?></option>
                            <?php foreach ($categories as $cat): ?>
                                <option value="<?php echo $cat->term_id; ?>" <?php selected($category_filter, $cat->term_id); ?>>
                                    <?php echo esc_html($cat->name); ?> (<?php echo $cat->count; ?>)
                                </option>
                            <?php endforeach; ?>
                        </select>
                        
                        <input type="submit" class="button" value="<?php _e('Filtrar', 'contentfactory-rdm'); ?>">
                    </div>
                    
                    <div class="alignright">
                        <input type="search" name="s" value="<?php echo esc_attr($search); ?>" placeholder="<?php _e('Buscar artigos...', 'contentfactory-rdm'); ?>">
                        <input type="submit" class="button" value="<?php _e('Buscar', 'contentfactory-rdm'); ?>">
                    </div>
                </form>
            </div>
            
            <!-- Articles Table -->
            <table class="wp-list-table widefat fixed striped posts">
                <thead>
                    <tr>
                        <th scope="col" class="manage-column column-cb check-column">
                            <input type="checkbox" id="cb-select-all-1">
                        </th>
                        <th scope="col" class="manage-column column-title column-primary sortable <?php echo ($orderby === 'title') ? ($order === 'DESC' ? 'desc' : 'asc') : ''; ?>">
                            <a href="<?php echo esc_url(add_query_arg(array('orderby' => 'title', 'order' => ($orderby === 'title' && $order === 'ASC') ? 'DESC' : 'ASC'))); ?>">
                                <span><?php _e('Título', 'contentfactory-rdm'); ?></span>
                                <span class="sorting-indicators">
                                    <span class="sorting-indicator asc" aria-hidden="true"></span>
                                    <span class="sorting-indicator desc" aria-hidden="true"></span>
                                </span>
                            </a>
                        </th>
                        <th scope="col" class="manage-column"><?php _e('Autor', 'contentfactory-rdm'); ?></th>
                        <th scope="col" class="manage-column"><?php _e('Categorias', 'contentfactory-rdm'); ?></th>
                        <th scope="col" class="manage-column"><?php _e('Tags', 'contentfactory-rdm'); ?></th>
                        <th scope="col" class="manage-column"><?php _e('Palavras', 'contentfactory-rdm'); ?></th>
                        <th scope="col" class="manage-column"><?php _e('Links Int.', 'contentfactory-rdm'); ?></th>
                        <th scope="col" class="manage-column sortable <?php echo ($orderby === 'date') ? ($order === 'DESC' ? 'desc' : 'asc') : ''; ?>">
                            <a href="<?php echo esc_url(add_query_arg(array('orderby' => 'date', 'order' => ($orderby === 'date' && $order === 'DESC') ? 'ASC' : 'DESC'))); ?>">
                                <span><?php _e('Data', 'contentfactory-rdm'); ?></span>
                                <span class="sorting-indicators">
                                    <span class="sorting-indicator asc" aria-hidden="true"></span>
                                    <span class="sorting-indicator desc" aria-hidden="true"></span>
                                </span>
                            </a>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <?php if ($query->have_posts()): ?>
                        <?php while ($query->have_posts()): $query->the_post(); 
                            $post_id = get_the_ID();
                            $categories = get_the_category();
                            $tags = get_the_tags();
                            $word_count = str_word_count(strip_tags(get_the_content()));
                            
                            // Count internal links
                            $content = get_the_content();
                            $site_url = home_url();
                            preg_match_all('/<a[^>]+href=["\'](' . preg_quote($site_url, '/') . '[^"\']*)["\'][^>]*>/i', $content, $internal_links);
                            $internal_link_count = count($internal_links[0]);
                        ?>
                        <tr>
                            <th scope="row" class="check-column">
                                <input type="checkbox" name="post[]" value="<?php echo $post_id; ?>">
                            </th>
                            <td class="column-title column-primary">
                                <strong>
                                    <a href="<?php echo get_edit_post_link($post_id); ?>" class="row-title">
                                        <?php the_title(); ?>
                                    </a>
                                </strong>
                                <div class="row-actions">
                                    <span class="edit">
                                        <a href="<?php echo get_edit_post_link($post_id); ?>"><?php _e('Editar', 'contentfactory-rdm'); ?></a> |
                                    </span>
                                    <span class="view">
                                        <a href="<?php the_permalink(); ?>" target="_blank"><?php _e('Ver', 'contentfactory-rdm'); ?></a> |
                                    </span>
                                    <span class="analyze">
                                        <a href="#" class="cfrdm-analyze-post" data-post-id="<?php echo $post_id; ?>"><?php _e('Analisar SEO', 'contentfactory-rdm'); ?></a>
                                    </span>
                                </div>
                            </td>
                            <td><?php the_author(); ?></td>
                            <td>
                                <?php 
                                if ($categories) {
                                    $cat_names = array_map(function($cat) { return $cat->name; }, $categories);
                                    echo esc_html(implode(', ', array_slice($cat_names, 0, 3)));
                                    if (count($cat_names) > 3) {
                                        echo ' <span class="description">+' . (count($cat_names) - 3) . '</span>';
                                    }
                                } else {
                                    echo '—';
                                }
                                ?>
                            </td>
                            <td>
                                <?php 
                                if ($tags) {
                                    $tag_names = array_map(function($tag) { return $tag->name; }, $tags);
                                    echo esc_html(implode(', ', array_slice($tag_names, 0, 3)));
                                    if (count($tag_names) > 3) {
                                        echo ' <span class="description">+' . (count($tag_names) - 3) . '</span>';
                                    }
                                } else {
                                    echo '—';
                                }
                                ?>
                            </td>
                            <td><?php echo number_format_i18n($word_count); ?></td>
                            <td>
                                <?php if ($internal_link_count > 0): ?>
                                    <span class="dashicons dashicons-admin-links" style="color: #2e7d32;"></span>
                                    <?php echo $internal_link_count; ?>
                                <?php else: ?>
                                    <span style="color: #b26a00;">0</span>
                                <?php endif; ?>
                            </td>
                            <td><?php echo get_the_date('d/m/Y H:i'); ?></td>
                        </tr>
                        <?php endwhile; ?>
                    <?php else: ?>
                        <tr>
                            <td colspan="8" class="no-items"><?php _e('Nenhum artigo encontrado.', 'contentfactory-rdm'); ?></td>
                        </tr>
                    <?php endif; ?>
                </tbody>
                <tfoot>
                    <tr>
                        <th scope="col" class="manage-column column-cb check-column">
                            <input type="checkbox" id="cb-select-all-2">
                        </th>
                        <th scope="col"><?php _e('Título', 'contentfactory-rdm'); ?></th>
                        <th scope="col"><?php _e('Autor', 'contentfactory-rdm'); ?></th>
                        <th scope="col"><?php _e('Categorias', 'contentfactory-rdm'); ?></th>
                        <th scope="col"><?php _e('Tags', 'contentfactory-rdm'); ?></th>
                        <th scope="col"><?php _e('Palavras', 'contentfactory-rdm'); ?></th>
                        <th scope="col"><?php _e('Links Int.', 'contentfactory-rdm'); ?></th>
                        <th scope="col"><?php _e('Data', 'contentfactory-rdm'); ?></th>
                    </tr>
                </tfoot>
            </table>
            
            <!-- Pagination -->
            <?php if ($total_pages > 1): ?>
            <div class="tablenav bottom">
                <div class="tablenav-pages">
                    <span class="displaying-num">
                        <?php echo sprintf(__('%d itens', 'contentfactory-rdm'), $total_posts); ?>
                    </span>
                    <span class="pagination-links">
                        <?php
                        echo paginate_links(array(
                            'base' => add_query_arg('paged', '%#%'),
                            'format' => '',
                            'prev_text' => '&laquo;',
                            'next_text' => '&raquo;',
                            'total' => $total_pages,
                            'current' => $current_page,
                        ));
                        ?>
                    </span>
                </div>
            </div>
            <?php endif; ?>
            
            <?php wp_reset_postdata(); ?>
            
            <!-- Info Box -->
            <div class="cfrdm-card" style="margin-top: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                <div class="cfrdm-card-body">
                    <h3 style="color: white; margin-top: 0;">
                        <span class="dashicons dashicons-lightbulb"></span>
                        <?php _e('Como funciona a Indexação Inteligente?', 'contentfactory-rdm'); ?>
                    </h3>
                    <p style="opacity: 0.9;">
                        <?php _e('A IA do ContentFactory analisa todos os seus artigos publicados para:', 'contentfactory-rdm'); ?>
                    </p>
                    <ul style="opacity: 0.9; margin-left: 20px;">
                        <li><?php _e('✓ Criar links internos inteligentes baseados em semântica', 'contentfactory-rdm'); ?></li>
                        <li><?php _e('✓ Identificar oportunidades de backlinks entre artigos', 'contentfactory-rdm'); ?></li>
                        <li><?php _e('✓ Detectar conteúdos relacionados para clusters temáticos', 'contentfactory-rdm'); ?></li>
                        <li><?php _e('✓ Sugerir melhorias de SEO baseadas no seu conteúdo existente', 'contentfactory-rdm'); ?></li>
                        <li><?php _e('✓ Alimentar a linha editorial com contexto do seu site', 'contentfactory-rdm'); ?></li>
                    </ul>
                </div>
            </div>
        </div>
        
        <script>
        jQuery(document).ready(function($) {
            // Export CSV
            $('#cfrdm-export-sitemap').on('click', function() {
                var articles = [];
                $('table.wp-list-table tbody tr').each(function() {
                    var $row = $(this);
                    articles.push({
                        title: $row.find('.column-title .row-title').text(),
                        author: $row.find('td:nth-child(3)').text(),
                        categories: $row.find('td:nth-child(4)').text(),
                        tags: $row.find('td:nth-child(5)').text(),
                        words: $row.find('td:nth-child(6)').text(),
                        internal_links: $row.find('td:nth-child(7)').text().trim(),
                        date: $row.find('td:nth-child(8)').text()
                    });
                });
                
                var csv = 'Título,Autor,Categorias,Tags,Palavras,Links Internos,Data\n';
                articles.forEach(function(a) {
                    csv += '"' + a.title + '","' + a.author + '","' + a.categories + '","' + a.tags + '",' + a.words + ',' + a.internal_links + ',"' + a.date + '"\n';
                });
                
                var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                var link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = 'artigos-indexados-' + new Date().toISOString().slice(0,10) + '.csv';
                link.click();
            });
            
            // Start full sync
            $('#cfrdm-start-full-sync').on('click', function() {
                var $btn = $(this);
                var $status = $('#cfrdm-sync-status');
                
                $btn.prop('disabled', true);
                $status.html('<span class="spinner is-active" style="float:none;"></span> Iniciando sincronização...');
                
                $.ajax({
                    url: ajaxurl,
                    method: 'POST',
                    data: {
                        action: 'cfrdm_start_full_sync',
                        nonce: '<?php echo wp_create_nonce('cfrdm_admin_nonce'); ?>'
                    },
                    success: function(response) {
                        if (response.success) {
                            $status.html('<span style="color:#2e7d32;">✓ ' + response.data.message + '</span>');
                            // Poll for status
                            pollSyncStatus();
                        } else {
                            $status.html('<span style="color:#c62828;">✗ ' + (response.data.message || 'Erro') + '</span>');
                            $btn.prop('disabled', false);
                        }
                    },
                    error: function() {
                        $status.html('<span style="color:#c62828;">✗ Erro de conexão</span>');
                        $btn.prop('disabled', false);
                    }
                });
            });
            
            function pollSyncStatus() {
                $.ajax({
                    url: ajaxurl,
                    method: 'POST',
                    data: {
                        action: 'cfrdm_get_sync_status',
                        nonce: '<?php echo wp_create_nonce('cfrdm_admin_nonce'); ?>'
                    },
                    success: function(response) {
                        if (response.success) {
                            var progress = response.data;
                            if (progress.status === 'running') {
                                $('#cfrdm-sync-status').html(
                                    '<span class="spinner is-active" style="float:none;"></span> ' +
                                    'Processando ' + progress.processed + '/' + progress.total + '...'
                                );
                                setTimeout(pollSyncStatus, 2000);
                            } else if (progress.status === 'completed') {
                                $('#cfrdm-sync-status').html(
                                    '<span style="color:#2e7d32;">✓ Sincronização concluída! ' +
                                    progress.synced + ' artigos sincronizados.</span>'
                                );
                                $('#cfrdm-start-full-sync').prop('disabled', false);
                            } else {
                                $('#cfrdm-start-full-sync').prop('disabled', false);
                            }
                        }
                    }
                });
            }
        });
        </script>
        <?php
    }
}
