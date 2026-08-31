from pathlib import Path
import re

root = Path('public/wordpress-plugin/zica-ai')
if not root.exists():
    raise SystemExit('Canonical Zica.ai plugin directory not found')

php_files = list(root.rglob('*.php'))

# Discover old global PHP function symbols before rewriting.
function_names = set()
for path in php_files:
    text = path.read_text(encoding='utf-8', errors='ignore')
    function_names.update(re.findall(r'\bfunction\s+(cfrdm_[A-Za-z0-9_]+)\s*\(', text))

# Rename include/test filenames while preserving storage names in the database.
renames = []
for path in sorted(root.rglob('*'), key=lambda p: len(str(p)), reverse=True):
    if path.is_file() and 'cfrdm' in path.name:
        target = path.with_name(path.name.replace('cfrdm', 'zica-ai'))
        renames.append((path, target))
for source, target in renames:
    source.rename(target)

# Canonical identifier and asset-prefix migration.
for path in root.rglob('*'):
    if not path.is_file() or path.suffix.lower() not in {'.php', '.css', '.js', '.txt', '.json'}:
        continue
    text = path.read_text(encoding='utf-8', errors='ignore')

    # Classes and constants. Storage table values such as 'cfrdm_logs' remain untouched.
    text = text.replace('CFRDM_', 'ZICA_AI_')

    # PHP global function identifiers only, including callbacks stored as strings.
    for old_name in sorted(function_names, key=len, reverse=True):
        new_name = 'zica_ai_' + old_name[len('cfrdm_'):]
        text = re.sub(r'\b' + re.escape(old_name) + r'\b', new_name, text)

    # Internal variables and DOM/CSS handles are safe to rename as the whole canonical plugin moves together.
    text = re.sub(r'\$cfrdm_([A-Za-z0-9_]+)', r'$zica_ai_\1', text)
    text = text.replace('cfrdm-', 'zica-ai-')
    text = text.replace('class-cfrdm-', 'class-zica-ai-')

    # Canonical option keys requested by branding contract, including either quote style.
    text = text.replace('cfrdm_api_key', 'zica_ai_api_key')
    text = text.replace('cfrdm_settings', 'zica_ai_settings')
    text = text.replace('cfrdm_auto_index', 'zica_ai_auto_index')

    # WordPress admin visual cue.
    text = text.replace('dashicons-admin-generic', 'dashicons-chart-area')
    text = text.replace('dashicons-admin-tools', 'dashicons-chart-area')

    path.write_text(text, encoding='utf-8')

main = root / 'zica-ai-connector.php'
text = main.read_text(encoding='utf-8')

# Normalize the compatibility block after canonical constant replacement.
text = re.sub(
    r'/\*\* Zica\.ai canonical namespace and backward compatibility layer\. \*/[\s\S]*$',
    '''/** Zica.ai backward compatibility layer.\n * Legacy REST aliases are intentionally retained so existing installations do not break.\n * Legacy WordPress database table names are also preserved as storage identifiers.\n */\nfunction zica_ai_register_legacy_rest_aliases($endpoints) {\n    foreach ($endpoints as $route => $handlers) {\n        if (strpos($route, '/zica-ai/v1/') === 0) {\n            $legacy = str_replace('/zica-ai/v1/', '/cfrdm/v1/', $route);\n            if (!isset($endpoints[$legacy])) $endpoints[$legacy] = $handlers;\n        }\n    }\n    return $endpoints;\n}\nadd_filter('rest_endpoints', 'zica_ai_register_legacy_rest_aliases', 99);\n\nfunction zica_ai_migrate_brand_options() {\n    $map = array(\n        'cfrdm_api_key' => 'zica_ai_api_key',\n        'cfrdm_settings' => 'zica_ai_settings',\n        'cfrdm_auto_index' => 'zica_ai_auto_index',\n    );\n    foreach ($map as $legacy => $canonical) {\n        $new_value = get_option($canonical, null);\n        $old_value = get_option($legacy, null);\n        if ($new_value === null && $old_value !== null) {\n            update_option($canonical, $old_value, false);\n        }\n    }\n}\nadd_action('plugins_loaded', 'zica_ai_migrate_brand_options', 1);\n\n// Read-only aliases for integrations that still inspect the historical constants.\nif (!defined('CFRDM_VERSION')) define('CFRDM_VERSION', ZICA_AI_VERSION);\nif (!defined('CFRDM_PLUGIN_DIR')) define('CFRDM_PLUGIN_DIR', ZICA_AI_PLUGIN_DIR);\nif (!defined('CFRDM_PLUGIN_URL')) define('CFRDM_PLUGIN_URL', ZICA_AI_PLUGIN_URL);\nif (!defined('CFRDM_PLUGIN_BASENAME')) define('CFRDM_PLUGIN_BASENAME', ZICA_AI_PLUGIN_BASENAME);\n\nif (class_exists('Zica_AI_Connector_Core') && !class_exists('Zica_AI_Connector')) {\n    class_alias('Zica_AI_Connector_Core', 'Zica_AI_Connector');\n}\n''',
    text,
    count=1,
)
main.write_text(text, encoding='utf-8')

# Ensure include paths use renamed files after the global pass.
for path in root.rglob('*.php'):
    text = path.read_text(encoding='utf-8')
    text = text.replace('class-cfrdm-', 'class-zica-ai-')
    path.write_text(text, encoding='utf-8')

print(f'Refactored {len(php_files)} PHP files and {len(function_names)} global functions.')
