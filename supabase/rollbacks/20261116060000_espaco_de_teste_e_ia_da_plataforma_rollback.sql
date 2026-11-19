-- Rollback do espaço de teste e da porteira da IA. ATENÇÃO:
--  * apaga a função `platform_ai_allowed`: ANTES, republique o resolvedor de chaves SEM a consulta (senão toda IA da plataforma será negada);
--  * remove o plano 'trial' só se nenhuma assinatura o usa (se houver espaços de teste, libere-os ou apague-os antes);
--  * NÃO volta o limite de artigos para "> 0" se algum plano tiver 0 (a restrição antiga recusaria).
drop function if exists public.lead_trial_info(uuid[]);
drop function if exists public.release_trial_space(uuid, text, uuid);
drop function if exists public.provision_trial_space(uuid, text);
drop function if exists public.platform_ai_allowed(uuid);
delete from public.commercial_plans where id = 'trial' and not exists (select 1 from public.organization_subscriptions s where s.plan_id = 'trial');
do $$
begin
  if not exists (select 1 from public.commercial_plans where article_limit_monthly = 0) then
    alter table public.commercial_plans drop constraint if exists commercial_plans_article_limit_monthly_check;
    alter table public.commercial_plans add constraint commercial_plans_article_limit_monthly_check check (article_limit_monthly is null or article_limit_monthly > 0);
  end if;
end $$;
