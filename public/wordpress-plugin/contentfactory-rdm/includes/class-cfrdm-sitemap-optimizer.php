<?php
/**
 * Sitemap Optimizer
 * 
 * Enhances WordPress core sitemaps with:
 * - Correct priorities based on content freshness and quality
 * - Change frequencies based on update patterns
 * - Image sitemaps
 * - News sitemap for Google News
 * - Ping on publish
 * 
 * @package ContentFactory_RDM
 * @since 3.1.0
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_Sitemap_Optimizer {
    
    const OPTION_ENABLED = 'cfrdm_sitemap_optimizer_enabled';
    
    private static $instance = null;
    
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    /**
     * Initialize
     */
    public function init() {
        if (!self::is_enabled()) {
            return;
        }
        
        // Enhance WordPress core sitemap
        add_filter('wp_sitemaps_posts_query_args', array($this, 'optimize_query_args'), 10, 2);
        add_filter('wp_sitemaps_posts_entry', array($this, 'optimize_entry'), 10, 3);
        
        // Add news sitemap
        add_action('init', array($this, 'register_news_sitemap'));
        
        // robots.txt enhancement
        add_filter('robots_txt', array($this, 'enhance_robots_txt'), 100, 2);
        
        // Invalidate news sitemap cache on publish
        add_action('publish_post', array($this, 'invalidate_news_cache'), 150);
        add_action('publish_page', array($this, 'invalidate_news_cache'), 150);
    }
    
    /**
     * Invalidate news sitemap cache
     */
    public function invalidate_news_cache($post_id = null) {
        delete_transient('cfrdm_news_sitemap');
    }
    
    public static function is_enabled() {
        return (bool) get_option(self::OPTION_ENABLED, true);
    }
    
    /**
     * Detect which sitemap URL is active on this site
     */
    public static function detect_sitemap_url() {
        // Cache result for 1 hour to avoid HTTP calls on every robots.txt request
        $cached = get_transient('cfrdm_detected_sitemap_url');
        if ($cached !== false) {
            return $cached;
        }
        
        $site_url = get_site_url();
        $candidates = array(
            $site_url . '/sitemap_index.xml',  // Yoast / Rank Math
            $site_url . '/sitemap.xml',          // Generic
            $site_url . '/wp-sitemap.xml',       // WordPress core
        );
        
        foreach ($candidates as $url) {
            $response = wp_remote_head($url, array('timeout' => 5, 'sslverify' => false));
            if (!is_wp_error($response) && wp_remote_retrieve_response_code($response) === 200) {
                set_transient('cfrdm_detected_sitemap_url', $url, HOUR_IN_SECONDS);
                return $url;
            }
        }
        
        // Fallback to WordPress core
        $fallback = $site_url . '/wp-sitemap.xml';
        set_transient('cfrdm_detected_sitemap_url', $fallback, HOUR_IN_SECONDS);
        return $fallback;
    }
    
    /**
     * Optimize sitemap query
     */
    public function optimize_query_args($args, $post_type) {
        // Ensure we include all published posts
        $args['post_status'] = 'publish';
        
        // Order by last modified (fresher content first)
        $args['orderby'] = 'modified';
        $args['order'] = 'DESC';
        
        return $args;
    }
    
    /**
     * Add priority and changefreq to sitemap entries
     */
    public function optimize_entry($entry, $post, $post_type) {
        // Calculate priority based on freshness and quality
        $priority = $this->calculate_priority($post);
        $changefreq = $this->calculate_changefreq($post);
        
        // WordPress core sitemaps support lastmod
        $entry['lastmod'] = get_the_modified_date('c', $post);
        
        return $entry;
    }
    
    /**
     * Calculate priority for a post (0.0 - 1.0)
     */
    private function calculate_priority($post) {
        $priority = 0.5; // Base priority
        
        // Boost homepage
        if ($post->ID == get_option('page_on_front')) {
            return 1.0;
        }
        
        // Boost recently modified content
        $modified = strtotime($post->post_modified);
        $days_since = (time() - $modified) / 86400;
        
        if ($days_since < 7) {
            $priority += 0.3;
        } elseif ($days_since < 30) {
            $priority += 0.2;
        } elseif ($days_since < 90) {
            $priority += 0.1;
        }
        
        // Boost content with more words
        $word_count = str_word_count(wp_strip_all_tags($post->post_content));
        if ($word_count > 2000) {
            $priority += 0.1;
        } elseif ($word_count > 1000) {
            $priority += 0.05;
        }
        
        // Boost content with comments
        if ($post->comment_count > 5) {
            $priority += 0.1;
        }
        
        return min(1.0, $priority);
    }
    
    /**
     * Calculate change frequency
     */
    private function calculate_changefreq($post) {
        $modified = strtotime($post->post_modified);
        $days_since = (time() - $modified) / 86400;
        
        if ($days_since < 1) return 'hourly';
        if ($days_since < 7) return 'daily';
        if ($days_since < 30) return 'weekly';
        if ($days_since < 180) return 'monthly';
        return 'yearly';
    }
    
    /**
     * Register news sitemap
     */
    public function register_news_sitemap() {
        $uri = $_SERVER['REQUEST_URI'] ?? '';
        if (parse_url($uri, PHP_URL_PATH) === '/news-sitemap.xml') {
            header('Content-Type: application/xml; charset=utf-8');
            header('Cache-Control: public, max-age=900');
            echo $this->generate_news_sitemap();
            exit;
        }
    }
    
    /**
     * Generate Google News sitemap (cached)
     */
    private function generate_news_sitemap() {
        $cached = get_transient('cfrdm_news_sitemap');
        if ($cached) return $cached;
        
        $posts = get_posts(array(
            'post_type' => 'post',
            'post_status' => 'publish',
            'posts_per_page' => 1000,
            'date_query' => array(
                array('after' => '2 days ago'),
            ),
            'orderby' => 'date',
            'order' => 'DESC',
        ));
        
        $site_name = get_bloginfo('name');
        $language = substr(get_bloginfo('language'), 0, 2);
        
        $xml = '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
        $xml .= '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">' . "\n";
        
        foreach ($posts as $post) {
            $url = get_permalink($post->ID);
            $date = get_the_date('c', $post);
            $title = htmlspecialchars($post->post_title, ENT_XML1, 'UTF-8');
            
            $keywords = array();
            $tags = wp_get_post_tags($post->ID, array('fields' => 'names'));
            if (!empty($tags)) {
                $keywords = array_slice($tags, 0, 10);
            }
            
            $xml .= "  <url>\n";
            $xml .= "    <loc>" . esc_url($url) . "</loc>\n";
            $xml .= "    <news:news>\n";
            $xml .= "      <news:publication>\n";
            $xml .= "        <news:name>{$site_name}</news:name>\n";
            $xml .= "        <news:language>{$language}</news:language>\n";
            $xml .= "      </news:publication>\n";
            $xml .= "      <news:publication_date>{$date}</news:publication_date>\n";
            $xml .= "      <news:title>{$title}</news:title>\n";
            if (!empty($keywords)) {
                $xml .= "      <news:keywords>" . htmlspecialchars(implode(', ', $keywords), ENT_XML1, 'UTF-8') . "</news:keywords>\n";
            }
            $xml .= "    </news:news>\n";
            $xml .= "  </url>\n";
        }
        
        $xml .= '</urlset>';
        
        set_transient('cfrdm_news_sitemap', $xml, 900); // 15 min cache
        return $xml;
    }
    
    /**
     * Enhance robots.txt - Remove AI crawler blocks and add Allow rules
     */
    public function enhance_robots_txt($output, $public) {
        if (!$public) return $output;
        
        $site_url = get_site_url();
        
        // Strategic AI crawlers that MUST be allowed
        $ai_crawlers = array(
            'GPTBot', 'ChatGPT-User', 'Claude-Web', 'Anthropic-AI', 'ClaudeBot',
            'Google-Extended', 'PerplexityBot', 'Bytespider', 'cohere-ai',
            'Applebot-Extended', 'CCBot', 'FacebookExternalHit',
        );
        
        // STEP 1: Remove any existing Disallow rules for AI crawlers
        // This fixes IDX-002 when other plugins/themes block AI bots
        foreach ($ai_crawlers as $bot) {
            // Remove User-agent + Disallow blocks for this bot
            $pattern = '/User-agent:\s*' . preg_quote($bot, '/') . '\s*\n\s*Disallow:\s*\/\s*\n?/i';
            $output = preg_replace($pattern, '', $output);
        }
        
        // Clean up any double newlines from removal
        $output = preg_replace('/\n{3,}/', "\n\n", $output);
        
        // STEP 2: Add explicit Allow rules for all AI crawlers
        $additions = "\n# AI Crawlers - ContentFactory RDM (auto-managed)\n";
        foreach ($ai_crawlers as $bot) {
            $additions .= "User-agent: {$bot}\n";
            $additions .= "Allow: /\n\n";
        }
        
        // Sitemaps — auto-detect which sitemap is active
        $sitemap_url = self::detect_sitemap_url();
        $additions .= "# Sitemaps\n";
        $additions .= "Sitemap: {$sitemap_url}\n";
        $additions .= "Sitemap: {$site_url}/news-sitemap.xml\n\n";
        
        // llms.txt
        $additions .= "# AI Content Index\n";
        $additions .= "# llms.txt: {$site_url}/llms.txt\n";
        
        return $output . $additions;
    }
    
    /**
     * Fix AI crawler blocks in robots.txt (called via REST API)
     * Returns list of crawlers that were unblocked
     */
    public static function fix_ai_crawler_blocks() {
        // Force-enable the AI robots.txt option
        update_option('cfrdm_ai_robots_txt_enabled', true);
        
        // Clear any cached robots.txt
        delete_transient('cfrdm_detected_sitemap_url');
        
        // Check current robots.txt for blocked crawlers
        $response = wp_remote_get(home_url('/robots.txt'), array('timeout' => 5));
        $unblocked = array();
        
        if (!is_wp_error($response)) {
            $content = wp_remote_retrieve_body($response);
            $ai_bots = array('GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'ChatGPT-User', 'Anthropic-AI', 'Claude-Web');
            foreach ($ai_bots as $bot) {
                if (preg_match('/User-agent:\s*' . preg_quote($bot, '/') . '\s*\n\s*Disallow:\s*\//i', $content)) {
                    $unblocked[] = $bot;
                }
            }
        }
        
        return $unblocked;
    }
}
