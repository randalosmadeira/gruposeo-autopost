<?php
/**
 * CFRDM_Entity_Graph
 *
 * Constrói e mantém o grafo de entidades semânticas do site:
 *   - Organization / LegalService (RDM Advogados Associados)
 *   - Person (Dr. Rândalos Madeira — autor/advogado responsável, com
 *     credentialCategory OAB e sameAs para sinais de E-E-A-T)
 *   - WebSite / WebPage / Article por conteúdo publicado
 *   - BreadcrumbList
 *
 * Todas as entidades são combinadas em um único @graph por página (ver
 * output_json_ld_schemas() no arquivo principal do plugin), o que é o
 * formato recomendado por Google e o que motores generativos (GEO) usam
 * para atribuir autoridade e citar a fonte corretamente.
 *
 * @since 3.9.0
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_Entity_Graph {

    private static $instance = null;

    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function init() {
        // Nothing to hook by default; entities are built on demand / via cron.
    }

    public static function create_tables() {
        global $wpdb;
        $charset_collate = $wpdb->get_charset_collate();
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';

        $table = $wpdb->prefix . CFRDM_ENTITY_GRAPH_TABLE;
        dbDelta("CREATE TABLE IF NOT EXISTS $table (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            entity_type varchar(50) NOT NULL,
            entity_key varchar(150) NOT NULL,
            name varchar(255) NOT NULL,
            schema_json longtext,
            same_as longtext,
            is_primary tinyint(1) DEFAULT 0,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY entity_key (entity_key),
            KEY entity_type (entity_type),
            KEY is_primary (is_primary)
        ) $charset_collate;");
    }

    /**
     * Rebuild the primary Organization and Person entities from plugin
     * settings (cfrdm_org_*, cfrdm_person_*). Safe to call repeatedly.
     */
    public function rebuild() {
        global $wpdb;
        $table = $wpdb->prefix . CFRDM_ENTITY_GRAPH_TABLE;

        $org_sameas = json_decode((string) get_option('cfrdm_org_sameas', '[]'), true) ?: array();
        $organization = array(
            '@type' => array('Organization', get_option('cfrdm_org_type', 'LegalService')),
            '@id' => home_url('/#organization'),
            'name' => get_option('cfrdm_org_name', get_bloginfo('name')),
            'url' => get_option('cfrdm_org_url', home_url('/')),
            'sameAs' => array_values(array_filter($org_sameas)),
        );
        if ($logo = get_option('cfrdm_org_logo')) {
            $organization['logo'] = $logo;
        }
        if ($phone = get_option('cfrdm_org_phone')) {
            $organization['telephone'] = $phone;
        }
        if ($address = get_option('cfrdm_org_address')) {
            $organization['address'] = $address;
        }

        $this->upsert_entity('organization', 'primary-organization', $organization['name'], $organization, $org_sameas, true);

        $person_sameas = json_decode((string) get_option('cfrdm_person_sameas', '[]'), true) ?: array();
        $person = array(
            '@type' => 'Person',
            '@id' => home_url('/#person-principal'),
            'name' => get_option('cfrdm_person_name', ''),
            'jobTitle' => get_option('cfrdm_person_jobtitle', 'Advogado'),
            'worksFor' => array('@id' => home_url('/#organization')),
            'sameAs' => array_values(array_filter($person_sameas)),
        );
        $credentials = get_option('cfrdm_person_credentials');
        if ($credentials) {
            $person['hasCredential'] = array(
                '@type' => 'EducationalOccupationalCredential',
                'credentialCategory' => $credentials,
            );
        }

        $this->upsert_entity('person', 'primary-person', $person['name'], $person, $person_sameas, true);

        return array(
            'organization' => $organization['name'],
            'person' => $person['name'],
        );
    }

    private function upsert_entity($type, $key, $name, $schema, $sameas, $is_primary = false) {
        global $wpdb;
        $table = $wpdb->prefix . CFRDM_ENTITY_GRAPH_TABLE;

        $row = array(
            'entity_type' => $type,
            'name' => $name,
            'schema_json' => wp_json_encode($schema, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'same_as' => wp_json_encode($sameas),
            'is_primary' => $is_primary ? 1 : 0,
            'updated_at' => current_time('mysql'),
        );

        $existing = $wpdb->get_var($wpdb->prepare("SELECT id FROM $table WHERE entity_key = %s", $key));
        if ($existing) {
            $wpdb->update($table, $row, array('entity_key' => $key));
        } else {
            $row['entity_key'] = $key;
            $row['created_at'] = current_time('mysql');
            $wpdb->insert($table, $row);
        }
    }

    public function get_entity($key) {
        global $wpdb;
        $table = $wpdb->prefix . CFRDM_ENTITY_GRAPH_TABLE;
        $row = $wpdb->get_row($wpdb->prepare("SELECT * FROM $table WHERE entity_key = %s", $key), ARRAY_A);
        if (!$row) return null;
        return json_decode($row['schema_json'], true);
    }

    /**
     * Links a post to the primary Person entity as its author, so the
     * Article schema carries author/E-E-A-T signals automatically.
     */
    public function link_post_to_author($post_id) {
        update_post_meta($post_id, '_cfrdm_entity_author', 'primary-person');
    }

    /**
     * Builds the full @graph array for a single post: Organization, Person
     * (author), WebPage/Article, BreadcrumbList, ImageObject[], and — when
     * available — FAQPage/Speakable from the GEO Optimizer module.
     */
    public function build_graph_for_post($post_id) {
        $graph = array();

        $org = $this->get_entity('primary-organization');
        $person = $this->get_entity('primary-person');

        if ($org) $graph[] = $org;
        if ($person) $graph[] = $person;

        $post = get_post($post_id);
        if ($post) {
            $permalink = get_permalink($post_id);

            $article = array(
                '@type' => 'Article',
                '@id' => $permalink . '#article',
                'headline' => get_the_title($post_id),
                'description' => has_excerpt($post_id) ? wp_strip_all_tags(get_the_excerpt($post_id)) : '',
                'datePublished' => get_the_date('c', $post_id),
                'dateModified' => get_the_modified_date('c', $post_id),
                'mainEntityOfPage' => array('@type' => 'WebPage', '@id' => $permalink),
                'url' => $permalink,
            );
            if ($org) {
                $article['publisher'] = array('@id' => $org['@id']);
            }
            if ($person) {
                $article['author'] = array('@id' => $person['@id']);
            }

            $thumb_id = get_post_thumbnail_id($post_id);
            if ($thumb_id) {
                $article['image'] = wp_get_attachment_url($thumb_id);
            }

            $graph[] = $article;

            // Breadcrumbs
            $graph[] = $this->build_breadcrumb($post_id);

            // Image entities from the Image Schema module
            if (class_exists('CFRDM_Image_Schema')) {
                $images = CFRDM_Image_Schema::get_instance()->get_schemas_for_post($post_id);
                foreach ($images as $img) {
                    $graph[] = $img;
                }
            }

            // FAQ / Speakable from the GEO Optimizer module
            if (class_exists('CFRDM_GEO_Optimizer')) {
                $faq = CFRDM_GEO_Optimizer::get_instance()->build_faq_schema($post_id);
                if ($faq) $graph[] = $faq;

                if (get_option('cfrdm_speakable_enabled', true)) {
                    $graph[] = CFRDM_GEO_Optimizer::get_instance()->build_speakable_schema($post_id);
                }
            }
        }

        return array_values(array_filter($graph));
    }

    private function build_breadcrumb($post_id) {
        $items = array();
        $categories = get_the_category($post_id);
        $position = 1;

        $items[] = array(
            '@type' => 'ListItem',
            'position' => $position++,
            'name' => 'Início',
            'item' => home_url('/'),
        );

        if (!empty($categories)) {
            $items[] = array(
                '@type' => 'ListItem',
                'position' => $position++,
                'name' => $categories[0]->name,
                'item' => get_category_link($categories[0]->term_id),
            );
        }

        $items[] = array(
            '@type' => 'ListItem',
            'position' => $position,
            'name' => get_the_title($post_id),
            'item' => get_permalink($post_id),
        );

        return array(
            '@type' => 'BreadcrumbList',
            'itemListElement' => $items,
        );
    }

    public function register_rest_routes() {
        register_rest_route('cfrdm/v1', '/entities', array(
            'methods' => 'GET',
            'callback' => array($this, 'rest_list_entities'),
            'permission_callback' => array($this, 'rest_permission_check'),
        ));

        register_rest_route('cfrdm/v1', '/entities/rebuild', array(
            'methods' => 'POST',
            'callback' => array($this, 'rest_rebuild'),
            'permission_callback' => array($this, 'rest_permission_check'),
        ));
    }

    public function rest_permission_check($request) {
        $api_key = $request->get_header('X-CFRDM-API-Key');
        return !empty($api_key) && hash_equals((string) get_option('cfrdm_api_key'), (string) $api_key);
    }

    public function rest_list_entities($request) {
        global $wpdb;
        $table = $wpdb->prefix . CFRDM_ENTITY_GRAPH_TABLE;
        $rows = $wpdb->get_results("SELECT entity_type, entity_key, name, schema_json, is_primary FROM $table", ARRAY_A);
        return rest_ensure_response($rows);
    }

    public function rest_rebuild($request) {
        return rest_ensure_response($this->rebuild());
    }

    public static function render_admin_page() {
        if (!current_user_can('manage_options')) {
            return;
        }
        $org = self::get_instance()->get_entity('primary-organization');
        $person = self::get_instance()->get_entity('primary-person');
        echo '<div class="wrap"><h1>GEO & Grafo de Entidades</h1>';
        echo '<p>Entidades Organization/Person injetadas em todo o site para sinais de E-E-A-T e citação por motores generativos (GEO).</p>';
        echo '<h2>Organization</h2><pre>' . esc_html(wp_json_encode($org, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) . '</pre>';
        echo '<h2>Person</h2><pre>' . esc_html(wp_json_encode($person, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) . '</pre>';
        echo '<p><em>Edite os dados em Configurações → GEO / Entidades e clique em "Reconstruir grafo".</em></p>';
        echo '</div>';
    }
}
