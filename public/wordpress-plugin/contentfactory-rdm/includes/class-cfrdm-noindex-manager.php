<?php
/**
 * Noindex Manager — Autonomous Low-Value Page Handler
 *
 * Automatically sets noindex on:
 * - Date archives
 * - Empty categories / tags
 * - Author archives (single author)
 * - Paginated archive pages (/page/N/)
 * - Attachment pages
 *
 * Works with Rank Math, Yoast SEO and AIOSEO.
 *
 * @package ContentFactory_RDM
 * @since   3.6.0
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class CFRDM_Noindex_Manager {

    private static $instance = null;

    public static function get_instance() {
        if ( null === self::$instance ) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Register REST routes
     */
    public function init() {
        add_action( 'rest_api_init', array( $this, 'register_routes' ) );
    }

    public function register_routes() {
        register_rest_route( 'cfrdm/v1', '/noindex-manager', array(
            'methods'             => 'POST',
            'callback'            => array( $this, 'handle_noindex_request' ),
            'permission_callback' => array( $this, 'check_permission' ),
        ) );

        register_rest_route( 'cfrdm/v1', '/noindex-manager/status', array(
            'methods'             => 'GET',
            'callback'            => array( $this, 'get_status' ),
            'permission_callback' => array( $this, 'check_permission' ),
        ) );
    }

    public function check_permission( $request ) {
        $api_key = $request->get_header( 'X-CFRDM-API-Key' );
        if ( $api_key && $api_key === get_option( 'cfrdm_api_key' ) ) {
            return true;
        }
        return current_user_can( 'manage_options' );
    }

    /**
     * Main handler — auto-noindex low-value archives and pages
     */
    public function handle_noindex_request( $request ) {
        $params  = $request->get_json_params();
        $dry_run = ! empty( $params['dry_run'] );
        $targets = isset( $params['targets'] ) ? (array) $params['targets'] : array(
            'date_archives',
            'empty_categories',
            'empty_tags',
            'author_archives',
            'attachment_pages',
            'paginated_archives',
        );

        $results = array(
            'success'       => true,
            'dry_run'       => $dry_run,
            'seo_plugin'    => 'none',
            'actions'       => array(),
            'total_applied' => 0,
            'errors'        => array(),
        );

        $seo_plugin = class_exists( 'CFRDM_SEO' ) ? CFRDM_SEO::detect_seo_plugin() : 'none';
        $results['seo_plugin'] = $seo_plugin;

        // ─── Date Archives ───
        if ( in_array( 'date_archives', $targets, true ) ) {
            $r = $this->noindex_date_archives( $seo_plugin, $dry_run );
            $results['actions'][] = $r;
            $results['total_applied'] += $r['applied'];
        }

        // ─── Empty Categories ───
        if ( in_array( 'empty_categories', $targets, true ) ) {
            $r = $this->noindex_empty_taxonomy( 'category', $seo_plugin, $dry_run );
            $results['actions'][] = $r;
            $results['total_applied'] += $r['applied'];
        }

        // ─── Empty Tags ───
        if ( in_array( 'empty_tags', $targets, true ) ) {
            $r = $this->noindex_empty_taxonomy( 'post_tag', $seo_plugin, $dry_run );
            $results['actions'][] = $r;
            $results['total_applied'] += $r['applied'];
        }

        // ─── Author Archives ───
        if ( in_array( 'author_archives', $targets, true ) ) {
            $r = $this->noindex_author_archives( $seo_plugin, $dry_run );
            $results['actions'][] = $r;
            $results['total_applied'] += $r['applied'];
        }

        // ─── Attachment Pages ───
        if ( in_array( 'attachment_pages', $targets, true ) ) {
            $r = $this->noindex_attachment_pages( $seo_plugin, $dry_run );
            $results['actions'][] = $r;
            $results['total_applied'] += $r['applied'];
        }

        // ─── Paginated Archives ───
        if ( in_array( 'paginated_archives', $targets, true ) ) {
            $r = $this->noindex_paginated_archives( $seo_plugin, $dry_run );
            $results['actions'][] = $r;
            $results['total_applied'] += $r['applied'];
        }

        // ─── Flush rewrite rules to apply changes ───
        if ( ! $dry_run && $results['total_applied'] > 0 ) {
            flush_rewrite_rules( false );
        }

        if ( $results['total_applied'] > 0 && class_exists( 'CFRDM_Logger' ) ) {
            CFRDM_Logger::success(
                'noindex_manager',
                sprintf( 'Noindex Manager: %d alterações aplicadas', $results['total_applied'] ),
                $results
            );
        }

        return rest_ensure_response( $results );
    }

    /**
     * Get current noindex status overview
     */
    public function get_status( $request ) {
        $seo_plugin = class_exists( 'CFRDM_SEO' ) ? CFRDM_SEO::detect_seo_plugin() : 'none';

        $status = array(
            'seo_plugin'             => $seo_plugin,
            'date_archives_noindex'  => $this->check_date_archives_noindex( $seo_plugin ),
            'empty_categories'       => $this->count_empty_terms( 'category' ),
            'empty_tags'             => $this->count_empty_terms( 'post_tag' ),
            'attachment_pages_count' => wp_count_posts( 'attachment' )->inherit ?? 0,
        );

        return rest_ensure_response( array( 'success' => true, 'status' => $status ) );
    }

    // ───────────────────────────────────────────
    // Date Archives → noindex via Rank Math / Yoast option
    // ───────────────────────────────────────────
    private function noindex_date_archives( $seo_plugin, $dry_run ) {
        $action = array( 'target' => 'date_archives', 'applied' => 0, 'details' => '' );

        switch ( $seo_plugin ) {
            case 'rankmath':
                $current = get_option( 'rank-math-options-titles', array() );
                if ( empty( $current['disable_date_archives'] ) || $current['disable_date_archives'] !== 'on' ) {
                    if ( ! $dry_run ) {
                        $current['disable_date_archives'] = 'on';
                        update_option( 'rank-math-options-titles', $current );
                    }
                    $action['applied'] = 1;
                    $action['details'] = 'Rank Math: date archives desativados';
                } else {
                    $action['details'] = 'Rank Math: date archives já desativados';
                }
                break;

            case 'yoast':
                $current = get_option( 'wpseo_titles', array() );
                if ( empty( $current['disable-date'] ) || $current['disable-date'] !== true ) {
                    if ( ! $dry_run ) {
                        $current['disable-date']     = true;
                        $current['noindex-archive-wpseo'] = true;
                        update_option( 'wpseo_titles', $current );
                    }
                    $action['applied'] = 1;
                    $action['details'] = 'Yoast: date archives noindex ativado';
                } else {
                    $action['details'] = 'Yoast: date archives já noindex';
                }
                break;

            case 'aioseo':
                $current = get_option( 'aioseo_options', array() );
                if ( is_string( $current ) ) {
                    $current = json_decode( $current, true ) ?: array();
                }
                if ( ! $dry_run ) {
                    $current['searchAppearance']['archives']['date']['show']           = false;
                    $current['searchAppearance']['archives']['date']['advanced']['robotsMeta']['noindex'] = true;
                    update_option( 'aioseo_options', wp_json_encode( $current ) );
                }
                $action['applied'] = 1;
                $action['details'] = 'AIOSEO: date archives noindex';
                break;

            default:
                // WordPress core: inject noindex via wp_head hook
                if ( ! $dry_run ) {
                    update_option( 'cfrdm_noindex_date_archives', true );
                }
                $action['applied'] = 1;
                $action['details'] = 'Core WP: date archives noindex via meta tag';
                break;
        }

        return $action;
    }

    /**
     * Noindex empty taxonomy terms (categories / tags)
     */
    private function noindex_empty_taxonomy( $taxonomy, $seo_plugin, $dry_run ) {
        $label  = $taxonomy === 'category' ? 'categories' : 'tags';
        $action = array( 'target' => "empty_{$label}", 'applied' => 0, 'details' => '', 'terms' => array() );

        $empty_terms = get_terms( array(
            'taxonomy'   => $taxonomy,
            'hide_empty' => false,
            'count'      => true,
            'fields'     => 'all',
        ) );

        if ( is_wp_error( $empty_terms ) ) {
            $action['details'] = 'Erro ao buscar termos';
            return $action;
        }

        $empty = array_filter( $empty_terms, function ( $t ) {
            return $t->count === 0;
        } );

        if ( empty( $empty ) ) {
            $action['details'] = "Nenhum {$label} vazio encontrado";
            return $action;
        }

        $applied = 0;
        foreach ( $empty as $term ) {
            if ( $dry_run ) {
                $action['terms'][] = $term->name;
                $applied++;
                continue;
            }

            switch ( $seo_plugin ) {
                case 'rankmath':
                    update_term_meta( $term->term_id, 'rank_math_robots', array( 'noindex' ) );
                    $applied++;
                    break;

                case 'yoast':
                    update_term_meta( $term->term_id, 'wpseo_noindex', 'noindex' );
                    $applied++;
                    break;

                case 'aioseo':
                    update_term_meta( $term->term_id, '_aioseo_noindex', '1' );
                    $applied++;
                    break;

                default:
                    update_term_meta( $term->term_id, '_cfrdm_noindex', '1' );
                    $applied++;
                    break;
            }

            $action['terms'][] = $term->name;
        }

        $action['applied'] = $applied;
        $action['details'] = sprintf( '%d %s vazios marcados como noindex', $applied, $label );

        return $action;
    }

    /**
     * Noindex author archive pages
     */
    private function noindex_author_archives( $seo_plugin, $dry_run ) {
        $action = array( 'target' => 'author_archives', 'applied' => 0, 'details' => '' );

        switch ( $seo_plugin ) {
            case 'rankmath':
                $current = get_option( 'rank-math-options-titles', array() );
                if ( empty( $current['author_archive_title'] ) || empty( $current['disable_author_archives'] ) ) {
                    if ( ! $dry_run ) {
                        $current['author_robots'] = array( 'noindex' );
                        update_option( 'rank-math-options-titles', $current );
                    }
                    $action['applied'] = 1;
                    $action['details'] = 'Rank Math: author archives noindex';
                } else {
                    $action['details'] = 'Rank Math: author archives já configurados';
                }
                break;

            case 'yoast':
                $current = get_option( 'wpseo_titles', array() );
                if ( empty( $current['noindex-author-wpseo'] ) || ! $current['noindex-author-wpseo'] ) {
                    if ( ! $dry_run ) {
                        $current['noindex-author-wpseo'] = true;
                        update_option( 'wpseo_titles', $current );
                    }
                    $action['applied'] = 1;
                    $action['details'] = 'Yoast: author archives noindex ativado';
                } else {
                    $action['details'] = 'Yoast: author archives já noindex';
                }
                break;

            default:
                if ( ! $dry_run ) {
                    update_option( 'cfrdm_noindex_author_archives', true );
                }
                $action['applied'] = 1;
                $action['details'] = 'Core WP: author archives noindex via meta tag';
                break;
        }

        return $action;
    }

    /**
     * Noindex attachment pages
     */
    private function noindex_attachment_pages( $seo_plugin, $dry_run ) {
        $action = array( 'target' => 'attachment_pages', 'applied' => 0, 'details' => '' );

        switch ( $seo_plugin ) {
            case 'rankmath':
                $current = get_option( 'rank-math-options-general', array() );
                if ( empty( $current['attachment_redirect_urls'] ) || $current['attachment_redirect_urls'] !== 'on' ) {
                    if ( ! $dry_run ) {
                        $current['attachment_redirect_urls'] = 'on';
                        update_option( 'rank-math-options-general', $current );
                    }
                    $action['applied'] = 1;
                    $action['details'] = 'Rank Math: attachment redirect ativado';
                } else {
                    $action['details'] = 'Rank Math: attachment redirect já ativo';
                }
                break;

            case 'yoast':
                $current = get_option( 'wpseo', array() );
                if ( empty( $current['disable-attachment'] ) || ! $current['disable-attachment'] ) {
                    if ( ! $dry_run ) {
                        $current['disable-attachment'] = true;
                        update_option( 'wpseo', $current );
                    }
                    $action['applied'] = 1;
                    $action['details'] = 'Yoast: attachment pages redirect ativado';
                } else {
                    $action['details'] = 'Yoast: attachment redirect já ativo';
                }
                break;

            default:
                if ( ! $dry_run ) {
                    update_option( 'cfrdm_noindex_attachments', true );
                }
                $action['applied'] = 1;
                $action['details'] = 'Core WP: attachment pages noindex via meta tag';
                break;
        }

        return $action;
    }

    /**
     * Handle paginated archive pages noindex
     */
    private function noindex_paginated_archives( $seo_plugin, $dry_run ) {
        $action = array( 'target' => 'paginated_archives', 'applied' => 0, 'details' => '' );

        // Rank Math and Yoast handle this automatically if configured
        // For core WP and unknown plugins, inject via wp_head
        if ( ! $dry_run ) {
            update_option( 'cfrdm_noindex_paginated', true );
        }
        $action['applied'] = 1;
        $action['details'] = 'Paginated archives: noindex ativado para /page/2+';

        return $action;
    }

    // ───────────────────────────────────────────
    // WordPress Core: Inject noindex meta tags via wp_head
    // (fallback when no SEO plugin is installed)
    // ───────────────────────────────────────────
    public static function inject_noindex_tags() {
        if ( get_option( 'cfrdm_noindex_date_archives' ) && is_date() ) {
            echo '<meta name="robots" content="noindex, follow" />' . "\n";
        }

        if ( get_option( 'cfrdm_noindex_author_archives' ) && is_author() ) {
            echo '<meta name="robots" content="noindex, follow" />' . "\n";
        }

        if ( get_option( 'cfrdm_noindex_attachments' ) && is_attachment() ) {
            echo '<meta name="robots" content="noindex, follow" />' . "\n";
        }

        if ( get_option( 'cfrdm_noindex_paginated' ) && is_paged() ) {
            echo '<meta name="robots" content="noindex, follow" />' . "\n";
        }

        // Individual term noindex
        if ( ( is_category() || is_tag() ) && is_object( get_queried_object() ) ) {
            $term_id = get_queried_object_id();
            if ( get_term_meta( $term_id, '_cfrdm_noindex', true ) ) {
                echo '<meta name="robots" content="noindex, follow" />' . "\n";
            }
        }
    }

    // ───────────────────────────────────────────
    // Helpers
    // ───────────────────────────────────────────
    private function check_date_archives_noindex( $seo_plugin ) {
        switch ( $seo_plugin ) {
            case 'rankmath':
                $opts = get_option( 'rank-math-options-titles', array() );
                return ! empty( $opts['disable_date_archives'] ) && $opts['disable_date_archives'] === 'on';
            case 'yoast':
                $opts = get_option( 'wpseo_titles', array() );
                return ! empty( $opts['disable-date'] ) && $opts['disable-date'];
            default:
                return (bool) get_option( 'cfrdm_noindex_date_archives', false );
        }
    }

    private function count_empty_terms( $taxonomy ) {
        $terms = get_terms( array(
            'taxonomy'   => $taxonomy,
            'hide_empty' => false,
            'count'      => true,
            'fields'     => 'all',
        ) );

        if ( is_wp_error( $terms ) ) {
            return 0;
        }

        return count( array_filter( $terms, function ( $t ) {
            return $t->count === 0;
        } ) );
    }
}
