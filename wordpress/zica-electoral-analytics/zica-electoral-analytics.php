<?php
/**
 * Plugin Name: Zica Electoral Analytics
 * Description: Telemetria editorial agregada para os portais eleitorais 1470. Nao cria perfis individuais de eleitor e nao infere preferencia politica.
 * Version: 1.0.0
 * Author: Zica.ai
 */

if (!defined('ABSPATH')) {
    exit;
}

final class Zica_Electoral_Analytics {
    private const OPTION = 'zica_electoral_analytics_config';
    private const VERSION = '1.0.0';

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
            'allow_google_signals' => false,
            'allow_ad_personalization_signals' => false,
            'consent_mode_default' => 'denied',
        ];
    }

    private static function config(): array {
        $stored = get_option(self::OPTION, []);
        return wp_parse_args(is_array($stored) ? $stored : [], self::defaults());
    }

    private static function active(array $config): bool {
        if (empty($config['enabled'])) {
            return false;
        }
        $disable_after = isset($config['disable_after']) ? strtotime((string) $config['disable_after']) : false;
        if ($disable_after && time() >= $disable_after) {
            return false;
        }
        return true;
    }

    public static function register_rest_routes(): void {
        register_rest_route('zica/v1', '/electoral-analytics/config', [
            [
                'methods' => 'GET',
                'callback' => [self::class, 'rest_get_config'],
                'permission_callback' => static function (): bool {
                    return current_user_can('manage_options');
                },
            ],
            [
                'methods' => ['POST', 'PUT', 'PATCH'],
                'callback' => [self::class, 'rest_save_config'],
                'permission_callback' => static function (): bool {
                    return current_user_can('manage_options');
                },
            ],
        ]);
    }

    public static function rest_get_config(): WP_REST_Response {
        $config = self::config();
        return new WP_REST_Response([
            'ok' => true,
            'config' => $config,
            'effective_enabled' => self::active($config),
        ], 200);
    }

    public static function rest_save_config(WP_REST_Request $request): WP_REST_Response {
        $payload = $request->get_json_params();
        $current = self::config();
        $next = array_merge($current, is_array($payload) ? $payload : []);

        $next['enabled'] = !empty($next['enabled']);
        $next['portal_id'] = sanitize_key((string) ($next['portal_id'] ?? ''));
        $next['ga4_measurement_id'] = preg_match('/^G-[A-Z0-9]+$/', (string) ($next['ga4_measurement_id'] ?? '')) ? sanitize_text_field((string) $next['ga4_measurement_id']) : '';
        $next['gtm_web_container_id'] = preg_match('/^GTM-[A-Z0-9]+$/', (string) ($next['gtm_web_container_id'] ?? '')) ? sanitize_text_field((string) $next['gtm_web_container_id']) : '';
        $next['gtm_server_container_url'] = esc_url_raw((string) ($next['gtm_server_container_url'] ?? ''));
        $next['disable_after'] = sanitize_text_field((string) ($next['disable_after'] ?? ''));
        $next['allow_google_signals'] = false;
        $next['allow_ad_personalization_signals'] = false;
        $next['consent_mode_default'] = 'denied';

        $portals = is_array($next['primary_portals'] ?? null) ? $next['primary_portals'] : [];
        $next['primary_portals'] = array_values(array_filter(array_map('esc_url_raw', $portals)));

        update_option(self::OPTION, $next, false);

        return new WP_REST_Response([
            'ok' => true,
            'config' => $next,
            'effective_enabled' => self::active($next),
        ], 200);
    }

    public static function render_google_loader(): void {
        $config = self::config();
        if (!self::active($config)) {
            return;
        }

        $gtm = (string) ($config['gtm_web_container_id'] ?? '');
        $ga4 = (string) ($config['ga4_measurement_id'] ?? '');
        $server = rtrim((string) ($config['gtm_server_container_url'] ?? ''), '/');

        echo "<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});</script>\n";

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
            ],
        ]);
    }
}

Zica_Electoral_Analytics::init();
