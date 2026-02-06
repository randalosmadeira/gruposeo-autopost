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
        
        // Add Product/Review schema for review and comparison articles
        add_action('wp_head', array(__CLASS__, 'add_product_review_schema'));
        
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
        
        echo '<script type="application/ld+json">' . wp_json_encode($schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . '</script>' . "\n";
        
        // Add separate FAQ schema if article has FAQ section (Google requires FAQPage type)
        $faq_items = self::extract_faq_schema($post->post_content);
        if (!empty($faq_items)) {
            $faq_schema = array(
                '@context' => 'https://schema.org',
                '@type' => 'FAQPage',
                'mainEntity' => $faq_items,
            );
            echo '<script type="application/ld+json">' . wp_json_encode($faq_schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . '</script>' . "\n";
        }
        
        // Add BreadcrumbList schema
        self::add_breadcrumb_schema($post);
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
    
    /**
     * Add BreadcrumbList schema for navigation
     */
    private static function add_breadcrumb_schema($post) {
        $categories = get_the_category($post->ID);
        
        $breadcrumb_items = array(
            array(
                '@type' => 'ListItem',
                'position' => 1,
                'name' => __('Início', 'contentfactory-rdm'),
                'item' => home_url('/'),
            ),
        );
        
        $position = 2;
        
        // Add category if exists
        if (!empty($categories)) {
            $category = $categories[0];
            $breadcrumb_items[] = array(
                '@type' => 'ListItem',
                'position' => $position,
                'name' => $category->name,
                'item' => get_category_link($category->term_id),
            );
            $position++;
        }
        
        // Add current article
        $breadcrumb_items[] = array(
            '@type' => 'ListItem',
            'position' => $position,
            'name' => get_the_title($post->ID),
            'item' => get_permalink($post->ID),
        );
        
        $breadcrumb_schema = array(
            '@context' => 'https://schema.org',
            '@type' => 'BreadcrumbList',
            'itemListElement' => $breadcrumb_items,
        );
        
        echo '<script type="application/ld+json">' . wp_json_encode($breadcrumb_schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . '</script>' . "\n";
    }
    
    /**
     * Validate schema data before output
     */
    private static function validate_schema_field($value, $default = '') {
        if (empty($value) || !is_string($value)) {
            return $default;
        }
        return wp_strip_all_tags($value);
    }
    
    /**
     * Add Product and Review schema for review/comparison articles
     */
    public static function add_product_review_schema() {
        if (!is_single()) {
            return;
        }
        
        global $post;
        
        // Only for ContentFactory articles
        $cfrdm_id = get_post_meta($post->ID, '_cfrdm_article_id', true);
        if (empty($cfrdm_id)) {
            return;
        }
        
        // Get article type from meta
        $article_type = get_post_meta($post->ID, '_cfrdm_article_type', true);
        
        // Only for review and comparison articles
        if (!in_array($article_type, array('review', 'comparison'), true)) {
            return;
        }
        
        // Extract product data from content or meta
        $products = self::extract_products_from_content($post);
        
        if (empty($products)) {
            return;
        }
        
        // Get author info for review
        $author_name = get_the_author_meta('display_name', $post->post_author);
        $site_name = get_bloginfo('name');
        
        foreach ($products as $product) {
            // Product Schema
            $product_schema = array(
                '@context' => 'https://schema.org',
                '@type' => 'Product',
                'name' => $product['name'],
                'description' => $product['description'] ?? get_the_excerpt($post->ID),
                'brand' => array(
                    '@type' => 'Brand',
                    'name' => $product['brand'] ?? $site_name,
                ),
            );
            
            // Add image if available
            if (!empty($product['image'])) {
                $product_schema['image'] = $product['image'];
            } elseif (has_post_thumbnail($post->ID)) {
                $product_schema['image'] = get_the_post_thumbnail_url($post->ID, 'full');
            }
            
            // Add offers if price is available
            if (!empty($product['price'])) {
                $product_schema['offers'] = array(
                    '@type' => 'Offer',
                    'price' => $product['price'],
                    'priceCurrency' => $product['currency'] ?? 'BRL',
                    'availability' => 'https://schema.org/InStock',
                    'url' => $product['url'] ?? get_permalink($post->ID),
                );
            }
            
            // Add aggregate rating if available
            if (!empty($product['rating'])) {
                $product_schema['aggregateRating'] = array(
                    '@type' => 'AggregateRating',
                    'ratingValue' => $product['rating'],
                    'bestRating' => '5',
                    'worstRating' => '1',
                    'ratingCount' => $product['rating_count'] ?? '1',
                );
            }
            
            // Add review
            $product_schema['review'] = array(
                '@type' => 'Review',
                'reviewRating' => array(
                    '@type' => 'Rating',
                    'ratingValue' => $product['rating'] ?? '4',
                    'bestRating' => '5',
                    'worstRating' => '1',
                ),
                'author' => array(
                    '@type' => 'Person',
                    'name' => $author_name,
                ),
                'publisher' => array(
                    '@type' => 'Organization',
                    'name' => $site_name,
                ),
                'datePublished' => get_the_date('c', $post->ID),
                'reviewBody' => $product['review_body'] ?? get_the_excerpt($post->ID),
            );
            
            // Add pros and cons if available
            if (!empty($product['pros']) || !empty($product['cons'])) {
                $product_schema['review']['positiveNotes'] = array(
                    '@type' => 'ItemList',
                    'itemListElement' => array_map(function($pro, $index) {
                        return array(
                            '@type' => 'ListItem',
                            'position' => $index + 1,
                            'name' => $pro,
                        );
                    }, $product['pros'] ?? array(), array_keys($product['pros'] ?? array())),
                );
                
                $product_schema['review']['negativeNotes'] = array(
                    '@type' => 'ItemList',
                    'itemListElement' => array_map(function($con, $index) {
                        return array(
                            '@type' => 'ListItem',
                            'position' => $index + 1,
                            'name' => $con,
                        );
                    }, $product['cons'] ?? array(), array_keys($product['cons'] ?? array())),
                );
            }
            
            echo '<script type="application/ld+json">' . wp_json_encode($product_schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . '</script>' . "\n";
        }
        
        // For comparison articles, add ItemList schema
        if ($article_type === 'comparison' && count($products) > 1) {
            self::add_comparison_schema($post, $products);
        }
    }
    
    /**
     * Extract products from article content or meta
     */
    private static function extract_products_from_content($post) {
        $products = array();
        
        // First, try to get products from meta (if stored by ContentFactory)
        $meta_products = get_post_meta($post->ID, '_cfrdm_products', true);
        if (!empty($meta_products) && is_array($meta_products)) {
            return $meta_products;
        }
        
        // Try to get from article config JSON
        $config = get_post_meta($post->ID, '_cfrdm_config', true);
        if (!empty($config)) {
            $config_data = json_decode($config, true);
            if (!empty($config_data['products'])) {
                return $config_data['products'];
            }
        }
        
        // Extract from content using patterns
        $content = $post->post_content;
        
        // Pattern 1: Look for product titles in H2/H3 with ratings
        // Example: <h2>1. iPhone 15 Pro - 4.8/5</h2>
        if (preg_match_all('/<h[23][^>]*>(?:\d+\.\s*)?([^<]+?)(?:\s*[-–]\s*(\d+(?:\.\d+)?)\s*\/\s*5)?<\/h[23]>/i', $content, $matches, PREG_SET_ORDER)) {
            foreach ($matches as $match) {
                $product_name = trim($match[1]);
                $rating = isset($match[2]) ? floatval($match[2]) : null;
                
                // Skip non-product headings (FAQ, Conclusão, etc.)
                $skip_words = array('FAQ', 'Perguntas', 'Conclusão', 'Introdução', 'Comparação', 'Resumo', 'Índice');
                $should_skip = false;
                foreach ($skip_words as $skip) {
                    if (stripos($product_name, $skip) !== false) {
                        $should_skip = true;
                        break;
                    }
                }
                
                if (!$should_skip && strlen($product_name) > 3) {
                    $products[] = array(
                        'name' => $product_name,
                        'rating' => $rating,
                        'description' => self::extract_product_description($content, $product_name),
                        'pros' => self::extract_pros_cons($content, $product_name, 'pros'),
                        'cons' => self::extract_pros_cons($content, $product_name, 'cons'),
                    );
                }
            }
        }
        
        // Pattern 2: Look for explicit product blocks
        // Example: <!-- product:Nome do Produto -->
        if (preg_match_all('/<!--\s*product:([^>]+)\s*-->/i', $content, $matches)) {
            foreach ($matches[1] as $product_name) {
                $products[] = array(
                    'name' => trim($product_name),
                    'description' => self::extract_product_description($content, trim($product_name)),
                );
            }
        }
        
        // Limit to first 10 products to avoid schema bloat
        return array_slice($products, 0, 10);
    }
    
    /**
     * Extract product description from content
     */
    private static function extract_product_description($content, $product_name) {
        // Find the first paragraph after the product heading
        $pattern = '/<h[23][^>]*>[^<]*' . preg_quote($product_name, '/') . '[^<]*<\/h[23]>\s*<p>([^<]+)<\/p>/i';
        if (preg_match($pattern, $content, $match)) {
            return wp_strip_all_tags($match[1]);
        }
        return '';
    }
    
    /**
     * Extract pros and cons for a product
     */
    private static function extract_pros_cons($content, $product_name, $type = 'pros') {
        $items = array();
        
        // Look for lists with pros/cons markers
        $markers = $type === 'pros' 
            ? array('✓', '✔', '👍', 'Prós', 'Vantagens', 'Pontos positivos')
            : array('✗', '✘', '👎', 'Contras', 'Desvantagens', 'Pontos negativos');
        
        foreach ($markers as $marker) {
            $pattern = '/' . preg_quote($marker, '/') . '\s*:?\s*([^<\n]+)/i';
            if (preg_match_all($pattern, $content, $matches)) {
                foreach ($matches[1] as $item) {
                    $clean_item = trim(wp_strip_all_tags($item));
                    if (strlen($clean_item) > 3 && strlen($clean_item) < 200) {
                        $items[] = $clean_item;
                    }
                }
            }
        }
        
        return array_slice(array_unique($items), 0, 5);
    }
    
    /**
     * Add ItemList schema for comparison articles
     */
    private static function add_comparison_schema($post, $products) {
        $list_items = array();
        $position = 1;
        
        foreach ($products as $product) {
            $list_items[] = array(
                '@type' => 'ListItem',
                'position' => $position,
                'item' => array(
                    '@type' => 'Product',
                    'name' => $product['name'],
                    'description' => $product['description'] ?? '',
                ),
            );
            $position++;
        }
        
        $comparison_schema = array(
            '@context' => 'https://schema.org',
            '@type' => 'ItemList',
            'name' => get_the_title($post->ID),
            'description' => get_the_excerpt($post->ID),
            'numberOfItems' => count($products),
            'itemListElement' => $list_items,
        );
        
        echo '<script type="application/ld+json">' . wp_json_encode($comparison_schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . '</script>' . "\n";
    }
}

// Initialize
CFRDM_Indexing::init();
