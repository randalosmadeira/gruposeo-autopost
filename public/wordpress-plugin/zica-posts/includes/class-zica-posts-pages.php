<?php
/**
 * Páginas do Estúdio de Páginas do Zica (Zica Posts 3.18.0).
 *
 * Rotas (namespace zica-posts/v1, mesma autenticação por chave das demais):
 *   POST /pages           cria ou atualiza uma PÁGINA (post_type page), idempotente por zica_ai_id, com endereço semântico EXATO e hierarquia.
 *   POST /pages/lookup    encontra uma página pelo caminho completo (também aceita GET ?path=).
 *   POST /pages/status    despublica (draft) ou republica (publish) pelo zica_ai_id.
 *   GET  /pages/{id}      devolve conteúdo e hash (detecta desvio).
 *   POST /redirects       mapa de redirecionamentos 301 (caminho antigo -> novo), aplicado em template_redirect.
 *
 * Garantias:
 *  - o slug pedido é o slug gravado: se o WordPress mudar o slug (sufixo "-2") ou a hierarquia, a criação é DESFEITA e devolve 409 (nunca fica página com endereço errado);
 *  - a página-pai precisa existir (o plugin não cria hub sozinho);
 *  - página existente com o mesmo caminho e OUTRO zica_ai_id: 409 (nunca duplica nem sobrescreve página alheia);
 *  - HTML filtrado por wp_kses_post; sem script, sem formulário próprio; nenhuma requisição externa daqui;
 *  - schema JSON-LD guardado em _zica_posts_json_ld e impresso pelo módulo de descoberta (um só grafo); com SEO plugin ativo o título, a meta descrição e o canonical
 *    vão para as chaves do plugin (Rank Math, Yoast) e o plugin do Estúdio não imprime os seus;
 *  - o portão de completude 3.17.0 é reaproveitado (relatório estruturado; por padrão publica com aviso, só segura como rascunho com política "require").
 * Sem a rota nova um Zica antigo continua funcionando como sempre.
 */
if (!defined('ABSPATH')) exit;

final class Zica_Posts_Pages {
    const META_EXTERNAL = '_zica_posts_page_external_id';
    const META_PAGE = '_zica_posts_page_meta';
    const META_HASH = '_zica_posts_page_content_hash';
    const OPTION_REDIRECTS = 'zica_posts_redirects';
    const MAX_REDIRECTS = 500;
    const MAX_LEVELS = 3;

    private $auth;
    private $completeness;

    public function __construct($auth, $completeness = null) {
        $this->auth = $auth;
        $this->completeness = $completeness;
        add_action('rest_api_init', array($this, 'register_routes'));
        add_action('template_redirect', array($this, 'apply_redirects'), 1);
        add_action('template_redirect', array($this, 'prepare_head'), 2);
        add_action('wp_head', array($this, 'output_head'), 5);
        add_filter('pre_get_document_title', array($this, 'filter_title'), 20);
        add_filter('wp_robots', array($this, 'filter_robots'), 20);
        add_filter('the_content', array($this, 'wrap_content'), 9);
        add_filter('body_class', array($this, 'body_class'));
    }

    public function register_routes() {
        $ns = 'zica-posts/v1';
        $auth = array($this->auth, 'verify_api_key');
        register_rest_route($ns, '/pages', array('methods' => 'POST', 'callback' => array($this, 'upsert_page'), 'permission_callback' => $auth));
        register_rest_route($ns, '/pages/lookup', array(array('methods' => 'POST', 'callback' => array($this, 'lookup'), 'permission_callback' => $auth), array('methods' => 'GET', 'callback' => array($this, 'lookup'), 'permission_callback' => $auth)));
        register_rest_route($ns, '/pages/status', array('methods' => 'POST', 'callback' => array($this, 'set_status'), 'permission_callback' => $auth));
        register_rest_route($ns, '/pages/(?P<id>\d+)', array('methods' => 'GET', 'callback' => array($this, 'read_page'), 'permission_callback' => $auth));
        register_rest_route($ns, '/redirects', array('methods' => 'POST', 'callback' => array($this, 'save_redirects'), 'permission_callback' => $auth));
    }

