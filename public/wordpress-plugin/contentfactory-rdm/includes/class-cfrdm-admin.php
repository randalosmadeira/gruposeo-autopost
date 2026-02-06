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
                
                <p class="submit">
                    <button type="submit" name="cfrdm_save_settings" class="button button-primary button-large">
                        <?php _e('Salvar Configurações', 'contentfactory-rdm'); ?>
                    </button>
                </p>
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
}
