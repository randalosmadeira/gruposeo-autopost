<?php
/**
 * Site Crawler — Real HTTP-based SEO audit engine.
 * 
 * Performs ACTUAL server-side crawling with real HTTP requests
 * to detect broken links, redirect chains, duplicate content,
 * meta issues, security problems, and site structure analysis.
 * 
 * @since 3.5.0
 */

if (!defined('ABSPATH')) exit;

class CFRDM_Site_Crawler {

    /**
     * Scan all published posts for broken internal/external links.
     * Makes REAL HTTP HEAD requests to verify each link.
     */
    public static function scan_broken_links($params = []) {
        $limit = isset($params['limit']) ? intval($params['limit']) : 200;
        $check_redirects = !empty($params['check_redirects']);
        $check_external = !empty($params['check_external']);

        $posts = get_posts([
            'post_type'   => ['post', 'page'],
            'post_status' => 'publish',
            'numberposts' => $limit,
            'fields'      => 'ids',
        ]);

        $broken_urls = [];
        $redirect_chains = [];
        $external_links = [];
        $total_checked = 0;
        $urls_checked_cache = [];

        foreach ($posts as $post_id) {
            $content = get_post_field('post_content', $post_id);
            $post_url = get_permalink($post_id);
            if (empty($content)) continue;

            // Extract all href links from content
            preg_match_all('/href=["\']([^"\']+)["\']/i', $content, $matches);
            if (empty($matches[1])) continue;

            $unique_links = array_unique($matches[1]);

            foreach ($unique_links as $link) {
                // Skip anchors, mailto, tel, javascript
                if (preg_match('/^(#|mailto:|tel:|javascript:)/i', $link)) continue;

                // Resolve relative URLs
                $absolute_url = self::resolve_url($link, home_url());
                if (empty($absolute_url)) continue;

                // Deduplicate across posts
                if (isset($urls_checked_cache[$absolute_url])) {
                    $cached = $urls_checked_cache[$absolute_url];
                    if ($cached['status'] === 'broken') {
                        $broken_urls[] = [
                            'source_url'  => $post_url,
                            'source_id'   => $post_id,
                            'broken_url'  => $absolute_url,
                            'status'      => $cached['code'],
                        ];
                    }
                    continue;
                }

                $total_checked++;
                $is_external = !self::is_internal_url($absolute_url);

                $result = self::check_url($absolute_url, $check_redirects);
                $urls_checked_cache[$absolute_url] = $result;

                if ($result['status'] === 'broken') {
                    $broken_urls[] = [
                        'source_url'  => $post_url,
                        'source_id'   => $post_id,
                        'broken_url'  => $absolute_url,
                        'status'      => $result['code'],
                        'is_external' => $is_external,
                    ];
                }

                if ($result['status'] === 'redirect_chain' && $check_redirects) {
                    $redirect_chains[] = [
                        'url'          => $absolute_url,
                        'chain_length' => $result['chain_length'],
                        'final_url'    => $result['final_url'],
                        'source_url'   => $post_url,
                        'source_id'    => $post_id,
                    ];
                }

                if ($is_external && $check_external) {
                    $external_links[] = [
                        'url'        => $absolute_url,
                        'status'     => $result['code'],
                        'source_url' => $post_url,
                        'source_id'  => $post_id,
                    ];
                }

                // Rate limit to avoid overwhelming servers
                if ($total_checked % 20 === 0) usleep(100000); // 100ms pause
            }
        }

        return [
            'success'          => true,
            'total_checked'    => $total_checked,
            'broken_found'     => count($broken_urls),
            'redirects_found'  => count($redirect_chains),
            'external_count'   => count($external_links),
            'broken_urls'      => array_slice($broken_urls, 0, 100),
            'redirect_chains'  => array_slice($redirect_chains, 0, 50),
            'external_links'   => $check_external ? array_slice($external_links, 0, 100) : [],
        ];
    }

