from pathlib import Path
import json
import re
import shutil

root = Path('.')


def replace_in(path: Path, replacements: dict[str, str]) -> None:
    if not path.exists() or not path.is_file():
        return
    text = path.read_text(encoding='utf-8', errors='ignore')
    original = text
    for old, new in replacements.items():
        text = text.replace(old, new)
    if text != original:
        path.write_text(text, encoding='utf-8')


# Package metadata
pkg_path = root / 'package.json'
pkg = json.loads(pkg_path.read_text(encoding='utf-8'))
pkg['name'] = 'zica-ai'
pkg['description'] = 'Zica.ai - Autonomous Organic Traffic Engine for SEO, GEO and LLM semantic optimization.'
pkg.setdefault('scripts', {})['build:zica'] = 'vite build --mode production'
pkg['scripts']['test:zica'] = 'vitest run'
pkg['scripts']['verify:zica'] = 'npm run test && npm run build'
pkg_path.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

lock = root / 'package-lock.json'
if lock.exists():
    data = json.loads(lock.read_text(encoding='utf-8'))
    data['name'] = 'zica-ai'
    if isinstance(data.get('packages'), dict) and '' in data['packages']:
        data['packages']['']['name'] = 'zica-ai'
    lock.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# Main HTML and PWA
(root / 'index.html').write_text('''<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0D1117" />
    <title>Zica.ai | Cérebro Central de Tráfego Orgânico e Ondas Virais</title>
    <meta name="description" content="Seu tráfego tá na zica? Deszica com Zica.ai. Motor autônomo de SEO, GEO e otimização semântica para LLMs." />
    <meta name="author" content="Zica.ai" />
    <meta name="robots" content="noindex, nofollow, noarchive" />
    <meta property="og:title" content="Zica.ai - Autonomous Organic Traffic Engine" />
    <meta property="og:description" content="Cérebro Central de Tráfego Orgânico e Ondas Virais 24/7 para SEO, GEO e Semântica LLMs." />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://zica.ai" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="Zica.ai" />
    <meta name="twitter:description" content="Seu tráfego tá na zica? Deszica com Zica.ai." />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="manifest" href="/site.webmanifest" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="dns-prefetch" href="https://ubahrbgaxrkjxklytobl.supabase.co" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
''', encoding='utf-8')

