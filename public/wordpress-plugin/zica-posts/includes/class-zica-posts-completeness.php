<?php
/**
 * Portão de completude (Zica Posts 3.17.0).
 *
 * Antes de publicar (rota POST /articles) o plugin confere o CONJUNTO do artigo e devolve ao Zica um relatório estruturado. O que ele consegue
 * preencher de forma determinística ele preenche (trilha BreadcrumbList, schema, canonical, Open Graph, alt das imagens, datas do schema); o que
 * não consegue fica "pending". Por padrão publica com aviso; só segura como rascunho quando o Zica manda a política "require" E existe item de
 * nível "exigir" pendente.
 *
 * Garantias:
 *  - sem requisição externa, sem telemetria, sem enviar conteúdo a terceiros (nenhum wp_remote_* aqui);
 *  - nada altera o texto aprovado (post_content): o plugin só escreve em post-meta e no <head>/saída da página;
 *  - sem o campo "completeness" na requisição (Zica antigo) nada muda: o comportamento é o de sempre;
 *  - não duplica schema do Rank Math, Yoast, AIOSEO ou SEOPress: com um deles ativo o bloco Article e a trilha ficam com ele.
 */
if (!defined('ABSPATH')) exit;

final class Zica_Posts_Completeness {
    const REPORT_VERSION = 1;
    const META_REQUEST = '_zica_posts_completeness_request';
    const META_REPORT = '_zica_posts_completeness';
    const META_POLICY = '_zica_posts_schema_policy';

    private static $item_ids = array(
        'title', 'meta_description', 'h1_single', 'heading_hierarchy', 'breadcrumb', 'schema', 'schema_faq', 'schema_duplicates', 'canonical',
        'open_graph', 'featured_image', 'image_alt', 'internal_links', 'author', 'dates', 'no_markdown_tables', 'no_prompt_residue', 'content_hash', 'hreflang',
    );
    private static $article_types = array('Article', 'BlogPosting', 'NewsArticle', 'TechArticle');

    public function __construct() {
        add_filter('zica_posts_stored_schemas', array($this, 'filter_stored_schemas'), 10, 2);
        add_action('wp_head', array($this, 'output_open_graph'), 6);
        add_action('wp_head', array($this, 'output_canonical_fallback'), 9);
        add_action('wp_head', array($this, 'output_fallback_breadcrumb'), 18);
        add_filter('the_content', array($this, 'fill_image_alt'), 20);
    }

    /** SEO plugin ativo (ele já emite Article, trilha, canonical e Open Graph). */
    public static function seo_plugin() {
        if (defined('RANK_MATH_VERSION')) return 'rank_math';
        if (defined('WPSEO_VERSION')) return 'yoast';
        if (defined('AIOSEO_VERSION')) return 'aioseo';
        if (defined('SEOPRESS_VERSION')) return 'seopress';
        return '';
    }

    private function is_managed($post) {
        return $post instanceof WP_Post && '' !== (string) get_post_meta($post->ID, '_zica_posts_external_id', true);
    }

    // ---------------------------------------------------------------- requisição

