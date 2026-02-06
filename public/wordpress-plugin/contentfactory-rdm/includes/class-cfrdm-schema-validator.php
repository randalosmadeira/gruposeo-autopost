<?php
/**
 * Schema Validator for ContentFactory RDM
 * 
 * Validates JSON-LD schemas before publication to ensure
 * they meet Google Rich Results requirements
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_Schema_Validator {
    
    /**
     * Required fields for each schema type based on Google guidelines
     */
    private static $required_fields = array(
        'Article' => array(
            'required' => array('@type', 'headline', 'datePublished', 'author'),
            'recommended' => array('image', 'dateModified', 'publisher', 'description'),
        ),
        'Product' => array(
            'required' => array('@type', 'name'),
            'recommended' => array('image', 'description', 'brand', 'offers', 'aggregateRating', 'review'),
        ),
        'Review' => array(
            'required' => array('@type', 'itemReviewed', 'reviewRating', 'author'),
            'recommended' => array('datePublished', 'reviewBody'),
        ),
        'FAQPage' => array(
            'required' => array('@type', 'mainEntity'),
            'recommended' => array(),
        ),
        'Question' => array(
            'required' => array('@type', 'name', 'acceptedAnswer'),
            'recommended' => array(),
        ),
        'BreadcrumbList' => array(
            'required' => array('@type', 'itemListElement'),
            'recommended' => array(),
        ),
        'ImageObject' => array(
            'required' => array('@type', 'contentUrl'),
            'recommended' => array('name', 'description', 'width', 'height'),
        ),
        'ItemList' => array(
            'required' => array('@type', 'itemListElement'),
            'recommended' => array('name', 'numberOfItems'),
        ),
        'Offer' => array(
            'required' => array('@type', 'price', 'priceCurrency'),
            'recommended' => array('availability', 'url'),
        ),
        'AggregateRating' => array(
            'required' => array('@type', 'ratingValue'),
            'recommended' => array('bestRating', 'worstRating', 'ratingCount'),
        ),
    );
    
    /**
     * Validation rules for specific fields
     */
    private static $field_rules = array(
        'headline' => array(
            'max_length' => 110,
            'min_length' => 10,
        ),
        'description' => array(
            'max_length' => 320,
            'min_length' => 50,
        ),
        'datePublished' => array(
            'format' => 'iso8601',
        ),
        'dateModified' => array(
            'format' => 'iso8601',
        ),
        'ratingValue' => array(
            'type' => 'numeric',
            'min' => 0,
            'max' => 5,
        ),
        'price' => array(
            'type' => 'numeric',
            'min' => 0,
        ),
    );
    
    /**
     * Initialize validator hooks
     */
    public static function init() {
        // Register REST endpoint for validation
        add_action('rest_api_init', array(__CLASS__, 'register_routes'));
        
        // Add validation before publish
        add_action('wp_insert_post', array(__CLASS__, 'validate_on_save'), 10, 3);
        
        // Add admin notice for validation issues
        add_action('admin_notices', array(__CLASS__, 'show_validation_notices'));
    }
    
    /**
     * Register REST API routes
     */
    public static function register_routes() {
        register_rest_route('cfrdm/v1', '/schema/validate', array(
            'methods' => 'POST',
            'callback' => array(__CLASS__, 'validate_schema_endpoint'),
            'permission_callback' => array('CFRDM_API', 'verify_api_key'),
        ));
        
        register_rest_route('cfrdm/v1', '/schema/preview', array(
            'methods' => 'POST',
            'callback' => array(__CLASS__, 'preview_schema_endpoint'),
            'permission_callback' => array('CFRDM_API', 'verify_api_key'),
        ));
        
        register_rest_route('cfrdm/v1', '/schema/test-url', array(
            'methods' => 'GET',
            'callback' => array(__CLASS__, 'get_test_url'),
            'permission_callback' => array('CFRDM_API', 'verify_api_key'),
        ));
    }
    
    /**
     * Validate schema endpoint
     */
    public static function validate_schema_endpoint($request) {
        $params = $request->get_json_params();
        
        // Validate by post ID
        if (!empty($params['post_id'])) {
            $post_id = intval($params['post_id']);
            $results = self::validate_post_schemas($post_id);
            return new WP_REST_Response($results, 200);
        }
        
        // Validate raw schema
        if (!empty($params['schema'])) {
            $schema = $params['schema'];
            if (is_string($schema)) {
                $schema = json_decode($schema, true);
            }
            $results = self::validate_schema($schema);
            return new WP_REST_Response($results, 200);
        }
        
        return new WP_Error(
            'missing_data',
            __('Forneça post_id ou schema para validar.', 'contentfactory-rdm'),
            array('status' => 400)
        );
    }
    
    /**
     * Preview schema endpoint - generates schemas without outputting
     */
    public static function preview_schema_endpoint($request) {
        $params = $request->get_json_params();
        $post_id = intval($params['post_id'] ?? 0);
        
        if (!$post_id) {
            return new WP_Error(
                'missing_post_id',
                __('ID do artigo não fornecido.', 'contentfactory-rdm'),
                array('status' => 400)
            );
        }
        
        $post = get_post($post_id);
        if (!$post) {
            return new WP_Error(
                'invalid_post',
                __('Artigo não encontrado.', 'contentfactory-rdm'),
                array('status' => 404)
            );
        }
        
        // Generate schemas without output
        $schemas = self::generate_schemas_for_post($post);
        $validation = self::validate_all_schemas($schemas);
        
        return new WP_REST_Response(array(
            'success' => true,
            'post_id' => $post_id,
            'schemas' => $schemas,
            'validation' => $validation,
            'test_url' => self::get_google_test_url(get_permalink($post_id)),
        ), 200);
    }
    
    /**
     * Get Google Rich Results Test URL
     */
    public static function get_test_url($request) {
        $post_id = intval($request->get_param('post_id'));
        
        if ($post_id) {
            $url = get_permalink($post_id);
        } else {
            $url = home_url('/');
        }
        
        return new WP_REST_Response(array(
            'success' => true,
            'test_url' => self::get_google_test_url($url),
            'schema_validator_url' => 'https://validator.schema.org/',
        ), 200);
    }
    
    /**
     * Generate Google Rich Results Test URL
     */
    private static function get_google_test_url($url) {
        return 'https://search.google.com/test/rich-results?url=' . urlencode($url);
    }
    
    /**
     * Validate schemas for a post
     */
    public static function validate_post_schemas($post_id) {
        $post = get_post($post_id);
        if (!$post) {
            return array(
                'success' => false,
                'error' => __('Artigo não encontrado.', 'contentfactory-rdm'),
            );
        }
        
        $schemas = self::generate_schemas_for_post($post);
        return self::validate_all_schemas($schemas);
    }
    
    /**
     * Generate all schemas for a post (without output)
     */
    private static function generate_schemas_for_post($post) {
        $schemas = array();
        
        // Check if ContentFactory article
        $cfrdm_id = get_post_meta($post->ID, '_cfrdm_article_id', true);
        if (empty($cfrdm_id)) {
            return $schemas;
        }
        
        // Article schema
        $featured_image_url = get_the_post_thumbnail_url($post->ID, 'full');
        $author_name = get_the_author_meta('display_name', $post->post_author);
        
        $article_schema = array(
            '@context' => 'https://schema.org',
            '@type' => 'Article',
            'mainEntityOfPage' => array(
                '@type' => 'WebPage',
                '@id' => get_permalink($post->ID),
            ),
            'headline' => get_the_title($post->ID),
            'description' => get_the_excerpt($post->ID),
            'datePublished' => get_the_date('c', $post->ID),
            'dateModified' => get_the_modified_date('c', $post->ID),
            'author' => array(
                '@type' => 'Person',
                'name' => $author_name,
            ),
            'publisher' => array(
                '@type' => 'Organization',
                'name' => get_bloginfo('name'),
            ),
        );
        
        if ($featured_image_url) {
            $article_schema['image'] = $featured_image_url;
        }
        
        $schemas['Article'] = $article_schema;
        
        // Image schema
        $featured_image_id = get_post_thumbnail_id($post->ID);
        if ($featured_image_id) {
            $image_url = wp_get_attachment_url($featured_image_id);
            $alt_text = get_post_meta($featured_image_id, '_wp_attachment_image_alt', true);
            $image_meta = wp_get_attachment_metadata($featured_image_id);
            
            $schemas['ImageObject'] = array(
                '@context' => 'https://schema.org',
                '@type' => 'ImageObject',
                'contentUrl' => $image_url,
                'name' => get_the_title($featured_image_id),
                'description' => $alt_text ?: get_the_title($post->ID),
                'width' => $image_meta['width'] ?? null,
                'height' => $image_meta['height'] ?? null,
            );
        }
        
        // Product/Review schema for review articles
        $article_type = get_post_meta($post->ID, '_cfrdm_article_type', true);
        if (in_array($article_type, array('review', 'comparison'), true)) {
            $schemas['Product'] = array(
                '@context' => 'https://schema.org',
                '@type' => 'Product',
                'name' => get_the_title($post->ID),
                'description' => get_the_excerpt($post->ID),
            );
        }
        
        // Breadcrumb schema
        $schemas['BreadcrumbList'] = array(
            '@context' => 'https://schema.org',
            '@type' => 'BreadcrumbList',
            'itemListElement' => array(
                array(
                    '@type' => 'ListItem',
                    'position' => 1,
                    'name' => __('Início', 'contentfactory-rdm'),
                    'item' => home_url('/'),
                ),
                array(
                    '@type' => 'ListItem',
                    'position' => 2,
                    'name' => get_the_title($post->ID),
                    'item' => get_permalink($post->ID),
                ),
            ),
        );
        
        return $schemas;
    }
    
    /**
     * Validate all schemas
     */
    private static function validate_all_schemas($schemas) {
        $results = array(
            'valid' => true,
            'errors' => array(),
            'warnings' => array(),
            'info' => array(),
            'schemas_validated' => count($schemas),
        );
        
        foreach ($schemas as $type => $schema) {
            $validation = self::validate_schema($schema);
            
            if (!$validation['valid']) {
                $results['valid'] = false;
            }
            
            foreach ($validation['errors'] as $error) {
                $results['errors'][] = "[$type] $error";
            }
            
            foreach ($validation['warnings'] as $warning) {
                $results['warnings'][] = "[$type] $warning";
            }
            
            foreach ($validation['info'] as $info) {
                $results['info'][] = "[$type] $info";
            }
        }
        
        return $results;
    }
    
    /**
     * Validate a single schema
     */
    public static function validate_schema($schema) {
        $result = array(
            'valid' => true,
            'errors' => array(),
            'warnings' => array(),
            'info' => array(),
        );
        
        // Basic structure validation
        if (!is_array($schema)) {
            $result['valid'] = false;
            $result['errors'][] = __('Schema deve ser um objeto válido.', 'contentfactory-rdm');
            return $result;
        }
        
        // Check @context
        if (empty($schema['@context'])) {
            $result['valid'] = false;
            $result['errors'][] = __('@context é obrigatório.', 'contentfactory-rdm');
        } elseif ($schema['@context'] !== 'https://schema.org') {
            $result['warnings'][] = __('@context deve ser "https://schema.org".', 'contentfactory-rdm');
        }
        
        // Check @type
        if (empty($schema['@type'])) {
            $result['valid'] = false;
            $result['errors'][] = __('@type é obrigatório.', 'contentfactory-rdm');
            return $result;
        }
        
        $type = $schema['@type'];
        
        // Check required fields
        if (isset(self::$required_fields[$type])) {
            $rules = self::$required_fields[$type];
            
            foreach ($rules['required'] as $field) {
                if ($field === '@type') continue;
                
                if (empty($schema[$field])) {
                    $result['valid'] = false;
                    $result['errors'][] = sprintf(
                        __('Campo obrigatório "%s" está vazio ou ausente.', 'contentfactory-rdm'),
                        $field
                    );
                }
            }
            
            foreach ($rules['recommended'] as $field) {
                if (empty($schema[$field])) {
                    $result['warnings'][] = sprintf(
                        __('Campo recomendado "%s" está ausente. Adicionar pode melhorar rich results.', 'contentfactory-rdm'),
                        $field
                    );
                }
            }
        } else {
            $result['info'][] = sprintf(
                __('Tipo "%s" não tem regras de validação definidas.', 'contentfactory-rdm'),
                $type
            );
        }
        
        // Validate specific fields
        foreach (self::$field_rules as $field => $rules) {
            if (!isset($schema[$field])) continue;
            
            $value = $schema[$field];
            
            // Length validation
            if (isset($rules['max_length']) && is_string($value)) {
                if (strlen($value) > $rules['max_length']) {
                    $result['warnings'][] = sprintf(
                        __('Campo "%s" excede %d caracteres (tem %d). Google pode truncar.', 'contentfactory-rdm'),
                        $field,
                        $rules['max_length'],
                        strlen($value)
                    );
                }
            }
            
            if (isset($rules['min_length']) && is_string($value)) {
                if (strlen($value) < $rules['min_length']) {
                    $result['warnings'][] = sprintf(
                        __('Campo "%s" tem menos de %d caracteres. Considere expandir.', 'contentfactory-rdm'),
                        $field,
                        $rules['min_length']
                    );
                }
            }
            
            // Format validation
            if (isset($rules['format']) && $rules['format'] === 'iso8601') {
                if (!self::is_valid_iso8601($value)) {
                    $result['errors'][] = sprintf(
                        __('Campo "%s" deve estar no formato ISO 8601 (ex: 2024-01-15T10:30:00+00:00).', 'contentfactory-rdm'),
                        $field
                    );
                }
            }
            
            // Numeric validation
            if (isset($rules['type']) && $rules['type'] === 'numeric') {
                if (!is_numeric($value)) {
                    $result['errors'][] = sprintf(
                        __('Campo "%s" deve ser numérico.', 'contentfactory-rdm'),
                        $field
                    );
                } else {
                    if (isset($rules['min']) && $value < $rules['min']) {
                        $result['errors'][] = sprintf(
                            __('Campo "%s" deve ser maior ou igual a %s.', 'contentfactory-rdm'),
                            $field,
                            $rules['min']
                        );
                    }
                    if (isset($rules['max']) && $value > $rules['max']) {
                        $result['errors'][] = sprintf(
                            __('Campo "%s" deve ser menor ou igual a %s.', 'contentfactory-rdm'),
                            $field,
                            $rules['max']
                        );
                    }
                }
            }
        }
        
        // Validate nested schemas
        self::validate_nested_schemas($schema, $result);
        
        return $result;
    }
    
    /**
     * Validate nested schemas recursively
     */
    private static function validate_nested_schemas($schema, &$result) {
        $nested_types = array('author', 'publisher', 'review', 'aggregateRating', 'offers', 'itemReviewed', 'acceptedAnswer');
        
        foreach ($nested_types as $field) {
            if (isset($schema[$field]) && is_array($schema[$field])) {
                $nested = $schema[$field];
                
                if (isset($nested['@type'])) {
                    $nested_validation = self::validate_schema($nested);
                    
                    foreach ($nested_validation['errors'] as $error) {
                        $result['errors'][] = "[$field] $error";
                    }
                    
                    foreach ($nested_validation['warnings'] as $warning) {
                        $result['warnings'][] = "[$field] $warning";
                    }
                }
            }
        }
    }
    
    /**
     * Check if string is valid ISO 8601 date
     */
    private static function is_valid_iso8601($date) {
        if (!is_string($date)) return false;
        
        // Common ISO 8601 patterns
        $patterns = array(
            '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/',
            '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/',
            '/^\d{4}-\d{2}-\d{2}$/',
        );
        
        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $date)) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Validate on post save
     */
    public static function validate_on_save($post_id, $post, $update) {
        // Only for published posts
        if ($post->post_status !== 'publish') {
            return;
        }
        
        // Only for ContentFactory articles
        $cfrdm_id = get_post_meta($post_id, '_cfrdm_article_id', true);
        if (empty($cfrdm_id)) {
            return;
        }
        
        // Validate schemas
        $validation = self::validate_post_schemas($post_id);
        
        // Store validation results
        update_post_meta($post_id, '_cfrdm_schema_validation', $validation);
        
        // Log if there are errors
        if (!$validation['valid']) {
            CFRDM_Logger::warning('schema', 'Problemas de validação de schema detectados', array(
                'post_id' => $post_id,
                'errors' => $validation['errors'],
                'warnings' => $validation['warnings'],
            ), $post_id);
        }
    }
    
    /**
     * Show admin notices for validation issues
     */
    public static function show_validation_notices() {
        global $post;
        
        if (!is_admin() || !$post) {
            return;
        }
        
        $screen = get_current_screen();
        if (!$screen || $screen->base !== 'post') {
            return;
        }
        
        $validation = get_post_meta($post->ID, '_cfrdm_schema_validation', true);
        if (empty($validation) || $validation['valid']) {
            return;
        }
        
        $error_count = count($validation['errors']);
        $warning_count = count($validation['warnings']);
        
        if ($error_count > 0) {
            echo '<div class="notice notice-error"><p>';
            echo '<strong>ContentFactory:</strong> ';
            printf(
                _n(
                    '%d erro de schema detectado.',
                    '%d erros de schema detectados.',
                    $error_count,
                    'contentfactory-rdm'
                ),
                $error_count
            );
            echo ' <a href="' . esc_url(self::get_google_test_url(get_permalink($post->ID))) . '" target="_blank">';
            echo __('Testar no Google', 'contentfactory-rdm');
            echo '</a></p></div>';
        }
        
        if ($warning_count > 0) {
            echo '<div class="notice notice-warning"><p>';
            echo '<strong>ContentFactory:</strong> ';
            printf(
                _n(
                    '%d aviso de schema detectado.',
                    '%d avisos de schema detectados.',
                    $warning_count,
                    'contentfactory-rdm'
                ),
                $warning_count
            );
            echo '</p></div>';
        }
    }
}

// Initialize
CFRDM_Schema_Validator::init();
