<?php
if (!defined('ABSPATH')) { exit; }

define('ZICA_NEURAL_VERSION', '1.0.0');

function zica_neural_setup() {
    add_theme_support('title-tag');
    add_theme_support('post-thumbnails');
    add_theme_support('custom-logo', array('height' => 120, 'width' => 420, 'flex-height' => true, 'flex-width' => true));
    add_theme_support('html5', array('search-form', 'comment-form', 'comment-list', 'gallery', 'caption', 'style', 'script'));
    add_theme_support('responsive-embeds');
    add_theme_support('align-wide');
    register_nav_menus(array('primary' => __('Menu principal', 'zica-neural'), 'footer' => __('Menu do rodapé', 'zica-neural')));
}
add_action('after_setup_theme', 'zica_neural_setup');

function zica_neural_assets() {
    wp_enqueue_style('zica-neural-style', get_template_directory_uri() . '/assets/theme.css', array(), ZICA_NEURAL_VERSION);
}
add_action('wp_enqueue_scripts', 'zica_neural_assets');

function zica_neural_customize($wp_customize) {
    $wp_customize->add_section('zica_neural_brand', array('title' => __('Zica Neural — Identidade', 'zica-neural'), 'priority' => 35));
    $controls = array(
        'zica_neural_brand_name' => array('Marca do portal', get_bloginfo('name')),
        'zica_neural_hero_title' => array('Título do hero', 'Conteúdo que vira autoridade, descoberta e tráfego.'),
        'zica_neural_hero_text' => array('Texto do hero', 'Publicação dinâmica conectada ao Zica Posts, GEO, LLMs e IndexNow.'),
    );
    foreach ($controls as $id => $data) {
        $wp_customize->add_setting($id, array('default' => $data[1], 'sanitize_callback' => 'sanitize_text_field'));
        $wp_customize->add_control($id, array('label' => __($data[0], 'zica-neural'), 'section' => 'zica_neural_brand', 'type' => 'text'));
    }
    $wp_customize->add_setting('zica_neural_accent', array('default' => '#D4FF00', 'sanitize_callback' => 'sanitize_hex_color'));
    $wp_customize->add_control(new WP_Customize_Color_Control($wp_customize, 'zica_neural_accent', array('label' => __('Cor de destaque', 'zica-neural'), 'section' => 'zica_neural_brand')));
}
add_action('customize_register', 'zica_neural_customize');

function zica_neural_inline_vars() {
    $accent = get_theme_mod('zica_neural_accent', '#D4FF00');
    echo '<style>:root{--zica-accent:' . esc_html($accent) . ';}</style>' . "\n";
}
add_action('wp_head', 'zica_neural_inline_vars', 2);

function zica_neural_excerpt_length($length) { return 28; }
add_filter('excerpt_length', 'zica_neural_excerpt_length', 99);

function zica_neural_body_classes($classes) {
    if (class_exists('Zica_Posts_310')) { $classes[] = 'zica-posts-connected'; }
    return $classes;
}
add_filter('body_class', 'zica_neural_body_classes');