    /**
     * Check a single URL via HTTP HEAD request.
     */
    private static function check_url($url, $follow_redirects = true) {
        $response = wp_remote_head($url, [
            'timeout'     => 8,
            'redirection' => 0, // Don't auto-follow
            'sslverify'   => false,
            'user-agent'  => 'ContentFactory-SEO-Crawler/3.5',
        ]);

        if (is_wp_error($response)) {
            return ['status' => 'broken', 'code' => 0, 'error' => $response->get_error_message()];
        }

        $code = wp_remote_retrieve_response_code($response);

        // 404, 410, 5xx = broken
        if ($code === 404 || $code === 410 || $code >= 500) {
            return ['status' => 'broken', 'code' => $code];
        }

        // 3xx = redirect
        if ($code >= 300 && $code < 400 && $follow_redirects) {
            $location = wp_remote_retrieve_header($response, 'location');
            return self::follow_redirect_chain($url, $location, $code);
        }

        return ['status' => 'ok', 'code' => $code];
    }

    /**
     * Follow redirect chain up to 10 hops, detect loops.
     */
    private static function follow_redirect_chain($original_url, $first_location, $first_code) {
        $chain = [$original_url];
        $current_url = $first_location;
        $max_hops = 10;
        $hop = 0;

        while ($current_url && $hop < $max_hops) {
            // Detect loop
            if (in_array($current_url, $chain)) {
                return [
                    'status'       => 'redirect_loop',
                    'code'         => $first_code,
                    'chain_length' => count($chain),
                    'final_url'    => $current_url,
                    'loop'         => true,
                ];
            }

            $chain[] = $current_url;
            $hop++;

            $resp = wp_remote_head($current_url, [
                'timeout'     => 5,
                'redirection' => 0,
                'sslverify'   => false,
                'user-agent'  => 'ContentFactory-SEO-Crawler/3.5',
            ]);

            if (is_wp_error($resp)) {
                return ['status' => 'broken', 'code' => 0, 'chain_length' => $hop, 'final_url' => $current_url];
            }

            $code = wp_remote_retrieve_response_code($resp);

            if ($code >= 300 && $code < 400) {
                $current_url = wp_remote_retrieve_header($resp, 'location');
                if ($current_url && !preg_match('/^https?:\/\//', $current_url)) {
                    $current_url = self::resolve_url($current_url, $chain[count($chain) - 1]);
                }
                continue;
            }

            if ($code === 404 || $code === 410 || $code >= 500) {
                return ['status' => 'broken', 'code' => $code, 'chain_length' => $hop, 'final_url' => $current_url];
            }

            // Reached a 200
            if ($hop > 1) {
                return [
                    'status'       => 'redirect_chain',
                    'code'         => $first_code,
                    'chain_length' => $hop,
                    'final_url'    => $current_url,
                ];
            }

            return ['status' => 'redirect', 'code' => $first_code, 'chain_length' => 1, 'final_url' => $current_url];
        }

        return [
            'status'       => 'redirect_chain',
            'code'         => $first_code,
            'chain_length' => $hop,
            'final_url'    => $current_url ?: end($chain),
        ];
    }

