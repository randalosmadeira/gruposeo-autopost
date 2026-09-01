<?php
/**
 * Zica Posts 3.10.1 security helpers: HMAC, replay protection and idempotency.
 */
if (!defined('ABSPATH')) exit;

final class Zica_Posts_Security {
    const OPTION_HUB_SECRET = 'zica_posts_hub_secret';
    const NONCE_PREFIX = 'zica_posts_nonce_';
    const WINDOW_SECONDS = 300;

    public static function ensure_secret() {
        if (!get_option(self::OPTION_HUB_SECRET)) {
            try {
                update_option(self::OPTION_HUB_SECRET, bin2hex(random_bytes(32)), false);
            } catch (Throwable $e) {
                update_option(self::OPTION_HUB_SECRET, wp_generate_password(64, true, true), false);
            }
        }
    }

    public static function get_secret() {
        self::ensure_secret();
        return (string) get_option(self::OPTION_HUB_SECRET, '');
    }

    public static function verify_hmac(WP_REST_Request $request) {
        $timestamp = trim((string) $request->get_header('X-Zica-Timestamp'));
        $nonce = trim((string) $request->get_header('X-Zica-Nonce'));
        $signature = strtolower(trim((string) $request->get_header('X-Zica-Signature')));
        if (!$timestamp || !$nonce || !$signature || !ctype_digit($timestamp)) {
            return new WP_Error('zica_hmac_missing', 'Assinatura HMAC incompleta.', array('status' => 401));
        }
        if (abs(time() - (int) $timestamp) > self::WINDOW_SECONDS) {
            return new WP_Error('zica_hmac_expired', 'Assinatura fora da janela de tempo.', array('status' => 401));
        }
        if (!preg_match('/^[A-Za-z0-9._:-]{12,128}$/', $nonce)) {
            return new WP_Error('zica_nonce_invalid', 'Nonce inválido.', array('status' => 401));
        }
        $nonce_key = self::NONCE_PREFIX . hash('sha256', $nonce);
        if (get_transient($nonce_key)) {
            return new WP_Error('zica_replay', 'Nonce já utilizado.', array('status' => 409));
        }
        $body = (string) $request->get_body();
        $body_hash = hash('sha256', $body);
        $expected = hash_hmac('sha256', $timestamp . "\n" . $nonce . "\n" . $body_hash, self::get_secret());
        if (!hash_equals($expected, $signature)) {
            return new WP_Error('zica_hmac_invalid', 'Assinatura HMAC inválida.', array('status' => 401));
        }
        set_transient($nonce_key, '1', self::WINDOW_SECONDS * 2);
        return true;
    }

    public static function content_hash($payload) {
        return hash('sha256', wp_json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    }

    public static function correlation_id(WP_REST_Request $request) {
        $cid = sanitize_text_field((string) $request->get_header('X-Zica-Correlation-ID'));
        return $cid ?: wp_generate_uuid4();
    }
}
