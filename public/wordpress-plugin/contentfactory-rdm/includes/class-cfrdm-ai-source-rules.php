<?php
/**
 * AI Source Detection Rules
 * 
 * Configurable rules table for detecting AI session sources.
 * Each rule has: Fonte IA, Campo, Operador, Valor
 * Used to identify traffic from ChatGPT, Claude, Perplexity, Gemini, etc.
 * and trigger automatic indexing submission via Google Indexing API.
 * 
 * @package ContentFactory_RDM
 * @since 3.2.7
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_AI_Source_Rules {
    
    const OPTION_RULES = 'cfrdm_ai_source_rules';
    const OPTION_ENABLED = 'cfrdm_ai_source_rules_enabled';
    const OPTION_AUTO_INDEX = 'cfrdm_ai_source_auto_index';
    const RULES_TABLE = 'cfrdm_ai_source_hits';
    
    private static $instance = null;
    
    /**
     * Default rules — Fonte IA | Campo | Operador | Valor
     */
    private static $default_rules = array(
        array('fonte' => 'ChatGPT',    'campo' => 'source', 'operador' => 'contains', 'valor' => 'chatgpt'),
        array('fonte' => 'OpenAI',     'campo' => 'source', 'operador' => 'contains', 'valor' => 'openai'),
        array('fonte' => 'Anthropic',  'campo' => 'source', 'operador' => 'contains', 'valor' => 'anthropic'),
        array('fonte' => 'Claude',     'campo' => 'source', 'operador' => 'contains', 'valor' => 'claude'),
        array('fonte' => 'Perplexity', 'campo' => 'source', 'operador' => 'contains', 'valor' => 'perplexity'),
        array('fonte' => 'Gemini',     'campo' => 'source', 'operador' => 'contains', 'valor' => 'gemini'),
        array('fonte' => 'Copilot',    'campo' => 'source', 'operador' => 'contains', 'valor' => 'copilot'),
        array('fonte' => 'DeepSeek',   'campo' => 'source', 'operador' => 'contains', 'valor' => 'deepseek'),
        array('fonte' => 'Grok',       'campo' => 'source', 'operador' => 'contains', 'valor' => 'grok'),
        array('fonte' => 'Meta AI',    'campo' => 'source', 'operador' => 'contains', 'valor' => 'meta.ai'),
    );
    
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
        
        // Detect AI referral on every frontend request
        if (!is_admin() && !wp_doing_ajax() && !wp_doing_cron()) {
            add_action('wp', array($this, 'detect_ai_referral'), 2);
        }
        
        // REST API endpoints
        add_action('rest_api_init', array($this, 'register_routes'));
        
        // Ensure default rules exist
        $this->ensure_default_rules();
    }
    
    public static function is_enabled() {
        return (bool) get_option(self::OPTION_ENABLED, true);
    }
    
    /**
     * Ensure default rules are stored
     */
    private function ensure_default_rules() {
        $rules = get_option(self::OPTION_RULES);
        if (empty($rules)) {
            update_option(self::OPTION_RULES, self::$default_rules);
        }
    }
    
    /**
     * Get all rules
     */
    public static function get_rules() {
        $rules = get_option(self::OPTION_RULES, self::$default_rules);
        return is_array($rules) ? $rules : self::$default_rules;
    }
    
    /**
     * Update rules
     */
    public static function update_rules($rules) {
        $sanitized = array();
        foreach ($rules as $rule) {
            $sanitized[] = array(
                'fonte'    => sanitize_text_field($rule['fonte'] ?? ''),
                'campo'    => sanitize_text_field($rule['campo'] ?? 'source'),
                'operador' => sanitize_text_field($rule['operador'] ?? 'contains'),
                'valor'    => sanitize_text_field($rule['valor'] ?? ''),
            );
        }
        update_option(self::OPTION_RULES, $sanitized);
        return $sanitized;
    }
    
    /**
     * Detect AI referral from session source (referrer, query params, user-agent)
     */
    public function detect_ai_referral() {
        $referrer   = $_SERVER['HTTP_REFERER'] ?? '';
        $user_agent = $_SERVER['HTTP_USER_AGENT'] ?? '';
        $request_uri = $_SERVER['REQUEST_URI'] ?? '';
        $query_string = $_SERVER['QUERY_STRING'] ?? '';
        
        // Build a composite source string for rule matching
        $source_string = strtolower(implode(' ', array($referrer, $user_agent, $request_uri, $query_string)));
        
        $rules = self::get_rules();
        $matched_rule = null;
        
        foreach ($rules as $rule) {
            if (empty($rule['valor'])) continue;
            
            $campo_value = $source_string; // Default: check all
            
            // Specific field matching
            switch ($rule['campo']) {
                case 'referrer':
                    $campo_value = strtolower($referrer);
                    break;
                case 'user_agent':
                    $campo_value = strtolower($user_agent);
                    break;
                case 'query_string':
                    $campo_value = strtolower($query_string);
                    break;
                case 'source':
                default:
                    $campo_value = $source_string;
                    break;
            }
            
            $match = false;
            $valor = strtolower($rule['valor']);
            
            switch ($rule['operador']) {
                case 'contains':
                    $match = (strpos($campo_value, $valor) !== false);
                    break;
                case 'equals':
                    $match = ($campo_value === $valor);
                    break;
                case 'starts_with':
                    $match = (strpos($campo_value, $valor) === 0);
                    break;
                case 'ends_with':
                    $match = (substr($campo_value, -strlen($valor)) === $valor);
                    break;
                case 'regex':
                    $match = (bool) @preg_match('/' . $rule['valor'] . '/i', $campo_value);
                    break;
            }
            
            if ($match) {
                $matched_rule = $rule;
                break;
            }
        }
        
        if (!$matched_rule) return;
        
        // Get current URL being visited
        $current_url = home_url(add_query_arg(array(), $_SERVER['REQUEST_URI'] ?? '/'));
        $today = date('Y-m-d');
        
        // Log the AI referral hit
        $hits = get_option('cfrdm_ai_source_hits_log', array());
        $hits[] = array(
            'fonte'     => $matched_rule['fonte'],
            'url'       => $current_url,
            'referrer'  => $referrer,
            'timestamp' => current_time('mysql'),
            'date'      => $today,
        );
        
        // Keep last 500 hits
        if (count($hits) > 500) {
            $hits = array_slice($hits, -500);
        }
        update_option('cfrdm_ai_source_hits_log', $hits, false);
        
        // Update daily AI source stats
        $daily = get_option('cfrdm_ai_source_daily', array());
        if (!isset($daily[$today])) {
            $daily[$today] = array();
        }
        $fonte = $matched_rule['fonte'];
        if (!isset($daily[$today][$fonte])) {
            $daily[$today][$fonte] = 0;
        }
        $daily[$today][$fonte]++;
        update_option('cfrdm_ai_source_daily', $daily, false);
        
        // Auto-submit to Google Indexing API if enabled
        if (get_option(self::OPTION_AUTO_INDEX, true)) {
            $this->auto_submit_for_indexing($current_url);
        }
        
        CFRDM_Logger::info('ai_source', 'Visita via IA detectada', array(
            'fonte' => $matched_rule['fonte'],
            'url' => $current_url,
            'referrer' => substr($referrer, 0, 200),
        ));
    }
    
    /**
     * Auto-submit URL for indexing when AI traffic is detected
     */
    private function auto_submit_for_indexing($url) {
        // Use IndexNow if available
        if (class_exists('CFRDM_IndexNow')) {
            try {
                CFRDM_IndexNow::get_instance()->submit_indexnow($url);
            } catch (\Throwable $e) {
                // Silent fail
            }
        }
        
        // Use Google Indexing API if GSC is connected
        if (class_exists('CFRDM_Google_Indexing_Submitter')) {
            try {
                CFRDM_Google_Indexing_Submitter::get_instance()->submit_url($url);
            } catch (\Throwable $e) {
                // Silent fail
            }
        }
    }
    
    /**
     * Register REST routes
     */
    public function register_routes() {
        register_rest_route('cfrdm/v1', '/ai-source-rules', array(
            array(
                'methods' => 'GET',
                'callback' => array($this, 'rest_get_rules'),
                'permission_callback' => function() {
                    return CFRDM_API::verify_api_key();
                },
            ),
            array(
                'methods' => 'POST',
                'callback' => array($this, 'rest_update_rules'),
                'permission_callback' => function() {
                    return CFRDM_API::verify_api_key();
                },
            ),
        ));
        
        register_rest_route('cfrdm/v1', '/ai-source-stats', array(
            'methods' => 'GET',
            'callback' => array($this, 'rest_get_stats'),
            'permission_callback' => function() {
                return CFRDM_API::verify_api_key();
            },
        ));
    }
    
    /**
     * REST: Get rules
     */
    public function rest_get_rules() {
        return rest_ensure_response(array(
            'success' => true,
            'rules' => self::get_rules(),
            'auto_index' => (bool) get_option(self::OPTION_AUTO_INDEX, true),
        ));
    }
    
    /**
     * REST: Update rules
     */
    public function rest_update_rules($request) {
        $params = $request->get_json_params();
        
        if (isset($params['rules']) && is_array($params['rules'])) {
            $rules = self::update_rules($params['rules']);
        }
        
        if (isset($params['auto_index'])) {
            update_option(self::OPTION_AUTO_INDEX, (bool) $params['auto_index']);
        }
        
        return rest_ensure_response(array(
            'success' => true,
            'rules' => self::get_rules(),
        ));
    }
    
    /**
     * REST: Get stats
     */
    public function rest_get_stats() {
        $daily = get_option('cfrdm_ai_source_daily', array());
        $hits = get_option('cfrdm_ai_source_hits_log', array());
        
        // Last 30 days breakdown
        $last_30 = array();
        for ($i = 29; $i >= 0; $i--) {
            $date = date('Y-m-d', strtotime("-{$i} days"));
            $last_30[$date] = $daily[$date] ?? array();
        }
        
        // Totals by fonte
        $totals = array();
        foreach ($daily as $date => $fontes) {
            foreach ($fontes as $fonte => $count) {
                if (!isset($totals[$fonte])) $totals[$fonte] = 0;
                $totals[$fonte] += $count;
            }
        }
        arsort($totals);
        
        // Recent hits (last 50)
        $recent = array_slice(array_reverse($hits), 0, 50);
        
        return rest_ensure_response(array(
            'success' => true,
            'totals_by_source' => $totals,
            'daily' => $last_30,
            'recent_hits' => $recent,
            'rules_count' => count(self::get_rules()),
        ));
    }
    
    /**
     * Dashboard stats summary
     */
    public static function get_dashboard_stats() {
        $daily = get_option('cfrdm_ai_source_daily', array());
        $today = date('Y-m-d');
        $yesterday = date('Y-m-d', strtotime('-1 day'));
        
        $today_total = isset($daily[$today]) ? array_sum($daily[$today]) : 0;
        $yesterday_total = isset($daily[$yesterday]) ? array_sum($daily[$yesterday]) : 0;
        
        $total = 0;
        $by_fonte = array();
        foreach ($daily as $date => $fontes) {
            foreach ($fontes as $fonte => $count) {
                $total += $count;
                if (!isset($by_fonte[$fonte])) $by_fonte[$fonte] = 0;
                $by_fonte[$fonte] += $count;
            }
        }
        
        return array(
            'total' => $total,
            'today' => $today_total,
            'yesterday' => $yesterday_total,
            'by_fonte' => $by_fonte,
        );
    }
}
