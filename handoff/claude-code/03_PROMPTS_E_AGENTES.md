# Registro de prompts, skills e agentes

## Prompts do produto já existentes

Estão incluídos integralmente no ZIP porque pertencem ao Git:

- `public/templates/system-prompt-editor-seo-geo.md`
- `public/templates/system-prompt-agente-jornalistico.md`
- `public/templates/system-prompt-agente-construtor-blogs.md`
- `public/templates/system-prompt-agente-auditoria-indexacao.md`
- `public/templates/system-prompt-agente-metadados-schema.md`
- `public/templates/system-prompt-agente-rdm.md`

O sistema também mantém prompts versionados em `prompt_templates` e `prompt_template_versions`. Conteúdo que exista somente no banco não foi exportado, pois o ambiente de origem não leu dados remotos nesta operação.

## Skills portáveis

- `zica-nexus-core`: arquitetura e engenharia do SaaS.
- `zica-editorial-planning`: domínio editorial em massa.
- `zica-supabase-security`: banco, RLS, RPC e Storage.
- `zica-web-geo-boundary`: contexto Web/SEO e bloqueio atual.
- `zica-verification`: gates e evidências.

## Agentes portáveis

- `nexus-orchestrator`: coordenação.
- `editorial-planner`: implementação do módulo.
- `supabase-guardian`: revisão de dados/segurança.
- `qa-evidence`: testes sem edição.
- `release-guardian`: bloqueio de ações externas.

Não trate esses arquivos como credenciais ou capacidades automáticas. O Claude Code precisa ter as ferramentas e permissões configuradas no ambiente de destino.
