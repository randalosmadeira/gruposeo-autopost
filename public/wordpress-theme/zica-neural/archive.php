<?php get_header(); ?>
<section class="zica-archive-head"><div class="zica-container"><span class="zica-kicker">ARQUIVO DE AUTORIDADE</span><h1><?php the_archive_title(); ?></h1><?php the_archive_description('<div class="zica-archive-description">','</div>'); ?></div></section>
<section class="zica-container zica-feed"><div class="zica-card-grid">
<?php if (have_posts()) : while (have_posts()) : the_post(); ?>
<article <?php post_class('zica-theme-card'); ?>><a href="<?php the_permalink(); ?>"><?php if (has_post_thumbnail()) { the_post_thumbnail('large', array('loading'=>'lazy','decoding'=>'async')); } ?><div class="zica-theme-card-body"><time datetime="<?php echo esc_attr(get_the_date('c')); ?>"><?php echo esc_html(get_the_date()); ?></time><h2><?php the_title(); ?></h2><p><?php echo esc_html(get_the_excerpt()); ?></p><span><?php esc_html_e('Ler agora →', 'zica-neural'); ?></span></div></a></article>
<?php endwhile; endif; ?>
</div><div class="zica-pagination"><?php the_posts_pagination(); ?></div></section>
<?php get_footer(); ?>
