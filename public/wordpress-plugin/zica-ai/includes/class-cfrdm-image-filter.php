<?php
/**
 * Image Filter - Advanced image filtering to avoid logos and small images
 * 
 * Features:
 * - Detect and skip logos/icons
 * - Filter images by minimum dimensions
 * - Custom CSS selectors for image extraction
 * - Image quality scoring
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_Image_Filter {
    
    /**
     * Default minimum dimensions
     */
    const MIN_WIDTH = 300;
    const MIN_HEIGHT = 200;
    
    /**
     * Patterns that indicate a logo or icon
     */
    private static $logo_patterns = array(
        'logo',
        'icon',
        'favicon',
        'sprite',
        'button',
        'badge',
        'avatar',
        'thumbnail-small',
        'emoji',
        'arrow',
        'chevron',
        'social',
        'share',
        'like',
        'follow',
        'subscribe',
        'banner-ad',
        'advertisement',
        'tracking',
        'pixel',
        'spacer',
        'placeholder',
        'loading',
        'spinner',
    );
    
    /**
     * File extensions that are typically logos/icons
     */
    private static $icon_extensions = array(
        'ico',
        'svg', // Often used for icons, but not always
    );
    
    /**
     * Filter an array of images to remove logos and small images
     * 
     * @param array $images Array of image URLs or data
     * @param array $options Filter options
     * @return array Filtered images
     */
    public static function filter_images($images, $options = array()) {
        $defaults = array(
            'avoid_logo' => true,
            'min_width' => self::MIN_WIDTH,
            'min_height' => self::MIN_HEIGHT,
            'check_dimensions' => true,
            'max_images' => 10,
        );
        
        $options = wp_parse_args($options, $defaults);
        $filtered = array();
        
        foreach ($images as $image) {
            // Handle both URL strings and image data arrays
            $url = is_array($image) ? ($image['url'] ?? $image['src'] ?? '') : $image;
            
            if (empty($url)) {
                continue;
            }
            
            // Check for logo patterns
            if ($options['avoid_logo'] && self::is_likely_logo($url)) {
                CFRDM_Logger::info('image_filter', 'Imagem ignorada (padrão de logo)', array(
                    'url' => $url,
                ));
                continue;
            }
            
            // Check dimensions if requested
            if ($options['check_dimensions']) {
                $dimensions = self::get_image_dimensions($url);
                
                if ($dimensions && (
                    $dimensions['width'] < $options['min_width'] ||
                    $dimensions['height'] < $options['min_height']
                )) {
                    CFRDM_Logger::info('image_filter', 'Imagem ignorada (dimensões insuficientes)', array(
                        'url' => $url,
                        'width' => $dimensions['width'],
                        'height' => $dimensions['height'],
                        'min_width' => $options['min_width'],
                        'min_height' => $options['min_height'],
                    ));
                    continue;
                }
            }
            
            $filtered[] = $image;
            
            // Limit number of images
            if (count($filtered) >= $options['max_images']) {
                break;
            }
        }
        
        return $filtered;
    }
    
    /**
     * Check if an image URL is likely a logo
     * 
     * @param string $url Image URL
     * @return bool True if likely a logo
     */
    public static function is_likely_logo($url) {
        $url_lower = strtolower($url);
        
        // Check URL patterns
        foreach (self::$logo_patterns as $pattern) {
            if (strpos($url_lower, $pattern) !== false) {
                return true;
            }
        }
        
        // Check file extension
        $extension = strtolower(pathinfo(parse_url($url, PHP_URL_PATH), PATHINFO_EXTENSION));
        if (in_array($extension, self::$icon_extensions)) {
            // SVGs might be logos, but not always - check URL for logo patterns
            if ($extension === 'svg') {
                // Only flag as logo if URL contains logo-related terms
                $logo_terms = array('logo', 'icon', 'favicon', 'brand');
                foreach ($logo_terms as $term) {
                    if (strpos($url_lower, $term) !== false) {
                        return true;
                    }
                }
                return false;
            }
            return true;
        }
        
        // Check for common logo dimensions in URL (e.g., 50x50, 100x100)
        if (preg_match('/(\d+)x(\d+)/', $url, $matches)) {
            $width = intval($matches[1]);
            $height = intval($matches[2]);
            
            // Very small or square images are often logos
            if ($width <= 100 && $height <= 100) {
                return true;
            }
            
            // 1:1 aspect ratio small images
            if ($width === $height && $width < 200) {
                return true;
            }
        }
        
        // Check for data URIs (often used for tiny images/icons)
        if (strpos($url, 'data:image') === 0) {
            // Check if it's a very short data URI (tiny image)
            if (strlen($url) < 1000) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Get image dimensions without downloading the full image
     * 
     * @param string $url Image URL
     * @return array|null Array with 'width' and 'height', or null
     */
    public static function get_image_dimensions($url) {
        // First, try to get dimensions from URL
        if (preg_match('/[-_](\d+)x(\d+)[.-]/', $url, $matches)) {
            return array(
                'width' => intval($matches[1]),
                'height' => intval($matches[2]),
            );
        }
        
        // Try HEAD request for Content-Length first (to avoid large downloads)
        $head_response = wp_remote_head($url, array(
            'timeout' => 5,
            'sslverify' => false,
        ));
        
        if (is_wp_error($head_response)) {
            return null;
        }
        
        // Download just enough to get dimensions
        $response = wp_remote_get($url, array(
            'timeout' => 10,
            'sslverify' => false,
            'headers' => array(
                'Range' => 'bytes=0-65535', // First 64KB should be enough for headers
            ),
        ));
        
        if (is_wp_error($response)) {
            return null;
        }
        
        $body = wp_remote_retrieve_body($response);
        
        if (empty($body)) {
            return null;
        }
        
        // Save temporarily and get dimensions
        $tmp_file = wp_tempnam('cfrdm_img');
        file_put_contents($tmp_file, $body);
        
        $size = @getimagesize($tmp_file);
        @unlink($tmp_file);
        
        if ($size && isset($size[0]) && isset($size[1])) {
            return array(
                'width' => $size[0],
                'height' => $size[1],
            );
        }
        
        return null;
    }
    
    /**
     * Extract images from HTML content using CSS selector
     * 
     * @param string $html HTML content
     * @param string $selector CSS selector (optional)
     * @return array Array of image data
     */
    public static function extract_images_from_html($html, $selector = '') {
        if (empty($html)) {
            return array();
        }
        
        $images = array();
        
        // Create DOM document
        $doc = new DOMDocument();
        @$doc->loadHTML(mb_convert_encoding($html, 'HTML-ENTITIES', 'UTF-8'));
        
        $xpath = new DOMXPath($doc);
        
        // If custom selector provided, try to convert to XPath
        if (!empty($selector)) {
            $xpath_query = self::css_to_xpath($selector);
            $nodes = @$xpath->query($xpath_query);
        } else {
            // Default: all img tags
            $nodes = $doc->getElementsByTagName('img');
        }
        
        if ($nodes) {
            foreach ($nodes as $node) {
                $src = '';
                $alt = '';
                
                // Get src (check data-src for lazy loading too)
                if ($node->hasAttribute('src')) {
                    $src = $node->getAttribute('src');
                }
                if (empty($src) && $node->hasAttribute('data-src')) {
                    $src = $node->getAttribute('data-src');
                }
                if (empty($src) && $node->hasAttribute('data-lazy-src')) {
                    $src = $node->getAttribute('data-lazy-src');
                }
                
                if (empty($src)) {
                    continue;
                }
                
                // Get alt text
                if ($node->hasAttribute('alt')) {
                    $alt = $node->getAttribute('alt');
                }
                
                // Get dimensions from attributes
                $width = $node->hasAttribute('width') ? intval($node->getAttribute('width')) : null;
                $height = $node->hasAttribute('height') ? intval($node->getAttribute('height')) : null;
                
                $images[] = array(
                    'src' => $src,
                    'alt' => $alt,
                    'width' => $width,
                    'height' => $height,
                );
            }
        }
        
        return $images;
    }
    
    /**
     * Convert simple CSS selector to XPath
     * 
     * @param string $selector CSS selector
     * @return string XPath query
     */
    private static function css_to_xpath($selector) {
        $selector = trim($selector);
        
        // Handle simple cases
        if (preg_match('/^([a-z]+)$/i', $selector, $matches)) {
            // Tag name only: "img"
            return "//{$matches[1]}";
        }
        
        if (preg_match('/^\.([a-z0-9_-]+)$/i', $selector, $matches)) {
            // Class only: ".featured-image"
            return "//*[contains(@class, '{$matches[1]}')]";
        }
        
        if (preg_match('/^#([a-z0-9_-]+)$/i', $selector, $matches)) {
            // ID only: "#main-image"
            return "//*[@id='{$matches[1]}']";
        }
        
        if (preg_match('/^([a-z]+)\.([a-z0-9_-]+)$/i', $selector, $matches)) {
            // Tag with class: "img.featured"
            return "//{$matches[1]}[contains(@class, '{$matches[2]}')]";
        }
        
        if (preg_match('/^([a-z]+)#([a-z0-9_-]+)$/i', $selector, $matches)) {
            // Tag with ID: "img#hero"
            return "//{$matches[1]}[@id='{$matches[2]}']";
        }
        
        // For complex selectors, fallback to all images
        return "//img";
    }
    
    /**
     * Find the best featured image from a list
     * 
     * @param array $images Array of images
     * @param array $options Selection options
     * @return array|null Best image or null
     */
    public static function find_best_featured_image($images, $options = array()) {
        $defaults = array(
            'avoid_logo' => true,
            'min_width' => 600,
            'min_height' => 400,
            'prefer_landscape' => true,
        );
        
        $options = wp_parse_args($options, $defaults);
        
        // Filter images first
        $filtered = self::filter_images($images, array(
            'avoid_logo' => $options['avoid_logo'],
            'min_width' => $options['min_width'],
            'min_height' => $options['min_height'],
            'check_dimensions' => true,
        ));
        
        if (empty($filtered)) {
            return null;
        }
        
        // Score each image
        $scored = array();
        foreach ($filtered as $image) {
            $url = is_array($image) ? ($image['url'] ?? $image['src'] ?? '') : $image;
            $dimensions = self::get_image_dimensions($url);
            
            $score = 0;
            
            if ($dimensions) {
                // Larger images score higher
                $score += ($dimensions['width'] + $dimensions['height']) / 100;
                
                // Prefer landscape for featured images
                if ($options['prefer_landscape'] && $dimensions['width'] > $dimensions['height']) {
                    $score += 5;
                }
                
                // Ideal aspect ratio for featured images (16:9 or similar)
                $ratio = $dimensions['width'] / max(1, $dimensions['height']);
                if ($ratio >= 1.5 && $ratio <= 2) {
                    $score += 10;
                }
            }
            
            // URLs with "featured" or "hero" in them score higher
            $url_lower = strtolower($url);
            if (strpos($url_lower, 'featured') !== false || 
                strpos($url_lower, 'hero') !== false ||
                strpos($url_lower, 'main') !== false) {
                $score += 5;
            }
            
            $scored[] = array(
                'image' => $image,
                'score' => $score,
            );
        }
        
        // Sort by score descending
        usort($scored, function($a, $b) {
            return $b['score'] - $a['score'];
        });
        
        return $scored[0]['image'] ?? null;
    }
    
    /**
     * Add custom logo patterns
     * 
     * @param array $patterns Patterns to add
     */
    public static function add_logo_patterns($patterns) {
        self::$logo_patterns = array_merge(self::$logo_patterns, $patterns);
    }
    
    /**
     * Get current logo patterns
     * 
     * @return array Current patterns
     */
    public static function get_logo_patterns() {
        return self::$logo_patterns;
    }
}
