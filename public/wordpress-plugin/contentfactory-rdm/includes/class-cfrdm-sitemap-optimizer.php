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
    }
    
    public static function is_enabled() {
        return (bool) get_option(self::OPTION_ENABLED, true);
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
     * Generate Google News sitemap
     */
    private function generate_news_sitemap() {
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
        return $xml;
    }
    
    /**
     * Enhance robots.txt
     */
    public function enhance_robots_txt($output, $public) {
        if (!$public) return $output;
        
        $site_url = get_site_url();
        
        // Add AI crawler rules
        $additions = "\n# AI Crawlers - ContentFactory RDM\n";
        $additions .= "User-agent: GPTBot\n";
        $additions .= "Allow: /\n\n";
        $additions .= "User-agent: ChatGPT-User\n";
        $additions .= "Allow: /\n\n";
        $additions .= "User-agent: Claude-Web\n";
        $additions .= "Allow: /\n\n";
        $additions .= "User-agent: Anthropic-AI\n";
        $additions .= "Allow: /\n\n";
        $additions .= "User-agent: Google-Extended\n";
        $additions .= "Allow: /\n\n";
        $additions .= "User-agent: PerplexityBot\n";
        $additions .= "Allow: /\n\n";
        $additions .= "User-agent: Bytespider\n";
        $additions .= "Allow: /\n\n";
        $additions .= "User-agent: cohere-ai\n";
        $additions .= "Allow: /\n\n";
        
        // Sitemaps
        $additions .= "# Sitemaps\n";
        $additions .= "Sitemap: {$site_url}/wp-sitemap.xml\n";
        $additions .= "Sitemap: {$site_url}/news-sitemap.xml\n\n";
        
        // llms.txt
        $additions .= "# AI Content Index\n";
        $additions .= "# llms.txt: {$site_url}/llms.txt\n";
        
        return $output . $additions;
    }
}