    /** Saneia o campo "completeness" que veio do Zica. Devolve null se ausente ou inválido (Zica antigo = comportamento antigo). */
    public function sanitize_request($raw) {
        if (!is_array($raw)) return null;
        $policy = isset($raw['policy']) ? (string) $raw['policy'] : 'warn';
        if (!in_array($policy, array('warn', 'require', 'off'), true)) $policy = 'warn';
        $hash = isset($raw['approved_hash']) ? strtolower((string) $raw['approved_hash']) : '';
        if (!preg_match('/^[a-f0-9]{64}$/', $hash)) $hash = '';
        $levels = array();
        if (isset($raw['levels']) && is_array($raw['levels'])) {
            foreach ($raw['levels'] as $id => $level) {
                if (in_array($id, self::$item_ids, true) && in_array($level, array('exigir', 'recomendar'), true)) $levels[$id] = $level;
            }
        }
        $expect = isset($raw['expect']) && is_array($raw['expect']) ? $raw['expect'] : array();
        $policy_schema = isset($raw['schema_policy']) && is_array($raw['schema_policy']) ? $raw['schema_policy'] : array();
        $drop = array();
        if (isset($policy_schema['drop_types']) && is_array($policy_schema['drop_types'])) {
            foreach (array_slice($policy_schema['drop_types'], 0, 8) as $type) $drop[] = sanitize_text_field((string) $type);
        }
        return array(
            'version' => isset($raw['version']) ? absint($raw['version']) : 1,
            'policy' => $policy,
            'approved_hash' => $hash,
            'language' => isset($raw['language']) ? sanitize_text_field((string) $raw['language']) : '',
            'levels' => $levels,
            'internal_links_min' => isset($raw['internal_links_min']) && null !== $raw['internal_links_min'] ? absint($raw['internal_links_min']) : null,
            'expect' => array(
                'faq_schema' => !empty($expect['faq_schema']),
                'hreflang' => !empty($expect['hreflang']),
                'author_identified' => array_key_exists('author_identified', $expect) && null !== $expect['author_identified'] ? !empty($expect['author_identified']) : null,
            ),
            'schema_policy' => array('seo_plugin' => isset($policy_schema['seo_plugin']) ? sanitize_key((string) $policy_schema['seo_plugin']) : '', 'drop_types' => $drop),
        );
    }

    // ---------------------------------------------------------------- avaliação

    private function schema_types($schemas) {
        $types = array();
        if (!is_array($schemas)) return $types;
        foreach ($schemas as $schema) {
            if (!is_array($schema) || !isset($schema['@type'])) continue;
            foreach ((array) $schema['@type'] as $t) $types[] = (string) $t;
        }
        return $types;
    }

    private function count_article_blocks($types) {
        $n = 0;
        foreach ($types as $t) if (in_array($t, self::$article_types, true)) $n++;
        return $n;
    }

    private function plain($html) {
        return trim(preg_replace('/\s+/u', ' ', wp_strip_all_tags((string) $html)));
    }

    private function has_markdown_table($html) {
        $text = preg_replace(array('#<br\s*/?>#i', '#</?p[^>]*>#i'), "\n", (string) $html);
        $lines = preg_split('/\r?\n/', $text);
        $count = count($lines);
        for ($i = 0; $i < $count - 1; $i++) {
            if (false !== strpos($lines[$i], '|') && preg_match('/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/', $lines[$i + 1])) return true;
        }
        return false;
    }

    private function has_residue($html) {
        $patterns = array(
            '/\[(?:PLACEHOLDER|TODO|FIXME|INSERIR[^\]]{0,40}|VERIFICAR[^\]]{0,120}|CONFIRMAR[^\]]{0,120}|RECONSULTAR[^\]]{0,120})\]/iu',
            '/\{\{[^}]{1,80}\}\}/u',
            '/lorem ipsum/iu',
            '/(?:^|[\n\r>])\s*(?:SYSTEM|ASSISTANT|DEVELOPER|PROMPT)\s*:/mu',
            '/\b(?:TITLE_SEO|META_DESCRIPTION)\s*:/u',
            '/```/',
            '/\b(?:system prompt|ignore previous instructions)\b/iu',
        );
        foreach ($patterns as $p) if (preg_match($p, (string) $html)) return true;
        return false;
    }

    private function heading_levels($html) {
        $levels = array();
        if (preg_match_all('/<h([1-6])\b/i', (string) $html, $m)) foreach ($m[1] as $l) $levels[] = (int) $l;
        return $levels;
    }

    private function count_internal_links($html) {
        $host = wp_parse_url(home_url('/'), PHP_URL_HOST);
        $n = 0;
        if (preg_match_all('/<a\b[^>]*href\s*=\s*["\']([^"\']+)["\']/i', (string) $html, $m)) {
            foreach ($m[1] as $href) {
                if (0 === strpos($href, '/') && 0 !== strpos($href, '//')) { $n++; continue; }
                $h = wp_parse_url($href, PHP_URL_HOST);
                if ($h && $host && strtolower($h) === strtolower($host)) $n++;
            }
        }
        return $n;
    }

