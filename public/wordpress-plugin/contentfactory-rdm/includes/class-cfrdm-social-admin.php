<?php
/**
 * Social Networks Admin Panel
 * 
 * Configuration interface for social media accounts and auto-posting settings
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_Social_Admin {
    
    /**
     * Supported platforms
     */
    const PLATFORMS = array(
        'facebook' => array(
            'name' => 'Facebook',
            'icon' => 'dashicons-facebook',
            'color' => '#1877F2',
            'fields' => array('page_id', 'access_token'),
        ),
        'twitter' => array(
            'name' => 'X (Twitter)',
            'icon' => 'dashicons-twitter',
            'color' => '#000000',
            'fields' => array('api_key', 'api_secret', 'access_token', 'access_secret'),
        ),
        'linkedin' => array(
            'name' => 'LinkedIn',
            'icon' => 'dashicons-linkedin',
            'color' => '#0A66C2',
            'fields' => array('company_id', 'access_token'),
        ),
        'instagram' => array(
            'name' => 'Instagram',
            'icon' => 'dashicons-instagram',
            'color' => '#E4405F',
            'fields' => array('account_id', 'access_token'),
        ),
        'pinterest' => array(
            'name' => 'Pinterest',
            'icon' => 'dashicons-pinterest',
            'color' => '#BD081C',
            'fields' => array('board_id', 'access_token'),
        ),
        'telegram' => array(
            'name' => 'Telegram',
            'icon' => 'dashicons-email-alt',
            'color' => '#0088CC',
            'fields' => array('bot_token', 'chat_id'),
        ),
        'whatsapp' => array(
            'name' => 'WhatsApp Business',
            'icon' => 'dashicons-whatsapp',
            'color' => '#25D366',
            'fields' => array('phone_number_id', 'access_token'),
        ),
    );
    
    /**
     * Render social settings page
     */
    public static function render() {
        // Handle form submission
        if (isset($_POST['cfrdm_save_social_settings']) && check_admin_referer('cfrdm_social_nonce')) {
            self::save_settings();
        }
        
        $accounts = CFRDM_Social_Poster::get_accounts();
        $settings = get_option('cfrdm_social_settings', array());
        
        ?>
        <div class="wrap cfrdm-wrap">
            <h1>
                <span class="dashicons dashicons-share"></span>
                <?php _e('Configuração de Redes Sociais', 'contentfactory-rdm'); ?>
                <span class="cfrdm-version">v<?php echo CFRDM_VERSION; ?></span>
            </h1>
            
            <form method="post" class="cfrdm-social-form">
                <?php wp_nonce_field('cfrdm_social_nonce'); ?>
                
                <!-- Global Settings -->
                <div class="cfrdm-card">
                    <div class="cfrdm-card-header">
                        <h2>
                            <span class="dashicons dashicons-admin-settings"></span>
                            <?php _e('Configurações Globais', 'contentfactory-rdm'); ?>
                        </h2>
                    </div>
                    <div class="cfrdm-card-body">
                        <div class="cfrdm-form-grid">
                            <div class="cfrdm-form-group">
                                <label>
                                    <input type="checkbox" name="cfrdm_auto_social_post" value="1" 
                                        <?php checked(get_option('cfrdm_auto_social_post'), true); ?> />
                                    <?php _e('Auto-postar em redes sociais ao publicar artigo', 'contentfactory-rdm'); ?>
                                </label>
                                <p class="description">
                                    <?php _e('Quando ativado, artigos serão automaticamente adicionados à fila social ao serem publicados.', 'contentfactory-rdm'); ?>
                                </p>
                            </div>
                            
                            <div class="cfrdm-form-group">
                                <label for="cfrdm_social_delay"><?php _e('Atraso entre posts (minutos)', 'contentfactory-rdm'); ?></label>
                                <input type="number" id="cfrdm_social_delay" name="cfrdm_social_delay" 
                                    value="<?php echo esc_attr($settings['delay_minutes'] ?? 5); ?>" min="0" max="1440" />
                                <p class="description">
                                    <?php _e('Tempo de espera entre posts em diferentes plataformas.', 'contentfactory-rdm'); ?>
                                </p>
                            </div>
                            
                            <div class="cfrdm-form-group">
                                <label for="cfrdm_social_template"><?php _e('Template Padrão de Post', 'contentfactory-rdm'); ?></label>
                                <textarea id="cfrdm_social_template" name="cfrdm_social_template" rows="3"
                                    placeholder="📢 {title}&#10;&#10;{excerpt}&#10;&#10;🔗 {url}"
                                ><?php echo esc_textarea($settings['default_template'] ?? "📢 {title}\n\n{excerpt}\n\n🔗 {url}"); ?></textarea>
                                <p class="description">
                                    <?php _e('Use: {title}, {excerpt}, {url}, {author}, {category}, {tags}', 'contentfactory-rdm'); ?>
                                </p>
                            </div>
                            
                            <div class="cfrdm-form-group">
                                <label>
                                    <input type="checkbox" name="cfrdm_social_include_image" value="1" 
                                        <?php checked($settings['include_image'] ?? true, true); ?> />
                                    <?php _e('Incluir imagem destacada nos posts', 'contentfactory-rdm'); ?>
                                </label>
                            </div>
                            
                            <div class="cfrdm-form-group">
                                <label>
                                    <input type="checkbox" name="cfrdm_social_auto_hashtags" value="1" 
                                        <?php checked($settings['auto_hashtags'] ?? true, true); ?> />
                                    <?php _e('Gerar hashtags automaticamente das tags do post', 'contentfactory-rdm'); ?>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Connected Accounts -->
                <div class="cfrdm-card">
                    <div class="cfrdm-card-header">
                        <h2>
                            <span class="dashicons dashicons-groups"></span>
                            <?php _e('Contas Conectadas', 'contentfactory-rdm'); ?>
                        </h2>
                        <button type="button" class="button" id="cfrdm-add-account">
                            <span class="dashicons dashicons-plus-alt"></span>
                            <?php _e('Adicionar Conta', 'contentfactory-rdm'); ?>
                        </button>
                    </div>
                    <div class="cfrdm-card-body">
                        <?php if (empty($accounts)): ?>
                        <div class="cfrdm-empty-state">
                            <span class="dashicons dashicons-share-alt2"></span>
                            <p><?php _e('Nenhuma conta configurada.', 'contentfactory-rdm'); ?></p>
                            <p class="description"><?php _e('Clique em "Adicionar Conta" para conectar suas redes sociais.', 'contentfactory-rdm'); ?></p>
                        </div>
                        <?php else: ?>
                        <div class="cfrdm-accounts-grid">
                            <?php foreach ($accounts as $account): 
                                $platform = self::PLATFORMS[$account['platform']] ?? null;
                                if (!$platform) continue;
                            ?>
                            <div class="cfrdm-account-card" data-account-id="<?php echo esc_attr($account['id']); ?>">
                                <div class="account-header" style="background-color: <?php echo esc_attr($platform['color']); ?>">
                                    <span class="dashicons <?php echo esc_attr($platform['icon']); ?>"></span>
                                    <span class="platform-name"><?php echo esc_html($platform['name']); ?></span>
                                    <span class="account-status <?php echo $account['is_active'] ? 'active' : 'inactive'; ?>">
                                        <?php echo $account['is_active'] ? '●' : '○'; ?>
                                    </span>
                                </div>
                                <div class="account-body">
                                    <p class="account-name"><?php echo esc_html($account['account_name'] ?? 'Conta sem nome'); ?></p>
                                    <p class="account-stats">
                                        <span><?php printf(__('%d posts', 'contentfactory-rdm'), $account['posts_count'] ?? 0); ?></span>
                                        <?php if (!empty($account['last_post_at'])): ?>
                                        <span>• <?php echo human_time_diff(strtotime($account['last_post_at'])); ?></span>
                                        <?php endif; ?>
                                    </p>
                                </div>
                                <div class="account-actions">
                                    <button type="button" class="button button-small cfrdm-edit-account" 
                                        data-account-id="<?php echo esc_attr($account['id']); ?>">
                                        <span class="dashicons dashicons-edit"></span>
                                    </button>
                                    <button type="button" class="button button-small cfrdm-toggle-account" 
                                        data-account-id="<?php echo esc_attr($account['id']); ?>"
                                        data-active="<?php echo $account['is_active'] ? '1' : '0'; ?>">
                                        <span class="dashicons dashicons-<?php echo $account['is_active'] ? 'hidden' : 'visibility'; ?>"></span>
                                    </button>
                                    <button type="button" class="button button-small button-link-delete cfrdm-delete-account" 
                                        data-account-id="<?php echo esc_attr($account['id']); ?>">
                                        <span class="dashicons dashicons-trash"></span>
                                    </button>
                                </div>
                            </div>
                            <?php endforeach; ?>
                        </div>
                        <?php endif; ?>
                    </div>
                </div>
                
                <!-- Platform Configuration Cards -->
                <div class="cfrdm-platforms-grid">
                    <?php foreach (self::PLATFORMS as $platform_key => $platform): ?>
                    <div class="cfrdm-card cfrdm-platform-card">
                        <div class="cfrdm-card-header" style="background: linear-gradient(135deg, <?php echo esc_attr($platform['color']); ?>20, <?php echo esc_attr($platform['color']); ?>10);">
                            <h2>
                                <span class="dashicons <?php echo esc_attr($platform['icon']); ?>" style="color: <?php echo esc_attr($platform['color']); ?>"></span>
                                <?php echo esc_html($platform['name']); ?>
                            </h2>
                            <label class="cfrdm-switch">
                                <input type="checkbox" name="cfrdm_platform_enabled[<?php echo esc_attr($platform_key); ?>]" value="1"
                                    <?php checked($settings['platforms'][$platform_key]['enabled'] ?? false, true); ?> />
                                <span class="cfrdm-slider"></span>
                            </label>
                        </div>
                        <div class="cfrdm-card-body cfrdm-platform-fields" data-platform="<?php echo esc_attr($platform_key); ?>">
                            <?php self::render_platform_fields($platform_key, $platform, $settings); ?>
                        </div>
                    </div>
                    <?php endforeach; ?>
                </div>
                
                <!-- Queue Status -->
                <div class="cfrdm-card">
                    <div class="cfrdm-card-header">
                        <h2>
                            <span class="dashicons dashicons-list-view"></span>
                            <?php _e('Status da Fila Social', 'contentfactory-rdm'); ?>
                        </h2>
                        <button type="button" class="button" id="cfrdm-process-social-queue">
                            <span class="dashicons dashicons-controls-play"></span>
                            <?php _e('Processar Agora', 'contentfactory-rdm'); ?>
                        </button>
                    </div>
                    <div class="cfrdm-card-body">
                        <?php 
                        $queue_stats = CFRDM_Social_Poster::get_queue_stats();
                        ?>
                        <div class="cfrdm-queue-stats">
                            <div class="stat-item pending">
                                <span class="stat-value"><?php echo number_format_i18n($queue_stats['pending'] ?? 0); ?></span>
                                <span class="stat-label"><?php _e('Pendentes', 'contentfactory-rdm'); ?></span>
                            </div>
                            <div class="stat-item processing">
                                <span class="stat-value"><?php echo number_format_i18n($queue_stats['processing'] ?? 0); ?></span>
                                <span class="stat-label"><?php _e('Processando', 'contentfactory-rdm'); ?></span>
                            </div>
                            <div class="stat-item completed">
                                <span class="stat-value"><?php echo number_format_i18n($queue_stats['posted'] ?? 0); ?></span>
                                <span class="stat-label"><?php _e('Postados', 'contentfactory-rdm'); ?></span>
                            </div>
                            <div class="stat-item failed">
                                <span class="stat-value"><?php echo number_format_i18n($queue_stats['failed'] ?? 0); ?></span>
                                <span class="stat-label"><?php _e('Falhas', 'contentfactory-rdm'); ?></span>
                            </div>
                        </div>
                        
                        <!-- Recent Queue Items -->
                        <?php 
                        $recent_items = CFRDM_Social_Poster::get_queue_items(array('limit' => 10));
                        if (!empty($recent_items)):
                        ?>
                        <table class="wp-list-table widefat fixed striped" style="margin-top: 20px;">
                            <thead>
                                <tr>
                                    <th><?php _e('Plataforma', 'contentfactory-rdm'); ?></th>
                                    <th><?php _e('Post', 'contentfactory-rdm'); ?></th>
                                    <th><?php _e('Status', 'contentfactory-rdm'); ?></th>
                                    <th><?php _e('Agendado', 'contentfactory-rdm'); ?></th>
                                    <th><?php _e('Ações', 'contentfactory-rdm'); ?></th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach ($recent_items as $item): 
                                    $platform = self::PLATFORMS[$item->platform] ?? null;
                                ?>
                                <tr>
                                    <td>
                                        <?php if ($platform): ?>
                                        <span class="dashicons <?php echo esc_attr($platform['icon']); ?>" 
                                            style="color: <?php echo esc_attr($platform['color']); ?>"></span>
                                        <?php echo esc_html($platform['name']); ?>
                                        <?php else: ?>
                                        <?php echo esc_html(ucfirst($item->platform)); ?>
                                        <?php endif; ?>
                                    </td>
                                    <td>
                                        <?php 
                                        $post = get_post($item->post_id);
                                        if ($post):
                                        ?>
                                        <a href="<?php echo get_edit_post_link($post->ID); ?>">
                                            <?php echo esc_html(wp_trim_words($post->post_title, 6)); ?>
                                        </a>
                                        <?php else: ?>
                                        #<?php echo esc_html($item->post_id); ?>
                                        <?php endif; ?>
                                    </td>
                                    <td>
                                        <span class="cfrdm-status-badge <?php echo esc_attr($item->status); ?>">
                                            <?php echo esc_html(ucfirst($item->status)); ?>
                                        </span>
                                    </td>
                                    <td>
                                        <?php echo esc_html(date_i18n('d/m H:i', strtotime($item->scheduled_at))); ?>
                                    </td>
                                    <td>
                                        <?php if ($item->status === 'failed'): ?>
                                        <button type="button" class="button button-small cfrdm-retry-social" 
                                            data-id="<?php echo esc_attr($item->id); ?>">
                                            <span class="dashicons dashicons-update"></span>
                                        </button>
                                        <?php endif; ?>
                                        <button type="button" class="button button-small button-link-delete cfrdm-cancel-social" 
                                            data-id="<?php echo esc_attr($item->id); ?>">
                                            <span class="dashicons dashicons-no"></span>
                                        </button>
                                    </td>
                                </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                        <?php endif; ?>
                    </div>
                </div>
                
                <!-- Save Button -->
                <div class="cfrdm-actions" style="margin-top: 24px;">
                    <button type="submit" name="cfrdm_save_social_settings" class="button button-primary button-large">
                        <span class="dashicons dashicons-saved"></span>
                        <?php _e('Salvar Configurações', 'contentfactory-rdm'); ?>
                    </button>
                </div>
            </form>
        </div>
        
        <!-- Add Account Modal -->
        <div id="cfrdm-account-modal" class="cfrdm-modal" style="display: none;">
            <div class="cfrdm-modal-content">
                <div class="cfrdm-modal-header">
                    <h3><?php _e('Adicionar Conta', 'contentfactory-rdm'); ?></h3>
                    <button type="button" class="cfrdm-modal-close">&times;</button>
                </div>
                <div class="cfrdm-modal-body">
                    <div class="cfrdm-form-group">
                        <label for="account-platform"><?php _e('Plataforma', 'contentfactory-rdm'); ?></label>
                        <select id="account-platform" name="platform">
                            <?php foreach (self::PLATFORMS as $key => $platform): ?>
                            <option value="<?php echo esc_attr($key); ?>"><?php echo esc_html($platform['name']); ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <div class="cfrdm-form-group">
                        <label for="account-name"><?php _e('Nome da Conta', 'contentfactory-rdm'); ?></label>
                        <input type="text" id="account-name" name="account_name" placeholder="Ex: Página Principal" />
                    </div>
                    <div id="account-credentials">
                        <!-- Dynamic fields will be inserted here -->
                    </div>
                </div>
                <div class="cfrdm-modal-footer">
                    <button type="button" class="button" id="cfrdm-modal-cancel"><?php _e('Cancelar', 'contentfactory-rdm'); ?></button>
                    <button type="button" class="button button-primary" id="cfrdm-save-account"><?php _e('Salvar Conta', 'contentfactory-rdm'); ?></button>
                </div>
            </div>
        </div>
        
        <script>
        jQuery(document).ready(function($) {
            // Modal handling
            $('#cfrdm-add-account').on('click', function() {
                $('#cfrdm-account-modal').fadeIn(200);
                updateCredentialFields();
            });
            
            $('.cfrdm-modal-close, #cfrdm-modal-cancel').on('click', function() {
                $('#cfrdm-account-modal').fadeOut(200);
            });
            
            $('#account-platform').on('change', function() {
                updateCredentialFields();
            });
            
            function updateCredentialFields() {
                var platform = $('#account-platform').val();
                var fields = <?php echo json_encode(array_map(function($p) { return $p['fields']; }, self::PLATFORMS)); ?>;
                var platformFields = fields[platform] || [];
                
                var html = '';
                platformFields.forEach(function(field) {
                    var label = field.replace(/_/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); });
                    html += '<div class="cfrdm-form-group">';
                    html += '<label for="account-' + field + '">' + label + '</label>';
                    if (field.indexOf('token') !== -1 || field.indexOf('secret') !== -1) {
                        html += '<input type="password" id="account-' + field + '" name="' + field + '" />';
                    } else {
                        html += '<input type="text" id="account-' + field + '" name="' + field + '" />';
                    }
                    html += '</div>';
                });
                
                $('#account-credentials').html(html);
            }
            
            // Save account
            $('#cfrdm-save-account').on('click', function() {
                var $btn = $(this);
                var data = {
                    action: 'cfrdm_save_social_account',
                    nonce: '<?php echo wp_create_nonce('cfrdm_social_account'); ?>',
                    platform: $('#account-platform').val(),
                    account_name: $('#account-name').val(),
                    credentials: {}
                };
                
                $('#account-credentials input').each(function() {
                    data.credentials[$(this).attr('name')] = $(this).val();
                });
                
                $btn.prop('disabled', true).text('<?php _e('Salvando...', 'contentfactory-rdm'); ?>');
                
                $.post(ajaxurl, data, function(response) {
                    if (response.success) {
                        location.reload();
                    } else {
                        alert(response.data || '<?php _e('Erro ao salvar conta', 'contentfactory-rdm'); ?>');
                        $btn.prop('disabled', false).text('<?php _e('Salvar Conta', 'contentfactory-rdm'); ?>');
                    }
                });
            });
            
            // Process queue
            $('#cfrdm-process-social-queue').on('click', function() {
                var $btn = $(this);
                $btn.prop('disabled', true);
                
                $.post(ajaxurl, {
                    action: 'cfrdm_process_social_queue',
                    nonce: '<?php echo wp_create_nonce('cfrdm_social_queue'); ?>'
                }, function(response) {
                    if (response.success) {
                        alert(response.data.message || '<?php _e('Fila processada!', 'contentfactory-rdm'); ?>');
                        location.reload();
                    } else {
                        alert(response.data || '<?php _e('Erro ao processar fila', 'contentfactory-rdm'); ?>');
                    }
                    $btn.prop('disabled', false);
                });
            });
        });
        </script>
        <?php
    }
    
    /**
     * Render platform-specific fields
     */
    private static function render_platform_fields($platform_key, $platform, $settings) {
        $platform_settings = $settings['platforms'][$platform_key] ?? array();
        
        foreach ($platform['fields'] as $field) {
            $label = ucwords(str_replace('_', ' ', $field));
            $value = $platform_settings[$field] ?? '';
            $type = (strpos($field, 'token') !== false || strpos($field, 'secret') !== false) ? 'password' : 'text';
            ?>
            <div class="cfrdm-form-group">
                <label for="cfrdm_<?php echo esc_attr($platform_key); ?>_<?php echo esc_attr($field); ?>">
                    <?php echo esc_html($label); ?>
                </label>
                <input type="<?php echo esc_attr($type); ?>" 
                    id="cfrdm_<?php echo esc_attr($platform_key); ?>_<?php echo esc_attr($field); ?>"
                    name="cfrdm_platform_config[<?php echo esc_attr($platform_key); ?>][<?php echo esc_attr($field); ?>]"
                    value="<?php echo esc_attr($value); ?>"
                    class="regular-text" />
            </div>
            <?php
        }
        
        // Custom template for this platform
        ?>
        <div class="cfrdm-form-group">
            <label for="cfrdm_<?php echo esc_attr($platform_key); ?>_template">
                <?php _e('Template Personalizado', 'contentfactory-rdm'); ?>
            </label>
            <textarea 
                id="cfrdm_<?php echo esc_attr($platform_key); ?>_template"
                name="cfrdm_platform_config[<?php echo esc_attr($platform_key); ?>][template]"
                rows="2"
                placeholder="<?php _e('Deixe vazio para usar o template padrão', 'contentfactory-rdm'); ?>"
            ><?php echo esc_textarea($platform_settings['template'] ?? ''); ?></textarea>
        </div>
        
        <div class="cfrdm-form-group">
            <label>
                <input type="checkbox" 
                    name="cfrdm_platform_config[<?php echo esc_attr($platform_key); ?>][include_link]" 
                    value="1"
                    <?php checked($platform_settings['include_link'] ?? true, true); ?> />
                <?php _e('Incluir link do artigo', 'contentfactory-rdm'); ?>
            </label>
        </div>
        <?php
    }
    
    /**
     * Save settings
     */
    private static function save_settings() {
        // Global settings
        update_option('cfrdm_auto_social_post', isset($_POST['cfrdm_auto_social_post']));
        
        $settings = array(
            'delay_minutes' => intval($_POST['cfrdm_social_delay'] ?? 5),
            'default_template' => sanitize_textarea_field($_POST['cfrdm_social_template'] ?? ''),
            'include_image' => isset($_POST['cfrdm_social_include_image']),
            'auto_hashtags' => isset($_POST['cfrdm_social_auto_hashtags']),
            'platforms' => array(),
        );
        
        // Platform-specific settings
        $enabled = $_POST['cfrdm_platform_enabled'] ?? array();
        $config = $_POST['cfrdm_platform_config'] ?? array();
        
        foreach (self::PLATFORMS as $platform_key => $platform) {
            $settings['platforms'][$platform_key] = array(
                'enabled' => isset($enabled[$platform_key]),
            );
            
            if (isset($config[$platform_key])) {
                foreach ($platform['fields'] as $field) {
                    if (isset($config[$platform_key][$field])) {
                        $value = $config[$platform_key][$field];
                        // Encrypt sensitive fields
                        if (strpos($field, 'token') !== false || strpos($field, 'secret') !== false) {
                            $value = self::encrypt_value($value);
                        }
                        $settings['platforms'][$platform_key][$field] = $value;
                    }
                }
                
                // Template and options
                $settings['platforms'][$platform_key]['template'] = sanitize_textarea_field($config[$platform_key]['template'] ?? '');
                $settings['platforms'][$platform_key]['include_link'] = isset($config[$platform_key]['include_link']);
            }
        }
        
        update_option('cfrdm_social_settings', $settings);
        
        echo '<div class="notice notice-success"><p>' . __('Configurações salvas com sucesso!', 'contentfactory-rdm') . '</p></div>';
    }
    
    /**
     * Simple encryption for sensitive values
     */
    private static function encrypt_value($value) {
        if (empty($value)) {
            return '';
        }
        
        $key = wp_salt('auth');
        $iv = substr(md5($key), 0, 16);
        
        return base64_encode(openssl_encrypt($value, 'AES-256-CBC', $key, 0, $iv));
    }
    
    /**
     * Decrypt sensitive values
     */
    public static function decrypt_value($value) {
        if (empty($value)) {
            return '';
        }
        
        $key = wp_salt('auth');
        $iv = substr(md5($key), 0, 16);
        
        return openssl_decrypt(base64_decode($value), 'AES-256-CBC', $key, 0, $iv);
    }
    
    /**
     * Register AJAX handlers
     */
    public static function register_ajax_handlers() {
        add_action('wp_ajax_cfrdm_save_social_account', array(__CLASS__, 'ajax_save_account'));
        add_action('wp_ajax_cfrdm_delete_social_account', array(__CLASS__, 'ajax_delete_account'));
        add_action('wp_ajax_cfrdm_toggle_social_account', array(__CLASS__, 'ajax_toggle_account'));
        add_action('wp_ajax_cfrdm_process_social_queue', array(__CLASS__, 'ajax_process_queue'));
        add_action('wp_ajax_cfrdm_retry_social_post', array(__CLASS__, 'ajax_retry_post'));
        add_action('wp_ajax_cfrdm_cancel_social_post', array(__CLASS__, 'ajax_cancel_post'));
    }
    
    /**
     * AJAX: Save account
     */
    public static function ajax_save_account() {
        check_ajax_referer('cfrdm_social_account', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Permissão negada');
        }
        
        $platform = sanitize_text_field($_POST['platform'] ?? '');
        $account_name = sanitize_text_field($_POST['account_name'] ?? '');
        $credentials = $_POST['credentials'] ?? array();
        
        if (empty($platform) || !isset(self::PLATFORMS[$platform])) {
            wp_send_json_error('Plataforma inválida');
        }
        
        // Encrypt sensitive credentials
        $encrypted_credentials = array();
        foreach ($credentials as $key => $value) {
            if (strpos($key, 'token') !== false || strpos($key, 'secret') !== false) {
                $encrypted_credentials[$key] = self::encrypt_value(sanitize_text_field($value));
            } else {
                $encrypted_credentials[$key] = sanitize_text_field($value);
            }
        }
        
        $result = CFRDM_Social_Poster::add_account($platform, $account_name, $encrypted_credentials);
        
        if ($result) {
            wp_send_json_success(array('id' => $result));
        } else {
            wp_send_json_error('Erro ao salvar conta');
        }
    }
    
    /**
     * AJAX: Process queue
     */
    public static function ajax_process_queue() {
        check_ajax_referer('cfrdm_social_queue', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Permissão negada');
        }
        
        $result = CFRDM_Social_Poster::process_queue(10);
        
        wp_send_json_success(array(
            'message' => sprintf(__('%d posts processados', 'contentfactory-rdm'), $result['processed'] ?? 0),
            'result' => $result,
        ));
    }
}
