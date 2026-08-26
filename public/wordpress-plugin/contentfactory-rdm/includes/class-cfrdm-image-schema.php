<?php
/**
 * CFRDM_Image_Schema
 *
 * Indexação semântica avançada de imagens:
 *   - Gera schema.org ImageObject para cada imagem publicada.
 *   - Audita alt-text ausente/fraco e marca para revisão (needs_review).
 *   - Alimenta um sitemap de imagens dedicado (image:image entries).
 *   - Suporta geolocalização opcional (ex.: fotos de unidades — Av. Paulista,
 *     Tatuapé) para LocalBusiness/ImageObject com contentLocation.
 *
 * @since 3.9.0
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_Image_Schema {

    private static $instance = null;

    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function init() {
        // Serve the dedicated image sitemap
        add_action('init', array($this, 'maybe_add_sitemap_rewrite'));
        add_action('template_redirect', array($this, 'maybe_render_image_sitemap'));
    }

    public static function create_tables() {
        global $wpdb;
        $charset_collate = $wpdb->get_charset_collate();
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';

        $table = $wpdb->prefix . CFRDM_IMAGE_SCHEMA_TABLE;
        dbDelta("CREATE TABLE IF NOT EXISTS $table (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            attachment_id bigint(20) NOT NULL,
            post_id bigint(20) DEFAULT NULL,
            image_url varchar(500) NOT NULL,
            alt_text varchar(500) DEFAULT NULL,
            caption text,
            width int DEFAULT NULL,
            height int DEFAULT NULL,
            schema_json longtext,
            geo_lat decimal(10,7) DEFAULT NULL,
            geo_lng decimal(10,7) DEFAULT NULL,
            license_url varchar(500) DEFAULT NULL,
            needs_review tinyint(1) DEFAULT 0,
            indexed_at datetime DEFAULT NULL,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY attachment_id (attachment_id),
            KEY post_id (post_id),
            KEY needs_review (needs_review)
        ) $charset_collate;");
    }

    /**
     * Index (or refresh) a single attachment: pulls current alt/caption,
     * dimensions, and builds an ImageObject schema fragment.
     */
    public function index_attachment($attachment_id, $post_id = null) {
        global $wpdb;
        $table = $wpdb->prefix . CFRDM_IMAGE_SCHEMA_TABLE;

        $url = wp_get_attachment_url($attachment_id);
        if (!$url) {
            return false;
        }

        $alt = get_post_meta($attachment_id, '_wp_attachment_image_alt', true);
        $attachment = get_post($attachment_id);
        $caption = $attachment ? $attachment->post_excerpt : '';
        $meta = wp_get_attachment_metadata($attachment_id);
        $width = $meta['width'] ?? null;
        $height = $meta['height'] ?? null;

        $needs_review = empty($alt) || mb_strlen($alt) < 8;

        $schema = array(
            '@type' => 'ImageObject',
            'contentUrl' => $url,
            'url' => $url,
        );
        if (!empty($alt)) {
            $schema['description'] = $alt;
            $schema['name'] = $alt;
        }
        if ($width) $schema['width'] = (string) $width;
        if ($height) $schema['height'] = (string) $height;
        if (!empty($caption)) $schema['caption'] = wp_strip_all_tags($caption);
        $schema['uploadDate'] = get_the_date('c', $attachment_id);

        $license = get_option('cfrdm_org_url');
        if ($license) {
            $schema['license'] = $license;
            $schema['acquireLicensePage'] = $license;
        }

        $row = array(
            'attachment_id' => (int) $attachment_id,
            'post_id' => $post_id ? (int) $post_id : null,
            'image_url' => $url,
            'alt_text' => $alt,
            'caption' => $caption,
            'width' => $width,
            'height' => $height,
            'schema_json' => wp_json_encode($schema, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'needs_review' => $needs_review ? 1 : 0,
            'indexed_at' => current_time('mysql'),
            'updated_at' => current_time('mysql'),
        );

        $existing = $wpdb->get_var($wpdb->prepare("SELECT id FROM $table WHERE attachment_id = %d", $attachment_id));
        if ($existing) {
            $wpdb->update($table, $row, array('attachment_id' => (int) $attachment_id));
        } else {
            $row['created_at'] = current_time('mysql');
            $wpdb->insert($table, $row);
        }

        return $schema;
    }

    /**
     * Index every image attached to / embedded in a post's content.
     */
    public function index_post_images($post_id) {
        $indexed = array();

        // Featured image
        $thumb_id = get_post_thumbnail_id($post_id);
        if ($thumb_id) {
            $indexed[] = $this->index_attachment($thumb_id, $post_id);
        }

        // Images embedded in content
        $post = get_post($post_id);
        if ($post && !empty($post->post_content)) {
            if (preg_match_all('/<img[^>]+src=["\']([^"\']+)["\']/i', $post->post_content, $matches)) {
                foreach ($matches[1] as $src) {
                    $attachment_id = attachment_url_to_postid($src);
                    if ($attachment_id) {
                        $indexed[] = $this->index_attachment($attachment_id, $post_id);
                    }
                }
            }
        }

        return array_filter($indexed);
    }

    /**
     * Re-scan every attachment in the media library (used by the "reindex
     * all" admin action and cron job).
     */
    public function reindex_all() {
        return $this->reindex_batch(-1);
    }

    public function reindex_batch($limit = 100) {
        $args = array(
            'post_type' => 'attachment',
            'post_mime_type' => 'image',
            'post_status' => 'inherit',
            'posts_per_page' => $limit,
            'fields' => 'ids',
        );
        $ids = get_posts($args);
        $count = 0;
        foreach ($ids as $attachment_id) {
            $post_id = wp_get_post_parent_id($attachment_id);
            $this->index_attachment($attachment_id, $post_id ?: null);
            $count++;
        }
        return array('indexed' => $count);
    }

    /**
     * Return the ImageObject schema fragments for a post (used by the
     * entity graph builder that outputs the final @graph in wp_head).
     */
    public function get_schemas_for_post($post_id) {
        global $wpdb;
        $table = $wpdb->prefix . CFRDM_IMAGE_SCHEMA_TABLE;
        $rows = $wpdb->get_col($wpdb->prepare("SELECT schema_json FROM $table WHERE post_id = %d", $post_id));
        $schemas = array();
        foreach ($rows as $json) {
            $decoded = json_decode($json, true);
            if ($decoded) {
                $schemas[] = $decoded;
            }
        }
        return $schemas;
    }

    /**
     * List images still needing alt-text/caption review (surfaced in admin
     * and available to AI personas with the `suggest_alt_text` action).
     */
    public function get_images_needing_review($limit = 50) {
        global $wpdb;
        $table = $wpdb->prefix . CFRDM_IMAGE_SCHEMA_TABLE;
        return $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM $table WHERE needs_review = 1 ORDER BY updated_at DESC LIMIT %d",
            $limit
        ), ARRAY_A);
    }

    /**
     * Dedicated XML image sitemap: /image-sitemap.xml
     */
    public function maybe_add_sitemap_rewrite() {
        add_rewrite_rule('^image-sitemap\.xml$', 'index.php?cfrdm_image_sitemap=1', 'top');
        add_filter('query_vars', function ($vars) {
            $vars[] = 'cfrdm_image_sitemap';
            return $vars;
        });
    }

    public function maybe_render_image_sitemap() {
        if (!get_query_var('cfrdm_image_sitemap')) {
            return;
        }

        global $wpdb;
        $table = $wpdb->prefix . CFRDM_IMAGE_SCHEMA_TABLE;
        $rows = $wpdb->get_results("SELECT image_url, alt_text, post_id FROM $table WHERE post_id IS NOT NULL ORDER BY updated_at DESC LIMIT 5000");

        header('Content-Type: application/xml; charset=UTF-8');
        echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
        echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">' . "\n";

        $by_post = array();
        foreach ($rows as $row) {
            $by_post[$row->post_id][] = $row;
        }

        foreach ($by_post as $post_id => $images) {
            $permalink = get_permalink($post_id);
            if (!$permalink) continue;
            echo "  <url>\n";
            echo '    <loc>' . esc_url($permalink) . "</loc>\n";
            foreach ($images as $img) {
                echo "    <image:image>\n";
                echo '      <image:loc>' . esc_url($img->image_url) . "</image:loc>\n";
                if (!empty($img->alt_text)) {
                    echo '      <image:title>' . esc_html($img->alt_text) . "</image:title>\n";
                }
                echo "    </image:image>\n";
            }
            echo "  </url>\n";
        }

        echo '</urlset>';
        exit;
    }

    public function register_rest_routes() {
        register_rest_route('cfrdm/v1', '/images/needs-review', array(
            'methods' => 'GET',
            'callback' => array($this, 'rest_needs_review'),
            'permission_callback' => array($this, 'rest_permission_check'),
        ));

        register_rest_route('cfrdm/v1', '/images/(?P<id>\d+)/alt-text', array(
            'methods' => 'POST',
            'callback' => array($this, 'rest_update_alt_text'),
            'permission_callback' => array($this, 'rest_permission_check'),
        ));
    }

    public function rest_permission_check($request) {
        $api_key = $request->get_header('X-CFRDM-API-Key');
        return !empty($api_key) && hash_equals((string) get_option('cfrdm_api_key'), (string) $api_key);
    }

    public function rest_needs_review($request) {
        return rest_ensure_response($this->get_images_needing_review(100));
    }

    /**
     * Allows an AI persona (scope=image_alt, action=suggest_alt_text) to
     * write back an improved alt-text/caption for a given attachment.
     */
    public function rest_update_alt_text($request) {
        $attachment_id = (int) $request['id'];
        $alt = sanitize_text_field($request->get_param('alt_text'));

        if (empty($alt) || !get_post($attachment_id)) {
            return new WP_Error('cfrdm_invalid_alt', 'alt_text inválido ou anexo inexistente.', array('status' => 400));
        }

        update_post_meta($attachment_id, '_wp_attachment_image_alt', $alt);
        $this->index_attachment($attachment_id);

        return rest_ensure_response(array('updated' => true, 'attachment_id' => $attachment_id));
    }

    public static function render_admin_page() {
        if (!current_user_can('manage_options')) {
            return;
        }
        $images = self::get_instance()->get_images_needing_review(100);
        echo '<div class="wrap"><h1>Indexação de Imagens & Sitemap</h1>';
        echo '<p>Sitemap de imagens disponível em <code>' . esc_url(home_url('/image-sitemap.xml')) . '</code>.</p>';
        echo '<h2>Imagens precisando de revisão (' . count($images) . ')</h2>';
        echo '<div id="cfrdm-images-app" data-images="' . esc_attr(wp_json_encode($images)) . '"></div>';
        echo '</div>';
    }
}
