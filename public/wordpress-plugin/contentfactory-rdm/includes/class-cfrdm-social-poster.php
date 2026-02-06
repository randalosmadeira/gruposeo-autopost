<?php
/**
 * Social Auto-Poster - Automated social media publishing
 * 
 * Inspired by FS Poster functionality:
 * - Auto-post to multiple networks
 * - Custom message templates
 * - Scheduling support
 * - Post format customization per network
 * - Hashtag generation
 * - Link shortening integration
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_Social_Poster {
    
    /**
     * Supported social networks
     */
    const NETWORKS = array(
        'facebook' => array(
            'name' => 'Facebook',
            'icon' => 'dashicons-facebook',
            'supports' => array('text', 'link', 'image'),
            'max_chars' => 63206,
        ),
        'twitter' => array(
            'name' => 'X (Twitter)',
            'icon' => 'dashicons-twitter',
            'supports' => array('text', 'link', 'image'),
            'max_chars' => 280,
        ),
        'linkedin' => array(
            'name' => 'LinkedIn',
            'icon' => 'dashicons-linkedin',
            'supports' => array('text', 'link', 'image'),
            'max_chars' => 3000,
        ),
        'pinterest' => array(
            'name' => 'Pinterest',
            'icon' => 'dashicons-pinterest',
            'supports' => array('text', 'link', 'image'),
            'max_chars' => 500,
        ),
        'telegram' => array(
            'name' => 'Telegram',
            'icon' => 'dashicons-format-chat',
            'supports' => array('text', 'link', 'image'),
            'max_chars' => 4096,
        ),
        'instagram' => array(
            'name' => 'Instagram',
            'icon' => 'dashicons-camera',
            'supports' => array('text', 'image'),
            'max_chars' => 2200,
        ),
        'whatsapp' => array(
            'name' => 'WhatsApp',
            'icon' => 'dashicons-whatsapp',
            'supports' => array('text', 'link'),
            'max_chars' => 65536,
        ),
    );
    
    /**
     * Queue table name
     */
    const QUEUE_TABLE = 'cfrdm_social_queue';
    
    /**
     * Accounts table name
     */
    const ACCOUNTS_TABLE = 'cfrdm_social_accounts';
    
    /**
     * Create required tables
     */
    public static function create_tables() {
        global $wpdb;
        
        $charset_collate = $wpdb->get_charset_collate();
        
        // Social accounts table
        $accounts_table = $wpdb->prefix . self::ACCOUNTS_TABLE;
        $sql_accounts = "CREATE TABLE IF NOT EXISTS {$accounts_table} (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            network varchar(50) NOT NULL,
            account_name varchar(255) NOT NULL,
            account_id varchar(255) DEFAULT NULL,
            access_token text,
            refresh_token text,
            token_expires_at datetime DEFAULT NULL,
            settings longtext,
            is_active tinyint(1) DEFAULT 1,
            last_posted_at datetime DEFAULT NULL,
            error_count int DEFAULT 0,
            last_error text,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY network (network),
            KEY is_active (is_active)
        ) {$charset_collate};";
        
        // Social queue table
        $queue_table = $wpdb->prefix . self::QUEUE_TABLE;
        $sql_queue = "CREATE TABLE IF NOT EXISTS {$queue_table} (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            post_id bigint(20) NOT NULL,
            account_id bigint(20) NOT NULL,
            network varchar(50) NOT NULL,
            message text,
            link varchar(500) DEFAULT NULL,
            image_url varchar(500) DEFAULT NULL,
            hashtags text,
            status varchar(50) DEFAULT 'pending',
            scheduled_at datetime DEFAULT NULL,
            posted_at datetime DEFAULT NULL,
            external_post_id varchar(255) DEFAULT NULL,
            external_post_url varchar(500) DEFAULT NULL,
            retry_count int DEFAULT 0,
            max_retries int DEFAULT 3,
            error_message text,
            metadata longtext,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY post_id (post_id),
            KEY account_id (account_id),
            KEY network (network),
            KEY status (status),
            KEY scheduled_at (scheduled_at)
        ) {$charset_collate};";
        
        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        dbDelta($sql_accounts);
        dbDelta($sql_queue);
        
        CFRDM_Logger::success('social_poster', 'Tabelas de social posting criadas/atualizadas');
    }
    
    /**
     * Drop tables (for uninstall)
     */
    public static function drop_tables() {
        global $wpdb;
        
        $accounts_table = $wpdb->prefix . self::ACCOUNTS_TABLE;
        $queue_table = $wpdb->prefix . self::QUEUE_TABLE;
        
        $wpdb->query("DROP TABLE IF EXISTS {$queue_table}");
        $wpdb->query("DROP TABLE IF EXISTS {$accounts_table}");
    }
    
    /**
     * Get available networks
     */
    public static function get_networks() {
        return self::NETWORKS;
    }
    
    /**
     * Get all accounts
     */
    public static function get_accounts($network = null, $active_only = true) {
        global $wpdb;
        
        $table = $wpdb->prefix . self::ACCOUNTS_TABLE;
        $where = array();
        $values = array();
        
        if ($network) {
            $where[] = 'network = %s';
            $values[] = $network;
        }
        
        if ($active_only) {
            $where[] = 'is_active = 1';
        }
        
        $where_clause = !empty($where) ? 'WHERE ' . implode(' AND ', $where) : '';
        
        $sql = "SELECT * FROM {$table} {$where_clause} ORDER BY network, account_name";
        
        if (!empty($values)) {
            $sql = $wpdb->prepare($sql, $values);
        }
        
        return $wpdb->get_results($sql, ARRAY_A);
    }
    
    /**
     * Add a social account
     */
    public static function add_account($data) {
        global $wpdb;
        
        $table = $wpdb->prefix . self::ACCOUNTS_TABLE;
        
        $insert_data = array(
            'network' => sanitize_text_field($data['network']),
            'account_name' => sanitize_text_field($data['account_name']),
            'account_id' => isset($data['account_id']) ? sanitize_text_field($data['account_id']) : null,
            'access_token' => isset($data['access_token']) ? $data['access_token'] : null,
            'refresh_token' => isset($data['refresh_token']) ? $data['refresh_token'] : null,
            'token_expires_at' => isset($data['token_expires_at']) ? $data['token_expires_at'] : null,
            'settings' => isset($data['settings']) ? wp_json_encode($data['settings']) : null,
            'is_active' => isset($data['is_active']) ? intval($data['is_active']) : 1,
        );
        
        $result = $wpdb->insert($table, $insert_data);
        
        if ($result === false) {
            CFRDM_Logger::error('social_poster', 'Falha ao adicionar conta social', array(
                'error' => $wpdb->last_error,
                'network' => $data['network'],
            ));
            return false;
        }
        
        CFRDM_Logger::success('social_poster', 'Conta social adicionada', array(
            'id' => $wpdb->insert_id,
            'network' => $data['network'],
            'account_name' => $data['account_name'],
        ));
        
        return $wpdb->insert_id;
    }
    
    /**
     * Update a social account
     */
    public static function update_account($id, $data) {
        global $wpdb;
        
        $table = $wpdb->prefix . self::ACCOUNTS_TABLE;
        $update_data = array();
        
        $allowed_fields = array(
            'account_name', 'account_id', 'access_token', 'refresh_token',
            'token_expires_at', 'is_active', 'last_posted_at', 'error_count', 'last_error'
        );
        
        foreach ($allowed_fields as $field) {
            if (isset($data[$field])) {
                $update_data[$field] = $data[$field];
            }
        }
        
        if (isset($data['settings'])) {
            $update_data['settings'] = wp_json_encode($data['settings']);
        }
        
        if (empty($update_data)) {
            return false;
        }
        
        return $wpdb->update($table, $update_data, array('id' => intval($id)));
    }
    
    /**
     * Delete a social account
     */
    public static function delete_account($id) {
        global $wpdb;
        
        $table = $wpdb->prefix . self::ACCOUNTS_TABLE;
        $queue_table = $wpdb->prefix . self::QUEUE_TABLE;
        
        // Delete pending queue items for this account
        $wpdb->delete($queue_table, array(
            'account_id' => intval($id),
            'status' => 'pending',
        ));
        
        return $wpdb->delete($table, array('id' => intval($id)));
    }
    
    /**
     * Queue a post for social sharing
     */
    public static function queue_post($post_id, $account_id, $options = array()) {
        global $wpdb;
        
        $post = get_post($post_id);
        if (!$post) {
            return new WP_Error('invalid_post', 'Post não encontrado');
        }
        
        // Get account
        $accounts_table = $wpdb->prefix . self::ACCOUNTS_TABLE;
        $account = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$accounts_table} WHERE id = %d AND is_active = 1",
            $account_id
        ), ARRAY_A);
        
        if (!$account) {
            return new WP_Error('invalid_account', 'Conta social não encontrada ou inativa');
        }
        
        $network = $account['network'];
        $network_config = self::NETWORKS[$network] ?? null;
        
        if (!$network_config) {
            return new WP_Error('invalid_network', 'Rede social não suportada');
        }
        
        // Build message
        $message = self::build_message($post, $network, $options);
        
        // Get featured image
        $image_url = null;
        if (in_array('image', $network_config['supports'])) {
            $image_id = get_post_thumbnail_id($post_id);
            if ($image_id) {
                $image_url = wp_get_attachment_url($image_id);
            }
        }
        
        // Generate hashtags
        $hashtags = self::generate_hashtags($post, $options);
        
        // Determine scheduling
        $scheduled_at = null;
        if (!empty($options['scheduled_at'])) {
            $scheduled_at = $options['scheduled_at'];
        } elseif (!empty($options['delay_minutes'])) {
            $scheduled_at = date('Y-m-d H:i:s', strtotime("+{$options['delay_minutes']} minutes"));
        }
        
        $queue_table = $wpdb->prefix . self::QUEUE_TABLE;
        
        $insert_data = array(
            'post_id' => $post_id,
            'account_id' => $account_id,
            'network' => $network,
            'message' => $message,
            'link' => get_permalink($post_id),
            'image_url' => $image_url,
            'hashtags' => $hashtags,
            'status' => $scheduled_at ? 'scheduled' : 'pending',
            'scheduled_at' => $scheduled_at,
            'max_retries' => isset($options['max_retries']) ? intval($options['max_retries']) : 3,
            'metadata' => wp_json_encode($options),
        );
        
        $result = $wpdb->insert($queue_table, $insert_data);
        
        if ($result === false) {
            return new WP_Error('queue_failed', 'Falha ao adicionar à fila: ' . $wpdb->last_error);
        }
        
        CFRDM_Logger::info('social_poster', 'Post adicionado à fila social', array(
            'queue_id' => $wpdb->insert_id,
            'post_id' => $post_id,
            'network' => $network,
            'scheduled_at' => $scheduled_at,
        ));
        
        return $wpdb->insert_id;
    }
    
    /**
     * Build message for social post
     */
    public static function build_message($post, $network, $options = array()) {
        $template = $options['template'] ?? self::get_default_template($network);
        
        // Available placeholders
        $placeholders = array(
            '{title}' => $post->post_title,
            '{excerpt}' => wp_trim_words(strip_tags($post->post_excerpt ?: $post->post_content), 30),
            '{link}' => get_permalink($post->ID),
            '{author}' => get_the_author_meta('display_name', $post->post_author),
            '{date}' => get_the_date('', $post->ID),
            '{site_name}' => get_bloginfo('name'),
            '{category}' => self::get_primary_category($post->ID),
        );
        
        $message = str_replace(array_keys($placeholders), array_values($placeholders), $template);
        
        // Truncate if exceeds network limit
        $max_chars = self::NETWORKS[$network]['max_chars'] ?? 500;
        if (strlen($message) > $max_chars) {
            $message = substr($message, 0, $max_chars - 3) . '...';
        }
        
        return $message;
    }
    
    /**
     * Get default template for network
     */
    public static function get_default_template($network) {
        $templates = array(
            'facebook' => "📰 {title}\n\n{excerpt}\n\n🔗 Leia mais: {link}",
            'twitter' => "🔥 {title}\n\n{link}",
            'linkedin' => "📢 {title}\n\n{excerpt}\n\n📖 Confira o artigo completo: {link}\n\n#ContentMarketing",
            'pinterest' => "{title} - {excerpt}",
            'telegram' => "📰 *{title}*\n\n{excerpt}\n\n[Leia mais]({link})",
            'instagram' => "📰 {title}\n\n{excerpt}\n\n👆 Link na bio!",
            'whatsapp' => "🔔 *{title}*\n\n{excerpt}\n\n🔗 {link}",
        );
        
        return $templates[$network] ?? "{title}\n\n{link}";
    }
    
    /**
     * Get primary category name
     */
    private static function get_primary_category($post_id) {
        $categories = get_the_category($post_id);
        if (!empty($categories)) {
            return $categories[0]->name;
        }
        return '';
    }
    
    /**
     * Generate hashtags
     */
    public static function generate_hashtags($post, $options = array()) {
        $hashtags = array();
        
        // From tags
        $tags = get_the_tags($post->ID);
        if ($tags) {
            foreach (array_slice($tags, 0, 5) as $tag) {
                $hashtag = str_replace(' ', '', $tag->name);
                $hashtags[] = '#' . preg_replace('/[^a-zA-Z0-9]/', '', $hashtag);
            }
        }
        
        // From categories
        $categories = get_the_category($post->ID);
        if ($categories) {
            foreach (array_slice($categories, 0, 2) as $cat) {
                $hashtag = str_replace(' ', '', $cat->name);
                $hashtags[] = '#' . preg_replace('/[^a-zA-Z0-9]/', '', $hashtag);
            }
        }
        
        // Custom hashtags
        if (!empty($options['custom_hashtags'])) {
            $custom = explode(',', $options['custom_hashtags']);
            foreach ($custom as $h) {
                $h = trim($h);
                if (strpos($h, '#') !== 0) {
                    $h = '#' . $h;
                }
                $hashtags[] = preg_replace('/[^a-zA-Z0-9#]/', '', $h);
            }
        }
        
        return implode(' ', array_unique($hashtags));
    }
    
    /**
     * Process queue
     */
    public static function process_queue($limit = 10) {
        global $wpdb;
        
        $table = $wpdb->prefix . self::QUEUE_TABLE;
        $now = current_time('mysql');
        
        // Get pending and scheduled items ready to process
        $items = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$table} 
             WHERE (status = 'pending' OR (status = 'scheduled' AND scheduled_at <= %s))
             AND retry_count < max_retries
             ORDER BY scheduled_at ASC, created_at ASC
             LIMIT %d",
            $now,
            $limit
        ), ARRAY_A);
        
        $results = array(
            'processed' => 0,
            'success' => 0,
            'failed' => 0,
            'retried' => 0,
        );
        
        foreach ($items as $item) {
            // Mark as processing
            $wpdb->update($table, array('status' => 'processing'), array('id' => $item['id']));
            
            // Attempt to post
            $post_result = self::execute_post($item);
            
            $results['processed']++;
            
            if (is_wp_error($post_result)) {
                $retry_count = $item['retry_count'] + 1;
                $max_retries = $item['max_retries'];
                
                $update_data = array(
                    'retry_count' => $retry_count,
                    'error_message' => $post_result->get_error_message(),
                );
                
                if ($retry_count >= $max_retries) {
                    $update_data['status'] = 'failed';
                    $results['failed']++;
                } else {
                    $update_data['status'] = 'pending';
                    $results['retried']++;
                }
                
                $wpdb->update($table, $update_data, array('id' => $item['id']));
                
                // Update account error count
                self::update_account($item['account_id'], array(
                    'error_count' => 'error_count + 1',
                    'last_error' => $post_result->get_error_message(),
                ));
            } else {
                $wpdb->update($table, array(
                    'status' => 'posted',
                    'posted_at' => $now,
                    'external_post_id' => $post_result['post_id'] ?? null,
                    'external_post_url' => $post_result['post_url'] ?? null,
                ), array('id' => $item['id']));
                
                $results['success']++;
                
                // Update account last posted
                self::update_account($item['account_id'], array(
                    'last_posted_at' => $now,
                    'error_count' => 0,
                    'last_error' => null,
                ));
            }
        }
        
        if ($results['processed'] > 0) {
            CFRDM_Logger::info('social_poster', 'Fila processada', $results);
        }
        
        return $results;
    }
    
    /**
     * Execute the actual post to social network
     * This is a hook point - actual implementations would go here
     */
    private static function execute_post($queue_item) {
        $network = $queue_item['network'];
        
        // Get account details
        global $wpdb;
        $accounts_table = $wpdb->prefix . self::ACCOUNTS_TABLE;
        $account = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$accounts_table} WHERE id = %d",
            $queue_item['account_id']
        ), ARRAY_A);
        
        if (!$account) {
            return new WP_Error('account_not_found', 'Conta social não encontrada');
        }
        
        // Apply filter to allow custom integrations
        $result = apply_filters("cfrdm_social_post_{$network}", null, $queue_item, $account);
        
        if ($result !== null) {
            return $result;
        }
        
        // Default implementation - webhook to external service
        $webhook_url = get_option("cfrdm_social_webhook_{$network}");
        
        if (!empty($webhook_url)) {
            $response = wp_remote_post($webhook_url, array(
                'headers' => array(
                    'Content-Type' => 'application/json',
                ),
                'body' => wp_json_encode(array(
                    'network' => $network,
                    'account' => array(
                        'id' => $account['account_id'],
                        'name' => $account['account_name'],
                        'token' => $account['access_token'],
                    ),
                    'post' => array(
                        'message' => $queue_item['message'],
                        'link' => $queue_item['link'],
                        'image' => $queue_item['image_url'],
                        'hashtags' => $queue_item['hashtags'],
                    ),
                    'metadata' => json_decode($queue_item['metadata'], true),
                )),
                'timeout' => 30,
            ));
            
            if (is_wp_error($response)) {
                return $response;
            }
            
            $body = json_decode(wp_remote_retrieve_body($response), true);
            
            if (wp_remote_retrieve_response_code($response) >= 400) {
                return new WP_Error(
                    'api_error',
                    $body['error'] ?? 'Erro ao publicar na rede social'
                );
            }
            
            return array(
                'success' => true,
                'post_id' => $body['post_id'] ?? null,
                'post_url' => $body['post_url'] ?? null,
            );
        }
        
        // If no webhook configured, just mark as posted (dry run)
        return array(
            'success' => true,
            'post_id' => 'dry_run_' . time(),
            'post_url' => null,
        );
    }
    
    /**
     * Get queue items
     */
    public static function get_queue($args = array()) {
        global $wpdb;
        
        $table = $wpdb->prefix . self::QUEUE_TABLE;
        
        $defaults = array(
            'post_id' => null,
            'account_id' => null,
            'network' => null,
            'status' => null,
            'limit' => 50,
            'offset' => 0,
        );
        
        $args = wp_parse_args($args, $defaults);
        
        $where = array('1=1');
        $values = array();
        
        if ($args['post_id']) {
            $where[] = 'post_id = %d';
            $values[] = intval($args['post_id']);
        }
        
        if ($args['account_id']) {
            $where[] = 'account_id = %d';
            $values[] = intval($args['account_id']);
        }
        
        if ($args['network']) {
            $where[] = 'network = %s';
            $values[] = $args['network'];
        }
        
        if ($args['status']) {
            if (is_array($args['status'])) {
                $placeholders = implode(',', array_fill(0, count($args['status']), '%s'));
                $where[] = "status IN ({$placeholders})";
                $values = array_merge($values, $args['status']);
            } else {
                $where[] = 'status = %s';
                $values[] = $args['status'];
            }
        }
        
        $where_clause = implode(' AND ', $where);
        
        $sql = "SELECT q.*, a.account_name, a.network as account_network 
                FROM {$table} q 
                LEFT JOIN " . $wpdb->prefix . self::ACCOUNTS_TABLE . " a ON q.account_id = a.id
                WHERE {$where_clause}
                ORDER BY q.created_at DESC
                LIMIT %d OFFSET %d";
        
        $values[] = intval($args['limit']);
        $values[] = intval($args['offset']);
        
        return $wpdb->get_results($wpdb->prepare($sql, $values), ARRAY_A);
    }
    
    /**
     * Get queue stats
     */
    public static function get_queue_stats() {
        global $wpdb;
        
        $table = $wpdb->prefix . self::QUEUE_TABLE;
        
        $stats = $wpdb->get_results(
            "SELECT status, COUNT(*) as count FROM {$table} GROUP BY status",
            ARRAY_A
        );
        
        $result = array(
            'pending' => 0,
            'scheduled' => 0,
            'processing' => 0,
            'posted' => 0,
            'failed' => 0,
        );
        
        foreach ($stats as $row) {
            $result[$row['status']] = intval($row['count']);
        }
        
        $result['total'] = array_sum($result);
        
        return $result;
    }
    
    /**
     * Cancel a queue item
     */
    public static function cancel_queue_item($id) {
        global $wpdb;
        
        $table = $wpdb->prefix . self::QUEUE_TABLE;
        
        return $wpdb->update(
            $table,
            array('status' => 'cancelled'),
            array('id' => intval($id), 'status' => array('pending', 'scheduled'))
        );
    }
    
    /**
     * Retry a failed queue item
     */
    public static function retry_queue_item($id) {
        global $wpdb;
        
        $table = $wpdb->prefix . self::QUEUE_TABLE;
        
        return $wpdb->update(
            $table,
            array(
                'status' => 'pending',
                'retry_count' => 0,
                'error_message' => null,
            ),
            array('id' => intval($id), 'status' => 'failed')
        );
    }
    
    /**
     * Cleanup old queue items
     */
    public static function cleanup($days = 30) {
        global $wpdb;
        
        $table = $wpdb->prefix . self::QUEUE_TABLE;
        $cutoff = date('Y-m-d H:i:s', strtotime("-{$days} days"));
        
        $deleted = $wpdb->query($wpdb->prepare(
            "DELETE FROM {$table} WHERE status IN ('posted', 'failed', 'cancelled') AND created_at < %s",
            $cutoff
        ));
        
        if ($deleted > 0) {
            CFRDM_Logger::info('social_poster', "Limpeza: {$deleted} itens removidos da fila");
        }
        
        return $deleted;
    }
    
    /**
     * Auto-queue on post publish
     */
    public static function on_post_publish($post_id, $post) {
        if (!get_option('cfrdm_auto_social_post', false)) {
            return;
        }
        
        // Only for posts
        if ($post->post_type !== 'post') {
            return;
        }
        
        // Skip if already queued
        $existing = self::get_queue(array('post_id' => $post_id, 'status' => array('pending', 'scheduled')));
        if (!empty($existing)) {
            return;
        }
        
        // Get active accounts
        $accounts = self::get_accounts(null, true);
        
        foreach ($accounts as $account) {
            $delay = get_option("cfrdm_social_delay_{$account['network']}", 0);
            
            self::queue_post($post_id, $account['id'], array(
                'delay_minutes' => $delay,
            ));
        }
    }
}