    // ---------------------------------------------------------------- utilidades

    /** Um nível do caminho: letras e números de qualquer alfabeto, hífen entre palavras, minúsculas, 3 a 60 caracteres. */
    private function valid_level($level) {
        $len = function_exists('mb_strlen') ? mb_strlen($level) : strlen($level);
        if ($len < 3 || $len > 60) return false;
        if (!preg_match('/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u', $level)) return false;
        return $level === (function_exists('mb_strtolower') ? mb_strtolower($level) : strtolower($level));
    }

    private function clean_path($raw) {
        $path = trim((string) $raw, "/ \t\n\r");
        if ('' === $path) return array('', array());
        $levels = explode('/', $path);
        if (count($levels) > self::MAX_LEVELS) return array(false, array());
        foreach ($levels as $l) if (!$this->valid_level($l)) return array(false, array());
        return array(implode('/', $levels), $levels);
    }

    private function find_by_external($external_id) {
        if ('' === $external_id) return 0;
        $found = get_posts(array('post_type' => 'page', 'post_status' => 'any', 'meta_key' => self::META_EXTERNAL, 'meta_value' => $external_id, 'posts_per_page' => 1, 'fields' => 'ids'));
        return $found ? (int) $found[0] : 0;
    }

    private function find_by_path($path) {
        $page = get_page_by_path($path, OBJECT, 'page');
        return $page instanceof WP_Post ? $page : null;
    }

    private function managed($post) {
        return $post instanceof WP_Post && 'page' === $post->post_type && '' !== (string) get_post_meta($post->ID, self::META_EXTERNAL, true);
    }

    private function err($code, $message, $status) {
        return new WP_Error($code, $message, array('status' => $status));
    }

    private function seo_plugin() {
        if (class_exists('Zica_Posts_Completeness')) return Zica_Posts_Completeness::seo_plugin();
        return '';
    }

    // ---------------------------------------------------------------- POST /pages

