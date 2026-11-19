<?php
if (!defined('ABSPATH')) exit;

/**
 * Sinais de IA: detecta robos de IA (UA) e visitas vindas de IA/busca (referrer),
 * agrega em um buffer limitado e envia lotes assinados (HMAC) ao hub Zica.ai.
 *
 * Privacidade: nunca grava IP, User-Agent completo, cookies ou usuario logado.
 * Guarda apenas contagens por dia|tipo|agente|caminho (sem query string).
 *
 * Limite conhecido: se a pagina for servida por cache de pagina/CDN, o PHP nao executa
 * e o acesso nao e visto aqui. Nesse caso use o Worker/middleware/shipper de integrations/zica-signals.
 */
final class Zica_Posts_Signals {
    const OPT_ENABLED = 'zica_posts_signals_enabled';
    const OPT_SITE_ID = 'zica_posts_signals_site_id';
    const OPT_SECRET = 'zica_posts_signals_secret';
    const OPT_ENDPOINT = 'zica_posts_signals_endpoint';
    const OPT_BUFFER = 'zica_posts_signals_buffer';
    const OPT_LAST_FLUSH = 'zica_posts_signals_last_flush';
    const OPT_LAST_ERROR = 'zica_posts_signals_last_error';
    const OPT_DROPPED = 'zica_posts_signals_dropped';
    const BUFFER_MAX_KEYS = 2000;
    const BATCH_MAX_EVENTS = 500;
    const SCRIPT_HANDLE = 'zica-signals';

    /* BEGIN signals-catalog (gerado de signals-catalog.json - nao editar a mao) */
const CATALOG_JSON = '{"b":["meta-externalagent","Applebot-Extended","Claude-SearchBot","Perplexity-User","Google-Extended","Googlebot-Image","Googlebot-Video","OAI-SearchBot","PerplexityBot","DuckAssistBot","ChatGPT-User","anthropic-ai","Claude-User","Bytespider","ClaudeBot","Googlebot","cohere-ai","Amazonbot","Applebot","Bingbot","GPTBot","CCBot"],"a":[["chatgpt.com",["chatgpt.com","chat.openai.com","openai.com"]],["perplexity.ai",["perplexity.ai"]],["gemini.google.com",["gemini.google.com","bard.google.com"]],["copilot.microsoft.com",["copilot.microsoft.com"]],["claude.ai",["claude.ai"]],["you.com",["you.com"]],["poe.com",["poe.com"]],["meta.ai",["meta.ai"]],["grok.com",["grok.com","x.ai"]]],"c":[["duckduckgo.com","duckduckgo.com",{"ia":"chat"},null],["bing.com","copilot.microsoft.com",null,["/chat","/copilot"]]],"u":{"chatgpt.com":"chatgpt.com","perplexity":"perplexity.ai","gemini":"gemini.google.com","copilot":"copilot.microsoft.com","claude":"claude.ai"},"s":[["google","(^|\\\\.)google\\\\.[a-z.]{2,6}$"],["bing","(^|\\\\.)bing\\\\.com$"],["duckduckgo","(^|\\\\.)duckduckgo\\\\.com$"],["yahoo","(^|\\\\.)yahoo\\\\.[a-z.]{2,6}$"],["yandex","(^|\\\\.)yandex\\\\.[a-z.]{2,6}$"],["ecosia","(^|\\\\.)ecosia\\\\.org$"],["baidu","(^|\\\\.)baidu\\\\.com$"]]}';
    /* END signals-catalog */

    private $auth;
    private $discovery;
    private $catalog = null;
    private $pending = array();

