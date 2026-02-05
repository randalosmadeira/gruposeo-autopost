<?php
/**
 * Admin Pages
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_Admin {
    
    /**
     * Dashboard page
     */
    public static function render_dashboard() {
        $stats = CFRDM_Articles::get_stats();
        $api_key = get_option('cfrdm_api_key');
        $is_connected = !empty(get_option('cfrdm_api_url'));
        $synced_articles = CFRDM_Articles::get_synced_articles(5);
        
        ?>
        <div class="wrap cfrdm-wrap">
            <h1>
                <span class="dashicons dashicons-edit-page"></span>
                <?php _e('ContentFactory RDM', 'contentfactory-rdm'); ?>
            </h1>
            
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
                
                <!-- Stats Cards -->
                <div class="cfrdm-stats-grid">
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
                </div>
                
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
                                        <tr>
                                            <td>
                                                <a href="<?php echo get_edit_post_link($article->ID); ?>">
                                                    <?php echo esc_html($article->post_title); ?>
                                                </a>
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
     * Settings page
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
                                    <p class="description">
                                        <?php _e('URL do projeto Supabase do ContentFactory.', 'contentfactory-rdm'); ?>
                                    </p>
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
                                    <p class="description">
                                        <?php _e('Use esta chave para autenticar as requisições do ContentFactory.', 'contentfactory-rdm'); ?>
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </div>
                </div>
                
                <!-- Webhook Settings -->
                <div class="cfrdm-card">
                    <div class="cfrdm-card-header">
                        <h2>
                            <span class="dashicons dashicons-rss"></span>
                            <?php _e('Webhooks', 'contentfactory-rdm'); ?>
                        </h2>
                    </div>
                    <div class="cfrdm-card-body">
                        <table class="form-table">
                            <tr>
                                <th><label for="cfrdm_webhook_enabled"><?php _e('Webhooks Ativos', 'contentfactory-rdm'); ?></label></th>
                                <td>
                                    <label>
                                        <input type="checkbox" name="cfrdm_webhook_enabled" id="cfrdm_webhook_enabled" value="1" 
                                            <?php checked(get_option('cfrdm_webhook_enabled', true)); ?> />
                                        <?php _e('Notificar ContentFactory quando posts forem criados/editados/excluídos', 'contentfactory-rdm'); ?>
                                    </label>
                                </td>
                            </tr>
                            <tr>
                                <th><label for="cfrdm_webhook_secret"><?php _e('Secret do Webhook', 'contentfactory-rdm'); ?></label></th>
                                <td>
                                    <input type="text" name="cfrdm_webhook_secret" id="cfrdm_webhook_secret" class="regular-text"
                                        value="<?php echo esc_attr(get_option('cfrdm_webhook_secret')); ?>"
                                        placeholder="<?php _e('Deixe vazio para usar a API Key', 'contentfactory-rdm'); ?>" />
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
                                        <option value="draft" <?php selected(get_option('cfrdm_default_status'), 'draft'); ?>>
                                            <?php _e('Rascunho', 'contentfactory-rdm'); ?>
                                        </option>
                                        <option value="pending" <?php selected(get_option('cfrdm_default_status'), 'pending'); ?>>
                                            <?php _e('Pendente de Revisão', 'contentfactory-rdm'); ?>
                                        </option>
                                        <option value="publish" <?php selected(get_option('cfrdm_default_status'), 'publish'); ?>>
                                            <?php _e('Publicado', 'contentfactory-rdm'); ?>
                                        </option>
                                    </select>
                                </td>
                            </tr>
                            <tr>
                                <th><label for="cfrdm_default_category"><?php _e('Categoria Padrão', 'contentfactory-rdm'); ?></label></th>
                                <td>
                                    <select name="cfrdm_default_category" id="cfrdm_default_category">
                                        <option value="0"><?php _e('Nenhuma', 'contentfactory-rdm'); ?></option>
                                        <?php foreach ($categories as $cat): ?>
                                            <option value="<?php echo $cat->term_id; ?>" 
                                                <?php selected(get_option('cfrdm_default_category'), $cat->term_id); ?>>
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
                                        <option value="0"><?php _e('Usar autor atual', 'contentfactory-rdm'); ?></option>
                                        <?php foreach ($users as $user): ?>
                                            <option value="<?php echo $user->ID; ?>" 
                                                <?php selected(get_option('cfrdm_default_author'), $user->ID); ?>>
                                                <?php echo esc_html($user->display_name); ?>
                                            </option>
                                        <?php endforeach; ?>
                                    </select>
                                </td>
                            </tr>
                        </table>
                    </div>
                </div>
                
                <p class="submit">
                    <button type="submit" name="cfrdm_save_settings" class="button button-primary button-large">
                        <span class="dashicons dashicons-saved"></span>
                        <?php _e('Salvar Configurações', 'contentfactory-rdm'); ?>
                    </button>
                </p>
            </form>
        </div>
        <?php
    }
    
    /**
     * Logs page
     */
    public static function render_logs() {
        // Handle clear logs
        if (isset($_POST['cfrdm_clear_logs']) && check_admin_referer('cfrdm_clear_logs_nonce')) {
            CFRDM_Webhooks::clear_logs();
            echo '<div class="notice notice-success"><p>' . __('Logs limpos com sucesso!', 'contentfactory-rdm') . '</p></div>';
        }
        
        $logs = CFRDM_Webhooks::get_logs(50);
        
        ?>
        <div class="wrap cfrdm-wrap">
            <h1>
                <span class="dashicons dashicons-list-view"></span>
                <?php _e('Logs de Atividade', 'contentfactory-rdm'); ?>
            </h1>
            
            <div class="cfrdm-card">
                <div class="cfrdm-card-header">
                    <h2><?php _e('Últimas Atividades', 'contentfactory-rdm'); ?></h2>
                    <form method="post" style="display: inline;">
                        <?php wp_nonce_field('cfrdm_clear_logs_nonce'); ?>
                        <button type="submit" name="cfrdm_clear_logs" class="button" 
                            onclick="return confirm('<?php _e('Tem certeza que deseja limpar todos os logs?', 'contentfactory-rdm'); ?>');">
                            <span class="dashicons dashicons-trash"></span>
                            <?php _e('Limpar Logs', 'contentfactory-rdm'); ?>
                        </button>
                    </form>
                </div>
                <div class="cfrdm-card-body">
                    <?php if (!empty($logs)): ?>
                        <table class="wp-list-table widefat fixed striped">
                            <thead>
                                <tr>
                                    <th style="width: 150px;"><?php _e('Data/Hora', 'contentfactory-rdm'); ?></th>
                                    <th style="width: 150px;"><?php _e('Ação', 'contentfactory-rdm'); ?></th>
                                    <th><?php _e('Detalhes', 'contentfactory-rdm'); ?></th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach ($logs as $log): ?>
                                    <tr>
                                        <td>
                                            <code><?php echo esc_html(date_i18n('d/m/Y H:i:s', strtotime($log['timestamp']))); ?></code>
                                        </td>
                                        <td>
                                            <span class="cfrdm-action-badge <?php echo esc_attr(sanitize_html_class($log['action'])); ?>">
                                                <?php echo esc_html($log['action']); ?>
                                            </span>
                                        </td>
                                        <td>
                                            <code><?php echo esc_html(wp_json_encode($log['data'], JSON_UNESCAPED_UNICODE)); ?></code>
                                        </td>
                                    </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                    <?php else: ?>
                        <p class="cfrdm-empty-state">
                            <span class="dashicons dashicons-info"></span>
                            <?php _e('Nenhum log registrado ainda.', 'contentfactory-rdm'); ?>
                        </p>
                    <?php endif; ?>
                </div>
            </div>
        </div>
        <?php
    }
}
