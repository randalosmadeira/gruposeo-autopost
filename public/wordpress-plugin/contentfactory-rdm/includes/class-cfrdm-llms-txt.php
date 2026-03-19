<?php
/**
 * llms.txt + AI-Friendly Headers
 * 
 * Makes content discoverable by AI systems (ChatGPT, Claude, Gemini, Perplexity):
 * - Generates /llms.txt with site overview and content structure
 * - Adds X-Robots-Tag headers for AI crawlers
 * - Adds structured data for AI consumption
 * - Generates /llms-full.txt with complete content index
 * 
 * @package ContentFactory_RDM
 * @since 3.1.0
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_LLMS_Txt {
    
    const OPTION_ENABLED = 'cfrdm_llms_txt_enabled';
    const CRON_HOOK = 'cfrdm_regenerate_llms_txt';
    
    private static $instance = null;
    
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    /**
     * Initialize llms.txt
     */
    public function init() {
        if (!self::is_enabled()) {
            // Force-enable on VPS — llms.txt is critical for AI discovery
            update_option(self::OPTION_ENABLED, true);
        }
        
        // Serve llms.txt and llms-full.txt
        add_action('init', array($this, 'serve_files'));
        
        // Add AI-friendly headers to all pages
        add_action('send_headers', array($this, 'add_ai_headers'));
        
        // Add meta tags to head
        add_action('wp_head', array($this, 'add_ai_meta_tags'), 1);
        
        // Regenerate on post publish
        add_action('publish_post', array($this, 'invalidate_and_regenerate'));
        add_action('publish_page', array($this, 'invalidate_and_regenerate'));
        
        // Schedule daily regeneration
        if (!wp_next_scheduled(self::CRON_HOOK)) {
            wp_schedule_event(time(), 'daily', self::CRON_HOOK);
        }
        add_action(self::CRON_HOOK, array($this, 'regenerate'));
        
        // REST API endpoint for remote regeneration (SEO Agent)
        add_action('rest_api_init', array($this, 'register_rest_routes'));
        
        // Auto-generate physical files if they don't exist
        $this->ensure_physical_files();
    }
    
    /**
     * Register REST routes for llms.txt management
     */
    public function register_rest_routes() {
        register_rest_route('cfrdm/v1', '/llms-txt/regenerate', array(
            'methods' => 'POST',
            'callback' => array($this, 'rest_regenerate'),
            'permission_callback' => array('CFRDM_API', 'verify_api_key'),
        ));
        
        register_rest_route('cfrdm/v1', '/llms-txt/status', array(
            'methods' => 'GET',
            'callback' => array($this, 'rest_status'),
            'permission_callback' => array('CFRDM_API', 'verify_api_key'),
        ));
    }
    
    /**
     * REST: Force regenerate llms.txt
     */
    public function rest_regenerate($request) {
        $this->regenerate();
        $llms_exists = file_exists(ABSPATH . 'llms.txt');
        $llms_full_exists = file_exists(ABSPATH . 'llms-full.txt');
        
        return new \WP_REST_Response(array(
            'success' => true,
            'llms_txt' => $llms_exists,
            'llms_full_txt' => $llms_full_exists,
            'llms_txt_size' => $llms_exists ? filesize(ABSPATH . 'llms.txt') : 0,
            'llms_full_txt_size' => $llms_full_exists ? filesize(ABSPATH . 'llms-full.txt') : 0,
            'message' => 'llms.txt regenerado com sucesso',
        ), 200);
    }
    
    /**
     * REST: Check llms.txt status
     */
    public function rest_status($request) {
        $llms_path = ABSPATH . 'llms.txt';
        $llms_full_path = ABSPATH . 'llms-full.txt';
        $llms_exists = file_exists($llms_path);
        $llms_full_exists = file_exists($llms_full_path);
        
        return new \WP_REST_Response(array(
            'enabled' => self::is_enabled(),
            'llms_txt' => array(
                'exists' => $llms_exists,
                'size' => $llms_exists ? filesize($llms_path) : 0,
                'modified' => $llms_exists ? date('c', filemtime($llms_path)) : null,
                'url' => get_site_url() . '/llms.txt',
            ),
            'llms_full_txt' => array(
                'exists' => $llms_full_exists,
                'size' => $llms_full_exists ? filesize($llms_full_path) : 0,
                'modified' => $llms_full_exists ? date('c', filemtime($llms_full_path)) : null,
                'url' => get_site_url() . '/llms-full.txt',
            ),
            'cache' => array(
                'llms_cached' => (bool) get_transient('cfrdm_llms_txt'),
                'llms_full_cached' => (bool) get_transient('cfrdm_llms_full_txt'),
            ),
        ), 200);
    }
    
    /**
     * Invalidate cache and regenerate physical files
     */
    public function invalidate_and_regenerate() {
        $this->invalidate_cache();
        // Schedule immediate regeneration to avoid slowing down publish
        if (!wp_next_scheduled('cfrdm_llms_txt_immediate_regen')) {
            wp_schedule_single_event(time() + 10, 'cfrdm_llms_txt_immediate_regen');
        }
    }
    
    /**
     * Ensure physical files exist on disk (VPS fallback)
     */
    private function ensure_physical_files() {
        if (!file_exists(ABSPATH . 'llms.txt') || !file_exists(ABSPATH . 'llms-full.txt')) {
            // Don't block init — schedule for next tick
            if (!wp_next_scheduled('cfrdm_llms_txt_immediate_regen')) {
                wp_schedule_single_event(time() + 5, 'cfrdm_llms_txt_immediate_regen');
            }
        }
        add_action('cfrdm_llms_txt_immediate_regen', array($this, 'regenerate'));
    }
    
    public static function is_enabled() {
        return (bool) get_option(self::OPTION_ENABLED, true);
    }
    
    /**
     * Serve llms.txt files
     */
    public function serve_files() {
        $uri = $_SERVER['REQUEST_URI'] ?? '';
        $path = parse_url($uri, PHP_URL_PATH);
        
        if ($path === '/llms.txt') {
            header('Content-Type: text/plain; charset=utf-8');
            header('Cache-Control: public, max-age=3600');
            echo $this->generate_llms_txt();
            exit;
        }
        
        if ($path === '/llms-full.txt') {
            header('Content-Type: text/plain; charset=utf-8');
            header('Cache-Control: public, max-age=3600');
            echo $this->generate_llms_full_txt();
            exit;
        }
    }
    
    /**
     * Generate llms.txt content
     */
    public function generate_llms_txt() {
        $cached = get_transient('cfrdm_llms_txt');
        if ($cached) return $cached;
        
        $site_name = get_bloginfo('name');
        $site_desc = get_bloginfo('description');
        $site_url = get_site_url();
        $language = get_bloginfo('language');
        
        $output = "# {$site_name}\n\n";
        $output .= "> {$site_desc}\n\n";
        $output .= "Website: {$site_url}\n";
        $output .= "Language: {$language}\n\n";
        
        // Categories
        $categories = get_categories(array('hide_empty' => true, 'number' => 20));
        if (!empty($categories)) {
            $output .= "## Topics\n\n";
            foreach ($categories as $cat) {
                $output .= "- [{$cat->name}]({$site_url}/category/{$cat->slug}/): {$cat->description}\n";
            }
            $output .= "\n";
        }
        
        // Recent/Popular content
        $recent = get_posts(array(
            'post_type' => 'post',
            'post_status' => 'publish',
            'posts_per_page' => 30,
            'orderby' => 'date',
            'order' => 'DESC',
        ));
        
        if (!empty($recent)) {
            $output .= "## Recent Articles\n\n";
            foreach ($recent as $post) {
                $url = get_permalink($post->ID);
                $excerpt = wp_strip_all_tags($post->post_excerpt ?: wp_trim_words($post->post_content, 25));
                $output .= "- [{$post->post_title}]({$url}): {$excerpt}\n";
            }
            $output .= "\n";
        }
        
        // Pages
        $pages = get_posts(array(
            'post_type' => 'page',
            'post_status' => 'publish',
            'posts_per_page' => 10,
            'orderby' => 'menu_order',
            'order' => 'ASC',
        ));
        
        if (!empty($pages)) {
            $output .= "## Pages\n\n";
            foreach ($pages as $page) {
                $url = get_permalink($page->ID);
                $output .= "- [{$page->post_title}]({$url})\n";
            }
            $output .= "\n";
        }
        
        $output .= "## Full Content Index\n\n";
        $output .= "- [Complete article index]({$site_url}/llms-full.txt)\n";
        
        set_transient('cfrdm_llms_txt', $output, 3600);
        return $output;
    }
    
    /**
     * Generate llms-full.txt with complete content
     */
    public function generate_llms_full_txt() {
        $cached = get_transient('cfrdm_llms_full_txt');
        if ($cached) return $cached;
        
        $site_name = get_bloginfo('name');
        $output = "# {$site_name} - Complete Content Index\n\n";
        
        $posts = get_posts(array(
            'post_type' => array('post', 'page'),
            'post_status' => 'publish',
            'posts_per_page' => 200,
            'orderby' => 'date',
            'order' => 'DESC',
        ));
        
        foreach ($posts as $post) {
            $url = get_permalink($post->ID);
            $date = get_the_date('Y-m-d', $post);
            $content_plain = wp_strip_all_tags($post->post_content);
            $content_plain = trim(preg_replace('/\s+/', ' ', $content_plain));
            $summary = mb_substr($content_plain, 0, 500);
            
            $categories = wp_get_post_categories($post->ID, array('fields' => 'names'));
            $tags = wp_get_post_tags($post->ID, array('fields' => 'names'));
            
            $output .= "---\n\n";
            $output .= "## {$post->post_title}\n\n";
            $output .= "URL: {$url}\n";
            $output .= "Date: {$date}\n";
            $output .= "Type: {$post->post_type}\n";
            if (!empty($categories)) {
                $output .= "Categories: " . implode(', ', $categories) . "\n";
            }
            if (!empty($tags)) {
                $output .= "Tags: " . implode(', ', $tags) . "\n";
            }
            $output .= "\n{$summary}\n\n";
        }
        
        set_transient('cfrdm_llms_full_txt', $output, 3600);
        return $output;
    }
    
    /**
     * Add AI-friendly HTTP headers
     */
    public function add_ai_headers() {
        // Allow all AI crawlers explicitly
        header('X-Robots-Tag: all');
        
        // Signal AI-friendliness
        header('X-Content-Type-Options: nosniff');
        
        // Link to llms.txt (discoverable by GPTBot, ClaudeBot, PerplexityBot, etc.)
        $site_url = get_site_url();
        header("Link: <{$site_url}/llms.txt>; rel=\"ai-content-index\"");
        header("Link: <{$site_url}/llms-full.txt>; rel=\"ai-content-full\"", false);
        
        // Explicit AI bot access signals
        header('X-AI-Content-Index: ' . $site_url . '/llms.txt');
        header('X-AI-Discoverable: true');
    }
    
    /**
     * Add meta tags for AI discoverability
     */
    public function add_ai_meta_tags() {
        $site_url = get_site_url();
        
        echo "<!-- ContentFactory AI Discovery -->\n";
        echo '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">' . "\n";
        echo '<link rel="alternate" type="text/plain" href="' . esc_url($site_url . '/llms.txt') . '" title="LLM Content Index">' . "\n";
        
        // Structured data for current page
        if (is_singular()) {
            global $post;
            if ($post) {
                $this->output_article_structured_data($post);
            }
        }
    }
    
    /**
     * Output enhanced structured data for AI crawlers
     */
    private function output_article_structured_data($post) {
        $url = get_permalink($post->ID);
        $author = get_the_author_meta('display_name', $post->post_author);
        $published = get_the_date('c', $post);
        $modified = get_the_modified_date('c', $post);
        $thumb = get_the_post_thumbnail_url($post->ID, 'full');
        $excerpt = wp_strip_all_tags($post->post_excerpt ?: wp_trim_words($post->post_content, 40));
        
        $schema = array(
            '@context' => 'https://schema.org',
            '@type' => 'Article',
            'headline' => $post->post_title,
            'description' => $excerpt,
            'url' => $url,
            'datePublished' => $published,
            'dateModified' => $modified,
            'author' => array(
                '@type' => 'Person',
                'name' => $author,
            ),
            'publisher' => array(
                '@type' => 'Organization',
                'name' => get_bloginfo('name'),
                'url' => get_site_url(),
            ),
            'mainEntityOfPage' => array(
                '@type' => 'WebPage',
                '@id' => $url,
            ),
        );
        
        if ($thumb) {
            $schema['image'] = $thumb;
        }
        
        $categories = wp_get_post_categories($post->ID, array('fields' => 'names'));
        if (!empty($categories)) {
            $schema['articleSection'] = $categories[0];
            $schema['keywords'] = implode(', ', $categories);
        }
        
        $tags = wp_get_post_tags($post->ID, array('fields' => 'names'));
        if (!empty($tags)) {
            $schema['keywords'] = implode(', ', $tags);
        }
        
        // Word count
        $word_count = str_word_count(wp_strip_all_tags($post->post_content));
        $schema['wordCount'] = $word_count;
        
        echo '<script type="application/ld+json">' . wp_json_encode($schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . '</script>' . "\n";
    }
    
    /**
     * Invalidate cache on content change
     */
    public function invalidate_cache() {
        delete_transient('cfrdm_llms_txt');
        delete_transient('cfrdm_llms_full_txt');
    }
    
    /**
     * Regenerate cached files and write physical fallback files
     */
    public function regenerate() {
        $this->invalidate_cache();
        $llms = $this->generate_llms_txt();
        $llms_full = $this->generate_llms_full_txt();
        
        // Write physical files as fallback for cached/CDN environments
        $this->write_physical_file('llms.txt', $llms);
        $this->write_physical_file('llms-full.txt', $llms_full);
    }
    
    /**
     * Write a physical file to the WordPress root as CDN/cache fallback
     */
    private function write_physical_file($filename, $content) {
        if (empty($content)) return;
        
        $root = ABSPATH;
        $filepath = $root . $filename;
        
        // Only write if we have permission
        if (!is_writable($root)) {
            return;
        }
        
        @file_put_contents($filepath, $content);
    }
}