    public function upsert_page($request) {
        $p = $request->get_json_params();
        $p = is_array($p) ? $p : array();
        $title = sanitize_text_field(isset($p['title']) ? $p['title'] : '');
        $content = wp_kses_post(isset($p['content']) ? $p['content'] : '');
        $external_id = sanitize_text_field(isset($p['zica_ai_id']) ? $p['zica_ai_id'] : '');
        if ('' === $title || '' === trim(wp_strip_all_tags($content))) return $this->err('zica_page_invalid', 'Título e conteúdo são obrigatórios.', 400);
        if (!preg_match('/^[A-Za-z0-9-]{16,64}$/', $external_id)) return $this->err('zica_page_external_id', 'zica_ai_id inválido (a publicação é idempotente por ele).', 400);
        $full = isset($p['full_path']) ? $p['full_path'] : trim((isset($p['parent_path']) ? $p['parent_path'] . '/' : '') . (isset($p['slug']) ? $p['slug'] : ''), '/');
        list($path, $levels) = $this->clean_path($full);
        if (false === $path || '' === $path) return $this->err('zica_page_path', 'Endereço inválido: até 3 níveis, minúsculas, letras, números e hífen (3 a 60 caracteres por nível).', 422);
        $slug = $levels[count($levels) - 1];
        $parent_levels = array_slice($levels, 0, -1);
        $parent_id = 0;
        if ($parent_levels) {
            $parent = $this->find_by_path(implode('/', $parent_levels));
            if (!$parent) return $this->err('zica_page_parent_not_found', 'A página-pai "' . implode('/', $parent_levels) . '" não existe neste site. Crie o hub antes.', 422);
            $parent_id = (int) $parent->ID;
        }
        $status = isset($p['status']) && in_array($p['status'], array('publish', 'draft'), true) ? $p['status'] : 'draft';

        $existing = $this->find_by_external($external_id);
        $at_path = $this->find_by_path($path);
        if ($at_path && (int) $at_path->ID !== $existing) return $this->err('zica_page_path_taken', 'Já existe uma página neste caminho (' . $path . ') que não é a desta publicação. O plugin não cria "-2" nem sobrescreve página alheia.', 409);

        $content_hash = hash('sha256', (string) $content);
        if ($existing && hash_equals((string) get_post_meta($existing, self::META_HASH, true), $content_hash) && get_post_status($existing) === $status && get_page_uri($existing) === $path) {
            return rest_ensure_response(array('success' => true, 'id' => $existing, 'url' => get_permalink($existing), 'path' => get_page_uri($existing), 'status' => get_post_status($existing), 'created' => false, 'idempotent' => true, 'plugin_version' => defined('ZICA_POSTS_VERSION') ? ZICA_POSTS_VERSION : ''));
        }

        // portão de completude (3.17.0): campos que ele sabe medir
        $gate = null;
        if ($this->completeness) {
            $q = $p;
            $q['title'] = isset($p['seo_title']) && '' !== (string) $p['seo_title'] ? (string) $p['seo_title'] : $title;
            $q['seo_description'] = isset($p['meta_description']) ? (string) $p['meta_description'] : '';
            $q['content'] = (string) $content;
            $nodes = array();
            if (isset($p['schema']['@graph']) && is_array($p['schema']['@graph'])) $nodes = $p['schema']['@graph'];
            $q['json_ld_schemas'] = $nodes;
            $gate = $this->completeness->precheck($q, $status);
            if ($gate && !empty($gate['hold'])) $status = 'draft';
        }

        $previous_name = $existing ? get_post_field('post_name', $existing) : '';
        $postarr = array(
            'post_type' => 'page', 'post_status' => $status, 'post_title' => $title, 'post_content' => $content,
            'post_excerpt' => sanitize_textarea_field(isset($p['excerpt']) ? $p['excerpt'] : (isset($p['meta_description']) ? $p['meta_description'] : '')),
            'post_name' => $slug, 'post_parent' => $parent_id,
        );
        if ($existing) $postarr['ID'] = $existing;
        if (class_exists('Zica_Posts_Outbox')) Zica_Posts_Outbox::suppress(true);
        $id = wp_insert_post($postarr, true);
        if (class_exists('Zica_Posts_Outbox')) Zica_Posts_Outbox::suppress(false);
        if (is_wp_error($id)) return $id;

        // o endereço gravado TEM de ser o pedido (slug exato e hierarquia): senão desfaz e recusa
        $stored_name = get_post_field('post_name', $id);
        $stored_path = get_page_uri($id);
        if ($stored_name !== $slug || $stored_path !== $path) {
            if (!$existing) {
                wp_delete_post($id, true);
            } elseif ('' !== $previous_name) {
                wp_update_post(array('ID' => $id, 'post_name' => $previous_name));
            }
            return $this->err('zica_page_slug_changed', 'O WordPress alterou o endereço pedido (' . $path . ' virou ' . $stored_path . '). A publicação foi desfeita. Resolva o conflito de endereço no site.', 409);
        }

        update_post_meta($id, self::META_EXTERNAL, $external_id);
        update_post_meta($id, self::META_HASH, $content_hash);
        if (!empty($p['schema']) && is_array($p['schema'])) update_post_meta($id, '_zica_posts_json_ld', array($p['schema']));
        else delete_post_meta($id, '_zica_posts_json_ld');
        $meta = $this->sanitize_meta($p, $title);
        update_post_meta($id, self::META_PAGE, $meta);
        $this->mirror_to_seo_plugin($id, $meta);
        if (!empty($p['canonical']) && 0 !== strpos((string) $p['canonical'], get_permalink($id)) && false === strpos((string) $p['canonical'], rtrim(get_permalink($id), '/'))) {
            // canonical diferente do permalink real: avisa no relatório (não reescreve a URL do site)
            $meta['canonical_mismatch'] = true;
            update_post_meta($id, self::META_PAGE, $meta);
        }
        // o outbox ficou suprimido durante a gravação (a publicação já é do Zica); a descoberta e o sitemap atualizam no próximo ciclo
        $resp = array(
            'success' => true, 'id' => $id, 'url' => get_permalink($id), 'path' => get_page_uri($id), 'status' => get_post_status($id), 'created' => !$existing, 'idempotent' => false,
            'content_hash' => $content_hash, 'plugin_version' => defined('ZICA_POSTS_VERSION') ? ZICA_POSTS_VERSION : '',
        );
        if ($gate && $this->completeness) $resp['completeness'] = $this->completeness->finalize($id, $gate);
        return rest_ensure_response($resp);
    }

