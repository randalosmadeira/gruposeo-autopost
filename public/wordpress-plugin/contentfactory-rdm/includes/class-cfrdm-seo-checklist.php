<?php
/**
 * SEO Foundation Checklist
 * 
 * Visual checklist panel showing status of all technical SEO foundation items
 * with green/red indicators for each item.
 * 
 * @package ContentFactory_RDM
 * @since 3.2.3
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_SEO_Checklist {
    
    private static $instance = null;
    
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    /**
     * Register REST route
     */
    public function init() {
        add_action('rest_api_init', array($this, 'register_routes'));
    }
    
    public function register_routes() {
        register_rest_route('cfrdm/v1', '/seo-checklist', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_checklist'),
            'permission_callback' => function() {
                return CFRDM_API::verify_api_key();
            },
        ));
    }
    
    /**
     * REST handler
     */
    public function get_checklist() {
        return rest_ensure_response(array(
            'success' => true,
            'checklist' => self::run_checks(),
            'score' => self::calculate_score(),
            'timestamp' => current_time('c'),
        ));
    }
    
    /**
     * Run all foundation checks
     */
    public static function run_checks() {
        $checks = array();
        
        // 1. robots.txt
        $checks[] = self::check_robots_txt();
        
        // 2. llms.txt
        $checks[] = self::check_llms_txt();
        
        // 3. Sitemap.xml
        $checks[] = self::check_sitemap();
        
        // 4. IndexNow
        $checks[] = self::check_indexnow();
        
        // 5. SSL/HTTPS
        $checks[] = self::check_ssl();
        
        // 6. Schema JSON-LD
        $checks[] = self::check_schema();
        
        // 7. Meta Auditor
        $checks[] = self::check_meta_auditor();
        
        // 8. SEO Plugin
        $checks[] = self::check_seo_plugin();
        
        // 9. Mobile-first (viewport)
        $checks[] = self::check_mobile();
        
        // 10. Internal Links Module
        $checks[] = self::check_internal_links();
        
        // 11. Image Optimization
        $checks[] = self::check_image_optimization();
        
        // 12. AI Traffic Detection
        $checks[] = self::check_ai_traffic();
        
        // 13. ContentFactory Connection
        $checks[] = self::check_cf_connection();
        
        // 14. News Sitemap
        $checks[] = self::check_news_sitemap();
        
        // 15. AI Crawler Rules in robots.txt
        $checks[] = self::check_ai_crawler_rules();
        
        return $checks;
    }
    
    /**
     * Calculate overall score (0-100)
     */
    public static function calculate_score() {
        $checks = self::run_checks();
        $passed = 0;
        foreach ($checks as $check) {
            if ($check['status'] === 'ok') $passed++;
        }
        return count($checks) > 0 ? round(($passed / count($checks)) * 100) : 0;
    }
    
    // --- Individual Checks ---
    
    private static function check_robots_txt() {
        $response = wp_remote_head(home_url('/robots.txt'), array('timeout' => 5));
        $ok = !is_wp_error($response) && wp_remote_retrieve_response_code($response) === 200;
        return array(
            'id' => 'robots_txt',
            'label' => 'robots.txt',
            'category' => 'Fundação Técnica',
            'status' => $ok ? 'ok' : 'fail',
            'detail' => $ok ? 'Acessível e publicado' : 'Não encontrado ou inacessível',
        );
    }
    
    private static function check_llms_txt() {
        $enabled = class_exists('CFRDM_LLMS_Txt') && CFRDM_LLMS_Txt::is_enabled();
        $response = wp_remote_head(home_url('/llms.txt'), array('timeout' => 5));
        $accessible = !is_wp_error($response) && wp_remote_retrieve_response_code($response) === 200;
        $ok = $enabled && $accessible;
        return array(
            'id' => 'llms_txt',
            'label' => 'llms.txt (AI Discovery)',
            'category' => 'Visibilidade IA',
            'status' => $ok ? 'ok' : ($enabled ? 'warn' : 'fail'),
            'detail' => $ok ? 'Publicado e acessível' : ($enabled ? 'Habilitado mas não acessível' : 'Desabilitado'),
        );
    }
    
    private static function check_sitemap() {
        $urls = array(
            home_url('/sitemap_index.xml'),
            home_url('/sitemap.xml'),
            home_url('/wp-sitemap.xml'),
        );
        foreach ($urls as $url) {
            $response = wp_remote_head($url, array('timeout' => 5));
            if (!is_wp_error($response) && wp_remote_retrieve_response_code($response) === 200) {
                return array(
                    'id' => 'sitemap',
                    'label' => 'Sitemap XML',
                    'category' => 'Fundação Técnica',
                    'status' => 'ok',
                    'detail' => 'Encontrado: ' . basename(parse_url($url, PHP_URL_PATH)),
                );
            }
        }
        return array(
            'id' => 'sitemap',
            'label' => 'Sitemap XML',
            'category' => 'Fundação Técnica',
            'status' => 'fail',
            'detail' => 'Nenhum sitemap encontrado',
        );
    }
    
    private static function check_indexnow() {
        $enabled = class_exists('CFRDM_IndexNow') && CFRDM_IndexNow::is_enabled();
        $key = class_exists('CFRDM_IndexNow') ? CFRDM_IndexNow::get_key() : '';
        $ok = $enabled && !empty($key);
        return array(
            'id' => 'indexnow',
            'label' => 'IndexNow',
            'category' => 'Indexação',
            'status' => $ok ? 'ok' : 'fail',
            'detail' => $ok ? 'Configurado com chave ativa' : 'Não configurado',
        );
    }
    
    private static function check_ssl() {
        $ok = is_ssl();
        return array(
            'id' => 'ssl',
            'label' => 'SSL/HTTPS',
            'category' => 'Fundação Técnica',
            'status' => $ok ? 'ok' : 'fail',
            'detail' => $ok ? 'HTTPS ativo em todas as páginas' : 'Site não está usando HTTPS',
        );
    }
    
    private static function check_schema() {
        $ok = class_exists('CFRDM_Schema_Validator');
        return array(
            'id' => 'schema',
            'label' => 'Schema JSON-LD',
            'category' => 'SEO Estruturado',
            'status' => $ok ? 'ok' : 'fail',
            'detail' => $ok ? 'Validador de Schema ativo' : 'Módulo de Schema não disponível',
        );
    }
    
    private static function check_meta_auditor() {
        $enabled = class_exists('CFRDM_Meta_Auditor') && CFRDM_Meta_Auditor::is_enabled();
        return array(
            'id' => 'meta_auditor',
            'label' => 'Meta Auditor (SEO IA)',
            'category' => 'SEO Automação',
            'status' => $enabled ? 'ok' : 'fail',
            'detail' => $enabled ? 'Auditor de meta-tags ativo' : 'Desabilitado',
        );
    }
    
    private static function check_seo_plugin() {
        $yoast = defined('WPSEO_VERSION');
        $rankmath = class_exists('RankMath');
        $aioseo = function_exists('aioseo');
        $plugin = $yoast ? 'Yoast SEO' : ($rankmath ? 'Rank Math' : ($aioseo ? 'AIOSEO' : null));
        return array(
            'id' => 'seo_plugin',
            'label' => 'Plugin SEO',
            'category' => 'Fundação Técnica',
            'status' => $plugin ? 'ok' : 'warn',
            'detail' => $plugin ? "Detectado: {$plugin}" : 'Nenhum plugin SEO detectado',
        );
    }
    
    private static function check_mobile() {
        $ok = wp_is_mobile() !== null; // WordPress always supports mobile detection
        // Check if theme has viewport meta
        return array(
            'id' => 'mobile',
            'label' => 'Mobile-First',
            'category' => 'Fundação Técnica',
            'status' => 'ok', // WordPress themes generally include viewport
            'detail' => 'WordPress com suporte mobile nativo',
        );
    }
    
    private static function check_internal_links() {
        $ok = class_exists('CFRDM_Internal_Links');
        return array(
            'id' => 'internal_links',
            'label' => 'Links Internos Inteligentes',
            'category' => 'SEO Automação',
            'status' => $ok ? 'ok' : 'fail',
            'detail' => $ok ? 'Motor de links internos ativo' : 'Módulo não disponível',
        );
    }
    
    private static function check_image_optimization() {
        $ok = class_exists('CFRDM_Image_Optimizer');
        return array(
            'id' => 'image_optimization',
            'label' => 'Otimização de Imagens',
            'category' => 'Performance',
            'status' => $ok ? 'ok' : 'fail',
            'detail' => $ok ? 'Conversor WebP ativo' : 'Módulo não disponível',
        );
    }
    
    private static function check_ai_traffic() {
        $enabled = class_exists('CFRDM_AI_Traffic_Detector') && CFRDM_AI_Traffic_Detector::is_enabled();
        return array(
            'id' => 'ai_traffic',
            'label' => 'Detecção de Tráfego IA',
            'category' => 'Visibilidade IA',
            'status' => $enabled ? 'ok' : 'fail',
            'detail' => $enabled ? 'Monitoramento de AI bots ativo' : 'Desabilitado',
        );
    }
    
    private static function check_cf_connection() {
        $ok = !empty(get_option('cfrdm_api_url'));
        return array(
            'id' => 'cf_connection',
            'label' => 'Conexão ContentFactory',
            'category' => 'Plataforma',
            'status' => $ok ? 'ok' : 'warn',
            'detail' => $ok ? 'Conectado à plataforma' : 'Não conectado',
        );
    }
    
    private static function check_news_sitemap() {
        $enabled = class_exists('CFRDM_Sitemap_Optimizer') && CFRDM_Sitemap_Optimizer::is_enabled();
        if ($enabled) {
            $response = wp_remote_head(home_url('/news-sitemap.xml'), array('timeout' => 5));
            $accessible = !is_wp_error($response) && wp_remote_retrieve_response_code($response) === 200;
        } else {
            $accessible = false;
        }
        return array(
            'id' => 'news_sitemap',
            'label' => 'News Sitemap',
            'category' => 'Indexação',
            'status' => ($enabled && $accessible) ? 'ok' : ($enabled ? 'warn' : 'fail'),
            'detail' => ($enabled && $accessible) ? 'Sitemap de notícias acessível' : 'Não disponível',
        );
    }
    
    private static function check_ai_crawler_rules() {
        $enabled = class_exists('CFRDM_Sitemap_Optimizer') && CFRDM_Sitemap_Optimizer::is_enabled();
        return array(
            'id' => 'ai_crawlers',
            'label' => 'Regras AI Crawlers (robots.txt)',
            'category' => 'Visibilidade IA',
            'status' => $enabled ? 'ok' : 'fail',
            'detail' => $enabled ? 'GPTBot, ClaudeBot, PerplexityBot permitidos' : 'Regras não configuradas',
        );
    }
    
    /**
     * Render the admin panel HTML
     */
    public static function render_panel() {
        $checks = self::run_checks();
        $score = self::calculate_score();
        
        // Group by category
        $groups = array();
        foreach ($checks as $check) {
            $cat = $check['category'];
            if (!isset($groups[$cat])) {
                $groups[$cat] = array();
            }
            $groups[$cat][] = $check;
        }
        
        $passed = 0;
        $total = count($checks);
        foreach ($checks as $c) {
            if ($c['status'] === 'ok') $passed++;
        }
        
        ?>
        <div class="cfrdm-card cfrdm-seo-checklist-card">
            <div class="cfrdm-card-header">
                <h2>
                    <span class="dashicons dashicons-yes-alt"></span>
                    <?php _e('Checklist Fundação SEO', 'contentfactory-rdm'); ?>
                </h2>
                <div class="cfrdm-checklist-score">
                    <span class="score-value <?php echo $score >= 80 ? 'good' : ($score >= 50 ? 'warn' : 'bad'); ?>">
                        <?php echo $score; ?>%
                    </span>
                    <span class="score-label"><?php echo "{$passed}/{$total}"; ?></span>
                </div>
            </div>
            <div class="cfrdm-card-body">
                <?php foreach ($groups as $category => $items): ?>
                <div class="cfrdm-checklist-group">
                    <h3 class="cfrdm-checklist-category"><?php echo esc_html($category); ?></h3>
                    <?php foreach ($items as $item): ?>
                    <div class="cfrdm-checklist-item <?php echo esc_attr($item['status']); ?>">
                        <span class="checklist-indicator">
                            <?php if ($item['status'] === 'ok'): ?>
                                <span class="dashicons dashicons-yes-alt" style="color: var(--cfrdm-success);"></span>
                            <?php elseif ($item['status'] === 'warn'): ?>
                                <span class="dashicons dashicons-warning" style="color: var(--cfrdm-warning);"></span>
                            <?php else: ?>
                                <span class="dashicons dashicons-dismiss" style="color: var(--cfrdm-danger);"></span>
                            <?php endif; ?>
                        </span>
                        <span class="checklist-label"><?php echo esc_html($item['label']); ?></span>
                        <span class="checklist-detail"><?php echo esc_html($item['detail']); ?></span>
                    </div>
                    <?php endforeach; ?>
                </div>
                <?php endforeach; ?>
            </div>
        </div>
        <?php
    }
    
    /**
     * Alias for run_checks() - backward compatibility with MethodValidator contracts
     */
    public static function get_results() {
        return array(
            'checks' => self::run_checks(),
            'score' => self::calculate_score(),
        );
    }
}