    /**
     * Scan for duplicate content using title/meta/content hash comparison.
     */
    public static function scan_duplicates($params = []) {
        $limit = isset($params['limit']) ? intval($params['limit']) : 500;
        $check_meta = !empty($params['check_meta']);

        $posts = get_posts([
            'post_type'   => ['post', 'page'],
            'post_status' => 'publish',
            'numberposts' => $limit,
        ]);

        $title_map = [];
        $content_hash_map = [];
        $meta_desc_map = [];
        $thin_pages = 0;
        $duplicate_titles = [];
        $duplicate_contents = [];
        $duplicate_metas = [];

        foreach ($posts as $post) {
            $title = strtolower(trim($post->post_title));
            $content = strip_tags($post->post_content);
            $word_count = str_word_count($content);
            $content_hash = md5($content);
            $url = get_permalink($post->ID);

            // Thin pages
            if ($word_count < 300) {
                $thin_pages++;
            }

            // Title duplicates
            if (!isset($title_map[$title])) $title_map[$title] = [];
            $title_map[$title][] = ['id' => $post->ID, 'url' => $url];

            // Content hash duplicates
            if (strlen($content) > 100) { // Skip very short content
                if (!isset($content_hash_map[$content_hash])) $content_hash_map[$content_hash] = [];
                $content_hash_map[$content_hash][] = ['id' => $post->ID, 'url' => $url, 'title' => $post->post_title];
            }

            // Meta description duplicates
            if ($check_meta) {
                $meta_desc = self::get_meta_description($post->ID);
                if (!empty($meta_desc)) {
                    $meta_key = strtolower(trim($meta_desc));
                    if (!isset($meta_desc_map[$meta_key])) $meta_desc_map[$meta_key] = [];
                    $meta_desc_map[$meta_key][] = ['id' => $post->ID, 'url' => $url];
                }
            }
        }

        // Filter only duplicates (count > 1)
        foreach ($title_map as $title => $urls) {
            if (count($urls) > 1) {
                $duplicate_titles[] = [
                    'title' => $title,
                    'urls'  => array_column($urls, 'url'),
                    'count' => count($urls),
                ];
            }
        }

        foreach ($content_hash_map as $hash => $items) {
            if (count($items) > 1) {
                $duplicate_contents[] = [
                    'hash'  => $hash,
                    'items' => array_slice($items, 0, 5),
                    'count' => count($items),
                ];
            }
        }

        foreach ($meta_desc_map as $desc => $urls) {
            if (count($urls) > 1) {
                $duplicate_metas[] = [
                    'description' => substr($desc, 0, 80) . '...',
                    'urls'        => array_column($urls, 'url'),
                    'count'       => count($urls),
                ];
            }
        }

        return [
            'success'             => true,
            'total_scanned'       => count($posts),
            'duplicates_found'    => count($duplicate_titles) + count($duplicate_contents),
            'duplicate_titles'    => array_slice($duplicate_titles, 0, 30),
            'duplicate_contents'  => array_slice($duplicate_contents, 0, 20),
            'duplicate_metas'     => array_slice($duplicate_metas, 0, 20),
            'thin_pages'          => $thin_pages,
        ];
    }

    /**
     * Audit all existing redirects for chains, loops, and type analysis.
     */
    public static function audit_redirects($params = []) {
        global $wpdb;

        $redirects = [];
        $temporary = 0;
        $permanent = 0;
        $chains = 0;
        $loops = 0;
        $details = [];

        // 1) Check Rank Math redirects
        if (class_exists('RankMath\\Redirections\\DB')) {
            try {
                $rm_redirects = $wpdb->get_results(
                    "SELECT id, sources, url_to, header_code, status FROM {$wpdb->prefix}rank_math_redirections WHERE status = 'active' LIMIT 500"
                );
                if ($rm_redirects) {
                    foreach ($rm_redirects as $r) {
                        $sources = maybe_unserialize($r->sources);
                        $source_url = is_array($sources) && !empty($sources[0]) ? 
                            (is_array($sources[0]) ? ($sources[0]['pattern'] ?? '') : $sources[0]) : '';
                        $code = intval($r->header_code);
                        if ($code === 301) $permanent++;
                        elseif ($code === 302 || $code === 307) $temporary++;
                        $redirects[] = [
                            'source' => $source_url,
                            'target' => $r->url_to,
                            'type'   => $code,
                            'origin' => 'rank_math',
                        ];
                    }
                }
            } catch (\Exception $e) { /* skip */ }
        }

        // 2) Check our own redirect table
        $table = $wpdb->prefix . 'cfrdm_redirects_301';
        if ($wpdb->get_var("SHOW TABLES LIKE '$table'") === $table) {
            $our_redirects = $wpdb->get_results(
                "SELECT source_url, target_url, redirect_type, hits FROM $table WHERE is_active = 1 LIMIT 500"
            );
            if ($our_redirects) {
                foreach ($our_redirects as $r) {
                    $code = intval($r->redirect_type ?: 301);
                    if ($code === 301) $permanent++;
                    elseif ($code === 302 || $code === 307) $temporary++;
                    $redirects[] = [
                        'source' => $r->source_url,
                        'target' => $r->target_url,
                        'type'   => $code,
                        'origin' => 'cfrdm',
                        'hits'   => intval($r->hits),
                    ];
                }
            }
        }

        // 3) Verify each redirect for chains/loops via HTTP
        $checked = 0;
        foreach ($redirects as &$r) {
            if ($checked >= 100) break; // Limit verification
            $target = $r['target'];
            if (empty($target)) continue;

            // Resolve relative targets
            if (!preg_match('/^https?:\/\//', $target)) {
                $target = home_url($target);
            }

            $result = self::check_url($target, true);
            $checked++;

            if (isset($result['chain_length']) && $result['chain_length'] > 1) {
                $r['chain_length'] = $result['chain_length'];
                $r['final_url'] = $result['final_url'] ?? '';
                $chains++;
            }

            if (!empty($result['loop'])) {
                $r['loop'] = true;
                $loops++;
            }

            $details[] = $r;

            if ($checked % 10 === 0) usleep(50000);
        }

        return [
            'success'          => true,
            'total_redirects'  => count($redirects),
            'temporary'        => $temporary,
            'permanent'        => $permanent,
            'chains'           => $chains,
            'loops'            => $loops,
            'details'          => array_slice($details, 0, 50),
        ];
    }