    private function sanitize_meta($p, $title) {
        $og = isset($p['og']) && is_array($p['og']) ? $p['og'] : array();
        $hreflang = array();
        if (isset($p['hreflang']) && is_array($p['hreflang'])) {
            foreach (array_slice($p['hreflang'], 0, 40, true) as $tag => $url) {
                $tag = sanitize_text_field((string) $tag);
                $url = esc_url_raw((string) $url);
                if ($url && 0 === strpos($url, 'https://') && preg_match('/^(?:x-default|[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?)$/', $tag)) $hreflang[$tag] = $url;
            }
        }
        return array(
            'seo_title' => sanitize_text_field(isset($p['seo_title']) && '' !== (string) $p['seo_title'] ? $p['seo_title'] : $title),
            'description' => sanitize_text_field(isset($p['meta_description']) ? $p['meta_description'] : ''),
            'canonical' => esc_url_raw(isset($p['canonical']) ? (string) $p['canonical'] : ''),
            'language' => sanitize_text_field(isset($p['language']) ? $p['language'] : ''),
            'noindex' => !empty($p['noindex']),
            'hreflang' => $hreflang,
            'og' => array(
                'title' => sanitize_text_field(isset($og['title']) ? $og['title'] : ''), 'description' => sanitize_text_field(isset($og['description']) ? $og['description'] : ''),
                'image' => esc_url_raw(isset($og['image']) ? (string) $og['image'] : ''), 'image_alt' => sanitize_text_field(isset($og['image_alt']) ? $og['image_alt'] : ''),
                'width' => isset($og['width']) ? absint($og['width']) : 0, 'height' => isset($og['height']) ? absint($og['height']) : 0,
            ),
        );
    }

    /** Com Rank Math ou Yoast ativos, o título, a meta descrição e o canonical vão para as chaves DELES (eles imprimem; o Estúdio não duplica). */
    private function mirror_to_seo_plugin($id, $meta) {
        $seo = $this->seo_plugin();
        if ('rank_math' === $seo) {
            update_post_meta($id, 'rank_math_title', $meta['seo_title']);
            update_post_meta($id, 'rank_math_description', $meta['description']);
            if ('' !== $meta['canonical']) update_post_meta($id, 'rank_math_canonical_url', $meta['canonical']);
        } elseif ('yoast' === $seo) {
            update_post_meta($id, '_yoast_wpseo_title', $meta['seo_title']);
            update_post_meta($id, '_yoast_wpseo_metadesc', $meta['description']);
            if ('' !== $meta['canonical']) update_post_meta($id, '_yoast_wpseo_canonical', $meta['canonical']);
        }
    }

    // ---------------------------------------------------------------- lookup, status, leitura

    public function lookup($request) {
        $path_raw = $request->get_param('path');
        if (null === $path_raw || '' === $path_raw) { $p = $request->get_json_params(); $path_raw = is_array($p) && isset($p['path']) ? $p['path'] : ''; }
        $external = sanitize_text_field((string) $request->get_param('zica_ai_id'));
        $post = null;
        if ('' !== $external) { $id = $this->find_by_external($external); $post = $id ? get_post($id) : null; }
        if (!$post && '' !== (string) $path_raw) { list($path) = $this->clean_path($path_raw); if ($path) $post = $this->find_by_path($path); }
        if (!$post) return rest_ensure_response(array('success' => true, 'found' => false));
        return rest_ensure_response(array('success' => true, 'found' => true, 'id' => $post->ID, 'url' => get_permalink($post), 'path' => get_page_uri($post), 'status' => $post->post_status, 'managed' => $this->managed($post), 'external_id' => (string) get_post_meta($post->ID, self::META_EXTERNAL, true), 'content_hash' => (string) get_post_meta($post->ID, self::META_HASH, true)));
    }

