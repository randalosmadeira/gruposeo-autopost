<?php
if (!defined('ABSPATH')) exit;

final class Zica_Posts_Auth {
    public function ensure_secrets() {
        if (!get_option('zica_posts_api_key')) update_option('zica_posts_api_key', wp_generate_uuid4(), false);
        if (!get_option('zica_posts_hub_secret')) update_option('zica_posts_hub_secret', $this->random_secret(64), false);
        if (!get_option('zica_posts_indexnow_key')) update_option('zica_posts_indexnow_key', $this->random_secret(32), false);
    }
    private function random_secret($bytes) { try { return bin2hex(random_bytes((int) ceil($bytes / 2))); } catch (Throwable $e) { return wp_generate_password($bytes, false, false); } }
    public function rotate_hub_secret() { $secret = $this->random_secret(64); update_option('zica_posts_hub_secret', $secret, false); return $secret; }
    public function api_key_from_request($request) {
        $candidates = array($request->get_header('X-ZICA-POSTS-Key'), $request->get_header('X-ZICA-AI-API-Key'), $request->get_header('X-CFRDM-API-Key'), $request->get_param('api_key'));
        $authorization = $request->get_header('Authorization'); if ($authorization && 0 === stripos($authorization, 'Bearer ')) $candidates[] = trim(substr($authorization, 7));
        foreach ($candidates as $candidate) if (is_string($candidate) && '' !== trim($candidate)) return trim($candidate); return '';
    }
    public function verify_api_key($request) { $stored=(string)get_option('zica_posts_api_key',''); $provided=$this->api_key_from_request($request); return (!$stored||!$provided||!hash_equals($stored,$provided)) ? new WP_Error('zica_posts_unauthorized',__('API Key inválida ou ausente.','zica-posts'),array('status'=>401)) : true; }
    public function sign_body($body,$nonce,$timestamp) { return hash_hmac('sha256',$timestamp."\n".$nonce."\n".hash('sha256',$body),(string)get_option('zica_posts_hub_secret','')); }
    public function verify_hmac($request) {
        $timestamp=trim((string)$request->get_header('X-Zica-Timestamp')); $nonce=trim((string)$request->get_header('X-Zica-Nonce')); $signature=strtolower(trim((string)$request->get_header('X-Zica-Signature')));
        if(!$timestamp||!ctype_digit($timestamp)||!$nonce||!$signature)return new WP_Error('zica_hmac_missing','Assinatura HMAC incompleta.',array('status'=>401));
        if(abs(time()-(int)$timestamp)>300)return new WP_Error('zica_hmac_expired','Assinatura fora da janela de tempo.',array('status'=>401));
        if(!preg_match('/^[A-Za-z0-9._:-]{12,128}$/',$nonce))return new WP_Error('zica_nonce_invalid','Nonce inválido.',array('status'=>401));
        $nonce_key='zica_posts_nonce_'.hash('sha256',$nonce); if(get_transient($nonce_key))return new WP_Error('zica_replay','Nonce já utilizado.',array('status'=>409));
        $expected=$this->sign_body((string)$request->get_body(),$nonce,$timestamp); if(!$expected||!hash_equals($expected,$signature))return new WP_Error('zica_hmac_invalid','Assinatura HMAC inválida.',array('status'=>401)); set_transient($nonce_key,'1',600); return true;
    }
    public function hub_url_is_safe($url) {
        if(!$url)return false; $parsed=wp_parse_url($url); if(!is_array($parsed)||empty($parsed['scheme'])||empty($parsed['host'])||'https'!==strtolower($parsed['scheme']))return false;
        $host=strtolower(trim($parsed['host'],'[]')); if('localhost'===$host||'::1'===$host||preg_match('/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/',$host)||preg_match('/^172\.(1[6-9]|2[0-9]|3[01])\./',$host))return false;
        if(substr($host,-6)==='.local'||substr($host,-9)==='.internal')return false; return true;
    }
}
