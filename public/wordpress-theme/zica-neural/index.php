<?php get_header(); ?>
<section class="zica-hero">
  <div class="zica-container zica-hero-grid">
    <div><span class="zica-kicker">ZICA.AI • ONDAS DE CONTEÚDO</span><h1><?php echo esc_html(get_theme_mod('zica_neural_hero_title', 'Conteúdo que vira autoridade, descoberta e tráfego.')); ?></h1><p><?php echo esc_html(get_theme_mod('zica_neural_hero_text', 'Publicação dinâmica conectada ao Zica Posts, GEO, LLMs e IndexNow.')); ?></p></div>
    <div class="zica-orbit" aria-hidden="true"><div class="zica-core">ZICA.AI</div><span></span><span></span><span></span></div>
  </div>
</section>
<section class="zica-container zica-feed">
  <div class="zica-section-head"><span>CONTEÚDO ATUALIZADO</span><h2><?php esc_html_e('Últimas publicações', 'zica-neural'); ?></h2></div>
  <div class="zica-card-grid">
  <?php if (have_posts()) : while (have_posts()) : the_post(); ?>
    <article <?php post_class('zica-theme-card'); ?>>
      <a href="<?php the_permalink(); ?>">
        <?php if (has_post_thumbnail()) { the_post_thumbnail('large', array('loading' => 'lazy', 'decoding' => 'async')); } ?>
        <div class="zica-theme-card-body"><time datetime="<?php echo esc_attr(get_the_date('c')); ?>"><?php echo esc_html(get_the_date()); ?></time><h2><?php the_title(); ?></h2><p><?php echo esc_html(get_the_excerpt()); ?></p><span><?php esc_html_e('Ler agora →', 'zica-neural'); ?></span></div>
      </a>
    </article>
  <?php endwhile; else : ?><p><?php esc_html_e('Nenhum conteúdo publicado ainda.', 'zica-neural'); ?></p><?php endif; ?>
  </div>
  <div class="zica-pagination"><?php the_posts_pagination(); ?></div>
</section>
<?php get_footer(); ?>