    private function item($req, $id, $state, $note = '') {
        if (!isset($req['levels'][$id])) return null; // item desligado pelo perfil de regras do Zica: nem avalia
        $out = array('id' => $id, 'level' => $req['levels'][$id], 'state' => $state);
        if ('' !== $note) $out['note'] = $note;
        return $out;
    }

    /** Avalia só o que o corpo da requisição permite medir. Nunca grava nada. */
    public function evaluate($p, $req, $raw_content) {
        $items = array();
        $add = function ($item) use (&$items) { if (null !== $item) $items[] = $item; };
        $seo = self::seo_plugin();
        $title = $this->plain(isset($p['title']) ? $p['title'] : '');
        $meta = $this->plain(isset($p['seo_description']) ? $p['seo_description'] : (isset($p['excerpt']) ? $p['excerpt'] : ''));
        $schemas = isset($p['json_ld_schemas']) && is_array($p['json_ld_schemas']) ? $p['json_ld_schemas'] : array();
        $types = $this->schema_types($schemas);
        $levels = $this->heading_levels($raw_content);

        $len = function_exists('mb_strlen') ? mb_strlen($title) : strlen($title);
        $add($this->item($req, 'title', ($len >= 15 && $len <= 120) ? 'ok' : 'pending', ($len >= 15 && $len <= 120) ? '' : 'título vazio, curto ou muito longo'));
        $mlen = function_exists('mb_strlen') ? mb_strlen($meta) : strlen($meta);
        $add($this->item($req, 'meta_description', ($mlen >= 50 && $mlen <= 200) ? 'ok' : 'pending', ($mlen >= 50 && $mlen <= 200) ? '' : 'meta descrição vazia, curta ou longa'));

        $h1 = 0; foreach ($levels as $l) if (1 === $l) $h1++;
        $add($this->item($req, 'h1_single', 0 === $h1 ? 'ok' : 'pending', 0 === $h1 ? '' : 'o corpo traz H1; o tema já usa o título como H1'));
        $jump = false; $prev = 1;
        foreach ($levels as $l) { if ($l > $prev + 1) $jump = true; if ($l > 1) $prev = $l; }
        $add($this->item($req, 'heading_hierarchy', $jump ? 'pending' : 'ok', $jump ? 'há salto de nível entre títulos (ex.: H2 direto para H4)' : ''));

        $add($this->item($req, 'no_markdown_tables', $this->has_markdown_table($raw_content) ? 'pending' : 'ok', $this->has_markdown_table($raw_content) ? 'tabela em markdown cru no texto' : ''));
        $add($this->item($req, 'no_prompt_residue', $this->has_residue($raw_content . ' ' . $title . ' ' . $meta) ? 'pending' : 'ok', $this->has_residue($raw_content . ' ' . $title . ' ' . $meta) ? 'resíduo de prompt ou placeholder' : ''));

        if ('' !== $req['approved_hash']) {
            $actual = hash('sha256', (string) $raw_content);
            $add($this->item($req, 'content_hash', hash_equals($req['approved_hash'], $actual) ? 'ok' : 'pending', hash_equals($req['approved_hash'], $actual) ? '' : 'o conteúdo recebido difere do aprovado no Zica'));
        }

        if (null !== $req['internal_links_min']) {
            $n = $this->count_internal_links($raw_content);
            $add($this->item($req, 'internal_links', $n >= $req['internal_links_min'] ? 'ok' : 'pending', $n >= $req['internal_links_min'] ? '' : $n . ' link(s) interno(s); mínimo ' . $req['internal_links_min']));
        }

        $imgs = preg_match_all('/<img\b[^>]*>/i', (string) $raw_content, $im) ? $im[0] : array();
        $missing = 0; foreach ($imgs as $tag) if (!preg_match('/\balt\s*=\s*["\'][^"\']+["\']/i', $tag)) $missing++;
        if (0 === $missing) $add($this->item($req, 'image_alt', 'ok'));
        else $add($this->item($req, 'image_alt', '1' === (string) get_option('zica_posts_fill_alt', '1') ? 'filled' : 'pending', $missing . ' imagem(ns) sem alt; o plugin completa pelo contexto ao exibir'));

        $add($this->item($req, 'featured_image', !empty($p['featured_image_id']) ? 'ok' : 'pending', !empty($p['featured_image_id']) ? '' : 'sem imagem destacada'));

        // schema: Article único; com SEO plugin o Article fica com ele
        $articles = $this->count_article_blocks($types);
        if ('' !== $seo) $add($this->item($req, 'schema', 'ok', 'o SEO plugin (' . $seo . ') emite o Article'));
        elseif ($articles >= 1) $add($this->item($req, 'schema', 'ok'));
        else $add($this->item($req, 'schema', '1' === (string) get_option('zica_posts_fill_schema', '1') ? 'filled' : 'pending', 'sem Article no envio; o plugin gera o básico do próprio post'));
        $dup = ($articles > 1) || ('' !== $seo && $articles >= 1);
        $add($this->item($req, 'schema_duplicates', $dup ? 'filled' : 'ok', $dup ? 'bloco Article duplicado ou conflitante com o SEO plugin; o plugin imprime um só' : ''));
        if (!empty($req['expect']['faq_schema'])) $add($this->item($req, 'schema_faq', in_array('FAQPage', $types, true) ? 'ok' : 'info', in_array('FAQPage', $types, true) ? '' : 'informativo: o Google aposentou o rich result de FAQ em 05/2026'));

        if ('' !== $seo) $add($this->item($req, 'breadcrumb', 'ok', 'o SEO plugin (' . $seo . ') cuida da trilha'));
        elseif (in_array('BreadcrumbList', $types, true)) $add($this->item($req, 'breadcrumb', 'ok'));
        else $add($this->item($req, 'breadcrumb', '1' === (string) get_option('zica_posts_fill_breadcrumb', '1') ? 'filled' : 'pending', 'sem BreadcrumbList no envio; o plugin gera a trilha com Início, categoria e o post'));

        if ('' !== $seo || has_action('wp_head', 'rel_canonical')) $add($this->item($req, 'canonical', 'ok'));
        else $add($this->item($req, 'canonical', 'filled', 'o tema não imprime canonical; o plugin imprime'));
        if ('' !== $seo) $add($this->item($req, 'open_graph', 'ok', 'o SEO plugin (' . $seo . ') cuida do Open Graph'));
        else $add($this->item($req, 'open_graph', '1' === (string) get_option('zica_posts_fill_og', '1') ? 'filled' : 'pending'));

        if (null !== $req['expect']['author_identified']) $add($this->item($req, 'author', $req['expect']['author_identified'] ? 'ok' : 'pending', $req['expect']['author_identified'] ? '' : 'autor genérico; o plugin não inventa autor'));

        foreach ($schemas as $schema) {
            if (!is_array($schema) || !isset($schema['@type']) || !array_intersect((array) $schema['@type'], self::$article_types)) continue;
            if (isset($schema['datePublished'], $schema['dateModified'])) {
                $pub = strtotime((string) $schema['datePublished']); $mod = strtotime((string) $schema['dateModified']);
                if ($pub && $mod) { $add($this->item($req, 'dates', $mod >= $pub ? 'ok' : 'filled', $mod >= $pub ? '' : 'modificação anterior à publicação; o plugin usa a data de publicação')); break; }
            }
        }
        if (!empty($req['expect']['hreflang'])) $add($this->item($req, 'hreflang', 'info', 'o mapa hreflang é sincronizado pelo Zica depois da publicação; confira o x-default'));
        return $items;
    }

