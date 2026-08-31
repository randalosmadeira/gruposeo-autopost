from pathlib import Path
import re


def patch(path: str, old: str, new: str, label: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if new in text:
        print(f"{label}: already applied")
        return
    if old not in text:
        raise SystemExit(f"{label}: target not found in {path}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")
    print(f"{label}: applied")


# Dashboard: real observability + approved neural hero.
patch(
    "src/pages/DashboardNew.tsx",
    "import { useNewsAgents } from '@/hooks/useNewsAgents';",
    "import { useNewsAgents } from '@/hooks/useNewsAgents';\nimport { useZicaTrafficKpis } from '@/hooks/useZicaTrafficKpis';",
    "dashboard KPI hook import",
)
patch(
    "src/pages/DashboardNew.tsx",
    "import { AuditScoreHistoryChart } from '@/components/dashboard/AuditScoreHistoryChart';",
    "import { AuditScoreHistoryChart } from '@/components/dashboard/AuditScoreHistoryChart';\nimport { TrafficBrainHero } from '@/components/brand/TrafficBrainHero';",
    "dashboard hero import",
)
patch(
    "src/pages/DashboardNew.tsx",
    "  const { agents, activeAgentsCount, totalArticles: agentArticles } = useNewsAgents();",
    "  const { agents, activeAgentsCount, totalArticles: agentArticles } = useNewsAgents();\n  const { data: zicaKpis } = useZicaTrafficKpis();",
    "dashboard real KPI query",
)

p = Path("src/pages/DashboardNew.tsx")
text = p.read_text(encoding="utf-8")
text, count = re.subn(
    r'\n\s*\{/\* Header \*/\}\n\s*<header className="bg-card border-b px-6 py-4">.*?</header>\n',
    "\n",
    text,
    count=1,
    flags=re.S,
)
if count:
    print("dashboard duplicate local header: removed")
p.write_text(text, encoding="utf-8")

patch(
    "src/pages/DashboardNew.tsx",
    '      <div className="p-6 space-y-6">\n        {/* Connection Error Banner */}',
    '      <div className="space-y-6 p-4 sm:p-6">\n'
    '        <TrafficBrainHero\n'
    '          totalWaves={zicaKpis?.totalWaves ?? dashboardStats.total}\n'
    '          activeWaves={zicaKpis?.activeWaves ?? dashboardStats.published}\n'
    '          indexingSubmitted={zicaKpis?.indexingSubmitted ?? 0}\n'
    '          indexingConfirmed={zicaKpis?.indexingConfirmed ?? 0}\n'
    '          llmVisibility={zicaKpis?.avgLlmVisibility ?? null}\n'
    '          semanticAuthority={zicaKpis?.avgSemanticAuthority ?? null}\n'
    '        />\n\n'
    '        {/* Connection Error Banner */}',
    "dashboard neural hero",
)
patch(
    "src/pages/DashboardNew.tsx",
    "            value={dashboardStats.total}",
    "            value={zicaKpis?.totalWaves ?? dashboardStats.total}",
    "dashboard total waves truth",
)
patch(
    "src/pages/DashboardNew.tsx",
    '            value={dashboardStats.published}\n'
    '            change={`${Math.round((dashboardStats.published / Math.max(dashboardStats.total, 1)) * 100)}% do total`}\n'
    '            changeType="up"',
    '            value={`${zicaKpis?.activeWaves ?? dashboardStats.published} / ${zicaKpis?.indexingConfirmed ?? 0}`}\n'
    '            change={`${zicaKpis?.indexingSubmitted ?? 0} submetidos • ${zicaKpis?.indexingConfirmed ?? 0} confirmados`}\n'
    '            changeType="neutral"',
    "dashboard indexing truth",
)

# Existing SEO audit score must not impersonate an LLM visibility score.
p = Path("src/components/dashboard/SEOAgentPanel.tsx")
text = p.read_text(encoding="utf-8")
text = text.replace("label: 'Score de Autoridade LLMs'", "label: 'Score Técnico SEO/GEO'")
p.write_text(text, encoding="utf-8")

# Auth inherits animated neural currents without changing Supabase Auth.
patch(
    "src/pages/Auth.tsx",
    "import { supabase } from '@/integrations/supabase/client';",
    "import { supabase } from '@/integrations/supabase/client';\nimport { NeuralEnergy } from '@/components/brand/NeuralEnergy';",
    "auth neural import",
)
patch(
    "src/pages/Auth.tsx",
    '    <div className="relative min-h-screen overflow-hidden bg-[#0D1117] text-slate-100">',
    '    <div className="neural-auth-shell relative min-h-screen overflow-hidden bg-[#0D1117] text-slate-100">\n      <NeuralEnergy variant="hero" />',
    "auth animated neural layer",
)

# Desktop sidebar gets the same cortex surface; mobile uses MobileDock.
p = Path("src/components/layout/Sidebar.tsx")
text = p.read_text(encoding="utf-8")
text = text.replace(
    "'h-screen flex flex-col bg-gradient-sidebar border-r border-sidebar-border'",
    "'neural-sidebar h-screen flex flex-col bg-gradient-sidebar border-r border-sidebar-border'",
)
p.write_text(text, encoding="utf-8")

# Neural loading state for every lazy module.
patch(
    "src/App.tsx",
    'const PageLoader = () => (\n'
    '  <div className="flex min-h-screen items-center justify-center">\n'
    '    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />\n'
    '  </div>\n'
    ');',
    'const PageLoader = () => (\n'
    '  <div className="neural-auth-shell flex min-h-screen items-center justify-center bg-[#0D1117]">\n'
    '    <div className="neural-state flex flex-col items-center gap-4 px-8 py-7 text-center">\n'
    '      <div className="neural-loader-ring" />\n'
    '      <div>\n'
    '        <p className="text-sm font-black text-white">Sincronizando o córtex Zica.ai</p>\n'
    '        <p className="mt-1 text-xs text-slate-500">Carregando sinais, ondas e agentes...</p>\n'
    '      </div>\n'
    '    </div>\n'
    '  </div>\n'
    ');',
    "global neural page loader",
)

# Load dedicated neural stylesheet only on Zica.ai WordPress admin pages.
patch(
    "public/wordpress-plugin/zica-ai/zica-ai-connector.php",
    "        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_assets'));",
    "        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_assets'));\n"
    "        add_action('admin_enqueue_scripts', function($hook) {\n"
    "            if (strpos((string) $hook, 'zica-ai') === false) return;\n"
    "            wp_enqueue_style('zica-ai-neural', ZICA_AI_PLUGIN_URL . 'assets/css/zica-neural.css', array(), ZICA_AI_VERSION);\n"
    "        }, 99);",
    "WordPress neural stylesheet enqueue",
)

# Remove temporary build helpers and obsolete archive bundles.
for obsolete in [
    ".github/workflows/zica-build-hotfix.yml",
    "tmp/files_6.zip",
    "tmp/indexmenow.zip",
]:
    target = Path(obsolete)
    if target.exists():
        target.unlink()
        print(f"removed {obsolete}")

# Assertions.
dash = Path("src/pages/DashboardNew.tsx").read_text(encoding="utf-8")
assert "TrafficBrainHero" in dash
assert "indexingConfirmed" in dash
assert "useZicaTrafficKpis" in dash
assert "Score de Autoridade LLMs" not in Path("src/components/dashboard/SEOAgentPanel.tsx").read_text(encoding="utf-8")
assert "NeuralEnergy" in Path("src/pages/Auth.tsx").read_text(encoding="utf-8")
print("Neural product assertions passed")
