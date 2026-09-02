<?php
/**
 * Plugin Name: Zica Electoral Analytics
 * Description: Telemetria editorial agregada e cadastro voluntario consentido para os portais eleitorais 1470, com configuracao central no Zica.ai.
 * Version: 1.2.1
 * Author: Zica.ai
 */

if (!defined('ABSPATH')) {
    exit;
}

final class Zica_Electoral_Analytics {
    private const VERSION = '1.2.1';
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
            'analytics_enabled' => false,
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
            'optin_enabled' => false,
            'optin_api_url' => '',
            'optin_scroll_trigger_percent' => 10,
            'optin_exit_intent_enabled' => true,
            'optin_dismiss_hours' => 24,
            'optin_success_suppress_days' => 90,
            'optin_privacy_url' => '',
            'optin_title' => 'Quero ajudar na campanha',
            'optin_subtitle' => 'Deixe seu contato e diga como quer ajudar.',
            'optin_button_label' => '🪵 MADEIRAAA NELESS',
            'optin_instagram_enabled' => true,
            'optin_instagram_url' => 'https://www.instagram.com/rdmadvogados/',
            'optin_instagram_label' => 'Seguir @rdmadvogados no Instagram',
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
        $config['analytics_enabled'] = !empty($remote['analytics_enabled']);
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

        $optin = is_array($remote['optin'] ?? null) ? $remote['optin'] : [];
        $config['optin_enabled'] = !empty($optin['enabled']);
        $config['optin_api_url'] = esc_url_raw((string) ($optin['api_url'] ?? ''));
        $config['optin_scroll_trigger_percent'] = max(1, min(90, absint($optin['scroll_trigger_percent'] ?? 10)));
        $config['optin_exit_intent_enabled'] = !empty($optin['exit_intent_enabled']);
        $config['optin_dismiss_hours'] = max(1, min(720, absint($optin['dismiss_hours'] ?? 24)));
        $config['optin_success_suppress_days'] = max(1, min(365, absint($optin['success_suppress_days'] ?? 90)));
        $config['optin_privacy_url'] = esc_url_raw((string) ($optin['privacy_url'] ?? ''));
        $config['optin_title'] = sanitize_text_field((string) ($optin['title'] ?? $config['optin_title']));
        $config['optin_subtitle'] = sanitize_text_field((string) ($optin['subtitle'] ?? $config['optin_subtitle']));
        $config['optin_button_label'] = sanitize_text_field((string) ($optin['button_label'] ?? $config['optin_button_label']));
        $config['optin_instagram_enabled'] = !empty($optin['instagram_enabled']);
        $config['optin_instagram_url'] = esc_url_raw((string) ($optin['instagram_url'] ?? $config['optin_instagram_url']));
        $config['optin_instagram_label'] = sanitize_text_field((string) ($optin['instagram_label'] ?? $config['optin_instagram_label']));

        // Estes controles permanecem desligados no runtime dos portais.
        $config['allow_google_signals'] = false;
        $config['allow_ad_personalization_signals'] = false;
        $config['consent_mode_default'] = 'denied';
        $config['central_config_reachable'] = true;
        return $config;
    }

    private static function config(bool $refresh = false): array {
        $key = self::transient_key();
        if ($refresh) {
            delete_transient($key);
        }

        $cached = get_transient($key);
        if (is_array($cached)) {
            return wp_parse_args($cached, self::defaults());
        }

        $host = self::portal_host();
        if ($host === '') {
            return self::defaults();
        }

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
        if (empty($config['enabled']) || empty($config['central_config_reachable'])) {
            return false;
        }
        $disable_after = isset($config['disable_after']) ? strtotime((string) $config['disable_after']) : false;
        return !($disable_after && time() >= $disable_after);
    }

    public static function register_rest_routes(): void {
        register_rest_route('zica/v1', '/electoral-analytics/config', [
            'methods' => 'GET',
            'callback' => [self::class, 'rest_get_config'],
            'permission_callback' => static function (): bool {
                return current_user_can('manage_options');
            },
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
        if (!self::active($config) || empty($config['analytics_enabled'])) {
            return;
        }

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
            if ($server !== '') {
                $params['transport_url'] = $server;
            }
            printf("gtag('config','%s',%s);</script>\n", esc_js($ga4), wp_json_encode($params));
        }
    }

    public static function enqueue_frontend(): void {
        $config = self::config();
        if (!self::active($config)) {
            return;
        }

        if (!empty($config['analytics_enabled'])) {
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

        if (!empty($config['optin_enabled']) && !empty($config['optin_api_url'])) {
            wp_enqueue_style(
                'zica-electoral-optin',
                plugins_url('assets/zica-electoral-optin.css', __FILE__),
                [],
                self::VERSION
            );
            wp_enqueue_script(
                'zica-electoral-optin',
                plugins_url('assets/zica-electoral-optin.js', __FILE__),
                [],
                self::VERSION,
                true
            );
            wp_localize_script('zica-electoral-optin', 'ZicaElectoralOptin', [
                'enabled' => true,
                'apiUrl' => esc_url_raw((string) $config['optin_api_url']),
                'portalId' => sanitize_key((string) ($config['portal_id'] ?? '')),
                'sourcePortal' => self::portal_host(),
                'disableAfter' => sanitize_text_field((string) ($config['disable_after'] ?? '')),
                'scrollTriggerPercent' => max(1, min(90, absint($config['optin_scroll_trigger_percent'] ?? 10))),
                'exitIntentEnabled' => !empty($config['optin_exit_intent_enabled']),
                'dismissHours' => max(1, absint($config['optin_dismiss_hours'] ?? 24)),
                'successSuppressDays' => max(1, absint($config['optin_success_suppress_days'] ?? 90)),
                'privacyUrl' => esc_url_raw((string) ($config['optin_privacy_url'] ?? '')),
                'title' => sanitize_text_field((string) ($config['optin_title'] ?? 'Quero ajudar na campanha')),
                'subtitle' => sanitize_text_field((string) ($config['optin_subtitle'] ?? 'Deixe seu contato e diga como quer ajudar.')),
                'buttonLabel' => sanitize_text_field((string) ($config['optin_button_label'] ?? '🪵 MADEIRAAA NELESS')),
                'instagramEnabled' => !empty($config['optin_instagram_enabled']),
                'instagramUrl' => esc_url_raw((string) ($config['optin_instagram_url'] ?? '')),
                'instagramLabel' => sanitize_text_field((string) ($config['optin_instagram_label'] ?? 'Seguir @rdmadvogados no Instagram')),
                'privacy' => [
                    'browsingHistoryLinkedToContact' => false,
                    'personalizedPoliticalTargeting' => false,
                ],
            ]);
        }
    }
}

Zica_Electoral_Analytics::init();