    public function has_pending_required($items) {
        foreach ($items as $i) if ('pending' === $i['state'] && 'exigir' === $i['level']) return true;
        return false;
    }

    /** Antes de gravar o post: avalia e decide se segura como rascunho. Null = sem requisição de completude (comportamento antigo). */
    public function precheck($p, $requested_status) {
        $req = $this->sanitize_request(isset($p['completeness']) ? $p['completeness'] : null);
        if (null === $req) return null;
        if ('off' === $req['policy']) return array('req' => $req, 'items' => array(), 'hold' => false, 'off' => true, 'hash' => '');
        $raw = isset($p['content']) ? (string) $p['content'] : '';
        $items = $this->evaluate($p, $req, $raw);
        $hold = 'require' === $req['policy'] && 'publish' === $requested_status && $this->has_pending_required($items);
        return array('req' => $req, 'items' => $items, 'hold' => $hold, 'off' => false, 'hash' => hash('sha256', $raw), 'schemas' => isset($p['json_ld_schemas']) && is_array($p['json_ld_schemas']) ? $p['json_ld_schemas'] : array());
    }

    /** Depois de gravar o post: guarda a requisição e o relatório no post (para o preenchimento na saída) e devolve o relatório ao Zica. */
    public function finalize($post_id, $gate) {
        $req = $gate['req'];
        if (!empty($gate['off'])) return array('ran' => false, 'policy' => 'off', 'version' => self::REPORT_VERSION);
        update_post_meta($post_id, self::META_REQUEST, $req);
        update_post_meta($post_id, self::META_POLICY, $req['schema_policy']);
        $stored = get_post($post_id);
        $actual_stored = $stored instanceof WP_Post ? hash('sha256', (string) $stored->post_content) : '';
        $report = array(
            'ran' => true,
            'version' => self::REPORT_VERSION,
            'policy' => $req['policy'],
            'held' => !empty($gate['hold']),
            'published_status' => get_post_status($post_id),
            'items' => $gate['items'],
            'hash' => array('expected' => $req['approved_hash'], 'actual' => $gate['hash'], 'match' => '' !== $req['approved_hash'] ? hash_equals($req['approved_hash'], $gate['hash']) : null, 'stored' => $actual_stored),
            'plugin_version' => defined('ZICA_POSTS_VERSION') ? ZICA_POSTS_VERSION : '',
        );
        update_post_meta($post_id, self::META_REPORT, $report);
        return $report;
    }

