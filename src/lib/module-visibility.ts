/**
 * Visibilidade dos módulos no menu (P5).
 *
 * O menu é do painel inteiro, não de um projeto. Regra: um item só some quando TODOS os projetos a que a pessoa tem acesso
 * desligaram o módulo explicitamente. Decisão não gravada = módulo ligado (nada some por falta de decisão).
 * Isto só esconde o ATALHO: o endereço continua abrindo e nenhum dado é apagado.
 */
export interface ModuleDecisionRow { project_id: string; module_code: string; enabled: boolean }

/** Item do menu -> módulo do catálogo. Itens fora desta lista (nucleares, conta, administração) nunca somem. */
export const MENU_MODULE: Record<string, string> = {
  '/articles': 'articles',
  '/keywords/bulk': 'bulk_generator',
  '/calendar': 'content_calendar',
  '/nexus-intelligence': 'nexus_intelligence',
  '/nexus/observatorio': 'nexus_observatory',
  '/nexus/motores': 'nexus_providers',
  '/nexus/visibilidade': 'nexus_visibility',
  '/electoral-campaign': 'electoral_campaign',
  '/electoral-campaign/portal-network': 'electoral_campaign',
  '/electoral-campaign/supporters': 'electoral_campaign',
};

export function hiddenModules(projectIds: readonly string[], decisions: readonly ModuleDecisionRow[]): Set<string> {
  const hidden = new Set<string>();
  if (!projectIds.length) return hidden;
  const accessible = new Set(projectIds);
  const disabledBy = new Map<string, Set<string>>();
  for (const d of decisions) {
    if (d.enabled !== false || !accessible.has(d.project_id)) continue;
    if (!disabledBy.has(d.module_code)) disabledBy.set(d.module_code, new Set());
    disabledBy.get(d.module_code)!.add(d.project_id);
  }
  for (const [code, projects] of disabledBy) if (projects.size === accessible.size) hidden.add(code);
  return hidden;
}

export const isMenuItemVisible = (href: string, hidden: ReadonlySet<string>): boolean => {
  const code = MENU_MODULE[href];
  return !code || !hidden.has(code);
};