    /**
     * Full site structure analysis: depth, orphans, anchor text, security.
     */
    public static function analyze_site_structure($params = []) {
        $limit = isset($params['limit']) ? intval($params['limit']) : 500;

        $posts = get_posts([
            'post_type'   => ['post', 'page'],
            'post_status' => 'publish',
            'numberposts' => $limit,
        ]);

        $internal_links_map = []; // url => [targets]
        $inbound_count = [];      // url => count of pages linking TO it
        $anchor_texts = [];       // anchor => count
        $security_issues = [];
        $url_issues = [];
        $heading_issues = [];
        $canonical_issues = [];

        foreach ($posts as $post) {
            $url = get_permalink($post->ID);
            $content = $post->post_content;
            $title = $post->post_title;

            // Internal links analysis
            preg_match_all('/<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)<\/a>/si', $content, $link_matches, PREG_SET_ORDER);
            $internal_targets = [];
            foreach ($link_matches as $m) {
                $href = $m[1];
                $anchor = strip_tags($m[2]);

                if (self::is_internal_url($href)) {
                    $resolved = self::resolve_url($href, home_url());
                    $internal_targets[] = $resolved;
                    $inbound_count[$resolved] = ($inbound_count[$resolved] ?? 0) + 1;

                    // Anchor text analysis
                    $anchor_clean = strtolower(trim($anchor));
                    if (!empty($anchor_clean)) {
                        $anchor_texts[$anchor_clean] = ($anchor_texts[$anchor_clean] ?? 0) + 1;
                    }

                    // Non-descriptive anchor check
                    $bad_anchors = ['clique aqui', 'saiba mais', 'leia mais', 'click here', 'read more', 'here', 'aqui'];
                    if (in_array($anchor_clean, $bad_anchors)) {
                        $url_issues[] = [
                            'url'   => $url,
                            'issue' => 'non_descriptive_anchor',
                            'value' => $anchor_clean,
                            'link'  => $href,
                        ];
                    }
                }
            }
            $internal_links_map[$url] = $internal_targets;

            // Heading analysis
            preg_match_all('/<h([1-6])[^>]*>(.*?)<\/h[1-6]>/si', $content, $headings, PREG_SET_ORDER);
            $h1_count = 0;
            $has_h2 = false;
            foreach ($headings as $h) {
                if ($h[1] === '1') $h1_count++;
                if ($h[1] === '2') $has_h2 = true;
            }
            // Check for post title as H1 (handled by theme) — content should NOT have H1
            if ($h1_count > 0) {
                $heading_issues[] = ['url' => $url, 'issue' => 'h1_in_content', 'count' => $h1_count, 'title' => $title];
            }
            if (!$has_h2 && str_word_count(strip_tags($content)) > 300) {
                $heading_issues[] = ['url' => $url, 'issue' => 'missing_h2', 'title' => $title];
            }

            // Security: mixed content
            preg_match_all('/(?:src|href)=["\']http:\/\/[^"\']+["\']/i', $content, $http_matches);
            if (!empty($http_matches[0])) {
                $security_issues[] = [
                    'url'   => $url,
                    'issue' => 'mixed_content',
                    'count' => count($http_matches[0]),
                ];
            }

            // URL issues
            if (preg_match('/[A-Z]/', parse_url($url, PHP_URL_PATH) ?: '')) {
                $url_issues[] = ['url' => $url, 'issue' => 'uppercase_url'];
            }
            if (strpos($url, '_') !== false) {
                $url_issues[] = ['url' => $url, 'issue' => 'underscore_in_url'];
            }
            if (strlen($url) > 200) {
                $url_issues[] = ['url' => $url, 'issue' => 'url_too_long', 'length' => strlen($url)];
            }
            if (preg_match('/[^\x20-\x7E]/', parse_url($url, PHP_URL_PATH) ?: '')) {
                $url_issues[] = ['url' => $url, 'issue' => 'non_ascii_url'];
            }
        }

        // Detect orphan pages (no inbound internal links)
        $all_urls = array_map(function($p) { return get_permalink($p->ID); }, $posts);
        $orphan_pages = [];
        foreach ($all_urls as $u) {
            if (($inbound_count[$u] ?? 0) === 0) {
                $orphan_pages[] = $u;
            }
        }

        // Sort anchor texts by frequency
        arsort($anchor_texts);

        // Canonical check
        foreach ($posts as $post) {
            $url = get_permalink($post->ID);
            $canonical = '';
            // Check Yoast
            $canonical = get_post_meta($post->ID, '_yoast_wpseo_canonical', true);
            if (empty($canonical)) {
                // Check Rank Math
                $canonical = get_post_meta($post->ID, 'rank_math_canonical_url', true);
            }
            if (!empty($canonical) && rtrim($canonical, '/') !== rtrim($url, '/')) {
                $canonical_issues[] = [
                    'url'       => $url,
                    'canonical' => $canonical,
                    'issue'     => 'canonical_mismatch',
                ];
            }
        }

        return [
            'success'           => true,
            'total_pages'       => count($posts),
            'orphan_pages'      => array_slice($orphan_pages, 0, 50),
            'orphan_count'      => count($orphan_pages),
            'avg_internal_links'=> count($posts) > 0 ? round(array_sum(array_map('count', $internal_links_map)) / count($posts), 1) : 0,
            'top_anchor_texts'  => array_slice($anchor_texts, 0, 30, true),
            'heading_issues'    => array_slice($heading_issues, 0, 50),
            'security_issues'   => array_slice($security_issues, 0, 30),
            'url_issues'        => array_slice($url_issues, 0, 50),
            'canonical_issues'  => array_slice($canonical_issues, 0, 30),
            'non_descriptive_anchors' => count(array_filter($url_issues, function($i) { return $i['issue'] === 'non_descriptive_anchor'; })),
        ];
    }