    // ---------------------------------------------------------------- preenchimento na saída

    /** Um só bloco Article, uma só trilha, datas coerentes; nunca duplica o do SEO plugin. */
    public function filter_stored_schemas($stored, $post) {
        if (!is_array($stored) || !$stored || !$post instanceof WP_Post) return $stored;
        $policy = get_post_meta($post->ID, self::META_POLICY, true);
        $drop = is_array($policy) && isset($policy['drop_types']) && is_array($policy['drop_types']) ? $policy['drop_types'] : array();
        $seo = self::seo_plugin();
        if ('' !== $seo) $drop = array_merge($drop, self::$article_types, array('BreadcrumbList'));
        $out = array(); $seen = array();
        foreach ($stored as $schema) {
            if (!is_array($schema)) continue;
            $types = isset($schema['@type']) ? (array) $schema['@type'] : array();
            if ($types && array_intersect($types, $drop)) continue;
            $key = array_intersect($types, self::$article_types) ? 'article' : implode('+', $types);
            if ('' !== $key && isset($seen[$key])) continue;
            if ('' !== $key) $seen[$key] = true;
            if ('article' === $key && isset($schema['datePublished'], $schema['dateModified'])) {
                $pub = strtotime((string) $schema['datePublished']); $mod = strtotime((string) $schema['dateModified']);
                if ($pub && $mod && $mod < $pub) $schema['dateModified'] = $schema['datePublished'];
            }
            $out[] = $schema;
        }
        return $out;
    }

    private function stored_types($post) {
        $stored = apply_filters('zica_posts_stored_schemas', get_post_meta($post->ID, '_zica_posts_json_ld', true), $post);
        return $this->schema_types($stored);
    }

    private function current_managed_post() {
        if (!is_singular(array('post', 'page'))) return null;
        global $post;
        if (!$post instanceof WP_Post || 'publish' !== $post->post_status || !$this->is_managed($post)) return null;
        return $post;
    }

