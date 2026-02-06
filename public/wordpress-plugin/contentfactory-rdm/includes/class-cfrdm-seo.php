<?php
/**
 * SEO Handler - Multi-plugin SEO meta management
 * 
 * Supports:
 * - Yoast SEO
 * - Rank Math
 * - All in One SEO (AIOSEO)
 * - Open Graph meta
 * - Twitter Cards
 * - Focus Keywords
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_SEO {
    
    /**
     * Detected SEO plugin
     */
    private static $detected_plugin = null;
    
    /**
     * Detect which SEO plugin is active
     * 
     * @return string Plugin identifier: 'yoast', 'rankmath', 'aioseo', or 'none'
     */
    public static function detect_seo_plugin() {
        if (self::$detected_plugin !== null) {
            return self::$detected_plugin;
        }
        
        // Check Yoast SEO
        if (defined('WPSEO_VERSION') || class_exists('WPSEO_Meta')) {
            self::$detected_plugin = 'yoast';
            return 'yoast';
        }
        
        // Check Rank Math
        if (defined('RANK_MATH_VERSION') || class_exists('RankMath')) {
            self::$detected_plugin = 'rankmath';
            return 'rankmath';
        }
        
        // Check All in One SEO
        if (defined('AIOSEO_VERSION') || class_exists('AIOSEO\Plugin\AIOSEO')) {
            self::$detected_plugin = 'aioseo';
            return 'aioseo';
        }
        
        // Fallback check via active plugins
        $active_plugins = get_option('active_plugins', array());
        foreach ($active_plugins as $plugin) {
            if (strpos($plugin, 'wordpress-seo') !== false) {
                self::$detected_plugin = 'yoast';
                return 'yoast';
            }
            if (strpos($plugin, 'seo-by-rank-math') !== false) {
                self::$detected_plugin = 'rankmath';
                return 'rankmath';
            }
            if (strpos($plugin, 'all-in-one-seo') !== false) {
                self::$detected_plugin = 'aioseo';
                return 'aioseo';
            }
        }
        
        self::$detected_plugin = 'none';
        return 'none';
    }
    
    /**
     * Set all SEO meta for a post
     * 
     * @param int $post_id Post ID
     * @param array $meta SEO meta data
     */
    public static function set_meta($post_id, $meta) {
        $plugin = self::detect_seo_plugin();
        
        // SEO Title
        if (!empty($meta['title'])) {
            self::set_title($post_id, $meta['title'], $plugin);
        }
        
        // Meta Description
        if (!empty($meta['description'])) {
            self::set_description($post_id, $meta['description'], $plugin);
        }
        
        // Focus Keyword
        if (!empty($meta['focus_keyword'])) {
            self::set_focus_keyword($post_id, $meta['focus_keyword'], $plugin);
        }
        
        // Open Graph
        if (!empty($meta['og_title']) || !empty($meta['og_description']) || !empty($meta['og_image'])) {
            self::set_open_graph($post_id, $meta, $plugin);
        }
        
        // Twitter Cards
        if (!empty($meta['twitter_title']) || !empty($meta['twitter_description']) || !empty($meta['twitter_image'])) {
            self::set_twitter_cards($post_id, $meta, $plugin);
        }
        
        // Canonical URL
        if (!empty($meta['canonical_url'])) {
            self::set_canonical($post_id, $meta['canonical_url'], $plugin);
        }
        
        // Robots meta
        if (isset($meta['noindex']) || isset($meta['nofollow'])) {
            self::set_robots($post_id, $meta, $plugin);
        }
        
        // Store raw meta for reference
        update_post_meta($post_id, '_cfrdm_seo_meta', $meta);
    }
    
    /**
     * Get all SEO meta for a post
     * 
     * @param int $post_id Post ID
     * @return array SEO meta data
     */
    public static function get_meta($post_id) {
        $plugin = self::detect_seo_plugin();
        
        $meta = array(
            'title' => '',
            'description' => '',
            'focus_keyword' => '',
            'og_title' => '',
            'og_description' => '',
            'og_image' => '',
            'twitter_title' => '',
            'twitter_description' => '',
            'twitter_image' => '',
            'canonical_url' => '',
            'noindex' => false,
            'nofollow' => false,
            'plugin' => $plugin,
        );
        
        switch ($plugin) {
            case 'yoast':
                $meta['title'] = get_post_meta($post_id, '_yoast_wpseo_title', true);
                $meta['description'] = get_post_meta($post_id, '_yoast_wpseo_metadesc', true);
                $meta['focus_keyword'] = get_post_meta($post_id, '_yoast_wpseo_focuskw', true);
                $meta['og_title'] = get_post_meta($post_id, '_yoast_wpseo_opengraph-title', true);
                $meta['og_description'] = get_post_meta($post_id, '_yoast_wpseo_opengraph-description', true);
                $meta['og_image'] = get_post_meta($post_id, '_yoast_wpseo_opengraph-image', true);
                $meta['twitter_title'] = get_post_meta($post_id, '_yoast_wpseo_twitter-title', true);
                $meta['twitter_description'] = get_post_meta($post_id, '_yoast_wpseo_twitter-description', true);
                $meta['twitter_image'] = get_post_meta($post_id, '_yoast_wpseo_twitter-image', true);
                $meta['canonical_url'] = get_post_meta($post_id, '_yoast_wpseo_canonical', true);
                $robots = get_post_meta($post_id, '_yoast_wpseo_meta-robots-noindex', true);
                $meta['noindex'] = ($robots === '1');
                $robots_follow = get_post_meta($post_id, '_yoast_wpseo_meta-robots-nofollow', true);
                $meta['nofollow'] = ($robots_follow === '1');
                break;
                
            case 'rankmath':
                $meta['title'] = get_post_meta($post_id, 'rank_math_title', true);
                $meta['description'] = get_post_meta($post_id, 'rank_math_description', true);
                $meta['focus_keyword'] = get_post_meta($post_id, 'rank_math_focus_keyword', true);
                $meta['og_title'] = get_post_meta($post_id, 'rank_math_facebook_title', true);
                $meta['og_description'] = get_post_meta($post_id, 'rank_math_facebook_description', true);
                $meta['og_image'] = get_post_meta($post_id, 'rank_math_facebook_image', true);
                $meta['twitter_title'] = get_post_meta($post_id, 'rank_math_twitter_title', true);
                $meta['twitter_description'] = get_post_meta($post_id, 'rank_math_twitter_description', true);
                $meta['twitter_image'] = get_post_meta($post_id, 'rank_math_twitter_image', true);
                $meta['canonical_url'] = get_post_meta($post_id, 'rank_math_canonical_url', true);
                $robots = get_post_meta($post_id, 'rank_math_robots', true);
                if (is_array($robots)) {
                    $meta['noindex'] = in_array('noindex', $robots);
                    $meta['nofollow'] = in_array('nofollow', $robots);
                }
                break;
                
            case 'aioseo':
                // AIOSEO stores data in a custom table and/or post meta
                $meta['title'] = get_post_meta($post_id, '_aioseo_title', true);
                $meta['description'] = get_post_meta($post_id, '_aioseo_description', true);
                $meta['focus_keyword'] = self::get_aioseo_focus_keyword($post_id);
                $meta['og_title'] = get_post_meta($post_id, '_aioseo_og_title', true);
                $meta['og_description'] = get_post_meta($post_id, '_aioseo_og_description', true);
                $meta['og_image'] = get_post_meta($post_id, '_aioseo_og_image_url', true);
                $meta['twitter_title'] = get_post_meta($post_id, '_aioseo_twitter_title', true);
                $meta['twitter_description'] = get_post_meta($post_id, '_aioseo_twitter_description', true);
                $meta['twitter_image'] = get_post_meta($post_id, '_aioseo_twitter_image_url', true);
                $meta['canonical_url'] = get_post_meta($post_id, '_aioseo_canonical_url', true);
                $meta['noindex'] = (bool) get_post_meta($post_id, '_aioseo_noindex', true);
                $meta['nofollow'] = (bool) get_post_meta($post_id, '_aioseo_nofollow', true);
                break;
        }
        
        return $meta;
    }
    
    /**
     * Set SEO title
     */
    private static function set_title($post_id, $title, $plugin) {
        $title = sanitize_text_field($title);
        
        switch ($plugin) {
            case 'yoast':
                update_post_meta($post_id, '_yoast_wpseo_title', $title);
                break;
            case 'rankmath':
                update_post_meta($post_id, 'rank_math_title', $title);
                break;
            case 'aioseo':
                update_post_meta($post_id, '_aioseo_title', $title);
                self::update_aioseo_table($post_id, 'title', $title);
                break;
        }
    }
    
    /**
     * Set meta description
     */
    private static function set_description($post_id, $description, $plugin) {
        $description = sanitize_textarea_field($description);
        
        switch ($plugin) {
            case 'yoast':
                update_post_meta($post_id, '_yoast_wpseo_metadesc', $description);
                break;
            case 'rankmath':
                update_post_meta($post_id, 'rank_math_description', $description);
                break;
            case 'aioseo':
                update_post_meta($post_id, '_aioseo_description', $description);
                self::update_aioseo_table($post_id, 'description', $description);
                break;
        }
    }
    
    /**
     * Set focus keyword
     */
    private static function set_focus_keyword($post_id, $keyword, $plugin) {
        $keyword = sanitize_text_field($keyword);
        
        switch ($plugin) {
            case 'yoast':
                update_post_meta($post_id, '_yoast_wpseo_focuskw', $keyword);
                break;
            case 'rankmath':
                update_post_meta($post_id, 'rank_math_focus_keyword', $keyword);
                break;
            case 'aioseo':
                update_post_meta($post_id, '_aioseo_keyphrases', json_encode(array(
                    'focus' => array('keyphrase' => $keyword),
                )));
                self::update_aioseo_table($post_id, 'keyphrases', json_encode(array(
                    'focus' => array('keyphrase' => $keyword),
                )));
                break;
        }
        
        // Also store in our own meta for reference
        update_post_meta($post_id, '_cfrdm_focus_keyword', $keyword);
    }
    
    /**
     * Set Open Graph meta
     */
    private static function set_open_graph($post_id, $meta, $plugin) {
        $og_title = sanitize_text_field($meta['og_title'] ?? '');
        $og_desc = sanitize_textarea_field($meta['og_description'] ?? '');
        $og_image = esc_url_raw($meta['og_image'] ?? '');
        
        switch ($plugin) {
            case 'yoast':
                if ($og_title) update_post_meta($post_id, '_yoast_wpseo_opengraph-title', $og_title);
                if ($og_desc) update_post_meta($post_id, '_yoast_wpseo_opengraph-description', $og_desc);
                if ($og_image) update_post_meta($post_id, '_yoast_wpseo_opengraph-image', $og_image);
                break;
            case 'rankmath':
                if ($og_title) update_post_meta($post_id, 'rank_math_facebook_title', $og_title);
                if ($og_desc) update_post_meta($post_id, 'rank_math_facebook_description', $og_desc);
                if ($og_image) update_post_meta($post_id, 'rank_math_facebook_image', $og_image);
                break;
            case 'aioseo':
                if ($og_title) update_post_meta($post_id, '_aioseo_og_title', $og_title);
                if ($og_desc) update_post_meta($post_id, '_aioseo_og_description', $og_desc);
                if ($og_image) update_post_meta($post_id, '_aioseo_og_image_url', $og_image);
                break;
        }
        
        // Store in our meta for fallback
        update_post_meta($post_id, '_cfrdm_og_title', $og_title);
        update_post_meta($post_id, '_cfrdm_og_description', $og_desc);
        update_post_meta($post_id, '_cfrdm_og_image', $og_image);
    }
    
    /**
     * Set Twitter Cards meta
     */
    private static function set_twitter_cards($post_id, $meta, $plugin) {
        $tw_title = sanitize_text_field($meta['twitter_title'] ?? '');
        $tw_desc = sanitize_textarea_field($meta['twitter_description'] ?? '');
        $tw_image = esc_url_raw($meta['twitter_image'] ?? '');
        
        switch ($plugin) {
            case 'yoast':
                if ($tw_title) update_post_meta($post_id, '_yoast_wpseo_twitter-title', $tw_title);
                if ($tw_desc) update_post_meta($post_id, '_yoast_wpseo_twitter-description', $tw_desc);
                if ($tw_image) update_post_meta($post_id, '_yoast_wpseo_twitter-image', $tw_image);
                break;
            case 'rankmath':
                if ($tw_title) update_post_meta($post_id, 'rank_math_twitter_title', $tw_title);
                if ($tw_desc) update_post_meta($post_id, 'rank_math_twitter_description', $tw_desc);
                if ($tw_image) update_post_meta($post_id, 'rank_math_twitter_image', $tw_image);
                // Enable Twitter card use
                update_post_meta($post_id, 'rank_math_twitter_use_facebook', 'off');
                break;
            case 'aioseo':
                if ($tw_title) update_post_meta($post_id, '_aioseo_twitter_title', $tw_title);
                if ($tw_desc) update_post_meta($post_id, '_aioseo_twitter_description', $tw_desc);
                if ($tw_image) update_post_meta($post_id, '_aioseo_twitter_image_url', $tw_image);
                break;
        }
        
        // Store in our meta for fallback
        update_post_meta($post_id, '_cfrdm_twitter_title', $tw_title);
        update_post_meta($post_id, '_cfrdm_twitter_description', $tw_desc);
        update_post_meta($post_id, '_cfrdm_twitter_image', $tw_image);
    }
    
    /**
     * Set canonical URL
     */
    private static function set_canonical($post_id, $url, $plugin) {
        $url = esc_url_raw($url);
        
        switch ($plugin) {
            case 'yoast':
                update_post_meta($post_id, '_yoast_wpseo_canonical', $url);
                break;
            case 'rankmath':
                update_post_meta($post_id, 'rank_math_canonical_url', $url);
                break;
            case 'aioseo':
                update_post_meta($post_id, '_aioseo_canonical_url', $url);
                break;
        }
    }
    
    /**
     * Set robots meta (noindex/nofollow)
     */
    private static function set_robots($post_id, $meta, $plugin) {
        $noindex = !empty($meta['noindex']);
        $nofollow = !empty($meta['nofollow']);
        
        switch ($plugin) {
            case 'yoast':
                update_post_meta($post_id, '_yoast_wpseo_meta-robots-noindex', $noindex ? '1' : '0');
                update_post_meta($post_id, '_yoast_wpseo_meta-robots-nofollow', $nofollow ? '1' : '0');
                break;
            case 'rankmath':
                $robots = array();
                if ($noindex) $robots[] = 'noindex';
                if ($nofollow) $robots[] = 'nofollow';
                update_post_meta($post_id, 'rank_math_robots', $robots);
                break;
            case 'aioseo':
                update_post_meta($post_id, '_aioseo_noindex', $noindex ? '1' : '0');
                update_post_meta($post_id, '_aioseo_nofollow', $nofollow ? '1' : '0');
                break;
        }
    }
    
    /**
     * Get AIOSEO focus keyword from custom table or meta
     */
    private static function get_aioseo_focus_keyword($post_id) {
        $keyphrases = get_post_meta($post_id, '_aioseo_keyphrases', true);
        
        if ($keyphrases) {
            $decoded = json_decode($keyphrases, true);
            if (isset($decoded['focus']['keyphrase'])) {
                return $decoded['focus']['keyphrase'];
            }
        }
        
        // Try AIOSEO posts table
        global $wpdb;
        $table = $wpdb->prefix . 'aioseo_posts';
        
        if ($wpdb->get_var("SHOW TABLES LIKE '$table'") === $table) {
            $keyphrases = $wpdb->get_var($wpdb->prepare(
                "SELECT keyphrases FROM $table WHERE post_id = %d",
                $post_id
            ));
            
            if ($keyphrases) {
                $decoded = json_decode($keyphrases, true);
                if (isset($decoded['focus']['keyphrase'])) {
                    return $decoded['focus']['keyphrase'];
                }
            }
        }
        
        return '';
    }
    
    /**
     * Update AIOSEO custom table
     */
    private static function update_aioseo_table($post_id, $field, $value) {
        global $wpdb;
        $table = $wpdb->prefix . 'aioseo_posts';
        
        // Check if table exists
        if ($wpdb->get_var("SHOW TABLES LIKE '$table'") !== $table) {
            return;
        }
        
        // Check if row exists
        $exists = $wpdb->get_var($wpdb->prepare(
            "SELECT id FROM $table WHERE post_id = %d",
            $post_id
        ));
        
        if ($exists) {
            $wpdb->update(
                $table,
                array($field => $value),
                array('post_id' => $post_id),
                array('%s'),
                array('%d')
            );
        } else {
            $wpdb->insert(
                $table,
                array(
                    'post_id' => $post_id,
                    $field => $value,
                ),
                array('%d', '%s')
            );
        }
    }
    
    /**
     * Get detected SEO plugin info for API response
     */
    public static function get_plugin_info() {
        $plugin = self::detect_seo_plugin();
        
        $info = array(
            'plugin' => $plugin,
            'name' => '',
            'version' => '',
            'features' => array(),
        );
        
        switch ($plugin) {
            case 'yoast':
                $info['name'] = 'Yoast SEO';
                $info['version'] = defined('WPSEO_VERSION') ? WPSEO_VERSION : 'Unknown';
                $info['features'] = array('title', 'description', 'focus_keyword', 'og', 'twitter', 'canonical', 'robots');
                break;
            case 'rankmath':
                $info['name'] = 'Rank Math';
                $info['version'] = defined('RANK_MATH_VERSION') ? RANK_MATH_VERSION : 'Unknown';
                $info['features'] = array('title', 'description', 'focus_keyword', 'og', 'twitter', 'canonical', 'robots');
                break;
            case 'aioseo':
                $info['name'] = 'All in One SEO';
                $info['version'] = defined('AIOSEO_VERSION') ? AIOSEO_VERSION : 'Unknown';
                $info['features'] = array('title', 'description', 'focus_keyword', 'og', 'twitter', 'canonical', 'robots');
                break;
            default:
                $info['name'] = 'None';
                $info['features'] = array();
        }
        
        return $info;
    }
}
