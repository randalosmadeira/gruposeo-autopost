<?php
/**
 * Indexing and SEO Schema for ContentFactory RDM
 * 
 * Handles automatic indexing of articles and images for better SEO
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_Indexing {
    
    /**
     * Initialize indexing hooks
     */
    public static function init() {
        // Add schema markup to articles
        add_action('wp_head', array(__CLASS__, 'add_article_schema'));
        
        // Add image schema for featured images
        add_action('wp_head', array(__CLASS__, 'add_image_schema'));
        
        // Notify search engines on publish
        add_action('publish_post', array(__CLASS__, 'notify_search_engines'), 10, 2);
        
        // Add meta tags for AI-generated content disclosure
        add_action('wp_head', array(__CLASS__, 'add_ai_disclosure_meta'));
        
        // Register REST endpoint for indexing status
        add_action('rest_api_init', array(__CLASS__, 'register_routes'));
    }
    
    /**
     * Register REST API routes
     */
    public static function register_routes() {
        register_rest_route('cfrdm/v1', '/indexing/status', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'get_indexing_status'),
            'permission_callback' => array('CFRDM_API', 'verify_api_key'),
        ));
        
        register_rest_route('cfrdm/v1', '/indexing/request', array(
            'methods' => 'POST',
            'callback' => array(__CLASS__, 'request_indexing'),
            'permission_callback' => array('CFRDM_API', 'verify_api_key'),
        ));
    }
    
    /**
     * Add Article Schema (JSON-LD)
     */
    public static function add_article_schema() {
        if (!is_single()) {
            return;
        }
        
        global $post;
        
        // Only for ContentFactory articles
        $cfrdm_id = get_post_meta($post->ID, '_cfrdm_article_id', true);
        if (empty($cfrdm_id)) {
            return;
        }
        
        $featured_image_url = get_the_post_thumbnail_url($post->ID, 'full');
        $author_name = get_the_author_meta('display_name', $post->post_author);
        
        $schema = array(
            '@context' => 'https://schema.org',
            '@type' => 'Article',
            'mainEntityOfPage' => array(
                '@type' => 'WebPage',
                '@id' => get_permalink($post->ID),
            ),
            'headline' => get_the_title($post->ID),
            'description' => get_the_excerpt($post->ID),
            'datePublished' => get_the_date('c', $post->ID),
            'dateModified' => get_the_modified_date('c', $post->ID),
            'author' => array(
                '@type' => 'Person',
                'name' => $author_name,
            ),
            'publisher' => array(
                '@type' => 'Organization',
                'name' => get_bloginfo('name'),
                'logo' => array(
                    '@type' => 'ImageObject',
                    'url' => self::get_site_logo(),
                ),
            ),
        );
        
        if ($featured_image_url) {
            $schema['image'] = array(
                '@type' => 'ImageObject',
                'url' => $featured_image_url,
                'width' => 1920,
                'height' => 1080,
            );
        }
        
        // Add FAQ schema if article has FAQ section
        $faq_schema = self::extract_faq_schema($post->post_content);
        if (!empty($faq_schema)) {
            $schema['hasPart'] = $faq_schema;
        }
        
        echo '<script type="application/ld+json">' . wp_json_encode($schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . '</script>' . "\n";
    }
    
    /**
     * Add Image Schema for featured images
     */
    public static function add_image_schema() {
        if (!is_single()) {
            return;
        }
        
        global $post;
        
        $featured_image_id = get_post_thumbnail_id($post->ID);
        if (!$featured_image_id) {
            return;
        }
        
        $featured_image_url = wp_get_attachment_url($featured_image_id);
        $alt_text = get_post_meta($featured_image_id, '_wp_attachment_image_alt', true);
        $image_meta = wp_get_attachment_metadata($featured_image_id);
        
        $image_schema = array(
            '@context' => 'https://schema.org',
            '@type' => 'ImageObject',
            'contentUrl' => $featured_image_url,
            'name' => get_the_title($featured_image_id),
            'description' => $alt_text ?: get_the_title($post->ID),
            'uploadDate' => get_the_date('c', $featured_image_id),
        );
        
        if (!empty($image_meta['width']) && !empty($image_meta['height'])) {
            $image_schema['width'] = $image_meta['width'];
            $image_schema['height'] = $image_meta['height'];
        }
        
        // Add AI generation info if applicable
        $ai_generated = get_post_meta($featured_image_id, '_cfrdm_ai_generated', true);
        if ($ai_generated) {
            $image_schema['creator'] = array(
                '@type' => 'Organization',
                'name' => 'ContentFactory AI',
            );
        }
        
        echo '<script type="application/ld+json">' . wp_json_encode($image_schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . '</script>' . "\n";
    }
    
    /**
     * Add AI disclosure meta tag
     */
    public static function add_ai_disclosure_meta() {
        if (!is_single()) {
            return;
        }
        
        global $post;
        
        $cfrdm_id = get_post_meta($post->ID, '_cfrdm_article_id', true);
        if (empty($cfrdm_id)) {
            return;
        }
        
        // Add transparency meta for AI-generated content
        echo '<meta name="generator" content="ContentFactory AI">' . "\n";
        echo '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">' . "\n";
    }
    
    /**
     * Notify search engines when article is published
     */
    public static function notify_search_engines($post_id, $post) {
        // Only for ContentFactory articles
        $cfrdm_id = get_post_meta($post_id, '_cfrdm_article_id', true);
        if (empty($cfrdm_id)) {
            return;
        }
        
        // Only notify for published posts
        if ($post->post_status !== 'publish') {
            return;
        }
        
        $permalink = get_permalink($post_id);
        
        // Ping Google
        if (get_option('cfrdm_ping_google', true)) {
            wp_remote_get('https://www.google.com/ping?sitemap=' . urlencode(get_sitemap_url('post')), array(
                'timeout' => 5,
                'blocking' => false,
            ));
        }
        
        // Ping Bing
        if (get_option('cfrdm_ping_bing', true)) {
            wp_remote_get('https://www.bing.com/ping?sitemap=' . urlencode(get_sitemap_url('post')), array(
                'timeout' => 5,
                'blocking' => false,
            ));
        }
        
        // Log indexing request
        CFRDM_Logger::info('indexing', 'Notificação de indexação enviada', array(
            'post_id' => $post_id,
            'url' => $permalink,
        ), $post_id);
        
        // Update indexing status
        update_post_meta($post_id, '_cfrdm_indexing_requested', current_time('mysql'));
    }
    
    /**
     * Get indexing status for articles
     */
    public static function get_indexing_status($request) {
        global $wpdb;
        
        // Get all ContentFactory articles
        $articles = $wpdb->get_results(
            "SELECT p.ID, p.post_title, p.post_status, p.post_date,
                    pm1.meta_value as cfrdm_id,
                    pm2.meta_value as indexing_requested,
                    pm3.meta_value as indexing_confirmed
             FROM {$wpdb->posts} p
             INNER JOIN {$wpdb->postmeta} pm1 ON p.ID = pm1.post_id AND pm1.meta_key = '_cfrdm_article_id'
             LEFT JOIN {$wpdb->postmeta} pm2 ON p.ID = pm2.post_id AND pm2.meta_key = '_cfrdm_indexing_requested'
             LEFT JOIN {$wpdb->postmeta} pm3 ON p.ID = pm3.post_id AND pm3.meta_key = '_cfrdm_indexing_confirmed'
             WHERE p.post_type = 'post' AND p.post_status = 'publish'
             ORDER BY p.post_date DESC
             LIMIT 100"
        );
        
        $data = array();
        foreach ($articles as $article) {
            $data[] = array(
                'id' => $article->ID,
                'cfrdm_id' => $article->cfrdm_id,
                'title' => $article->post_title,
                'url' => get_permalink($article->ID),
                'published_at' => $article->post_date,
                'indexing_requested' => $article->indexing_requested,
                'indexing_confirmed' => $article->indexing_confirmed,
                'has_featured_image' => has_post_thumbnail($article->ID),
            );
        }
        
        return new WP_REST_Response(array(
            'success' => true,
            'data' => $data,
            'total' => count($data),
        ), 200);
    }
    
    /**
     * Request indexing for specific article
     */
    public static function request_indexing($request) {
        $params = $request->get_json_params();
        $post_id = intval($params['post_id'] ?? 0);
        
        if (!$post_id) {
            return new WP_Error(
                'missing_post_id',
                __('ID do artigo não fornecido.', 'contentfactory-rdm'),
                array('status' => 400)
            );
        }
        
        $post = get_post($post_id);
        if (!$post || $post->post_status !== 'publish') {
            return new WP_Error(
                'invalid_post',
                __('Artigo não encontrado ou não publicado.', 'contentfactory-rdm'),
                array('status' => 404)
            );
        }
        
        // Trigger indexing notification
        self::notify_search_engines($post_id, $post);
        
        return new WP_REST_Response(array(
            'success' => true,
            'message' => __('Solicitação de indexação enviada.', 'contentfactory-rdm'),
            'post_id' => $post_id,
            'url' => get_permalink($post_id),
        ), 200);
    }
    
    /**
     * Extract FAQ schema from content
     */
    private static function extract_faq_schema($content) {
        $faq_items = array();
        
        // Look for FAQ patterns in content
        // Pattern: <h2>FAQ</h2> or <h2>Perguntas Frequentes</h2> followed by Q&A pairs
        if (preg_match_all('/<h3[^>]*>([^<]+)<\/h3>\s*<p>([^<]+)<\/p>/i', $content, $matches, PREG_SET_ORDER)) {
            foreach ($matches as $match) {
                $question = strip_tags($match[1]);
                $answer = strip_tags($match[2]);
                
                if (strpos($question, '?') !== false) {
                    $faq_items[] = array(
                        '@type' => 'Question',
                        'name' => $question,
                        'acceptedAnswer' => array(
                            '@type' => 'Answer',
                            'text' => $answer,
                        ),
                    );
                }
            }
        }
        
        return $faq_items;
    }
    
    /**
     * Get site logo URL
     */
    private static function get_site_logo() {
        $custom_logo_id = get_theme_mod('custom_logo');
        if ($custom_logo_id) {
            return wp_get_attachment_url($custom_logo_id);
        }
        return get_site_icon_url() ?: '';
    }
}

// Initialize
CFRDM_Indexing::init();
