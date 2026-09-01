<?php
/**
 * Plugin Name: Zica Electoral Analytics
 * Description: Telemetria editorial agregada para os portais eleitorais 1470, com configuração central no Zica.ai.
 * Version: 1.1.0
 * Author: Zica.ai
 */

if (!defined('ABSPATH')) {
    exit;
}

final class Zica_Electoral_Analytics {
    private const VERSION = '1.1.0';
    private const CENTRAL_CONFIG_URL = 'https://ubahrbgaxrkjxklytobl.supabase.co/functions/v1/electoral-analytics-public-config';
    private const TRANSIENT_PREFIX = 'zica_electoral_analytics_';

    public static function init(): void {
        add_action('rest_api_init', [self::class, 'register_rest_routes']);
        add_action('wp_enqueue_scripts', [self::class, 'enqueue_frontend']);
        add_action('wp_head', [self::class, 'render_google_loader'], 2);
    }

    private static function defaults(): array {
        return [
            'enabled' => false,
            'portal_id' => '',
            'ga4_measurement_id' => '',
            'gtm_web_container_id' => '',
            'gtm_server_container_url' => '',
            'disable_after' => '2026-10-05T00:00:00-03:00',
            'primary_portals' => [
                'https://quemvotar.drmadeira1470.com.br/blog/',
                'https://votardeputadofederal.drmadeira1470.com.br/blog/',
            ],
            'geo_reporting_level' => 'city',
            'allow_google_signals' => false,
            'allow_ad_personalization_signals' => false,
            'consent_mode_default' => 'denied',
            'central_config_reachable' => false,
        ];
    }

    private static function portal_host(): string {
        $host = (string) wp_parse_url(home_url('/'), PHP_URL_HOST);
        $host = strtolower(preg_replace('/^www\./i', '', $host));
        return sanitize_text_field($host);
    }

    private static function transient_key(): string {
        return self::TRANSIENT_PREFIX . md5(self::portal_host());
    }

    private static function sanitize_remote(array $remote): array {
        $config = self::defaults();
        $config['enabled'] = !empty($remote['enabled']);
        $config['portal_id'] = sanitize_key((string) ($remote['portal_id'] ?? ''));

        $ga4 = (string) ($remote['ga4_measurement_id'] ?? '');
        $gtm = (string) ($remote['gtm_web_container_id'] ?? '');
        $config['ga4_measurement_id'] = preg_match('/^G-[A-Z0-9]+$/', $ga4) ? sanitize_text_field($ga4) : '';
        $config['gtm_web_container_id'] = preg_match('/^GTM-[A-Z0-9]+$/', $gtm) ? sanitize_text_field($gtm) : '';
        $config['gtm_server_container_url'] = esc_url_raw((string) ($remote['gtm_server_container_url'] ?? ''));
        $config['disable_after'] = sanitize_text_field((string) ($remote['disable_after'] ?? $config['disable_after']));
        $config['geo_reporting_level'] = (($remote['geo_reporting_level'] ?? 'city') === 'state') ? 'state' : 'city';

        $portals = is_array($remote['primary_portals'] ?? null) ? $remote['primary_portals'] : [];
        $config['primary_portals'] = array_values(array_filter(array_map('esc_url_raw', $portals)));

        $config['allow_google_signals'] = false;
        $config['allow_ad_personalization_signals'] = false;
        $config['consent_mode_default'] = 'denied';
        $config['central_config_reachable'] = true;
        return $config;
    }

    private static function config(bool $refresh = false): array {
        $key = self::transient_key();
        if ($refresh) delete_transient($key);

        $cached = get_transient($key);
        if (is_array($cached)) return wp_parse_args($cached, self::defaults());

        $host = self::portal_host();
        if ($host === '') return self::defaults();

        $url = add_query_arg(['portal' => $host], self::CENTRAL_CONFIG_URL);
        $response = wp_remote_get($url, [
            'timeout' => 4,
            'redirection' => 2,
            'headers' => [
                'Accept' => 'application/json',
                'User-Agent' => 'Zica-Electoral-Analytics/' . self::VERSION,
            ],
        ]);

        if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
            $closed = self::defaults();
            set_transient($key, $closed, MINUTE_IN_SECONDS);
            return $closed;
        }

