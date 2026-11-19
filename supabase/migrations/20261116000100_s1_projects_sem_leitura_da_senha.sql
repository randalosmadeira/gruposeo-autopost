-- S1 (B): o papel `authenticated` (navegador) deixa de poder LER public.projects.wordpress_app_password.
-- Todas as outras colunas continuam legíveis; INSERT/UPDATE/DELETE não mudam (a pessoa ainda pode digitar uma senha nova).
-- Funções de borda usam service_role (não afetado). Rollback: supabase/rollbacks/20261116000100_s1_projects_sem_leitura_da_senha_rollback.sql
--
-- ATENÇÃO: depois disto `select('*')` em projects, feito pelo navegador, falha ("permission denied").
-- Toda coluna NOVA de projects que o navegador precisa ler tem de ser adicionada à lista abaixo
-- E em src/lib/project-columns.ts (um teste confere que as duas listas são iguais).
-- Pré-requisito: a coluna wordpress_has_credential (S1 A) e o painel novo já no ar.
REVOKE SELECT ON public.projects FROM authenticated;
REVOKE SELECT ON public.projects FROM anon;
REVOKE SELECT ON public.projects FROM PUBLIC;

GRANT SELECT (
    id,
    user_id,
    name,
    domain,
    description,
    wordpress_username,
    is_connected,
    created_at,
    updated_at,
    seo_plugin,
    wordpress_url,
    nicho,
    compliance_rules,
    tom_padrao,
    pov_padrao,
    empresa_nome,
    empresa_telefone,
    empresa_endereco,
    empresa_whatsapp,
    links_prioritarios,
    palavras_secundarias,
    social_instagram,
    social_youtube,
    social_linkedin,
    social_twitter,
    social_tiktok,
    social_google_maps,
    social_linktree,
    cta_comunidade,
    cta_conclusao,
    cta_leads,
    wordpress_connector_mode,
    wordpress_credential_ref,
    wordpress_plugin_namespace,
    wordpress_plugin_version,
    wordpress_connected_at,
    wordpress_last_verified_at,
    rss_feed_url,
    rss_feed_validation,
    rss_feed_validated_at,
    commercial_info,
    social_links,
    editorial_identity,
    organization_id,
    nexus_business_id,
    nexus_strategy,
    nexus_strategy_version,
    nexus_profile_status,
    wordpress_has_credential
) ON public.projects TO authenticated;
