from pathlib import Path
import re

plugin_api = Path('public/wordpress-plugin/zica-ai/includes/class-zica-ai-api.php')
edge = Path('supabase/functions/publish-to-wordpress/index.ts')

if not plugin_api.exists() or not edge.exists():
    raise SystemExit('Required Zica.ai API sources are missing')

text = plugin_api.read_text(encoding='utf-8')
old = '''    public static function verify_api_key($request) {
        $api_key = $request->get_header('X-CFRDM-API-Key');
        
        if (empty($api_key)) {
            $api_key = $request->get_param('api_key');
        }
'''
new = '''    public static function verify_api_key($request) {
        // Canonical Zica.ai header. Legacy header remains as a transition fallback.
        $api_key = $request->get_header('X-ZICA-AI-API-Key');
        if (empty($api_key)) {
            $api_key = $request->get_header('X-CFRDM-API-Key');
        }
        if (empty($api_key)) {
            $api_key = $request->get_param('api_key');
        }
'''
if old in text:
    text = text.replace(old, new)
else:
    text = re.sub(
        r"    public static function verify_api_key\(\$request\) \{[\s\S]*?        \$stored_key = get_option\('zica_ai_api_key'\);",
        "    public static function verify_api_key($request) {\n        // Canonical Zica.ai header. Legacy header remains as a transition fallback.\n        $api_key = $request->get_header('X-ZICA-AI-API-Key');\n        if (empty($api_key)) {\n            $api_key = $request->get_header('X-CFRDM-API-Key');\n        }\n        if (empty($api_key)) {\n            $api_key = $request->get_param('api_key');\n        }\n        \n        $stored_key = get_option('zica_ai_api_key');",
        text,
        count=1,
    )
plugin_api.write_text(text, encoding='utf-8')

edge_text = edge.read_text(encoding='utf-8')
edge_text = edge_text.replace('/wp-json/cfrdm/v1/media', '/wp-json/zica-ai/v1/media')
edge_text = edge_text.replace('/wp-json/cfrdm/v1/articles', '/wp-json/zica-ai/v1/articles')
edge_text = edge_text.replace('"X-CFRDM-API-Key": apiKey', '"X-ZICA-AI-API-Key": apiKey')
edge_text = edge_text.replace('cfrdm_id: String(article.id)', 'zica_ai_id: String(article.id),\n    cfrdm_id: String(article.id)')
edge_text = edge_text.replace('project.wordpress_username === "__CFRDM_PLUGIN__"', '["__ZICA_AI_PLUGIN__", "__CFRDM_PLUGIN__"].includes(String(project.wordpress_username))')
edge.write_text(edge_text, encoding='utf-8')

# Update frontend/backend references where the legacy plugin sentinel is created, while preserving reads of the old sentinel.
for base in [Path('src'), Path('supabase/functions')]:
    if not base.exists():
        continue
    for path in list(base.rglob('*.ts')) + list(base.rglob('*.tsx')):
        if path == edge:
            continue
        content = path.read_text(encoding='utf-8', errors='ignore')
        # Only future writes become canonical. Generic legacy reads are retained unless clearly assignment literals.
        content = content.replace('wordpress_username: "__CFRDM_PLUGIN__"', 'wordpress_username: "__ZICA_AI_PLUGIN__"')
        content = content.replace("wordpress_username: '__CFRDM_PLUGIN__'", "wordpress_username: '__ZICA_AI_PLUGIN__'")
        content = content.replace('"X-CFRDM-API-Key"', '"X-ZICA-AI-API-Key"')
        content = content.replace("'X-CFRDM-API-Key'", "'X-ZICA-AI-API-Key'")
        content = content.replace('/wp-json/cfrdm/v1/', '/wp-json/zica-ai/v1/')
        path.write_text(content, encoding='utf-8')

print('Canonical Zica.ai REST header and Edge Function contract applied.')