    public function set_status($request) {
        $p = $request->get_json_params();
        $p = is_array($p) ? $p : array();
        $external = sanitize_text_field(isset($p['zica_ai_id']) ? $p['zica_ai_id'] : '');
        $status = isset($p['status']) && in_array($p['status'], array('draft', 'publish'), true) ? $p['status'] : '';
        if ('' === $external || '' === $status) return $this->err('zica_page_status', 'zica_ai_id e status (draft ou publish) são obrigatórios.', 400);
        $id = $this->find_by_external($external);
        if (!$id) return $this->err('zica_page_not_found', 'Página não encontrada.', 404);
        if (class_exists('Zica_Posts_Outbox')) Zica_Posts_Outbox::suppress(true);
        $r = wp_update_post(array('ID' => $id, 'post_status' => $status), true);
        if (class_exists('Zica_Posts_Outbox')) Zica_Posts_Outbox::suppress(false);
        if (is_wp_error($r)) return $r;
        return rest_ensure_response(array('success' => true, 'id' => $id, 'status' => get_post_status($id)));
    }

    public function read_page($request) {
        $post = get_post(absint($request['id']));
        if (!$post instanceof WP_Post || !$this->managed($post)) return $this->err('zica_page_not_found', 'Página não encontrada.', 404);
        return rest_ensure_response(array('success' => true, 'id' => $post->ID, 'url' => get_permalink($post), 'path' => get_page_uri($post), 'status' => $post->post_status, 'title' => $post->post_title, 'content' => $post->post_content, 'content_hash' => hash('sha256', (string) $post->post_content), 'approved_hash' => (string) get_post_meta($post->ID, self::META_HASH, true), 'modified_gmt' => $post->post_modified_gmt));
    }

    // ---------------------------------------------------------------- redirecionamentos 301

    public function save_redirects($request) {
        $p = $request->get_json_params();
        $p = is_array($p) ? $p : array();
        $list = isset($p['redirects']) && is_array($p['redirects']) ? $p['redirects'] : array();
        $map = get_option(self::OPTION_REDIRECTS, array());
        $map = is_array($map) ? $map : array();
        $added = 0;
        foreach (array_slice($list, 0, 200) as $r) {
            if (!is_array($r) || empty($r['from']) || empty($r['to'])) continue;
            $from = '/' . trim((string) wp_parse_url((string) $r['from'], PHP_URL_PATH), '/') . '/';
            $to = '/' . trim((string) wp_parse_url((string) $r['to'], PHP_URL_PATH), '/') . '/';
            if ('//' === $from || '//' === $to || $from === $to) continue;
            $map[$from] = $to;
            $added++;
        }
        if (count($map) > self::MAX_REDIRECTS) $map = array_slice($map, -self::MAX_REDIRECTS, null, true);
        update_option(self::OPTION_REDIRECTS, $map, false);
        return rest_ensure_response(array('success' => true, 'added' => $added, 'total' => count($map)));
    }

    public function apply_redirects() {
        if (is_admin() || is_feed()) return;
        $map = get_option(self::OPTION_REDIRECTS, array());
        if (!is_array($map) || !$map) return;
        $uri = isset($_SERVER['REQUEST_URI']) ? (string) wp_parse_url(wp_unslash($_SERVER['REQUEST_URI']), PHP_URL_PATH) : '';
        $key = '/' . trim($uri, '/') . '/';
        if (isset($map[$key])) { wp_safe_redirect(home_url($map[$key]), 301); exit; }
    }

    // ---------------------------------------------------------------- saída (<head>, título, robots, conteúdo)

    private function current_page() {
        if (!is_singular('page')) return null;
        global $post;
        if (!$post instanceof WP_Post || 'publish' !== $post->post_status || !$this->managed($post)) return null;
        return $post;
    }

    private function page_meta($post) {
        $m = get_post_meta($post->ID, self::META_PAGE, true);
        return is_array($m) ? $m : array();
    }

