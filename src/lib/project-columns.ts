/**
 * Colunas de `projects` que o navegador pode ler.
 *
 * `wordpress_app_password` NÃO está aqui de propósito: o banco nega SELECT dessa coluna ao papel
 * `authenticated` (migração S1). Por isso nenhuma tela pode usar `select('*')` em `projects`;
 * use `PROJECT_COLUMNS`. Quem precisa saber se há credencial lê `wordpress_has_credential`
 * (coluna gerada: true quando há referência no cofre OU senha legada). O segredo em si só é
 * resolvido no servidor (`test-wordpress-connection` com `{ project_id }`).
 */
export const PROJECT_COLUMN_LIST = [
  'id', 'user_id', 'name', 'domain', 'description',
  'wordpress_username', 'is_connected', 'created_at', 'updated_at', 'seo_plugin', 'wordpress_url',
  'nicho', 'compliance_rules', 'tom_padrao', 'pov_padrao',
  'empresa_nome', 'empresa_telefone', 'empresa_endereco', 'empresa_whatsapp',
  'links_prioritarios', 'palavras_secundarias',
  'social_instagram', 'social_youtube', 'social_linkedin', 'social_twitter', 'social_tiktok',
  'social_google_maps', 'social_linktree',
  'cta_comunidade', 'cta_conclusao', 'cta_leads',
  'wordpress_connector_mode', 'wordpress_credential_ref', 'wordpress_plugin_namespace', 'wordpress_plugin_version',
  'wordpress_connected_at', 'wordpress_last_verified_at',
  'rss_feed_url', 'rss_feed_validation', 'rss_feed_validated_at',
  'commercial_info', 'social_links', 'editorial_identity',
  'organization_id', 'nexus_business_id', 'nexus_strategy', 'nexus_strategy_version', 'nexus_profile_status',
  'wordpress_has_credential',
] as const;

export const PROJECT_COLUMNS = PROJECT_COLUMN_LIST.join(',');

/** Senha digitada agora -> vai no UPDATE; em branco -> NÃO vai (mantém a guardada; nunca apaga por engano). */
export function passwordPatch(typed: string | null | undefined): { wordpress_app_password?: string } {
  return typed ? { wordpress_app_password: typed } : {};
}

/** O site fica "conectado" se há URL, usuário e uma senha (a digitada agora ou a já guardada). */
export function hasUsableCredential(url: string, username: string, typed: string | null | undefined, hasStored: boolean): boolean {
  return !!(url && username && (typed || hasStored));
}

/**
 * Colunas do ciclo de vida (migração 20261120300000, Central de Projetos). O navegador só LÊ; quem muda é a função `project-lifecycle`.
 * Ficam FORA de PROJECT_COLUMN_LIST de propósito: se a migração ainda não foi aplicada, a leitura principal de projetos continua funcionando
 * e a leitura destas colunas (feita à parte, em useProjects) apenas falha em silêncio e todos os projetos contam como ativos.
 */
export const PROJECT_LIFECYCLE_COLUMNS = ['lifecycle_status', 'archived_at', 'paused_reason'] as const;
export type ProjectLifecycleStatus = 'ativo' | 'pausado' | 'arquivado';
