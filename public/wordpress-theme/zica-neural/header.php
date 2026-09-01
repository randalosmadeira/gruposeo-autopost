<!doctype html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo('charset'); ?>">
<meta name="viewport" content="width=device-width, initial-scale=1">
<?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>
<div class="zica-site-shell">
<header class="zica-site-header">
  <div class="zica-container zica-header-inner">
    <a class="zica-brand" href="<?php echo esc_url(home_url('/')); ?>" aria-label="<?php echo esc_attr(get_bloginfo('name')); ?>">
      <?php if (has_custom_logo()) { the_custom_logo(); } else { ?><span class="zica-brand-mark">Z</span><span><?php echo esc_html(get_theme_mod('zica_neural_brand_name', get_bloginfo('name'))); ?></span><?php } ?>
    </a>
    <nav class="zica-nav" aria-label="<?php esc_attr_e('Navegação principal', 'zica-neural'); ?>">
      <?php wp_nav_menu(array('theme_location' => 'primary', 'container' => false, 'fallback_cb' => false)); ?>
    </nav>
  </div>
</header>
<main id="content" class="zica-main">