        $payload = json_decode((string) wp_remote_retrieve_body($response), true);
        if (!is_array($payload) || empty($payload['ok'])) {
            $closed = self::defaults();
            set_transient($key, $closed, MINUTE_IN_SECONDS);
            return $closed;
        }

        $config = self::sanitize_remote($payload);
        set_transient($key, $config, 5 * MINUTE_IN_SECONDS);
        return $config;
    }

    private static function active(array $config): bool {
        if (empty($config['enabled']) || empty($config['central_config_reachable'])) return false;
        $disable_after = isset($config['disable_after']) ? strtotime((string) $config['disable_after']) : false;
        return !($disable_after && time() >= $disable_after);
    }

    public static function register_rest_routes(): void {
        register_rest_route('zica/v1', '/electoral-analytics/config', [
            'methods' => 'GET',
            'callback' => [self::class, 'rest_get_config'],
            'permission_callback' => static function (): bool { return current_user_can('manage_options'); },
        ]);
    }

    public static function rest_get_config(WP_REST_Request $request): WP_REST_Response {
        $refresh = $request->get_param('refresh') === '1';
        $config = self::config($refresh);
        return new WP_REST_Response([
            'ok' => true,
            'source' => 'zica-ai-central-config',
            'portal_host' => self::portal_host(),
            'config' => $config,
            'effective_enabled' => self::active($config),
        ], 200);
    }

    public static function render_google_loader(): void {
        $config = self::config();
        if (!self::active($config)) return;

        $gtm = (string) ($config['gtm_web_container_id'] ?? '');
        $ga4 = (string) ($config['ga4_measurement_id'] ?? '');
        $server = rtrim((string) ($config['gtm_server_container_url'] ?? ''), '/');

        echo "<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});window.dataLayer.push({zica_google_signals:false,zica_ad_personalization:false,zica_gtm_server_url:" . wp_json_encode($server) . "});</script>\n";

        if ($gtm !== '') {
            printf(
                "<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','%s');</script>\n",
                esc_js($gtm)
            );
        } elseif ($ga4 !== '') {
            printf("<script async src=\"https://www.googletagmanager.com/gtag/js?id=%s\"></script>\n", esc_attr($ga4));
            echo "<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());";
            $params = [
                'allow_google_signals' => false,
                'allow_ad_personalization_signals' => false,
                'send_page_view' => true,
            ];
            if ($server !== '') $params['transport_url'] = $server;
            printf("gtag('config','%s',%s);</script>\n", esc_js($ga4), wp_json_encode($params));
        }
    }

    public static function enqueue_frontend(): void {
        $config = self::config();
        if (!self::active($config)) return;

        wp_enqueue_script(
            'zica-electoral-analytics',
            plugins_url('assets/zica-electoral-analytics.js', __FILE__),
            [],
            self::VERSION,
            true
        );

        $canonical = wp_get_canonical_url();
        $post_id = is_singular() ? get_queried_object_id() : 0;
        $post_type = $post_id ? get_post_type($post_id) : '';

        wp_localize_script('zica-electoral-analytics', 'ZicaElectoralAnalytics', [
            'enabled' => true,
            'portalId' => sanitize_key((string) ($config['portal_id'] ?? '')),
            'disableAfter' => sanitize_text_field((string) ($config['disable_after'] ?? '')),
            'primaryPortals' => array_values((array) ($config['primary_portals'] ?? [])),
            'geoReportingLevel' => ($config['geo_reporting_level'] ?? 'city') === 'state' ? 'state' : 'city',
            'page' => [
                'postId' => $post_id,
                'postType' => sanitize_key((string) $post_type),
                'canonicalUrl' => esc_url_raw($canonical ?: home_url(add_query_arg([], $GLOBALS['wp']->request ?? ''))),
                'title' => wp_strip_all_tags(wp_get_document_title()),
            ],
            'privacy' => [
                'individualVoterProfiles' => false,
                'politicalPreferenceInference' => false,
                'preciseLocationCollection' => false,
                'rawIpStorage' => false,
                'adPersonalization' => false,
                'googleSignals' => false,
            ],
        ]);
    }
}

Zica_Electoral_Analytics::init();