    public function prepare_head() {
        $post = $this->current_page();
        if (!$post || '' !== $this->seo_plugin()) return;
        $m = $this->page_meta($post);
        if (!empty($m['canonical'])) remove_action('wp_head', 'rel_canonical'); // o canonical vem do Estúdio (mesmo endereço semântico)
    }

    public function filter_title($title) {
        $post = $this->current_page();
        if (!$post || '' !== $this->seo_plugin()) return $title;
        $m = $this->page_meta($post);
        return !empty($m['seo_title']) ? $m['seo_title'] : $title;
    }

    public function filter_robots($robots) {
        $post = $this->current_page();
        if (!$post) return $robots;
        $m = $this->page_meta($post);
        if (!empty($m['noindex'])) { $robots['noindex'] = true; unset($robots['index']); }
        return $robots;
    }

    public function output_head() {
        $post = $this->current_page();
        if (!$post || '' !== $this->seo_plugin()) return;
        $m = $this->page_meta($post);
        if (!empty($m['description'])) echo '<meta name="description" content="' . esc_attr($m['description']) . '">' . "\n";
        if (!empty($m['canonical'])) echo '<link rel="canonical" href="' . esc_url($m['canonical']) . '">' . "\n";
        if (!empty($m['hreflang']) && is_array($m['hreflang'])) foreach ($m['hreflang'] as $tag => $url) echo '<link rel="alternate" hreflang="' . esc_attr($tag) . '" href="' . esc_url($url) . '">' . "\n";
        $og = isset($m['og']) && is_array($m['og']) ? $m['og'] : array();
        $tags = array(
            'og:type' => 'website', 'og:title' => !empty($og['title']) ? $og['title'] : (isset($m['seo_title']) ? $m['seo_title'] : ''), 'og:description' => !empty($og['description']) ? $og['description'] : (isset($m['description']) ? $m['description'] : ''),
            'og:url' => !empty($m['canonical']) ? $m['canonical'] : get_permalink($post), 'og:site_name' => get_bloginfo('name'), 'og:locale' => !empty($m['language']) ? str_replace('-', '_', $m['language']) : get_locale(),
        );
        if (!empty($og['image'])) { $tags['og:image'] = $og['image']; if (!empty($og['width'])) $tags['og:image:width'] = (string) $og['width']; if (!empty($og['height'])) $tags['og:image:height'] = (string) $og['height']; if (!empty($og['image_alt'])) $tags['og:image:alt'] = $og['image_alt']; }
        foreach ($tags as $property => $value) { if ('' === (string) $value) continue; echo '<meta property="' . esc_attr($property) . '" content="' . esc_attr($value) . '">' . "\n"; }
        echo '<meta name="twitter:card" content="' . (!empty($og['image']) ? 'summary_large_image' : 'summary') . '">' . "\n";
        if (!empty($tags['og:title'])) echo '<meta name="twitter:title" content="' . esc_attr($tags['og:title']) . '">' . "\n";
        if (!empty($tags['og:description'])) echo '<meta name="twitter:description" content="' . esc_attr($tags['og:description']) . '">' . "\n";
        if (!empty($og['image'])) echo '<meta name="twitter:image" content="' . esc_url($og['image']) . '">' . "\n";
        echo '<style id="zica-page-css">.zica-page{max-width:46rem;margin:0 auto;line-height:1.65}.zica-page h2{margin:2rem 0 .6rem}.zica-page img{max-width:100%;height:auto}.zica-page table{border-collapse:collapse;width:100%;display:block;overflow-x:auto}.zica-page th,.zica-page td{border:1px solid #e3e3e6;padding:.5rem .6rem;text-align:left}.zica-page .answer{border-left:3px solid currentColor;padding-left:1rem}.zica-page .cta a{display:inline-block;padding:.7rem 1.1rem;border:1px solid currentColor;border-radius:6px;text-decoration:none;font-weight:600}</style>' . "\n";
    }

    public function wrap_content($content) {
        $post = $this->current_page();
        if (!$post || !in_the_loop() || !is_main_query()) return $content;
        return '<div class="zica-page">' . $content . '</div>';
    }

    public function body_class($classes) {
        if ($this->current_page()) $classes[] = 'zica-page-template';
        return $classes;
    }
}
