-- Espaço de teste (opção "c" da decisão D19) e porteira da IA paga da plataforma.
-- Quem chega pelo atalho de captação recebe, ao se cadastrar, um espaço MÍNIMO (1 projeto, sem artigos pela cota, sem IA paga da
-- plataforma). A gestão libera depois, escolhendo um plano. Aditiva e reversível (supabase/rollbacks/20261116060000_*_rollback.sql).
--
-- Por que a porteira da IA: as funções de IA hoje autenticam o usuário e, se ele não tem chave própria, usam a chave da PLATAFORMA
-- (Vault/variável de ambiente), sem olhar plano nem cota. Sem esta porteira, qualquer espaço de teste gastaria a chave da plataforma.
-- A função `platform_ai_allowed` diz quem pode; o resolvedor de chaves (`_shared/byok-resolver.ts`) passa a consultá-la.
--
-- Tudo aqui só é executável pela chave de serviço (funções de borda). O navegador não chama nada disto.

-- 1) O plano de teste precisa de limite de artigos ZERO (a cota hoje exige > 0, o que tornaria "1 artigo" o mínimo possível).
alter table public.commercial_plans drop constraint if exists commercial_plans_article_limit_monthly_check;
alter table public.commercial_plans add constraint commercial_plans_article_limit_monthly_check
  check (article_limit_monthly is null or article_limit_monthly >= 0);

insert into public.commercial_plans (id, name, project_limit, article_limit_monthly, brand_asset_limit, byok_allowed, copilot_allowed, active, features)
values ('trial', 'Espaço de teste', 1, 0, 1, false, false, true, '{"trial": true, "platform_ai": false}'::jsonb)
on conflict (id) do nothing;

-- 2) Quem pode usar a IA paga da plataforma: gestor (app_role = ceo) ou membro de organização viva cujo plano NÃO é de teste.
create or replace function public.platform_ai_allowed(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select u.raw_app_meta_data ->> 'app_role' = 'ceo' from auth.users u where u.id = p_user), false)
  or exists (
    select 1
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id and o.status in ('trialing', 'active', 'past_due')
    join public.organization_subscriptions s on s.organization_id = o.id and s.status in ('trialing', 'active', 'past_due')
    join public.commercial_plans p on p.id = s.plan_id
    where m.user_id = p_user and m.status = 'active' and (p.features ->> 'trial') is distinct from 'true'
  );
$$;
revoke all on function public.platform_ai_allowed(uuid) from public, anon, authenticated;
grant execute on function public.platform_ai_allowed(uuid) to service_role;

-- 3) Cria o espaço de teste de quem acabou de se cadastrar pelo atalho. Idempotente: quem já tem espaço não ganha outro.
create or replace function public.provision_trial_space(p_user uuid, p_display_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_name text; v_slug text; v_recent integer;
begin
  if p_user is null or not exists (select 1 from auth.users where id = p_user) then raise exception 'user_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('trial-space:' || p_user::text, 0));
  select m.organization_id into v_org from public.organization_members m where m.user_id = p_user and m.status = 'active' order by m.created_at limit 1;
  if v_org is not null then return jsonb_build_object('created', false, 'organization_id', v_org); end if;

  -- teto de segurança: no máximo 30 espaços de teste novos por dia na plataforma toda
  select count(*) into v_recent from public.organizations o join public.organization_subscriptions s on s.organization_id = o.id
   where s.plan_id = 'trial' and o.created_at > now() - interval '24 hours';
  if v_recent >= 30 then raise exception 'trial_capacity_reached'; end if;

  v_name := left(coalesce(nullif(btrim(regexp_replace(coalesce(p_display_name, ''), '\s+', ' ', 'g')), ''), 'Novo espaço'), 100);
  if char_length(v_name) < 2 then v_name := 'Novo espaço'; end if;
  v_slug := 'teste-' || coalesce(nullif(trim(both '-' from left(regexp_replace(lower(translate(v_name, 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn')), '[^a-z0-9]+', '-', 'g'), 40)), ''), 'novo') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  insert into public.organizations (owner_user_id, name, slug, status, kind) values (p_user, 'Espaço de ' || v_name, v_slug, 'trialing', 'client') returning id into v_org;
  insert into public.organization_members (organization_id, user_id, role, status) values (v_org, p_user, 'owner', 'active');
  insert into public.organization_subscriptions (organization_id, plan_id, status, current_period_start, current_period_end)
  values (v_org, 'trial', 'trialing', now(), now() + interval '30 days');
  insert into public.organization_operating_policies (organization_id, updated_by) values (v_org, null) on conflict do nothing;
  return jsonb_build_object('created', true, 'organization_id', v_org);
end $$;
revoke all on function public.provision_trial_space(uuid, text) from public, anon, authenticated;
grant execute on function public.provision_trial_space(uuid, text) to service_role;

-- 4) A gestão libera o espaço de teste para um plano de verdade. Só espaço que ainda está no plano de teste; nunca para o plano interno.
create or replace function public.release_trial_space(p_org uuid, p_plan text, p_actor uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_old text;
begin
  select s.plan_id into v_old from public.organization_subscriptions s where s.organization_id = p_org for update;
  if not found then raise exception 'subscription_not_found'; end if;
  if v_old is distinct from 'trial' then raise exception 'not_a_trial_space'; end if;
  if p_plan is null or p_plan = 'internal' or not exists (select 1 from public.commercial_plans p where p.id = p_plan and p.active and (p.features ->> 'trial') is distinct from 'true') then
    raise exception 'plan_not_releasable';
  end if;
  update public.organization_subscriptions set plan_id = p_plan, status = 'active', current_period_start = date_trunc('month', now()),
    current_period_end = date_trunc('month', now()) + interval '1 month', updated_at = now() where organization_id = p_org;
  update public.organizations set status = 'active', updated_at = now() where id = p_org;
  insert into public.organization_operating_policies (organization_id, updated_by) values (p_org, p_actor)
  on conflict (organization_id) do update set updated_by = excluded.updated_by, updated_at = now();
  return jsonb_build_object('released', true, 'organization_id', p_org, 'plan_id', p_plan);
end $$;
revoke all on function public.release_trial_space(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.release_trial_space(uuid, text, uuid) to service_role;

-- 5) Para a caixa de leads do gestor: o espaço de cada pessoa que já se cadastrou.
create or replace function public.lead_trial_info(p_users uuid[]) returns table (user_id uuid, organization_id uuid, plan_id text, subscription_status text)
language sql stable security definer set search_path = '' as $$
  select distinct on (m.user_id) m.user_id, m.organization_id, s.plan_id, s.status
  from public.organization_members m
  join public.organization_subscriptions s on s.organization_id = m.organization_id
  where m.user_id = any (p_users) and m.status = 'active'
  order by m.user_id, (m.role = 'owner') desc, m.created_at;
$$;
revoke all on function public.lead_trial_info(uuid[]) from public, anon, authenticated;
grant execute on function public.lead_trial_info(uuid[]) to service_role;