    public function output_fallback_breadcrumb() {
        $post = $this->current_managed_post();
        if (!$post || '' !== self::seo_plugin() || '1' !== (string) get_option('zica_posts_fill_breadcrumb', '1')) return;
        if (in_array('BreadcrumbList', $this->stored_types($post), true)) return;
        $items = array(array('name' => __('Home'), 'item' => home_url('/')));
        $cats = 'post' === $post->post_type ? get_the_category($post->ID) : array();
        if ($cats && !is_wp_error($cats)) {
            $link = get_category_link($cats[0]->term_id);
            if ($link && !is_wp_error($link)) $items[] = array('name' => $cats[0]->name, 'item' => $link);
        }
        $items[] = array('name' => wp_strip_all_tags(get_the_title($post)), 'item' => get_permalink($post));
        $list = array();
        foreach ($items as $i => $it) $list[] = array('@type' => 'ListItem', 'position' => $i + 1, 'name' => $it['name'], 'item' => $it['item']);
        $schema = array('@context' => 'https://schema.org', '@type' => 'BreadcrumbList', 'itemListElement' => $list);
        echo '<script type="application/ld+json">' . wp_json_encode($schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . '</script>' . "\n";
    }

    public function output_canonical_fallback() {
        $post = $this->current_managed_post();
        if (!$post || '' !== self::seo_plugin() || has_action('wp_head', 'rel_canonical')) return;
        echo '<link rel="canonical" href="' . esc_url(get_permalink($post)) . '">' . "\n";
    }

    public function output_open_graph() {
        $post = $this->current_managed_post();
        if (!$post || '' !== self::seo_plugin() || '1' !== (string) get_option('zica_posts_fill_og', '1')) return;
        $desc = $this->plain($post->post_excerpt ? $post->post_excerpt : $post->post_content);
        $desc = function_exists('mb_substr') ? mb_substr($desc, 0, 200) : substr($desc, 0, 200);
        $tags = array(
            'og:type' => 'article', 'og:title' => wp_strip_all_tags(get_the_title($post)), 'og:description' => $desc, 'og:url' => get_permalink($post),
            'og:site_name' => get_bloginfo('name'), 'og:locale' => get_locale(),
        );
        $image = get_the_post_thumbnail_url($post, 'full');
        if ($image) $tags['og:image'] = $image;
        foreach ($tags as $property => $value) {
            if ('' === (string) $value) continue;
            echo '<meta property="' . esc_attr($property) . '" content="' . esc_attr($value) . '">' . "\n";
        }
        echo '<meta name="twitter:card" content="' . ($image ? 'summary_large_image' : 'summary') . '">' . "\n";
    }

    /** Alt vazio vira o texto do próprio title da imagem ou o título do post. Só na exibição; o texto salvo não muda. */
    public function fill_image_alt($content) {
        $post = $this->current_managed_post();
        if (!$post || '1' !== (string) get_option('zica_posts_fill_alt', '1') || false === stripos((string) $content, '<img')) return $content;
        $fallback = wp_strip_all_tags(get_the_title($post));
        return preg_replace_callback('/<img\b([^>]*?)(\/?)>/i', function ($m) use ($fallback) {
            if (preg_match('/\balt\s*=\s*(["\'])(.*?)\1/i', $m[1], $a) && '' !== trim($a[2])) return $m[0];
            $text = $fallback;
            if (preg_match('/\btitle\s*=\s*(["\'])(.*?)\1/i', $m[1], $t) && '' !== trim($t[2])) $text = $t[2];
            if ('' === trim($text)) return $m[0];
            $attrs = trim(preg_replace('/\balt\s*=\s*(["\'])\1/i', '', $m[1]));
            return '<img' . ('' !== $attrs ? ' ' . $attrs : '') . ' alt="' . esc_attr($text) . '"' . ($m[2] ? ' /' : '') . '>';
        }, (string) $content);
    }
}