    /**
     * Comprehensive meta/title audit with counts per issue type.
     */
    public static function audit_titles_and_metas($params = []) {
        $limit = isset($params['limit']) ? intval($params['limit']) : 500;

        $posts = get_posts([
            'post_type'   => ['post', 'page'],
            'post_status' => 'publish',
            'numberposts' => $limit,
        ]);

        $missing_titles = 0;
        $long_titles = 0;
        $short_titles = 0;
        $duplicate_titles_count = 0;
        $missing_descriptions = 0;
        $long_descriptions = 0;
        $short_descriptions = 0;
        $duplicate_descriptions_count = 0;
        $missing_h1 = 0;
        $multiple_h1 = 0;
        $issues = [];

        $title_counts = [];
        $desc_counts = [];

        foreach ($posts as $post) {
            $url = get_permalink($post->ID);
            $seo_title = self::get_seo_title($post->ID) ?: $post->post_title;
            $meta_desc = self::get_meta_description($post->ID);

            // Title checks
            if (empty(trim($seo_title))) {
                $missing_titles++;
                $issues[] = ['url' => $url, 'issue' => 'missing_title'];
            } else {
                $title_len = mb_strlen($seo_title);
                if ($title_len > 60) {
                    $long_titles++;
                    $issues[] = ['url' => $url, 'issue' => 'long_title', 'current_value' => $seo_title, 'length' => $title_len];
                }
                if ($title_len < 20 && $title_len > 0) {
                    $short_titles++;
                    $issues[] = ['url' => $url, 'issue' => 'short_title', 'current_value' => $seo_title, 'length' => $title_len];
                }
                $tk = strtolower(trim($seo_title));
                $title_counts[$tk] = ($title_counts[$tk] ?? 0) + 1;
            }

            // Description checks
            if (empty(trim($meta_desc))) {
                $missing_descriptions++;
                $issues[] = ['url' => $url, 'issue' => 'missing_description'];
            } else {
                $desc_len = mb_strlen($meta_desc);
                if ($desc_len > 160) {
                    $long_descriptions++;
                    $issues[] = ['url' => $url, 'issue' => 'long_description', 'length' => $desc_len];
                }
                if ($desc_len < 70 && $desc_len > 0) {
                    $short_descriptions++;
                    $issues[] = ['url' => $url, 'issue' => 'short_description', 'length' => $desc_len];
                }
                $dk = strtolower(trim($meta_desc));
                $desc_counts[$dk] = ($desc_counts[$dk] ?? 0) + 1;
            }

            // H1 in content check
            preg_match_all('/<h1[^>]*>/i', $post->post_content, $h1s);
            $h1_count = count($h1s[0]);
            if ($h1_count === 0) {
                // Theme usually adds H1 from title, so just note
            }
            if ($h1_count > 1) {
                $multiple_h1++;
                $issues[] = ['url' => $url, 'issue' => 'multiple_h1', 'count' => $h1_count];
            }
        }

        // Count duplicates
        foreach ($title_counts as $t => $c) {
            if ($c > 1) $duplicate_titles_count++;
        }
        foreach ($desc_counts as $d => $c) {
            if ($c > 1) $duplicate_descriptions_count++;
        }

        return [
            'success'                  => true,
            'pages_audited'            => count($posts),
            'missing_titles'           => $missing_titles,
            'long_titles'              => $long_titles,
            'short_titles'             => $short_titles,
            'duplicate_titles'         => $duplicate_titles_count,
            'missing_descriptions'     => $missing_descriptions,
            'long_descriptions'        => $long_descriptions,
            'short_descriptions'       => $short_descriptions,
            'duplicate_descriptions'   => $duplicate_descriptions_count,
            'multiple_h1'              => $multiple_h1,
            'issues'                   => array_slice($issues, 0, 100),
        ];
    }

