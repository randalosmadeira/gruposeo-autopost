</main>
<footer class="zica-site-footer">
  <div class="zica-container zica-footer-inner">
    <div><strong><?php echo esc_html(get_theme_mod('zica_neural_brand_name', get_bloginfo('name'))); ?></strong><p><?php bloginfo('description'); ?></p></div>
    <nav aria-label="<?php esc_attr_e('Navegação do rodapé', 'zica-neural'); ?>"><?php wp_nav_menu(array('theme_location' => 'footer', 'container' => false, 'fallback_cb' => false)); ?></nav>
  </div>
</footer>
</div>
<?php wp_footer(); ?>
</body>
</html>