public = root / 'public'
public.mkdir(exist_ok=True)
(public / 'favicon.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0D1117"/><path d="M14 18h36L27 46h23" fill="none" stroke="#D4FF00" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="50" cy="18" r="4" fill="#00F0FF"/></svg>\n', encoding='utf-8')
(public / 'site.webmanifest').write_text(json.dumps({
    'name': 'Zica.ai',
    'short_name': 'Zica.ai',
    'description': 'Autonomous Organic Traffic Engine',
    'start_url': '/',
    'display': 'standalone',
    'background_color': '#0D1117',
    'theme_color': '#D4FF00',
    'icons': [{'src': '/favicon.svg', 'sizes': 'any', 'type': 'image/svg+xml'}]
}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# Design system
css_path = root / 'src/index.css'
css = css_path.read_text(encoding='utf-8')
brand_block = '''  :root {
    --background: 215 28% 7%;
    --foreground: 210 29% 97%;
    --card: 215 21% 11%;
    --card-foreground: 210 29% 97%;
    --popover: 215 21% 11%;
    --popover-foreground: 210 29% 97%;
    --primary: 70 100% 50%;
    --primary-foreground: 215 28% 7%;
    --primary-dark: 70 100% 42%;
    --primary-light: 70 100% 92%;
    --secondary: 213 12% 18%;
    --secondary-foreground: 210 29% 97%;
    --muted: 213 12% 16%;
    --muted-foreground: 215 13% 65%;
    --accent: 184 100% 50%;
    --accent-foreground: 215 28% 7%;
    --accent-light: 184 100% 88%;
    --success: 142 71% 45%;
    --success-foreground: 215 28% 7%;
    --success-light: 142 50% 18%;
    --warning: 42 100% 55%;
    --warning-foreground: 215 28% 7%;
    --warning-light: 42 55% 18%;
    --info: 184 100% 50%;
    --info-foreground: 215 28% 7%;
    --info-light: 184 45% 18%;
    --premium: 276 100% 70%;
    --premium-foreground: 215 28% 7%;
    --premium-light: 276 40% 18%;
    --destructive: 0 72% 55%;
    --destructive-foreground: 0 0% 100%;
    --border: 213 12% 21%;
    --input: 213 12% 21%;
    --ring: 70 100% 50%;
    --radius: 0.75rem;
    --sidebar-background: 215 28% 7%;
    --sidebar-foreground: 210 29% 97%;
    --sidebar-primary: 70 100% 50%;
    --sidebar-primary-foreground: 215 28% 7%;
    --sidebar-accent: 215 21% 13%;
    --sidebar-accent-foreground: 210 29% 97%;
    --sidebar-border: 213 12% 21%;
    --sidebar-ring: 184 100% 50%;
    --gradient-primary: linear-gradient(135deg, #D4FF00 0%, #A6FF00 100%);
    --gradient-accent: linear-gradient(135deg, #00F0FF 0%, #00AEEF 100%);
    --gradient-success: linear-gradient(135deg, #22C55E 0%, #00F0FF 100%);
    --gradient-info: linear-gradient(135deg, #00F0FF 0%, #38BDF8 100%);
    --gradient-premium: linear-gradient(135deg, #A855F7 0%, #00F0FF 100%);
    --gradient-dark: linear-gradient(135deg, #0D1117 0%, #161B22 100%);
    --gradient-sidebar: linear-gradient(180deg, #0D1117 0%, #090C10 100%);
    --gradient-hero: radial-gradient(circle at top, #162329 0%, #0D1117 42%, #090C10 100%);
    --gradient-seo: linear-gradient(135deg, #D4FF00 0%, #00F0FF 100%);
    --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.35);
    --shadow-md: 0 4px 12px rgb(0 0 0 / 0.35);
    --shadow-lg: 0 12px 28px rgb(0 0 0 / 0.40);
    --shadow-xl: 0 22px 48px rgb(0 0 0 / 0.48);
    --shadow-glow-primary: 0 0 24px rgb(212 255 0 / 0.28);
    --shadow-glow-accent: 0 0 24px rgb(0 240 255 / 0.25);
    --shadow-card: 0 1px 0 rgb(255 255 255 / 0.03), 0 10px 28px rgb(0 0 0 / 0.22);
    --shadow-card-hover: 0 0 0 1px rgb(212 255 0 / 0.18), 0 16px 36px rgb(0 0 0 / 0.35);
  }

  .dark {
    --background: 215 28% 7%;
    --foreground: 210 29% 97%;
    --card: 215 21% 11%;
    --card-foreground: 210 29% 97%;
    --popover: 215 21% 11%;
    --popover-foreground: 210 29% 97%;
    --primary: 70 100% 50%;
    --primary-foreground: 215 28% 7%;
    --secondary: 213 12% 18%;
    --secondary-foreground: 210 29% 97%;
    --muted: 213 12% 16%;
    --muted-foreground: 215 13% 65%;
    --accent: 184 100% 50%;
    --accent-foreground: 215 28% 7%;
    --destructive: 0 72% 55%;
    --destructive-foreground: 0 0% 100%;
    --border: 213 12% 21%;
    --input: 213 12% 21%;
    --ring: 70 100% 50%;
    --sidebar-background: 215 28% 7%;
    --sidebar-foreground: 210 29% 97%;
  }'''
css = re.sub(r'  :root \{.*?\n  \}\n\n  \.dark \{.*?\n  \}', brand_block, css, count=1, flags=re.S)
css = css.replace('/* GRUPO SEO MARKETING - Design System', '/* Zica.ai - Design System')
css = css.replace('background: hsl(0 0% 100% / 0.8);', 'background: hsl(215 21% 11% / 0.88);')
css_path.write_text(css, encoding='utf-8')

# User-facing naming. Do not alter app route paths.
ui = {
    'ContentFactory RDM': 'Zica.ai',
    'ContentFactory': 'Zica.ai',
    'GRUPO SEO MKT': 'Zica.ai',
    'GRUPO SEO MARKETING': 'Zica.ai',
    'Criar Conteúdo': 'Gerar Onda de Conteúdo',
    'Painel Geral': 'Cérebro de Tráfego',
    'Otimização SEO': 'GEO & Semântica LLMs',
    'Novo Artigo': 'Gerar Onda',
    'Artigos IA': 'Ondas IA',
    'Plataforma interna de geração de conteúdo SEO': 'Seu tráfego tá na zica? Deszica com Zica.ai.',
    '/wp-json/cfrdm/v1/': '/wp-json/zica-ai/v1/'
}
for path in list((root / 'src').rglob('*.tsx')) + list((root / 'src').rglob('*.ts')):
    replace_in(path, ui)

sidebar = root / 'src/components/layout/Sidebar.tsx'
if sidebar.exists():
    s = sidebar.read_text(encoding='utf-8')
    s = s.replace("import logoSeo from '@/assets/logo-grupo-seo.png';\n", '')
    s = s.replace("{ label: 'Painel', icon: Activity, href: '/' }", "{ label: 'Cérebro de Tráfego', icon: Activity, href: '/' }")
    s = re.sub(r'<img\s+src=\{logoSeo\}[\s\S]*?/>', '<div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground font-black text-xl flex items-center justify-center shadow-glow-primary">Z</div>', s, count=1)
    s = s.replace('<p>Zica.ai</p>', '<p className="font-bold">Zica.ai</p>').replace('by Zica.ai', 'Cérebro de Tráfego 24/7')
    sidebar.write_text(s, encoding='utf-8')
replace_in(root / 'src/components/layout/Header.tsx', {'Buscar artigos, projetos...': 'Buscar ondas, projetos e sinais...'})

# Repository docs
(root / 'README.md').write_text('''# Zica.ai

![Zica.ai - Autonomous Organic Traffic Engine](https://img.shields.io/badge/Zica.ai-Autonomous_Organic_Traffic_Engine-D4FF00?style=for-the-badge&labelColor=0D1117)

**Seu tráfego tá na zica? Deszica com Zica.ai.**

Zica.ai é um SaaS de automação de tráfego orgânico, produção editorial, GEO e otimização semântica para mecanismos de busca e LLMs. Coordena artigos, ondas virais, IndexNow, `llms.txt`, linkagem interna, auditoria técnica e publicação WordPress para Advocacia, Saúde, Imobiliário, Educação e E-commerce.

## Cérebro Central

**Cérebro Central de Tráfego Orgânico e Ondas Virais 24/7**, combinando SEO, GEO e Semântica LLMs para superfícies como ChatGPT, Perplexity e Claude.

## Arquitetura

```mermaid
flowchart LR
  A[Cérebro Central Zica.ai] --> B[Ondas Virais de Conteúdo]
  B --> C[GEO e Semântica LLMs]
  C --> D[IndexNow / llms.txt / Search]
  D --> E[WordPress Plugin Zica.ai]
  E --> F[Publicação e Manutenção Autônoma]
  F --> A
```

## Stack

- React 18 + TypeScript + Vite
- Tailwind CSS + shadcn/ui
- Supabase Database, Auth e Edge Functions
- OpenAI, Gemini e Anthropic via BYOK ou configuração de plataforma
- WordPress REST API + plugin oficial Zica.ai
- IndexNow, `llms.txt`, linkagem interna e automações editoriais

## Ambiente

```bash
cp .env.example .env.local
npm install
npm run dev
```

## Variáveis

```bash
VITE_APP_NAME="Zica.ai"
VITE_SUPABASE_URL="https://PROJECT_REF.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."
SUPABASE_URL="https://PROJECT_REF.supabase.co"
SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."
SUPABASE_SECRET_KEY="sb_secret_..."
OPENAI_API_KEY=""
GEMINI_API_KEY=""
ANTHROPIC_API_KEY=""
```

Nunca publique `SUPABASE_SECRET_KEY` ou chaves privadas no frontend.

## Testes

```bash
npm run test
npm run build
npm run lint
```

Testes e build são bloqueantes no CI. O lint permanece como relatório enquanto a dívida técnica herdada é saneada.

## Deploy

O workflow `deploy.yml` gera `zica-ai-web-dist` e utiliza configuração com prefixo `ZICA_AI_`. A publicação externa ocorre somente quando um destino autorizado estiver configurado.

## WordPress

Código canônico: `public/wordpress-plugin/zica-ai/zica-ai-connector.php`.

Namespace REST canônico: `/wp-json/zica-ai/v1/`.

Durante a transição, o namespace legado permanece como alias de compatibilidade para não interromper instalações existentes.

## Segurança

- RLS nas tabelas públicas expostas.
- Segredos somente em backend, Vault ou Edge Function secrets.
- Idempotência em RSS e publicação.
- Sem executor remoto genérico de SQL na superfície operacional.

© 2026 Zica.ai.
''', encoding='utf-8')

(root / '.env.example').write_text('''VITE_APP_NAME="Zica.ai"
VITE_SUPABASE_URL="https://PROJECT_REF.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."
SUPABASE_URL="https://PROJECT_REF.supabase.co"
SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."
SUPABASE_SECRET_KEY="sb_secret_..."
OPENAI_API_KEY=""
GEMINI_API_KEY=""
ANTHROPIC_API_KEY=""
ZICA_AI_DEPLOY_BUCKET="zica-ai-web"
ZICA_AI_BUILD_TAG="zica-ai-local"
''', encoding='utf-8')
replace_in(root / '.github/workflows/ci.yml', {'name: CI': 'name: Zica.ai CI', 'gruposeo-autopost-dist': 'zica-ai-web-dist'})

# WordPress canonical path, naming and compatibility.
old_dir = root / 'public/wordpress-plugin/contentfactory-rdm'
new_dir = root / 'public/wordpress-plugin/zica-ai'
if old_dir.exists() and not new_dir.exists():
    shutil.move(str(old_dir), str(new_dir))
old_main = new_dir / 'contentfactory-rdm.php'
new_main = new_dir / 'zica-ai-connector.php'
if old_main.exists() and not new_main.exists():
    old_main.rename(new_main)

if new_main.exists():
    p = new_main.read_text(encoding='utf-8')
    p = re.sub(r'/\*\*\n \* Plugin Name:.*?\n \* Requires PHP: 7\.4\n \*/', '''/**
 * Plugin Name: Zica.ai - Conector de Tráfego Autônomo & GEO
 * Plugin URI: https://zica.ai
 * Description: Conecta seu WordPress ao cérebro Zica.ai para publicação autônoma de artigos, atualização de IndexNow, llms.txt, correção de links órfãos e redirects 301.
 * Version: 3.8.0
 * Author: Equipe Zica.ai
 * Author URI: https://zica.ai
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: zica-ai
 * Domain Path: /languages
 * Requires at least: 5.8
 * Requires PHP: 7.4
 */''', p, count=1, flags=re.S)
    p = p.replace('ContentFactory_RDM', 'Zica_AI_Connector_Core')
    p = p.replace('contentfactory-rdm', 'zica-ai').replace('cfrdm/v1', 'zica-ai/v1')
    p = p.replace("'cfrdm_api_key'", "'zica_ai_api_key'").replace("'cfrdm_settings'", "'zica_ai_settings'").replace("'cfrdm_auto_index'", "'zica_ai_auto_index'")
    p = re.sub(r'ContentFactory(?=[\s:])', 'Zica.ai', p).replace('GRUPO SEO MARKETING', 'Equipe Zica.ai')
    if 'zica_ai_register_legacy_rest_aliases' not in p:
        p += '''

/** Zica.ai canonical namespace and backward compatibility layer. */
if (!defined('ZICA_AI_VERSION')) define('ZICA_AI_VERSION', CFRDM_VERSION);
if (!defined('ZICA_AI_PLUGIN_DIR')) define('ZICA_AI_PLUGIN_DIR', CFRDM_PLUGIN_DIR);
if (!defined('ZICA_AI_PLUGIN_URL')) define('ZICA_AI_PLUGIN_URL', CFRDM_PLUGIN_URL);
function zica_ai_register_legacy_rest_aliases($endpoints) {
    foreach ($endpoints as $route => $handlers) {
        if (strpos($route, '/zica-ai/v1/') === 0) {
            $legacy = str_replace('/zica-ai/v1/', '/cfrdm/v1/', $route);
            if (!isset($endpoints[$legacy])) $endpoints[$legacy] = $handlers;
        }
    }
    return $endpoints;
}
add_filter('rest_endpoints', 'zica_ai_register_legacy_rest_aliases', 99);
function zica_ai_migrate_brand_options() {
    $map = array('cfrdm_api_key'=>'zica_ai_api_key','cfrdm_settings'=>'zica_ai_settings','cfrdm_auto_index'=>'zica_ai_auto_index');
    foreach ($map as $legacy=>$canonical) {
        $new_value=get_option($canonical,null);
        $old_value=get_option($legacy,null);
        if ($new_value===null && $old_value!==null) update_option($canonical,$old_value,false);
    }
}
add_action('plugins_loaded','zica_ai_migrate_brand_options',1);
if (class_exists('Zica_AI_Connector_Core') && !class_exists('Zica_AI_Connector')) class_alias('Zica_AI_Connector_Core','Zica_AI_Connector');
'''
    new_main.write_text(p, encoding='utf-8')

if new_dir.exists():
    plugin_replace = {
        'cfrdm/v1': 'zica-ai/v1',
        "'cfrdm_api_key'": "'zica_ai_api_key'",
        "'cfrdm_settings'": "'zica_ai_settings'",
        "'cfrdm_auto_index'": "'zica_ai_auto_index'",
        'contentfactory-rdm': 'zica-ai',
        'ContentFactory RDM': 'Zica.ai',
        'ContentFactory': 'Zica.ai',
        'GRUPO SEO MARKETING': 'Equipe Zica.ai',
        '#001957': '#0D1117',
        '#FF8000': '#D4FF00',
        '#ff8000': '#D4FF00',
        '#00aaff': '#00F0FF'
    }
    for path in new_dir.rglob('*'):
        if path.is_file() and path.suffix.lower() in {'.php', '.css', '.js', '.txt', '.json'}:
            replace_in(path, plugin_replace)

# Loader stays at legacy slug so already-installed WordPress plugins keep working.
compat_dir = root / 'public/wordpress-plugin/contentfactory-rdm'
compat_dir.mkdir(parents=True, exist_ok=True)
(compat_dir / 'contentfactory-rdm.php').write_text('''<?php
/**
 * Plugin Name: Zica.ai - Compatibility Loader
 * Description: Loader temporário para instalações existentes. O código canônico está em ../zica-ai/zica-ai-connector.php.
 * Version: 3.8.0
 * Author: Equipe Zica.ai
 * Text Domain: zica-ai
 */
if (!defined('ABSPATH')) exit;
require_once dirname(__DIR__) . '/zica-ai/zica-ai-connector.php';
''', encoding='utf-8')

for manifest in [root / 'public/api/plugin-updates.json', new_dir / 'version.json']:
    replace_in(manifest, {'contentfactory-rdm.zip': 'zica-ai-connector.zip', 'contentfactory-rdm/': 'zica-ai/'})

# Supabase Auth templates kept under source control.
tpl = root / 'supabase/templates'
tpl.mkdir(parents=True, exist_ok=True)
base = '''<!doctype html><html><body style="margin:0;background:#0D1117;color:#F0F6FC;font-family:Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="background:#0D1117;padding:32px"><tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="background:#161B22;border:1px solid #30363D;border-radius:16px;padding:32px"><tr><td><div style="font-size:28px;font-weight:800;color:#D4FF00">Zica.ai</div><p style="color:#8B949E">Cérebro de Tráfego</p><h2 style="color:#F0F6FC">__TITLE__</h2><p style="color:#C9D1D9;line-height:1.6">__BODY__</p><p><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#D4FF00;color:#0D1117;text-decoration:none;font-weight:800;padding:14px 22px;border-radius:10px">__CTA__</a></p><p style="color:#8B949E;font-size:12px">Se você não iniciou esta ação, ignore esta mensagem.</p></td></tr></table></td></tr></table></body></html>'''
(tpl / 'confirmation.html').write_text(base.replace('__TITLE__', 'Confirme seu acesso à Zica.ai').replace('__BODY__', 'Confirme seu e-mail para ativar o Cérebro de Tráfego.').replace('__CTA__', 'Confirmar cadastro'), encoding='utf-8')
(tpl / 'magic_link.html').write_text(base.replace('__TITLE__', 'Acesse seu Cérebro de Tráfego - Zica.ai').replace('__BODY__', 'Use o botão abaixo para entrar com segurança.').replace('__CTA__', 'Acessar Zica.ai'), encoding='utf-8')
(tpl / 'recovery.html').write_text(base.replace('__TITLE__', 'Redefina sua senha da Zica.ai').replace('__BODY__', 'Recebemos uma solicitação de recuperação de acesso.').replace('__CTA__', 'Redefinir senha'), encoding='utf-8')

config = root / 'supabase/config.toml'
if config.exists():
    ct = config.read_text(encoding='utf-8')
    if '[auth.email.template.confirmation]' not in ct:
        ct += '''

[auth.email.template.confirmation]
subject = "Acesse seu Cérebro de Tráfego - Zica.ai"
content_path = "./supabase/templates/confirmation.html"

[auth.email.template.magic_link]
subject = "Acesse seu Cérebro de Tráfego - Zica.ai"
content_path = "./supabase/templates/magic_link.html"

[auth.email.template.recovery]
subject = "Acesse seu Cérebro de Tráfego - Zica.ai"
content_path = "./supabase/templates/recovery.html"
'''
        config.write_text(ct, encoding='utf-8')

# Remove obsolete visual asset and temporary workflows/scripts.
old_logo = root / 'src/assets/logo-grupo-seo.png'
if old_logo.exists():
    old_logo.unlink()
purge = root / '.github/workflows/purge-legacy-builder.yml'
if purge.exists():
    purge.unlink()
workflow = root / '.github/workflows/zica-brand-refactor.yml'
if workflow.exists():
    workflow.unlink()
script = root / '.github/scripts/zica_brand_refactor.py'
if script.exists():
    script.unlink()
