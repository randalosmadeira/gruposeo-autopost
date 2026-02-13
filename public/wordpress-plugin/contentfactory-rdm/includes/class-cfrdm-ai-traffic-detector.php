<?php
/**
 * AI Traffic Detector
 * 
 * Detects and tracks visits from AI bots/crawlers via User-Agent analysis.
 * Tracks: ChatGPT, Perplexity, Gemini, Claude, Copilot, Cohere, etc.
 * 
 * @package ContentFactory_RDM
 * @since 3.2.3
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_AI_Traffic_Detector {
    
    const OPTION_ENABLED = 'cfrdm_ai_traffic_enabled';
    const OPTION_STATS = 'cfrdm_ai_traffic_stats';
    const OPTION_DAILY_LOG = 'cfrdm_ai_traffic_daily';
    
    /**
     * AI bot signatures: user-agent pattern => display label
     */
    private static $ai_bots = array(
        'GPTBot'          => 'ChatGPT (OpenAI)',
        'ChatGPT-User'    => 'ChatGPT Browser',
        'OAI-SearchBot'   => 'OpenAI Search',
        'PerplexityBot'   => 'Perplexity',
        'ClaudeBot'       => 'Claude (Anthropic)',
        'Claude-Web'      => 'Claude Web',
        'Anthropic-AI'    => 'Anthropic',
        'Google-Extended' => 'Gemini (Google)',
        'Googlebot'       => 'Google Search',
        'Bingbot'         => 'Bing Search',
        'Bytespider'      => 'ByteDance/TikTok',
        'cohere-ai'       => 'Cohere AI',
        'YouBot'          => 'You.com',
        'CCBot'           => 'Common Crawl',
        'meta-externalagent' => 'Meta AI',
        'Applebot-Extended' => 'Apple Intelligence',
    );
    
    private static $instance = null;
    
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    /**
     * Initialize detector
     */
    public function init() {
        if (!self::is_enabled()) {
            return;
        }
        
        // Track on every frontend request (not admin)
        if (!is_admin() && !wp_doing_ajax() && !wp_doing_cron()) {
            add_action('wp', array($this, 'detect_ai_visit'), 1);
        }
        
        // REST API endpoint for stats
        add_action('rest_api_init', array($this, 'register_routes'));
        
        // Daily cleanup
        add_action('cfrdm_daily_cleanup', array($this, 'cleanup_old_data'));
    }
    
    public static function is_enabled() {
        return (bool) get_option(self::OPTION_ENABLED, true);
    }
    
    /**
     * Detect AI bot visit and log it
     */
    public function detect_ai_visit() {
        $user_agent = $_SERVER['HTTP_USER_AGENT'] ?? '';
        if (empty($user_agent)) return;
        
        $detected_bot = null;
        $detected_label = null;
        
        foreach (self::$ai_bots as $pattern => $label) {
            if (stripos($user_agent, $pattern) !== false) {
                $detected_bot = $pattern;
                $detected_label = $label;
                break;
            }
        }
        
        if (!$detected_bot) return;
        
        // Get current URL being crawled
        $url = home_url(add_query_arg(array(), $_SERVER['REQUEST_URI'] ?? '/'));
        $today = date('Y-m-d');
        
        // Update cumulative stats
        $stats = get_option(self::OPTION_STATS, array());
        if (!isset($stats[$detected_bot])) {
            $stats[$detected_bot] = array(
                'label' => $detected_label,
                'total_visits' => 0,
                'first_seen' => $today,
                'last_seen' => $today,
                'pages_crawled' => array(),
            );
        }
        
        $stats[$detected_bot]['total_visits']++;
        $stats[$detected_bot]['last_seen'] = $today;
        
        // Keep last 50 unique pages crawled per bot
        $pages = &$stats[$detected_bot]['pages_crawled'];
        if (!in_array($url, $pages)) {
            $pages[] = $url;
            if (count($pages) > 50) {
                $pages = array_slice($pages, -50);
            }
        }
        
        update_option(self::OPTION_STATS, $stats, false);
        
        // Update daily log (last 90 days)
        $daily = get_option(self::OPTION_DAILY_LOG, array());
        if (!isset($daily[$today])) {
            $daily[$today] = array();
        }
        if (!isset($daily[$today][$detected_bot])) {
            $daily[$today][$detected_bot] = 0;
        }
        $daily[$today][$detected_bot]++;
        
        update_option(self::OPTION_DAILY_LOG, $daily, false);
    }
    
    /**
     * Register REST routes
     */
    public function register_routes() {
        register_rest_route('cfrdm/v1', '/ai-traffic', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_traffic_stats'),
            'permission_callback' => function() {
                return CFRDM_API::verify_api_key();
            },
        ));
    }
    
    /**
     * Get traffic stats via REST
     */
    public function get_traffic_stats() {
        $stats = get_option(self::OPTION_STATS, array());
        $daily = get_option(self::OPTION_DAILY_LOG, array());
        
        // Calculate totals
        $total_ai_visits = 0;
        $bots_summary = array();
        
        foreach ($stats as $bot_id => $data) {
            $total_ai_visits += $data['total_visits'];
            $bots_summary[] = array(
                'bot_id' => $bot_id,
                'label' => $data['label'],
                'total_visits' => $data['total_visits'],
                'first_seen' => $data['first_seen'],
                'last_seen' => $data['last_seen'],
                'pages_count' => count($data['pages_crawled']),
            );
        }
        
        // Sort by visits descending
        usort($bots_summary, function($a, $b) {
            return $b['total_visits'] - $a['total_visits'];
        });
        
        // Last 30 days daily breakdown
        $last_30_days = array();
        for ($i = 29; $i >= 0; $i--) {
            $date = date('Y-m-d', strtotime("-{$i} days"));
            $last_30_days[$date] = $daily[$date] ?? array();
        }
        
        return rest_ensure_response(array(
            'success' => true,
            'total_ai_visits' => $total_ai_visits,
            'bots' => $bots_summary,
            'daily' => $last_30_days,
            'tracked_bots' => count(self::$ai_bots),
        ));
    }
    
    /**
     * Get stats for admin dashboard display
     */
    public static function get_dashboard_stats() {
        $stats = get_option(self::OPTION_STATS, array());
        $daily = get_option(self::OPTION_DAILY_LOG, array());
        $today = date('Y-m-d');
        $yesterday = date('Y-m-d', strtotime('-1 day'));
        
        $total = 0;
        $today_total = 0;
        $yesterday_total = 0;
        $bots = array();
        
        foreach ($stats as $bot_id => $data) {
            $total += $data['total_visits'];
            $bots[] = array(
                'id' => $bot_id,
                'label' => $data['label'],
                'visits' => $data['total_visits'],
                'last_seen' => $data['last_seen'],
            );
        }
        
        if (isset($daily[$today])) {
            $today_total = array_sum($daily[$today]);
        }
        if (isset($daily[$yesterday])) {
            $yesterday_total = array_sum($daily[$yesterday]);
        }
        
        // Sort by visits
        usort($bots, function($a, $b) {
            return $b['visits'] - $a['visits'];
        });
        
        return array(
            'total' => $total,
            'today' => $today_total,
            'yesterday' => $yesterday_total,
            'trend' => $yesterday_total > 0 
                ? round((($today_total - $yesterday_total) / $yesterday_total) * 100) 
                : ($today_total > 0 ? 100 : 0),
            'bots' => array_slice($bots, 0, 10),
        );
    }
    
    /**
     * Cleanup data older than 90 days
     */
    public function cleanup_old_data() {
        $daily = get_option(self::OPTION_DAILY_LOG, array());
        $cutoff = date('Y-m-d', strtotime('-90 days'));
        
        foreach ($daily as $date => $data) {
            if ($date < $cutoff) {
                unset($daily[$date]);
            }
        }
        
        update_option(self::OPTION_DAILY_LOG, $daily, false);
    }
}