    /**
     * Audit robots.txt and meta robots directives.
     */
    public static function audit_directives() {
        $robots_txt = '';
        $robots_url = home_url('/robots.txt');
        $resp = wp_remote_get($robots_url, ['timeout' => 5, 'sslverify' => false]);
        if (!is_wp_error($resp)) {
            $robots_txt = wp_remote_retrieve_body($resp);
        }

        $blocked_urls = [];
        $noindex_pages = [];
        $nofollow_pages = [];

        // Parse robots.txt for Disallow rules
        $disallow_rules = [];
        if (!empty($robots_txt)) {
            preg_match_all('/Disallow:\s*(.+)/i', $robots_txt, $d_matches);
            $disallow_rules = array_map('trim', $d_matches[1] ?? []);
        }

        // Check published posts for meta robots
        $posts = get_posts([
            'post_type'   => ['post', 'page'],
            'post_status' => 'publish',
            'numberposts' => 500,
        ]);

        foreach ($posts as $post) {
            $url = get_permalink($post->ID);
            $robots_meta = '';

            // Yoast
            $yoast = get_post_meta($post->ID, '_yoast_wpseo_meta-robots-noindex', true);
            if ($yoast === '1') {
                $noindex_pages[] = $url;
            }
            $yoast_nf = get_post_meta($post->ID, '_yoast_wpseo_meta-robots-nofollow', true);
            if ($yoast_nf === '1') {
                $nofollow_pages[] = $url;
            }

            // Rank Math
            $rm_robots = get_post_meta($post->ID, 'rank_math_robots', true);
            if (is_array($rm_robots)) {
                if (in_array('noindex', $rm_robots)) $noindex_pages[] = $url;
                if (in_array('nofollow', $rm_robots)) $nofollow_pages[] = $url;
            }

            // Check if URL is blocked by robots.txt
            $path = parse_url($url, PHP_URL_PATH);
            foreach ($disallow_rules as $rule) {
                if (!empty($rule) && $rule !== '/' && strpos($path, $rule) === 0) {
                    $blocked_urls[] = ['url' => $url, 'rule' => $rule];
                    break;
                }
            }
        }

        return [
            'success'          => true,
            'robots_txt'       => $robots_txt,
            'disallow_rules'   => $disallow_rules,
            'blocked_urls'     => array_slice($blocked_urls, 0, 50),
            'noindex_pages'    => array_slice(array_unique($noindex_pages), 0, 50),
            'nofollow_pages'   => array_slice(array_unique($nofollow_pages), 0, 50),
            'noindex_count'    => count(array_unique($noindex_pages)),
            'nofollow_count'   => count(array_unique($nofollow_pages)),
            'blocked_count'    => count($blocked_urls),
        ];
    }

