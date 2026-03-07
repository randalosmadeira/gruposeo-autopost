<?php
/**
 * Instant Indexing Engine v3.7.0
 * 
 * Inspired by IndexMeNow architecture — Admin Bar, Posts List column,
 * Manual Push, Bulk Index, Quota Monitoring, Auto-submit on Publish.
 * 
 * Consolidates and enhances:
 * - CFRDM_Google_Indexing_Submitter (Google Indexing API)
 * - CFRDM_IndexNow (IndexNow + Bing/Yandex ping)
 * - NEW: Admin Bar quick-index button
 * - NEW: Posts list indexing status column
 * - NEW: Bulk index action from posts list
 * - NEW: Quota monitoring dashboard widget
 * - NEW: Real-time indexing status per post
 * 
 * @package ContentFactory_RDM
 * @since 3.7.0
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_Instant_Indexing {

    const OPTION_DAILY_QUOTA = 'cfrdm_instant_indexing_daily_count';
    const OPTION_QUOTA_DATE = 'cfrdm_instant_indexing_quota_date';
    const OPTION_ENABLED = 'cfrdm_instant_indexing_enabled';
    const MAX_DAILY_QUOTA = 500; // 200 Google + 300 IndexNow

    private static $instance = null;

    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Initialize all hooks
     */
    public function init() {
        if (!self::is_enabled()) {
            return;
        }

        // Admin Bar — quick index button
        add_action('admin_bar_menu', array($this, 'add_admin_bar_menu'), 999);

        // Posts list — indexing status column
        add_filter('manage_posts_columns', array($this, 'add_indexing_column'));
        add_action('manage_posts_custom_column', array($this, 'render_indexing_column'), 10, 2);
        add_filter('manage_pages_columns', array($this, 'add_indexing_column'));
        add_action('manage_pages_custom_column', array($this, 'render_indexing_column'), 10, 2);

        // Bulk actions — index selected posts
        add_filter('bulk_actions-edit-post', array($this, 'register_bulk_actions'));
        add_filter('bulk_actions-edit-page', array($this, 'register_bulk_actions'));
        add_filter('handle_bulk_actions-edit-post', array($this, 'handle_bulk_index'), 10, 3);
        add_filter('handle_bulk_actions-edit-page', array($this, 'handle_bulk_index'), 10, 3);
        add_action('admin_notices', array($this, 'bulk_action_notices'));

        // AJAX — manual push from posts list + admin bar
        add_action('wp_ajax_cfrdm_instant_index', array($this, 'ajax_instant_index'));
        add_action('wp_ajax_cfrdm_instant_index_current', array($this, 'ajax_instant_index_current'));

        // Auto-submit on publish (priority 250 — after all other publish hooks)
        add_action('transition_post_status', array($this, 'on_post_transition'), 250, 3);

        // Dashboard widget
        add_action('wp_dashboard_setup', array($this, 'add_dashboard_widget'));

        // Admin scripts
        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_scripts'));
        add_action('admin_footer', array($this, 'admin_bar_inline_css'));

        // REST endpoints
        add_action('rest_api_init', array($this, 'register_routes'));
    }

    public static function is_enabled() {
        return (bool) get_option(self::OPTION_ENABLED, true);
    }

    // =========================================================================
    // ADMIN BAR — Quick Index Button
    // =========================================================================

    public function add_admin_bar_menu($wp_admin_bar) {
        if (!current_user_can('edit_posts')) {
            return;
        }

        $quota = $this->get_quota_info();

        // Main menu item
        $wp_admin_bar->add_node(array(
            'id' => 'cfrdm-instant-indexing',
            'title' => '<span class="ab-icon dashicons dashicons-admin-site-alt3"></span> IndexNow <span class="cfrdm-quota-badge">' . $quota['remaining'] . '</span>',
            'href' => '#',
            'meta' => array(
                'class' => 'cfrdm-instant-indexing-bar',
                'title' => sprintf('Quota: %d/%d restantes hoje', $quota['remaining'], self::MAX_DAILY_QUOTA),
            ),
        ));

        // Sub-item: Index current page (only on single post/page view)
        if (is_singular()) {
            $wp_admin_bar->add_node(array(
                'parent' => 'cfrdm-instant-indexing',
                'id' => 'cfrdm-index-current',
                'title' => '⚡ Indexar Esta Página',
                'href' => '#',
                'meta' => array(
                    'class' => 'cfrdm-index-current-page',
                    'onclick' => 'cfrdmInstantIndexCurrent(); return false;',
                ),
            ));
        }

        // Sub-item: Index recent posts
        $wp_admin_bar->add_node(array(
            'parent' => 'cfrdm-instant-indexing',
            'id' => 'cfrdm-index-recent',
            'title' => '📋 Indexar Últimos 50 Posts',
            'href' => admin_url('admin.php?page=cfrdm-settings&tab=indexing'),
        ));

        // Sub-item: Quota status
        $wp_admin_bar->add_node(array(
            'parent' => 'cfrdm-instant-indexing',
            'id' => 'cfrdm-quota-status',
            'title' => sprintf('📊 Quota: %d/%d usados', $quota['used'], self::MAX_DAILY_QUOTA),
            'href' => admin_url('admin.php?page=cfrdm-diagnostics'),
        ));
    }

    // =========================================================================
    // POSTS LIST — Indexing Status Column
    // =========================================================================

    public function add_indexing_column($columns) {
        $columns['cfrdm_indexing'] = '<span class="dashicons dashicons-admin-site-alt3" title="Status de Indexação"></span>';
        return $columns;
    }

    public function render_indexing_column($column, $post_id) {
        if ($column !== 'cfrdm_indexing') {
            return;
        }

        $post = get_post($post_id);
        if ($post->post_status !== 'publish') {
            echo '<span class="cfrdm-idx-status cfrdm-idx-na" title="Não publicado">—</span>';
            return;
        }

        $submitted_at = get_post_meta($post_id, '_cfrdm_google_indexing_submitted', true);
        $indexnow_at = get_post_meta($post_id, '_cfrdm_indexnow_submitted', true);
        $last_indexed = $submitted_at ?: $indexnow_at;

        if ($last_indexed) {
            $time_ago = human_time_diff(strtotime($last_indexed), current_time('timestamp'));
            echo '<span class="cfrdm-idx-status cfrdm-idx-ok" title="Indexado há ' . esc_attr($time_ago) . '">✅</span>';
            echo '<br><small style="color:#666;font-size:10px;">' . esc_html($time_ago) . '</small>';
        } else {
            echo '<a href="#" class="cfrdm-idx-push" data-post-id="' . esc_attr($post_id) . '" title="Clique para indexar agora">';
            echo '<span class="cfrdm-idx-status cfrdm-idx-pending">⏳</span>';
            echo '</a>';
        }
    }

    // =========================================================================
    // BULK ACTIONS — Index Selected Posts
    // =========================================================================

    public function register_bulk_actions($bulk_actions) {
        $bulk_actions['cfrdm_bulk_index'] = '⚡ Indexar Agora (IndexNow + Google)';
        return $bulk_actions;
    }

    public function handle_bulk_index($redirect_to, $doaction, $post_ids) {
        if ($doaction !== 'cfrdm_bulk_index') {
            return $redirect_to;
        }

        $indexed = 0;
        $failed = 0;

        foreach ($post_ids as $post_id) {
            $post = get_post($post_id);
            if (!$post || $post->post_status !== 'publish') {
                $failed++;
                continue;
            }

            $url = get_permalink($post_id);
            if ($this->submit_for_indexing($url, $post_id)) {
                $indexed++;
            } else {
                $failed++;
            }

            usleep(100000); // 100ms throttle
        }

        $redirect_to = add_query_arg(array(
            'cfrdm_indexed' => $indexed,
            'cfrdm_failed' => $failed,
        ), $redirect_to);

        return $redirect_to;
    }

    public function bulk_action_notices() {
        if (!empty($_REQUEST['cfrdm_indexed'])) {
            $indexed = intval($_REQUEST['cfrdm_indexed']);
            $failed = intval($_REQUEST['cfrdm_failed'] ?? 0);
            $msg = sprintf(
                '⚡ ContentFactory: %d URL(s) submetidas para indexação.',
                $indexed
            );
            if ($failed > 0) {
                $msg .= sprintf(' %d falharam.', $failed);
            }
            echo '<div class="notice notice-success is-dismissible"><p>' . esc_html($msg) . '</p></div>';
        }
    }

    // =========================================================================
    // AJAX — Manual Push
    // =========================================================================

    public function ajax_instant_index() {
        check_ajax_referer('cfrdm_instant_index', 'nonce');

        if (!current_user_can('edit_posts')) {
            wp_send_json_error('Permissão negada');
        }

        $post_id = intval($_POST['post_id'] ?? 0);
        if (!$post_id) {
            wp_send_json_error('Post ID inválido');
        }

        $url = get_permalink($post_id);
        $result = $this->submit_for_indexing($url, $post_id);

        if ($result) {
            wp_send_json_success(array(
                'message' => 'URL submetida para indexação!',
                'url' => $url,
                'quota' => $this->get_quota_info(),
            ));
        } else {
            wp_send_json_error('Falha ao submeter. Verifique a quota.');
        }
    }

    public function ajax_instant_index_current() {
        check_ajax_referer('cfrdm_instant_index', 'nonce');

        if (!current_user_can('edit_posts')) {
            wp_send_json_error('Permissão negada');
        }

        $url = sanitize_url($_POST['url'] ?? '');
        $post_id = url_to_postid($url);

        if (empty($url)) {
            wp_send_json_error('URL inválida');
        }

        $result = $this->submit_for_indexing($url, $post_id ?: null);

        wp_send_json_success(array(
            'message' => 'URL submetida!',
            'url' => $url,
            'quota' => $this->get_quota_info(),
        ));
    }

    // =========================================================================
    // AUTO-SUBMIT ON PUBLISH
    // =========================================================================

    public function on_post_transition($new_status, $old_status, $post) {
        // Only when transitioning TO publish
        if ($new_status !== 'publish' || $old_status === 'publish') {
            return;
        }

        if (wp_is_post_revision($post->ID) || wp_is_post_autosave($post->ID)) {
            return;
        }

        $allowed_types = array('post', 'page', 'product');
        if (!in_array($post->post_type, $allowed_types, true)) {
            return;
        }

        $url = get_permalink($post->ID);
        if (!$url) return;

        // Submit with a slight delay to ensure the page is live
        wp_schedule_single_event(time() + 30, 'cfrdm_delayed_index', array($post->ID));
    }

    // =========================================================================
    // CORE SUBMISSION — Unified indexing across all providers
    // =========================================================================

    /**
     * Submit URL for indexing across ALL available channels
     */
    public function submit_for_indexing($url, $post_id = null) {
        if (!$this->check_quota()) {
            CFRDM_Logger::warning('instant_indexing', 'Quota diária atingida', array('url' => $url));
            return false;
        }

        $submitted = false;
        $channels = array();

        // 1. IndexNow (Bing, Yandex, DuckDuckGo, Seznam)
        if (class_exists('CFRDM_IndexNow')) {
            try {
                $indexnow = CFRDM_IndexNow::get_instance();
                $result = $indexnow->submit_indexnow($url);
                if ($result) {
                    $channels[] = 'indexnow';
                    $submitted = true;
                    if ($post_id) {
                        update_post_meta($post_id, '_cfrdm_indexnow_submitted', current_time('mysql'));
                    }
                }
            } catch (\Throwable $e) {
                CFRDM_Logger::warning('instant_indexing', 'IndexNow falhou: ' . $e->getMessage());
            }
        }

        // 2. Google Indexing API (via GSC service account)
        if (class_exists('CFRDM_Google_Indexing_Submitter')) {
            try {
                $google = CFRDM_Google_Indexing_Submitter::get_instance();
                $result = $google->submit_url($url, 'URL_UPDATED');
                if ($result) {
                    $channels[] = 'google_api';
                    $submitted = true;
                }
            } catch (\Throwable $e) {
                CFRDM_Logger::warning('instant_indexing', 'Google API falhou: ' . $e->getMessage());
            }
        }

        // 3. Google Ping (sitemap notification)
        $sitemap_url = $this->detect_sitemap();
        if ($sitemap_url) {
            wp_remote_get('https://www.google.com/ping?sitemap=' . urlencode($sitemap_url), array(
                'timeout' => 5,
                'blocking' => false,
            ));
            $channels[] = 'google_ping';
            $submitted = true;
        }

        // 4. Bing Ping
        wp_remote_get('https://www.bing.com/ping?url=' . urlencode($url), array(
            'timeout' => 5,
            'blocking' => false,
        ));
        $channels[] = 'bing_ping';

        if ($submitted) {
            $this->increment_quota();

            if ($post_id) {
                update_post_meta($post_id, '_cfrdm_instant_indexed_at', current_time('mysql'));
                update_post_meta($post_id, '_cfrdm_instant_indexed_channels', implode(',', $channels));
            }

            CFRDM_Logger::success('instant_indexing', 'URL indexada via: ' . implode(', ', $channels), array(
                'url' => $url,
                'post_id' => $post_id,
                'channels' => $channels,
            ), $post_id);
        }

        return $submitted;
    }

    // =========================================================================
    // DASHBOARD WIDGET
    // =========================================================================

    public function add_dashboard_widget() {
        wp_add_dashboard_widget(
            'cfrdm_indexing_widget',
            '⚡ ContentFactory — Indexação Instantânea',
            array($this, 'render_dashboard_widget')
        );
    }

    public function render_dashboard_widget() {
        $quota = $this->get_quota_info();
        $pct = ($quota['used'] / max($quota['max'], 1)) * 100;
        $color = $pct > 80 ? '#dc3545' : ($pct > 50 ? '#ffc107' : '#28a745');

        // Recent submissions
        global $wpdb;
        $recent = $wpdb->get_results(
            "SELECT p.ID, p.post_title, pm.meta_value as indexed_at
             FROM {$wpdb->posts} p
             INNER JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_cfrdm_instant_indexed_at'
             ORDER BY pm.meta_value DESC
             LIMIT 5"
        );

        ?>
        <div class="cfrdm-idx-widget">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <div>
                    <strong style="font-size:24px;color:<?php echo $color; ?>"><?php echo $quota['remaining']; ?></strong>
                    <span style="color:#666;font-size:12px;"> / <?php echo $quota['max']; ?> restantes</span>
                </div>
                <div style="font-size:12px;color:#666;">
                    📅 <?php echo date_i18n('d/m/Y'); ?>
                </div>
            </div>
            <div style="background:#f0f0f0;border-radius:4px;height:8px;margin-bottom:16px;">
                <div style="background:<?php echo $color; ?>;width:<?php echo min($pct, 100); ?>%;height:100%;border-radius:4px;transition:width 0.3s;"></div>
            </div>
            <?php if (!empty($recent)): ?>
            <p style="margin:0 0 6px;font-weight:600;font-size:12px;">Últimas indexações:</p>
            <ul style="margin:0;padding:0;list-style:none;">
                <?php foreach ($recent as $r): ?>
                <li style="padding:3px 0;font-size:11px;border-bottom:1px solid #f0f0f0;">
                    ✅ <a href="<?php echo get_edit_post_link($r->ID); ?>"><?php echo esc_html(wp_trim_words($r->post_title, 6)); ?></a>
                    <span style="float:right;color:#999;"><?php echo human_time_diff(strtotime($r->indexed_at), current_time('timestamp')); ?></span>
                </li>
                <?php endforeach; ?>
            </ul>
            <?php else: ?>
            <p style="color:#999;font-size:12px;">Nenhuma URL indexada hoje.</p>
            <?php endif; ?>
        </div>
        <?php
    }

    // =========================================================================
    // ADMIN SCRIPTS & STYLES
    // =========================================================================

    public function enqueue_admin_scripts($hook) {
        wp_enqueue_script(
            'cfrdm-instant-indexing',
            '',
            array('jquery'),
            CFRDM_VERSION,
            true
        );

        // Inline script
        $script = "
        jQuery(document).ready(function($) {
            // Manual push from posts list
            $(document).on('click', '.cfrdm-idx-push', function(e) {
                e.preventDefault();
                var btn = $(this);
                var postId = btn.data('post-id');
                btn.html('<span class=\"spinner is-active\" style=\"float:none;margin:0;\"></span>');
                $.post(ajaxurl, {
                    action: 'cfrdm_instant_index',
                    post_id: postId,
                    nonce: '" . wp_create_nonce('cfrdm_instant_index') . "'
                }, function(res) {
                    if (res.success) {
                        btn.replaceWith('<span class=\"cfrdm-idx-status cfrdm-idx-ok\" title=\"Indexado agora!\">✅</span><br><small style=\"color:#666;font-size:10px;\">agora</small>');
                    } else {
                        btn.html('<span class=\"cfrdm-idx-status cfrdm-idx-error\" title=\"Erro\">❌</span>');
                    }
                });
            });
        });

        // Admin bar — index current page
        function cfrdmInstantIndexCurrent() {
            var url = window.location.href.split('?')[0];
            if (url.indexOf('/wp-admin/') > -1) {
                alert('Navegue para uma página do site para indexá-la.');
                return;
            }
            jQuery.post('" . admin_url('admin-ajax.php') . "', {
                action: 'cfrdm_instant_index_current',
                url: url,
                nonce: '" . wp_create_nonce('cfrdm_instant_index') . "'
            }, function(res) {
                if (res.success) {
                    alert('✅ ' + res.data.message);
                    // Update quota badge
                    jQuery('.cfrdm-quota-badge').text(res.data.quota.remaining);
                } else {
                    alert('❌ Falha ao indexar.');
                }
            });
        }
        window.cfrdmInstantIndexCurrent = cfrdmInstantIndexCurrent;
        ";

        wp_add_inline_script('jquery', $script);
    }

    public function admin_bar_inline_css() {
        ?>
        <style>
        .cfrdm-quota-badge {
            background: #2271b1;
            color: #fff;
            padding: 1px 6px;
            border-radius: 10px;
            font-size: 11px;
            margin-left: 4px;
            font-weight: 600;
        }
        .cfrdm-idx-status { cursor: default; font-size: 14px; }
        .cfrdm-idx-push { text-decoration: none; }
        .cfrdm-idx-push:hover .cfrdm-idx-pending { opacity: 0.7; }
        #wp-admin-bar-cfrdm-instant-indexing .ab-icon { top: 2px; }
        th.column-cfrdm_indexing, td.column-cfrdm_indexing { width: 50px; text-align: center; }
        </style>
        <?php
    }

    // =========================================================================
    // REST API
    // =========================================================================

    public function register_routes() {
        register_rest_route('cfrdm/v1', '/instant-indexing/submit', array(
            'methods' => 'POST',
            'callback' => array($this, 'rest_submit'),
            'permission_callback' => array('CFRDM_API', 'verify_api_key'),
        ));

        register_rest_route('cfrdm/v1', '/instant-indexing/batch', array(
            'methods' => 'POST',
            'callback' => array($this, 'rest_batch'),
            'permission_callback' => array('CFRDM_API', 'verify_api_key'),
        ));

        register_rest_route('cfrdm/v1', '/instant-indexing/status', array(
            'methods' => 'GET',
            'callback' => array($this, 'rest_status'),
            'permission_callback' => array('CFRDM_API', 'verify_api_key'),
        ));
    }

    public function rest_submit($request) {
        $url = sanitize_url($request->get_param('url'));
        $post_id = intval($request->get_param('post_id'));

        if (empty($url) && $post_id) {
            $url = get_permalink($post_id);
        }

        if (empty($url)) {
            return new WP_REST_Response(array('success' => false, 'error' => 'URL obrigatória'), 400);
        }

        $result = $this->submit_for_indexing($url, $post_id ?: null);

        return new WP_REST_Response(array(
            'success' => $result,
            'url' => $url,
            'quota' => $this->get_quota_info(),
        ));
    }

    public function rest_batch($request) {
        $urls = $request->get_param('urls');
        $post_ids = $request->get_param('post_ids');

        // If post_ids provided, resolve to URLs
        if (!empty($post_ids) && is_array($post_ids)) {
            $urls = array();
            foreach ($post_ids as $pid) {
                $u = get_permalink(intval($pid));
                if ($u) $urls[] = $u;
            }
        }

        // If no URLs, collect recent
        if (empty($urls)) {
            $recent = get_posts(array(
                'post_type' => array('post', 'page'),
                'post_status' => 'publish',
                'numberposts' => 50,
                'orderby' => 'modified',
                'order' => 'DESC',
                'fields' => 'ids',
            ));
            $urls = array_map('get_permalink', $recent);
        }

        $results = array('submitted' => 0, 'failed' => 0, 'quota_exceeded' => 0);

        foreach ($urls as $url) {
            if (!$this->check_quota()) {
                $results['quota_exceeded']++;
                continue;
            }
            $pid = url_to_postid($url);
            if ($this->submit_for_indexing($url, $pid ?: null)) {
                $results['submitted']++;
            } else {
                $results['failed']++;
            }
            usleep(100000);
        }

        return new WP_REST_Response(array(
            'success' => true,
            'results' => $results,
            'quota' => $this->get_quota_info(),
        ));
    }

    public function rest_status($request) {
        global $wpdb;

        $quota = $this->get_quota_info();

        $recent = $wpdb->get_results(
            "SELECT p.ID, p.post_title, p.post_type,
                    pm.meta_value as indexed_at,
                    pm2.meta_value as channels
             FROM {$wpdb->posts} p
             INNER JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_cfrdm_instant_indexed_at'
             LEFT JOIN {$wpdb->postmeta} pm2 ON p.ID = pm2.post_id AND pm2.meta_key = '_cfrdm_instant_indexed_channels'
             ORDER BY pm.meta_value DESC
             LIMIT 100"
        );

        $submissions = array();
        foreach ($recent as $r) {
            $submissions[] = array(
                'post_id' => $r->ID,
                'title' => $r->post_title,
                'type' => $r->post_type,
                'url' => get_permalink($r->ID),
                'indexed_at' => $r->indexed_at,
                'channels' => $r->channels ? explode(',', $r->channels) : array(),
            );
        }

        // Count never-indexed published posts
        $total_published = wp_count_posts('post')->publish + wp_count_posts('page')->publish;
        $indexed_count = $wpdb->get_var(
            "SELECT COUNT(DISTINCT post_id) FROM {$wpdb->postmeta} WHERE meta_key = '_cfrdm_instant_indexed_at'"
        );

        return new WP_REST_Response(array(
            'success' => true,
            'quota' => $quota,
            'stats' => array(
                'total_published' => $total_published,
                'total_indexed' => intval($indexed_count),
                'never_indexed' => max(0, $total_published - intval($indexed_count)),
                'coverage_pct' => $total_published > 0 ? round(($indexed_count / $total_published) * 100, 1) : 0,
            ),
            'recent_submissions' => $submissions,
        ));
    }

    // =========================================================================
    // QUOTA MANAGEMENT
    // =========================================================================

    public function get_quota_info() {
        $today = date('Y-m-d');
        $quota_date = get_option(self::OPTION_QUOTA_DATE, '');

        if ($quota_date !== $today) {
            update_option(self::OPTION_DAILY_QUOTA, 0);
            update_option(self::OPTION_QUOTA_DATE, $today);
            $used = 0;
        } else {
            $used = (int) get_option(self::OPTION_DAILY_QUOTA, 0);
        }

        return array(
            'used' => $used,
            'max' => self::MAX_DAILY_QUOTA,
            'remaining' => max(0, self::MAX_DAILY_QUOTA - $used),
            'date' => $today,
        );
    }

    private function check_quota() {
        $info = $this->get_quota_info();
        return $info['remaining'] > 0;
    }

    private function increment_quota() {
        $count = (int) get_option(self::OPTION_DAILY_QUOTA, 0);
        update_option(self::OPTION_DAILY_QUOTA, $count + 1);
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    private function detect_sitemap() {
        $cached = get_transient('cfrdm_sitemap_url');
        if ($cached) return $cached;

        $candidates = array(
            get_site_url() . '/sitemap_index.xml',
            get_site_url() . '/sitemap.xml',
            get_site_url() . '/wp-sitemap.xml',
        );

        foreach ($candidates as $url) {
            $r = wp_remote_head($url, array('timeout' => 3));
            if (!is_wp_error($r) && wp_remote_retrieve_response_code($r) === 200) {
                set_transient('cfrdm_sitemap_url', $url, HOUR_IN_SECONDS);
                return $url;
            }
        }

        $fallback = get_site_url() . '/wp-sitemap.xml';
        set_transient('cfrdm_sitemap_url', $fallback, HOUR_IN_SECONDS);
        return $fallback;
    }
}

// Register delayed index hook
add_action('cfrdm_delayed_index', function($post_id) {
    if (!class_exists('CFRDM_Instant_Indexing')) return;
    $url = get_permalink($post_id);
    if ($url) {
        CFRDM_Instant_Indexing::get_instance()->submit_for_indexing($url, $post_id);
    }
});