    public function __construct($auth, $discovery) {
        $this->auth = $auth;
        $this->discovery = $discovery;
        add_action('template_redirect', array($this, 'detect'), -90);
        add_action('shutdown', array($this, 'persist_pending'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_snippet'));
        add_filter('script_loader_tag', array($this, 'script_tag_attributes'), 10, 3);
        add_action(ZICA_POSTS_CRON_SIGNALS, array($this, 'flush'));
        add_action('admin_post_zica_posts_signals_flush_now', array($this, 'handle_flush_now'));
    }

    /* ---------- catalogo ---------- */

    private function catalog() {
        if (null === $this->catalog) {
            $data = json_decode(self::CATALOG_JSON, true);
            $data = is_array($data) ? $data : array();
            $bots = isset($data['b']) && is_array($data['b']) ? $data['b'] : array();
            $known = array();
            foreach ($bots as $name) $known[strtolower((string) $name)] = true;
            $extra = $this->discovery ? (array) $this->discovery->ai_bots() : array();
            foreach ($extra as $name) {
                $name = trim((string) $name);
                if ('' !== $name && !isset($known[strtolower($name)])) {
                    $bots[] = $name;
                    $known[strtolower($name)] = true;
                }
            }
            usort($bots, function ($a, $b) { return strlen((string) $b) - strlen((string) $a); });
            $data['b'] = $bots;
            foreach (array('a', 'c', 'u', 's') as $k) {
                if (!isset($data[$k]) || !is_array($data[$k])) $data[$k] = array();
            }
            $this->catalog = $data;
        }
        return $this->catalog;
    }

    private function host_is($host, $list) {
        foreach ((array) $list as $candidate) {
            $candidate = strtolower((string) $candidate);
            if ('' === $candidate) continue;
            if ($host === $candidate || substr($host, -strlen($candidate) - 1) === '.' . $candidate) return true;
        }
        return false;
    }

    /* ---------- configuracao ---------- */

    public function is_enabled() {
        return '1' === (string) get_option(self::OPT_ENABLED, '0');
    }

    public function endpoint_is_allowed($url) {
        $url = (string) $url;
        if ('' === $url || !$this->auth->hub_url_is_safe($url)) return false;
        $parts = wp_parse_url($url);
        if (!is_array($parts) || empty($parts['host']) || empty($parts['scheme']) || 'https' !== strtolower($parts['scheme'])) return false;
        $host = strtolower(trim($parts['host'], '[]'));
        if ('.supabase.co' === substr($host, -12) && strlen($host) > 12) return true;
        $hub = wp_parse_url((string) get_option('zica_posts_hub_webhook_url', ''));
        return is_array($hub) && !empty($hub['host']) && strtolower($hub['host']) === $host;
    }

    private function is_configured() {
        return '' !== (string) get_option(self::OPT_SITE_ID, '')
            && '' !== (string) get_option(self::OPT_SECRET, '')
            && $this->endpoint_is_allowed((string) get_option(self::OPT_ENDPOINT, ''));
    }

    /** True quando o snippet de navegador sera impresso nas paginas (evita contar a mesma visita duas vezes). */
    private function snippet_active() {
        return $this->is_enabled()
            && '' !== (string) get_option(self::OPT_SITE_ID, '')
            && $this->endpoint_is_allowed((string) get_option(self::OPT_ENDPOINT, ''));
    }

    /** Valida e grava site_id/secret/endpoint. Retorna true ou WP_Error. O segredo nunca e devolvido. */
    public function configure($site_id, $secret, $endpoint, $enabled = null) {
        $site_id = strtolower(trim((string) $site_id));
        $secret = trim((string) $secret);
        $endpoint = esc_url_raw(trim((string) $endpoint));
        if (!preg_match('/^[a-z0-9]{12}$/', $site_id)) return new WP_Error('zica_signals_site_id', __('site_id inválido: use 12 caracteres [a-z0-9].', 'zica-posts'), array('status' => 400));
        if (!preg_match('/^[A-Za-z0-9_-]{32,128}$/', $secret)) return new WP_Error('zica_signals_secret', __('Segredo inválido: use de 32 a 128 caracteres.', 'zica-posts'), array('status' => 400));
        if (!$this->endpoint_is_allowed($endpoint)) return new WP_Error('zica_signals_endpoint', __('Endpoint inválido: precisa ser HTTPS e terminar em .supabase.co ou usar o host do webhook do Hub.', 'zica-posts'), array('status' => 400));
        update_option(self::OPT_SITE_ID, $site_id, false);
        update_option(self::OPT_SECRET, $secret, false);
        update_option(self::OPT_ENDPOINT, $endpoint, false);
        update_option(self::OPT_ENABLED, (null === $enabled || $enabled) ? '1' : '0', false);
        delete_option(self::OPT_LAST_ERROR);
        return true;
    }

    public function ensure_schedule() {
        if (!wp_next_scheduled(ZICA_POSTS_CRON_SIGNALS)) wp_schedule_event(time() + 600, 'hourly', ZICA_POSTS_CRON_SIGNALS);
    }

    /* ---------- deteccao ---------- */

    private function today() {
        return (new DateTimeImmutable('now', new DateTimeZone(ZICA_POSTS_TZ)))->format('Y-m-d');
    }

    private function request_path() {
        $uri = isset($_SERVER['REQUEST_URI']) ? (string) wp_unslash($_SERVER['REQUEST_URI']) : '/';
        $path = wp_parse_url($uri, PHP_URL_PATH);
        $path = is_string($path) && '' !== $path ? $path : '/';
        $path = preg_replace('/[^\x20-\x7E]/', '', $path);
        $path = str_replace('|', '%7C', (string) $path);
        return substr('' === $path ? '/' : $path, 0, 200);
    }

    private function detect_bot() {
        $ua = isset($_SERVER['HTTP_USER_AGENT']) ? (string) wp_unslash($_SERVER['HTTP_USER_AGENT']) : '';
        if ('' === $ua) return null;
        $catalog = $this->catalog();
        foreach ($catalog['b'] as $name) {
            if (false !== stripos($ua, (string) $name)) return (string) $name;
        }
        return null;
    }

    private function classify_referrer() {
        $c = $this->catalog();
        $utm = '';
        foreach (array('utm_source', 'ref') as $key) {
            if (isset($_GET[$key]) && is_scalar($_GET[$key])) {
                $utm = strtolower(sanitize_text_field(wp_unslash((string) $_GET[$key])));
                if ('' !== $utm) break;
            }
        }
        if ('' !== $utm && isset($c['u'][$utm])) return array('ai_referral', (string) $c['u'][$utm]);

        $ref = isset($_SERVER['HTTP_REFERER']) ? (string) wp_unslash($_SERVER['HTTP_REFERER']) : '';
        if ('' === $ref) return null;
        $parts = wp_parse_url($ref);
        if (!is_array($parts) || empty($parts['host'])) return null;
        $host = strtolower(preg_replace('/^www\./i', '', (string) $parts['host']));
        $own = strtolower(preg_replace('/^www\./i', '', (string) wp_parse_url(home_url('/'), PHP_URL_HOST)));
        if ('' === $host || $host === $own) return null;
        $path = isset($parts['path']) ? (string) $parts['path'] : '/';
        $query = isset($parts['query']) ? (string) $parts['query'] : '';

        foreach ($c['a'] as $row) {
            if (isset($row[0], $row[1]) && $this->host_is($host, $row[1])) return array('ai_referral', (string) $row[0]);
        }
        foreach ($c['c'] as $row) {
            if (!isset($row[0], $row[1]) || !$this->host_is($host, array($row[0]))) continue;
            if (!empty($row[2]) && is_array($row[2])) {
                foreach ($row[2] as $qk => $qv) {
                    if (preg_match('/(^|&)' . preg_quote((string) $qk, '/') . '=' . preg_quote((string) $qv, '/') . '(&|$)/', $query)) return array('ai_referral', (string) $row[1]);
                }
            }
            if (!empty($row[3]) && is_array($row[3])) {
                foreach ($row[3] as $prefix) {
                    if (0 === strpos($path, (string) $prefix)) return array('ai_referral', (string) $row[1]);
                }
            }
        }
        foreach ($c['s'] as $row) {
            if (isset($row[0], $row[1]) && 1 === preg_match('~' . $row[1] . '~i', $host)) return array('search_referral', (string) $row[0]);
        }
        return null;
    }

    public function detect() {
        if (!$this->is_enabled() || is_admin() || is_user_logged_in() || is_preview() || is_feed()) return;
        $method = isset($_SERVER['REQUEST_METHOD']) ? strtoupper((string) $_SERVER['REQUEST_METHOD']) : 'GET';
        if ('GET' !== $method && 'HEAD' !== $method) return;

        $hit = null;
        $bot = $this->detect_bot();
        if (null !== $bot) {
            $hit = array('ai_bot_hit', $bot);
        } elseif (apply_filters('zica_posts_signals_server_referrals', !$this->snippet_active())) {
            $hit = $this->classify_referrer();
        }
        if (null === $hit) return;
        $key = $this->today() . '|' . $hit[0] . '|' . $hit[1] . '|' . $this->request_path();
        $this->pending[$key] = (isset($this->pending[$key]) ? $this->pending[$key] : 0) + 1;
    }

    /** Persiste as contagens da requisicao (uma escrita por requisicao, no shutdown). */
    public function persist_pending() {
        if (!$this->pending) return;
        $buffer = get_option(self::OPT_BUFFER, array());
        $buffer = is_array($buffer) ? $buffer : array();
        $dropped = 0;
        foreach ($this->pending as $key => $hits) {
            if (isset($buffer[$key])) {
                $buffer[$key] = min(100000, (int) $buffer[$key] + (int) $hits);
            } elseif (count($buffer) < self::BUFFER_MAX_KEYS) {
                $buffer[$key] = (int) $hits;
            } else {
                $dropped += (int) $hits;
            }
        }
        $this->pending = array();
        update_option(self::OPT_BUFFER, $buffer, false);
        if ($dropped > 0) update_option(self::OPT_DROPPED, (int) get_option(self::OPT_DROPPED, 0) + $dropped, false);
    }

    /* ---------- snippet de navegador ---------- */

    public function enqueue_snippet() {
        if (is_admin() || is_user_logged_in() || !$this->snippet_active()) return;
        wp_enqueue_script(self::SCRIPT_HANDLE, ZICA_POSTS_URL . 'assets/zica-signals.js', array(), ZICA_POSTS_VERSION, true);
    }

    public function script_tag_attributes($tag, $handle, $src) {
        if (self::SCRIPT_HANDLE !== $handle) return $tag;
        $attrs = ' defer data-site="' . esc_attr((string) get_option(self::OPT_SITE_ID, '')) . '" data-endpoint="' . esc_url((string) get_option(self::OPT_ENDPOINT, '')) . '"';
        return str_replace(' src=', $attrs . ' src=', $tag);
    }

    /* ---------- envio ---------- */

    private function buffer_stats() {
        $buffer = get_option(self::OPT_BUFFER, array());
        $buffer = is_array($buffer) ? $buffer : array();
        return array('keys' => count($buffer), 'hits' => (int) array_sum(array_map('intval', $buffer)));
    }

    private function remember_error($message) {
        update_option(self::OPT_LAST_ERROR, array('at' => gmdate('c'), 'message' => substr(sanitize_text_field((string) $message), 0, 200)), false);
    }

    /** Envia o buffer em lotes de ate 500 eventos. Mantem o que falhar. */
    public function flush() {
        if (!$this->is_configured()) return array('ok' => false, 'error' => 'not_configured', 'sent' => 0);
        if (get_transient('zica_posts_signals_flush_lock')) return array('ok' => false, 'error' => 'locked', 'sent' => 0);
        set_transient('zica_posts_signals_flush_lock', '1', 2 * MINUTE_IN_SECONDS);

        $site_id = (string) get_option(self::OPT_SITE_ID, '');
        $secret = (string) get_option(self::OPT_SECRET, '');
        $endpoint = (string) get_option(self::OPT_ENDPOINT, '');
        $site_host = strtolower((string) wp_parse_url(home_url('/'), PHP_URL_HOST));
        $buffer = get_option(self::OPT_BUFFER, array());
        $buffer = is_array($buffer) ? $buffer : array();
        $sent_events = 0;
        $result = array('ok' => true, 'sent' => 0);

        foreach (array_chunk($buffer, self::BATCH_MAX_EVENTS, true) as $chunk) {
            $events = array();
            foreach ($chunk as $key => $hits) {
                $p = explode('|', (string) $key, 4);
                if (4 !== count($p)) continue;
                $events[] = array('day' => $p[0], 'kind' => $p[1], 'agent' => $p[2], 'path' => $p[3], 'hits' => min(100000, max(1, (int) $hits)));
            }
            if (!$events) {
                $this->subtract($chunk);
                continue;
            }
            $body = wp_json_encode(array('site_host' => $site_host, 'batch_id' => wp_generate_uuid4(), 'events' => $events), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            $timestamp = (string) time();
            $nonce = wp_generate_uuid4();
            $response = wp_remote_post($endpoint, array(
                'timeout' => 15,
                'redirection' => 0,
                'headers' => array(
                    'Content-Type' => 'application/json',
                    'X-Zica-Site' => $site_id,
                    'X-Zica-Timestamp' => $timestamp,
                    'X-Zica-Nonce' => $nonce,
                    'X-Zica-Signature' => $this->auth->sign_body($body, $nonce, $timestamp, $secret),
                ),
                'body' => $body,
            ));
            if (is_wp_error($response)) {
                $this->remember_error($response->get_error_message());
                $result = array('ok' => false, 'error' => 'request_failed', 'sent' => $sent_events);
                break;
            }
            $code = (int) wp_remote_retrieve_response_code($response);
            if ($code < 200 || $code >= 300) {
                $this->remember_error('http_' . $code);
                $result = array('ok' => false, 'error' => 'http_' . $code, 'sent' => $sent_events);
                break;
            }
            $this->subtract($chunk);
            $sent_events += count($events);
        }
        delete_transient('zica_posts_signals_flush_lock');
        $result['sent'] = $sent_events;
        if ($result['ok']) {
            delete_option(self::OPT_LAST_ERROR);
            if ($sent_events > 0) update_option(self::OPT_LAST_FLUSH, gmdate('c'), false);
        }
        return $result;
    }

    /** Remove do buffer atual o que foi enviado (releitura evita perder hits concorrentes). */
    private function subtract($sent) {
        $current = get_option(self::OPT_BUFFER, array());
        $current = is_array($current) ? $current : array();
        foreach ($sent as $key => $hits) {
            if (!isset($current[$key])) continue;
            $left = (int) $current[$key] - (int) $hits;
            if ($left > 0) $current[$key] = $left;
            else unset($current[$key]);
        }
        update_option(self::OPT_BUFFER, $current, false);
    }

    /* ---------- status (REST/admin) ---------- */

    public function status() {
        $endpoint = (string) get_option(self::OPT_ENDPOINT, '');
        $stats = $this->buffer_stats();
        $last_error = get_option(self::OPT_LAST_ERROR, '');
        $last_flush = get_option(self::OPT_LAST_FLUSH, '');
        return array(
            'enabled' => $this->is_enabled(),
            'site_id' => (string) get_option(self::OPT_SITE_ID, ''),
            'endpoint_host' => $endpoint ? (string) wp_parse_url($endpoint, PHP_URL_HOST) : '',
            'buffer_keys' => $stats['keys'],
            'buffer_hits' => $stats['hits'],
            'last_flush' => $last_flush ? (string) $last_flush : null,
            'last_error' => is_array($last_error) ? $last_error : null,
            'configured' => $this->is_configured(),
            'snippet_active' => $this->snippet_active(),
            'dropped_hits' => (int) get_option(self::OPT_DROPPED, 0),
        );
    }

    /* ---------- admin ---------- */

    public function handle_flush_now() {
        if (!current_user_can('manage_options')) wp_die(esc_html__('Permissão insuficiente.', 'zica-posts'));
        check_admin_referer('zica_posts_signals_flush_now');
        $this->flush();
        wp_safe_redirect(admin_url('admin.php?page=zica-posts'));
        exit;
    }

    public function render_admin_block() {
        $s = $this->status();
        echo '<section class="zica-posts-panel"><h2>' . esc_html__('Sinais de IA', 'zica-posts') . '</h2>';
        echo '<p>' . esc_html__('Conta acessos de robôs de IA e visitas vindas de IA/busca por dia, agente e página. Não registra IP, navegador completo, cookies nem usuários logados. São contagens observadas, não garantia de citação.', 'zica-posts') . '</p>';
        echo '<table class="widefat striped"><tbody>';
        $rows = array(
            __('Estado', 'zica-posts') => $s['enabled'] ? __('Ativo', 'zica-posts') : __('Desativado', 'zica-posts'),
            __('Conexão com o Zica.ai', 'zica-posts') => $s['configured'] ? sprintf(__('Configurada (%s)', 'zica-posts'), $s['endpoint_host']) : __('Não configurada', 'zica-posts'),
            __('Snippet de navegador', 'zica-posts') => $s['snippet_active'] ? __('Impresso nas páginas', 'zica-posts') : __('Inativo', 'zica-posts'),
            __('No buffer (aguardando envio)', 'zica-posts') => sprintf(__('%1$d contagens em %2$d chaves', 'zica-posts'), $s['buffer_hits'], $s['buffer_keys']),
            __('Último envio', 'zica-posts') => $s['last_flush'] ? $s['last_flush'] : __('nunca', 'zica-posts'),
            __('Último erro', 'zica-posts') => is_array($s['last_error']) ? ($s['last_error']['at'] . ' · ' . $s['last_error']['message']) : __('nenhum', 'zica-posts'),
        );
        foreach ($rows as $label => $value) {
            echo '<tr><th scope="row">' . esc_html($label) . '</th><td>' . esc_html((string) $value) . '</td></tr>';
        }
        echo '</tbody></table>';
        echo '<form method="post" action="options.php" style="margin-top:12px">';
        settings_fields('zica_posts_signals_settings');
        echo '<input type="hidden" name="' . esc_attr(self::OPT_ENABLED) . '" value="0">';
        echo '<label><input type="checkbox" name="' . esc_attr(self::OPT_ENABLED) . '" value="1" ' . checked($s['enabled'], true, false) . '> ' . esc_html__('Coletar sinais de IA neste site', 'zica-posts') . '</label> ';
        submit_button(__('Salvar', 'zica-posts'), 'secondary', 'submit', false);
        echo '</form>';
        echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '" style="margin-top:8px"><input type="hidden" name="action" value="zica_posts_signals_flush_now">';
        wp_nonce_field('zica_posts_signals_flush_now');
        submit_button(__('Enviar agora', 'zica-posts'), 'secondary', 'submit', false, $s['configured'] ? array() : array('disabled' => 'disabled'));
        echo '</form>';
        echo '<p class="description">' . esc_html__('Se o site usa cache de página ou CDN, parte dos acessos de robôs não chega ao WordPress. Veja integrations/zica-signals para Worker, middleware ou leitor de logs.', 'zica-posts') . '</p>';
        echo '</section>';
    }
}