    /**
     * Audit images for missing alt, size, dimensions.
     */
    public static function audit_images($params = []) {
        $limit = isset($params['limit']) ? intval($params['limit']) : 200;

        $posts = get_posts([
            'post_type'   => ['post', 'page'],
            'post_status' => 'publish',
            'numberposts' => $limit,
        ]);

        $missing_alt = 0;
        $missing_dimensions = 0;
        $total_images = 0;
        $issues = [];

        foreach ($posts as $post) {
            $url = get_permalink($post->ID);
            preg_match_all('/<img[^>]+>/i', $post->post_content, $img_matches);

            foreach ($img_matches[0] as $img_tag) {
                $total_images++;

                // Check alt
                if (!preg_match('/alt=["\'][^"\']+["\']/i', $img_tag)) {
                    $missing_alt++;
                    preg_match('/src=["\']([^"\']+)["\']/i', $img_tag, $src);
                    $issues[] = [
                        'url'   => $url,
                        'issue' => 'missing_alt',
                        'image' => $src[1] ?? 'unknown',
                    ];
                }

                // Check width/height
                if (!preg_match('/width=/i', $img_tag) || !preg_match('/height=/i', $img_tag)) {
                    $missing_dimensions++;
                }
            }
        }

        return [
            'success'            => true,
            'total_images'       => $total_images,
            'missing_alt'        => $missing_alt,
            'missing_dimensions' => $missing_dimensions,
            'issues'             => array_slice($issues, 0, 50),
        ];
    }

    // ===== HELPERS =====

    private static function is_internal_url($url) {
        $home = parse_url(home_url(), PHP_URL_HOST);
        $link_host = parse_url($url, PHP_URL_HOST);
        if (empty($link_host)) return true; // Relative URL
        return $link_host === $home || $link_host === 'www.' . $home;
    }

    private static function resolve_url($url, $base) {
        if (preg_match('/^https?:\/\//', $url)) return $url;
        if (strpos($url, '//') === 0) return 'https:' . $url;
        if (strpos($url, '/') === 0) {
            $parsed = parse_url($base);
            return ($parsed['scheme'] ?? 'https') . '://' . ($parsed['host'] ?? '') . $url;
        }
        return rtrim($base, '/') . '/' . ltrim($url, '/');
    }

    private static function get_meta_description($post_id) {
        // Yoast
        $desc = get_post_meta($post_id, '_yoast_wpseo_metadesc', true);
        if (!empty($desc)) return $desc;

        // Rank Math
        $desc = get_post_meta($post_id, 'rank_math_description', true);
        if (!empty($desc)) return $desc;

        // AIOSEO
        $desc = get_post_meta($post_id, '_aioseo_description', true);
        if (!empty($desc)) return $desc;

        return '';
    }

    private static function get_seo_title($post_id) {
        // Yoast
        $title = get_post_meta($post_id, '_yoast_wpseo_title', true);
        if (!empty($title)) return $title;

        // Rank Math
        $title = get_post_meta($post_id, 'rank_math_title', true);
        if (!empty($title)) return $title;

        // AIOSEO
        $title = get_post_meta($post_id, '_aioseo_title', true);
        if (!empty($title)) return $title;

        return '';
    }
}
