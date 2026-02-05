<?php
/**
 * Internal Links Manager Class
 * 
 * Advanced internal linking system that analyzes content structure
 * to generate backlinks and cross-article redirections.
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_Internal_Links {
    
    /**
     * Constructor
     */
    public function __construct() {
        // Hook into content save to analyze links
        add_action('save_post', array($this, 'analyze_post_links'), 20, 3);
        
        // Add REST API endpoints
        add_action('rest_api_init', array($this, 'register_rest_routes'));
    }
    
    /**
     * Register REST API routes
     */
    public function register_rest_routes() {
        register_rest_route('cfrdm/v1', '/analyze-internal-links', array(
            'methods' => 'POST',
            'callback' => array($this, 'rest_analyze_links'),
            'permission_callback' => array($this, 'check_permission'),
        ));
        
        register_rest_route('cfrdm/v1', '/generate-internal-links', array(
            'methods' => 'POST',
            'callback' => array($this, 'rest_generate_links'),
            'permission_callback' => array($this, 'check_permission'),
        ));
        
        register_rest_route('cfrdm/v1', '/link-suggestions', array(
            'methods' => 'GET',
            'callback' => array($this, 'rest_get_suggestions'),
            'permission_callback' => array($this, 'check_permission'),
        ));
    }
    
    /**
     * Check permission
     */
    public function check_permission() {
        return current_user_can('edit_posts');
    }
    
    /**
     * Analyze all posts for internal linking opportunities
     */
    public function rest_analyze_links($request) {
        $analysis = $this->analyze_all_posts();
        
        CFRDM_Logger::info(
            CFRDM_Logger::CATEGORY_SYNC,
            'Análise de links internos concluída',
            array(
                'total_posts' => $analysis['total_posts'],
                'orphan_pages' => count($analysis['orphan_pages']),
                'opportunities' => count($analysis['opportunities']),
            )
        );
        
        return rest_ensure_response(array(
            'success' => true,
            'data' => $analysis,
        ));
    }
    
    /**
     * Generate internal links based on analysis
     */
    public function rest_generate_links($request) {
        $params = $request->get_json_params();
        $mode = isset($params['mode']) ? $params['mode'] : 'smart';
        $max_links = isset($params['max_links_per_post']) ? intval($params['max_links_per_post']) : 5;
        
        $result = $this->generate_links($mode, $max_links);
        
        CFRDM_Logger::success(
            CFRDM_Logger::CATEGORY_SYNC,
            'Links internos gerados',
            array(
                'links_added' => $result['links_added'],
                'posts_updated' => $result['posts_updated'],
            )
        );
        
        return rest_ensure_response(array(
            'success' => true,
            'links_added' => $result['links_added'],
            'posts_updated' => $result['posts_updated'],
        ));
    }
    
    /**
     * Get link suggestions for a specific post
     */
    public function rest_get_suggestions($request) {
        $post_id = $request->get_param('post_id');
        
        if ($post_id) {
            $suggestions = $this->get_suggestions_for_post($post_id);
        } else {
            $suggestions = $this->get_all_suggestions();
        }
        
        return rest_ensure_response(array(
            'success' => true,
            'suggestions' => $suggestions,
        ));
    }
    
    /**
     * Analyze all published posts
     */
    public function analyze_all_posts() {
        $posts = get_posts(array(
            'post_type' => 'post',
            'post_status' => 'publish',
            'posts_per_page' => -1,
        ));
        
        $post_data = array();
        $link_map = array(); // Maps post ID to incoming links
        
        // First pass: gather all post data
        foreach ($posts as $post) {
            $content = $post->post_content;
            $keywords = $this->extract_keywords($post);
            $outgoing_links = $this->extract_internal_links($content);
            
            $post_data[$post->ID] = array(
                'id' => $post->ID,
                'title' => $post->post_title,
                'url' => get_permalink($post->ID),
                'keywords' => $keywords,
                'outgoing_links' => $outgoing_links,
                'incoming_count' => 0,
            );
            
            // Track incoming links
            foreach ($outgoing_links as $link) {
                $linked_id = url_to_postid($link);
                if ($linked_id && isset($link_map[$linked_id])) {
                    $link_map[$linked_id]++;
                } elseif ($linked_id) {
                    $link_map[$linked_id] = 1;
                }
            }
        }
        
        // Update incoming counts
        foreach ($link_map as $id => $count) {
            if (isset($post_data[$id])) {
                $post_data[$id]['incoming_count'] = $count;
            }
        }
        
        // Find orphan pages (no incoming links)
        $orphan_pages = array();
        foreach ($post_data as $data) {
            if ($data['incoming_count'] === 0) {
                $orphan_pages[] = array(
                    'id' => $data['id'],
                    'title' => $data['title'],
                    'url' => $data['url'],
                );
            }
        }
        
        // Find linking opportunities
        $opportunities = $this->find_opportunities($post_data);
        
        // Calculate link distribution
        $link_distribution = array();
        foreach ($post_data as $data) {
            $link_distribution[] = array(
                'post_id' => $data['id'],
                'title' => $data['title'],
                'incoming' => $data['incoming_count'],
                'outgoing' => count($data['outgoing_links']),
            );
        }
        
        // Sort by incoming links
        usort($link_distribution, function($a, $b) {
            return $b['incoming'] - $a['incoming'];
        });
        
        return array(
            'total_posts' => count($posts),
            'orphan_pages' => $orphan_pages,
            'opportunities' => $opportunities,
            'link_distribution' => array_slice($link_distribution, 0, 20),
        );
    }
    
    /**
     * Extract keywords from a post
     */
    private function extract_keywords($post) {
        $keywords = array();
        
        // Get Yoast focus keyword
        $yoast_keyword = get_post_meta($post->ID, '_yoast_wpseo_focuskw', true);
        if ($yoast_keyword) {
            $keywords[] = strtolower($yoast_keyword);
        }
        
        // Get Rank Math focus keyword
        $rankmath_keyword = get_post_meta($post->ID, 'rank_math_focus_keyword', true);
        if ($rankmath_keyword) {
            $keywords = array_merge($keywords, array_map('strtolower', explode(',', $rankmath_keyword)));
        }
        
        // Extract from title
        $title_words = $this->extract_significant_words($post->post_title);
        $keywords = array_merge($keywords, $title_words);
        
        // Get tags
        $tags = wp_get_post_tags($post->ID, array('fields' => 'names'));
        if ($tags) {
            $keywords = array_merge($keywords, array_map('strtolower', $tags));
        }
        
        // Get categories
        $categories = wp_get_post_categories($post->ID, array('fields' => 'names'));
        if ($categories) {
            $keywords = array_merge($keywords, array_map('strtolower', $categories));
        }
        
        return array_unique(array_filter($keywords));
    }
    
    /**
     * Extract significant words from text
     */
    private function extract_significant_words($text) {
        // Remove common Portuguese stop words
        $stop_words = array(
            'de', 'a', 'o', 'que', 'e', 'do', 'da', 'em', 'um', 'para', 'é', 'com',
            'não', 'uma', 'os', 'no', 'se', 'na', 'por', 'mais', 'as', 'dos', 'como',
            'mas', 'foi', 'ao', 'ele', 'das', 'tem', 'à', 'seu', 'sua', 'ou', 'ser',
            'quando', 'muito', 'há', 'nos', 'já', 'está', 'eu', 'também', 'só', 'pelo',
            'pela', 'até', 'isso', 'ela', 'entre', 'era', 'depois', 'sem', 'mesmo',
            'aos', 'ter', 'seus', 'quem', 'nas', 'me', 'esse', 'eles', 'estão', 'você',
            'tinha', 'foram', 'essa', 'num', 'nem', 'suas', 'meu', 'às', 'minha', 'têm',
        );
        
        $words = preg_split('/\s+/', strtolower($text));
        $significant = array();
        
        foreach ($words as $word) {
            $word = trim($word, '.,;:!?()[]{}"\'-');
            if (strlen($word) >= 4 && !in_array($word, $stop_words)) {
                $significant[] = $word;
            }
        }
        
        return $significant;
    }
    
    /**
     * Extract internal links from content
     */
    private function extract_internal_links($content) {
        $links = array();
        $site_url = home_url();
        
        // Match all href attributes
        preg_match_all('/href=["\']([^"\']+)["\']/', $content, $matches);
        
        if (!empty($matches[1])) {
            foreach ($matches[1] as $url) {
                // Check if it's an internal link
                if (strpos($url, $site_url) === 0 || strpos($url, '/') === 0) {
                    $links[] = $url;
                }
            }
        }
        
        return array_unique($links);
    }
    
    /**
     * Find linking opportunities between posts
     */
    private function find_opportunities($post_data) {
        $opportunities = array();
        
        foreach ($post_data as $from_id => $from_data) {
            foreach ($post_data as $to_id => $to_data) {
                if ($from_id === $to_id) continue;
                
                // Check if link already exists
                $already_linked = false;
                foreach ($from_data['outgoing_links'] as $link) {
                    if (url_to_postid($link) === $to_id) {
                        $already_linked = true;
                        break;
                    }
                }
                
                if ($already_linked) continue;
                
                // Calculate relevance
                $relevance = $this->calculate_relevance($from_data['keywords'], $to_data['keywords']);
                
                if ($relevance >= 30) {
                    $anchor_text = $this->generate_anchor_text($to_data);
                    
                    $opportunities[] = array(
                        'from_id' => $from_id,
                        'from_title' => $from_data['title'],
                        'to_id' => $to_id,
                        'to_title' => $to_data['title'],
                        'to_url' => $to_data['url'],
                        'relevance' => $relevance,
                        'anchor_text' => $anchor_text,
                    );
                }
            }
        }
        
        // Sort by relevance
        usort($opportunities, function($a, $b) {
            return $b['relevance'] - $a['relevance'];
        });
        
        return array_slice($opportunities, 0, 100);
    }
    
    /**
     * Calculate relevance between two sets of keywords
     */
    private function calculate_relevance($keywords1, $keywords2) {
        if (empty($keywords1) || empty($keywords2)) {
            return 0;
        }
        
        $matches = 0;
        $partial_matches = 0;
        
        foreach ($keywords1 as $kw1) {
            foreach ($keywords2 as $kw2) {
                if ($kw1 === $kw2) {
                    $matches++;
                } elseif (strpos($kw1, $kw2) !== false || strpos($kw2, $kw1) !== false) {
                    $partial_matches++;
                }
            }
        }
        
        $total = count($keywords1) + count($keywords2);
        $score = ($matches * 2 + $partial_matches) / $total * 100;
        
        return min(round($score), 100);
    }
    
    /**
     * Generate anchor text for a target post
     */
    private function generate_anchor_text($post_data) {
        // Prefer the first keyword if available
        if (!empty($post_data['keywords'])) {
            $keyword = reset($post_data['keywords']);
            if (strlen($keyword) <= 50) {
                return ucfirst($keyword);
            }
        }
        
        // Fall back to title
        $title = $post_data['title'];
        if (strlen($title) <= 50) {
            return $title;
        }
        
        // Truncate long titles
        return substr($title, 0, 47) . '...';
    }
    
    /**
     * Generate links for all posts
     */
    public function generate_links($mode = 'smart', $max_links = 5) {
        $analysis = $this->analyze_all_posts();
        $links_added = 0;
        $posts_updated = 0;
        
        // Prioritize orphan pages
        $target_posts = array();
        foreach ($analysis['orphan_pages'] as $orphan) {
            $target_posts[$orphan['id']] = 0;
        }
        
        // Process opportunities
        foreach ($analysis['opportunities'] as $opp) {
            $from_post = get_post($opp['from_id']);
            if (!$from_post) continue;
            
            // Count current links to this target
            if (!isset($target_posts[$opp['to_id']])) {
                $target_posts[$opp['to_id']] = 0;
            }
            
            // Limit links per target
            if ($target_posts[$opp['to_id']] >= 3) continue;
            
            // Check max links per post
            $current_links = substr_count($from_post->post_content, '<a ');
            if ($current_links >= $max_links * 2) continue;
            
            // Find appropriate place to insert link
            $content = $from_post->post_content;
            $anchor = $opp['anchor_text'];
            $url = $opp['to_url'];
            
            // Look for the keyword or related text
            $search_terms = array($anchor);
            if (strlen($anchor) > 10) {
                $search_terms[] = substr($anchor, 0, -3);
            }
            
            $inserted = false;
            foreach ($search_terms as $term) {
                // Case insensitive search that's not already a link
                $pattern = '/(?<!<a [^>]*>)(\b' . preg_quote($term, '/') . '\b)(?![^<]*<\/a>)/iu';
                
                if (preg_match($pattern, $content, $matches, PREG_OFFSET_CAPTURE)) {
                    $match = $matches[1][0];
                    $offset = $matches[1][1];
                    
                    $link = '<a href="' . esc_url($url) . '" title="' . esc_attr($opp['to_title']) . '">' . $match . '</a>';
                    $content = substr_replace($content, $link, $offset, strlen($match));
                    $inserted = true;
                    break;
                }
            }
            
            if ($inserted) {
                wp_update_post(array(
                    'ID' => $from_post->ID,
                    'post_content' => $content,
                ));
                
                $links_added++;
                $target_posts[$opp['to_id']]++;
                
                if (!isset($updated_posts[$from_post->ID])) {
                    $posts_updated++;
                    $updated_posts[$from_post->ID] = true;
                }
                
                // Log the link addition
                CFRDM_Logger::info(
                    CFRDM_Logger::CATEGORY_SYNC,
                    sprintf('Link interno adicionado: %s → %s', $from_post->post_title, $opp['to_title']),
                    array(
                        'from_id' => $from_post->ID,
                        'to_id' => $opp['to_id'],
                        'anchor' => $anchor,
                    ),
                    $from_post->ID
                );
            }
        }
        
        return array(
            'links_added' => $links_added,
            'posts_updated' => $posts_updated,
        );
    }
    
    /**
     * Analyze a single post on save
     */
    public function analyze_post_links($post_id, $post, $update) {
        if (wp_is_post_revision($post_id)) return;
        if ($post->post_status !== 'publish') return;
        if ($post->post_type !== 'post') return;
        
        // Get suggestions for this post
        $suggestions = $this->get_suggestions_for_post($post_id);
        
        // Store suggestions as post meta for quick access
        update_post_meta($post_id, '_cfrdm_link_suggestions', $suggestions);
    }
    
    /**
     * Get suggestions for a specific post
     */
    public function get_suggestions_for_post($post_id) {
        $post = get_post($post_id);
        if (!$post) return array();
        
        $keywords = $this->extract_keywords($post);
        $current_links = $this->extract_internal_links($post->post_content);
        
        $suggestions = array();
        
        // Get all other published posts
        $other_posts = get_posts(array(
            'post_type' => 'post',
            'post_status' => 'publish',
            'posts_per_page' => 50,
            'post__not_in' => array($post_id),
        ));
        
        foreach ($other_posts as $other) {
            // Skip if already linked
            $already_linked = false;
            foreach ($current_links as $link) {
                if (url_to_postid($link) === $other->ID) {
                    $already_linked = true;
                    break;
                }
            }
            
            if ($already_linked) continue;
            
            $other_keywords = $this->extract_keywords($other);
            $relevance = $this->calculate_relevance($keywords, $other_keywords);
            
            if ($relevance >= 25) {
                $suggestions[] = array(
                    'post_id' => $other->ID,
                    'title' => $other->post_title,
                    'url' => get_permalink($other->ID),
                    'relevance' => $relevance,
                    'anchor_text' => $this->generate_anchor_text(array(
                        'keywords' => $other_keywords,
                        'title' => $other->post_title,
                    )),
                );
            }
        }
        
        // Sort by relevance
        usort($suggestions, function($a, $b) {
            return $b['relevance'] - $a['relevance'];
        });
        
        return array_slice($suggestions, 0, 10);
    }
    
    /**
     * Get all link suggestions
     */
    public function get_all_suggestions() {
        $posts = get_posts(array(
            'post_type' => 'post',
            'post_status' => 'publish',
            'posts_per_page' => 20,
            'orderby' => 'date',
            'order' => 'DESC',
        ));
        
        $all_suggestions = array();
        
        foreach ($posts as $post) {
            $suggestions = $this->get_suggestions_for_post($post->ID);
            if (!empty($suggestions)) {
                $all_suggestions[] = array(
                    'post_id' => $post->ID,
                    'post_title' => $post->post_title,
                    'suggestions' => $suggestions,
                );
            }
        }
        
        return $all_suggestions;
    }
    
    /**
     * Get internal linking stats
     */
    public function get_stats() {
        global $wpdb;
        
        $posts = get_posts(array(
            'post_type' => 'post',
            'post_status' => 'publish',
            'posts_per_page' => -1,
        ));
        
        $total_links = 0;
        $site_url = home_url();
        
        foreach ($posts as $post) {
            $content = $post->post_content;
            preg_match_all('/href=["\']([^"\']+)["\']/', $content, $matches);
            
            if (!empty($matches[1])) {
                foreach ($matches[1] as $url) {
                    if (strpos($url, $site_url) === 0 || strpos($url, '/') === 0) {
                        $total_links++;
                    }
                }
            }
        }
        
        return array(
            'total_internal_links' => $total_links,
            'total_posts' => count($posts),
            'average_links_per_post' => count($posts) > 0 ? round($total_links / count($posts), 1) : 0,
        );
    }
}
