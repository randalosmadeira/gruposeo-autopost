<?php get_header(); ?>
<?php while (have_posts()) : the_post(); ?>
<article <?php post_class('zica-article'); ?>>
  <header class="zica-article-hero">
    <div class="zica-container zica-article-head">
      <span class="zica-kicker"><?php echo esc_html(get_the_category_list(' • ')); ?></span>
      <h1><?php the_title(); ?></h1>
      <div class="zica-article-meta"><time datetime="<?php echo esc_attr(get_the_date('c')); ?>"><?php echo esc_html(get_the_date()); ?></time><span>Atualizado <?php echo esc_html(get_the_modified_date()); ?></span></div>
    </div>
  </header>
  <?php if (has_post_thumbnail()) : ?><div class="zica-container zica-featured"><?php the_post_thumbnail('full', array('loading' => 'eager', 'decoding' => 'async')); ?></div><?php endif; ?>
  <div class="zica-container zica-article-layout">
    <div class="zica-entry-content"><?php the_content(); ?></div>
    <aside class="zica-article-aside"><div class="zica-aside-card"><span>ZICA.AI DISCOVERY</span><strong>Conteúdo estruturado para web, GEO e descoberta semântica.</strong><p>Veja também os conteúdos relacionados ao longo do artigo.</p></div></aside>
  </div>
</article>
<?php endwhile; ?>
<?php get_footer(); ?>
