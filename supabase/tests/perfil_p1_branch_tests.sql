-- Baterias de teste do P1 do Perfil do Projeto (15/11/2026). RODAR SOMENTE EM BRANCH SUPABASE, NUNCA EM PRODUÇÃO.
-- Resultado de 15/11: acesso por papel 136/136 (131 das políticas + 5 de restrições), armazenamento 25/25, custo 11/11, reversão ensaiada,
-- verificador de segurança sem alerta novo, desempenho só com "índice sem uso" (esperado em tabela nova e vazia).
--
-- Como usar: criar o branch, aplicar supabase/migrations/20261115211110_perfil_projeto_p1.sql, rodar as seções 0 a 3 UMA POR VEZ
-- (a ferramenta devolve só o resultado da última consulta de cada execução). Cada seção termina em um resumo "total / aprovados / reprovados".
-- Pré-requisito do branch: ele nasce das migrações do Git e NÃO tem a concessão de SELECT em organization_members para authenticated que a
-- produção tem; a seção 2 a concede (só no branch) para as políticas antigas de storage.objects não derrubarem o teste.
-- Papéis válidos em organization_members: owner, admin, editor, viewer, campaign_manager.

-- =================================================================== SEÇÃO 0: dados sintéticos (rodar uma vez por branch)
select set_config('request.jwt.claims','{"role":"service_role"}',false), set_config('request.jwt.claim.role','service_role',false);
insert into auth.users (id, aud, role, email, created_at, updated_at) values
 ('11111111-1111-1111-1111-111111111111','authenticated','authenticated','owner-a@teste.invalid',now(),now()),
 ('22222222-2222-2222-2222-222222222222','authenticated','authenticated','admin-a@teste.invalid',now(),now()),
 ('33333333-3333-3333-3333-333333333333','authenticated','authenticated','editor-a@teste.invalid',now(),now()),
 ('44444444-4444-4444-4444-444444444444','authenticated','authenticated','viewer-a@teste.invalid',now(),now()),
 ('55555555-5555-5555-5555-555555555555','authenticated','authenticated','owner-b@teste.invalid',now(),now());
insert into public.organizations (id, owner_user_id, name, slug, status, kind) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','Org Teste A','org-teste-a','active','client'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','55555555-5555-5555-5555-555555555555','Org Teste B','org-teste-b','active','client');
insert into public.organization_members (organization_id, user_id, role, status) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','owner','active'),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','admin','active'),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','33333333-3333-3333-3333-333333333333','editor','active'),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','44444444-4444-4444-4444-444444444444','viewer','active'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','55555555-5555-5555-5555-555555555555','owner','active');
-- o gatilho guard_project_plan_limit exige service_role (por isso o set_config acima)
insert into public.projects (id, user_id, name, domain, organization_id) values
 ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1','11111111-1111-1111-1111-111111111111','Projeto A','a.teste.invalid','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
 ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1','55555555-5555-5555-5555-555555555555','Projeto B','b.teste.invalid','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select (select count(*) from public.organizations) orgs, (select count(*) from public.organization_members) membros, (select count(*) from public.projects) projetos;

-- =================================================================== SEÇÃO 1: acesso por papel (131 verificações) + restrições de dado
-- Esperado: owner e admin veem o financeiro; editor e viewer não; ninguém vê a org B; outsider nada; anon nada; escrita direta negada.
-- (a versão completa com as 5 verificações de restrição de dado está no histórico do P1; as de dado: fato com projeto de outra org
--  -> project_not_in_organization; ativo .exe recusado; ativo > 25 MB recusado; áudio sem consentimento recusado; módulo fora do catálogo recusado.)
select set_config('request.jwt.claims','{"role":"service_role"}',false), set_config('request.jwt.claim.role','service_role',false);
truncate public.project_findings, public.project_analysis_checks, public.project_analysis_runs, public.project_modules, public.project_profile_snapshots, public.project_profile_assets, public.project_profile_messages, public.project_profile_conversations, public.project_profile_facts, public.project_profile_private, public.project_profile_extended;
insert into public.project_profile_extended (project_id, organization_id) values ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.project_profile_private (project_id, organization_id, finance) values ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','{"lucro":"faixa"}');
insert into public.project_profile_facts (organization_id, project_id, field_key, value, is_private, source) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1','segmento','"Advocacia"',false,'user'),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1','lucro_mensal','"faixa"',true,'user'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1','segmento','"Outro"',false,'user');
insert into public.project_profile_conversations (id, organization_id, project_id, started_by) values
 ('c0000000-0000-0000-0000-0000000000e1','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1','33333333-3333-3333-3333-333333333333'),
 ('c0000000-0000-0000-0000-0000000000f2','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1','44444444-4444-4444-4444-444444444444');
insert into public.project_profile_messages (conversation_id, organization_id, role, content) values
 ('c0000000-0000-0000-0000-0000000000e1','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','user','oi'),
 ('c0000000-0000-0000-0000-0000000000f2','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','user','ola');
insert into public.project_profile_assets (organization_id, project_id, kind, storage_path, mime_type, byte_size) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1','logo','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/a1a1a1a1/logo.png','image/png',1000);
insert into public.project_profile_snapshots (organization_id, project_id, version, snapshot) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',1,'{}');
insert into public.project_modules (project_id, module_code, organization_id, enabled) values
 ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1','articles','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',true),
 ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1','electoral_campaign','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',false);
insert into public.project_analysis_runs (id, organization_id, project_id, request_key) values ('d0000000-0000-0000-0000-0000000000d1','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1','chave-de-teste-1');
insert into public.project_analysis_checks (run_id, organization_id, project_id, check_key, source, status) values ('d0000000-0000-0000-0000-0000000000d1','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1','cnpj','brasilapi','ok');
insert into public.project_findings (run_id, organization_id, project_id, check_key, severity, title) values ('d0000000-0000-0000-0000-0000000000d1','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1','dominio','media','Domínio no nome de terceiro');
create temp table rls_res(persona text, item text, esperado text, obtido text, ok boolean);
grant all on rls_res to public;
-- NOTA: o papel authenticated não pode escrever em tabela temporária; por isso o DO acumula em jsonb e só insere no fim, depois de "reset role".
do $$
declare
  oa uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; ob uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  personas text[][] := array[['owner','11111111-1111-1111-1111-111111111111'],['admin','22222222-2222-2222-2222-222222222222'],['editor','33333333-3333-3333-3333-333333333333'],['viewer','44444444-4444-4444-4444-444444444444'],['outsider','55555555-5555-5555-5555-555555555555']];
  tabs text[] := array['project_profile_extended','project_profile_private','project_profile_facts','project_profile_conversations','project_profile_messages','project_profile_assets','project_profile_snapshots','project_modules','project_analysis_runs','project_analysis_checks','project_findings'];
  exps text[] := array['1,1,1,1,0','1,1,0,0,0','2,2,1,1,0','2,2,1,1,0','2,2,1,1,0','1,1,1,1,0','1,1,1,1,0','2,2,2,2,0','1,1,1,1,0','1,1,1,1,0','1,1,1,1,0'];
  res jsonb := '[]'::jsonb; i int; j int; n bigint; e int; nb bigint;
begin
  for i in 1..5 loop
    perform set_config('request.jwt.claims', json_build_object('sub', personas[i][2], 'role','authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', personas[i][2], true); perform set_config('request.jwt.claim.role', 'authenticated', true);
    set local role authenticated;
    for j in 1..array_length(tabs,1) loop
      execute format('select count(*) from public.%I where organization_id = $1', tabs[j]) into n using oa;
      e := (string_to_array(exps[j], ','))[i]::int;
      res := res || jsonb_build_array(jsonb_build_array(personas[i][1], 'ler '||tabs[j]||' (org A)', e::text, n::text, n = e));
      if personas[i][1] <> 'outsider' then
        execute format('select count(*) from public.%I where organization_id = $1', tabs[j]) into nb using ob;
        res := res || jsonb_build_array(jsonb_build_array(personas[i][1], 'ler '||tabs[j]||' (org B, deve ser 0)', '0', nb::text, nb = 0));
      end if;
    end loop;
    select count(*) into n from public.module_catalog;
    res := res || jsonb_build_array(jsonb_build_array(personas[i][1], 'ler module_catalog', '21', n::text, n = 21));
    begin insert into public.project_profile_extended (project_id, organization_id) values ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', oa);
      res := res || jsonb_build_array(jsonb_build_array(personas[i][1], 'INSERT direto', 'negado', 'PERMITIDO', false));
    exception when others then res := res || jsonb_build_array(jsonb_build_array(personas[i][1], 'INSERT direto', 'negado', 'negado', true)); end;
    begin update public.project_profile_private set finance = '{}' where organization_id = oa; get diagnostics n = row_count;
      res := res || jsonb_build_array(jsonb_build_array(personas[i][1], 'UPDATE direto', 'negado/0', n::text, n = 0));
    exception when others then res := res || jsonb_build_array(jsonb_build_array(personas[i][1], 'UPDATE direto', 'negado/0', 'negado', true)); end;
    begin delete from public.project_modules where organization_id = oa; get diagnostics n = row_count;
      res := res || jsonb_build_array(jsonb_build_array(personas[i][1], 'DELETE direto', 'negado/0', n::text, n = 0));
    exception when others then res := res || jsonb_build_array(jsonb_build_array(personas[i][1], 'DELETE direto', 'negado/0', 'negado', true)); end;
    reset role;
  end loop;
  perform set_config('request.jwt.claims','{"role":"anon"}', true); perform set_config('request.jwt.claim.sub','', true); perform set_config('request.jwt.claim.role','anon', true);
  set local role anon;
  for j in 1..array_length(tabs,1) loop
    begin execute format('select count(*) from public.%I', tabs[j]) into n;
      res := res || jsonb_build_array(jsonb_build_array('anon', 'ler '||tabs[j], 'negado', n::text, false));
    exception when others then res := res || jsonb_build_array(jsonb_build_array('anon', 'ler '||tabs[j], 'negado', 'negado', true)); end;
  end loop;
  reset role;
  insert into pg_temp.rls_res select x->>0, x->>1, x->>2, x->>3, (x->>4)::boolean from jsonb_array_elements(res) x;
end $$;
select 'RESUMO' persona, 'total='||count(*)||' aprovados='||count(*) filter (where ok)||' reprovados='||count(*) filter (where not ok) item, '' esperado, '' obtido from pg_temp.rls_res
union all select persona, item, esperado, obtido from pg_temp.rls_res where not ok;

-- =================================================================== SEÇÃO 2: armazenamento (25 verificações; desfaz tudo no final)
-- Esperado: owner, admin e editor enviam para a pasta da própria organização; viewer e outsider não; ninguém envia para a pasta de outra
-- organização nem com nome sem id de organização; a política não vaza para outros buckets; quem é da org A vê os arquivos da org A.
grant select on public.organization_members to authenticated;  -- só no BRANCH, para espelhar produção (ver cabeçalho)
create temp table sto_res(persona text, item text, esperado text, obtido text, ok boolean);
grant all on sto_res to public;
do $$
declare
  personas text[][] := array[['owner','11111111-1111-1111-1111-111111111111'],['admin','22222222-2222-2222-2222-222222222222'],['editor','33333333-3333-3333-3333-333333333333'],['viewer','44444444-4444-4444-4444-444444444444'],['outsider','55555555-5555-5555-5555-555555555555']];
  quem_envia text[] := array['sim','sim','sim','nao','nao'];
  quem_ve int[] := array[1,2,3,4,0];  -- 1 arquivo existente + os enviados com sucesso pelos papéis anteriores
  res jsonb := '[]'::jsonb; i int; n bigint; msg text;
begin
  begin
    perform set_config('request.jwt.claims','{"role":"service_role"}', true); perform set_config('request.jwt.claim.role','service_role', true);
    insert into storage.objects (bucket_id, name) values ('project-profile-uploads','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/a1a1a1a1/existente.pdf');
    for i in 1..5 loop
      perform set_config('request.jwt.claims', json_build_object('sub', personas[i][2], 'role','authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', personas[i][2], true); perform set_config('request.jwt.claim.role','authenticated', true);
      set local role authenticated;
      select count(*) into n from storage.objects where bucket_id='project-profile-uploads';
      res := res || jsonb_build_array(jsonb_build_array(personas[i][1],'ver arquivos da org A',quem_ve[i]::text,n::text,n = quem_ve[i]));
      begin insert into storage.objects (bucket_id, name, owner_id) values ('project-profile-uploads','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/a1a1a1a1/novo-'||personas[i][1]||'.pdf', personas[i][2]);
        res := res || jsonb_build_array(jsonb_build_array(personas[i][1],'enviar para a pasta da org A',quem_envia[i],'sim', quem_envia[i]='sim'));
      exception when others then res := res || jsonb_build_array(jsonb_build_array(personas[i][1],'enviar para a pasta da org A',quem_envia[i],'nao', quem_envia[i]='nao')); end;
      begin insert into storage.objects (bucket_id, name, owner_id) values ('project-profile-uploads','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/b1b1b1b1/invasor-'||personas[i][1]||'.pdf', personas[i][2]);
        res := res || jsonb_build_array(jsonb_build_array(personas[i][1],'enviar para a pasta da org B',case when personas[i][1]='outsider' then 'sim' else 'nao' end,'sim', personas[i][1]='outsider'));
      exception when others then res := res || jsonb_build_array(jsonb_build_array(personas[i][1],'enviar para a pasta da org B',case when personas[i][1]='outsider' then 'sim' else 'nao' end,'nao', personas[i][1]<>'outsider')); end;
      begin insert into storage.objects (bucket_id, name, owner_id) values ('project-profile-uploads','nome-sem-pasta-de-organizacao.pdf', personas[i][2]);
        res := res || jsonb_build_array(jsonb_build_array(personas[i][1],'nome sem id de organização','negado','PERMITIDO',false));
      exception when others then res := res || jsonb_build_array(jsonb_build_array(personas[i][1],'nome sem id de organização','negado','negado',true)); end;
      begin insert into storage.objects (bucket_id, name, owner_id) values ('article-images','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/x.pdf', personas[i][2]);
        res := res || jsonb_build_array(jsonb_build_array(personas[i][1],'não vaza para outros buckets','negado','PERMITIDO',false));
      exception when others then res := res || jsonb_build_array(jsonb_build_array(personas[i][1],'não vaza para outros buckets','negado','negado',true)); end;
      reset role;
    end loop;
    perform set_config('request.jwt.claims','{"role":"service_role"}', true);
    raise exception 'desfazer_teste_de_armazenamento';
  exception when others then
    get stacked diagnostics msg = message_text;
    if msg <> 'desfazer_teste_de_armazenamento' then res := res || jsonb_build_array(jsonb_build_array('erro','execução','sem erro',msg,false)); end if;
  end;
  insert into pg_temp.sto_res select x->>0, x->>1, x->>2, x->>3, (x->>4)::boolean from jsonb_array_elements(res) x;
end $$;
select 'RESUMO' persona, 'total='||count(*)||' aprovados='||count(*) filter (where ok)||' reprovados='||count(*) filter (where not ok) item, '' esperado, '' obtido from pg_temp.sto_res
union all select persona, item, esperado, obtido from pg_temp.sto_res where not ok
union all select 'LIMPEZA', 'objetos restantes no bucket = '||count(*)::text, '', '' from storage.objects where bucket_id='project-profile-uploads';

-- =================================================================== SEÇÃO 3: reserva de custo com os tipos novos (11 verificações)
-- Esperado: sem teto configurado, profile_agent, profile_analyze, prospect_search, prospect_enrich, serp e ai_observation respondem
-- pricing_not_configured; editorial_review e pilot continuam global_paid_services_blocked; com teto, reserva e consome sem duplicar.
select set_config('request.jwt.claims','{"role":"service_role"}',false), set_config('request.jwt.claim.role','service_role',false);
insert into public.nexus_programs (organization_id, execution_enabled, budget_usd_micros, settings) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true, 50000000, '{"pricing_verified_at":"2026-11-15T00:00:00Z"}');
create temp table custo_res(passo text, esperado text, obtido text, ok boolean);
do $$
declare k text; op uuid; msg text; r jsonb; res jsonb := '[]'::jsonb; v bigint;
begin
  foreach k in array array['profile_agent','profile_analyze','prospect_search','prospect_enrich','serp','ai_observation','editorial_review','pilot'] loop
    insert into public.nexus_operations (organization_id, project_id, user_id, kind, request_key, status)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1','11111111-1111-1111-1111-111111111111', k, 'teste-custo-'||k, 'prepared') returning id into op;
    begin r := private.nexus_reserve_operation(op);
      res := res || jsonb_build_array(jsonb_build_array('sem teto: '||k, 'bloqueio/sem preço', 'RESERVOU', false));
    exception when others then get stacked diagnostics msg = message_text;
      res := res || jsonb_build_array(jsonb_build_array('sem teto: '||k, case when k in ('editorial_review','pilot') then 'global_paid_services_blocked' else 'pricing_not_configured' end, msg,
        msg = case when k in ('editorial_review','pilot') then 'global_paid_services_blocked' else 'pricing_not_configured' end)); end;
  end loop;
  update public.nexus_programs set settings = settings || '{"cost_ceilings_usd_micros":{"profile_agent":60000}}'::jsonb where organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  select id into op from public.nexus_operations where request_key = 'teste-custo-profile_agent';
  r := private.nexus_reserve_operation(op);
  select reserved_usd_micros into v from public.nexus_programs where organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  res := res || jsonb_build_array(jsonb_build_array('com teto: reserva', '60000', v::text, v = 60000));
  perform private.nexus_finish_operation(op, '{"teste":true}'::jsonb);
  select consumed_usd_micros into v from public.nexus_programs where organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  res := res || jsonb_build_array(jsonb_build_array('com teto: consumido', '60000', v::text, v = 60000));
  begin r := private.nexus_reserve_operation(op);
    res := res || jsonb_build_array(jsonb_build_array('reserva repetida', 'operation_already_claimed', 'RESERVOU', false));
  exception when others then get stacked diagnostics msg = message_text;
    res := res || jsonb_build_array(jsonb_build_array('reserva repetida', 'operation_already_claimed', msg, msg = 'operation_already_claimed')); end;
  insert into pg_temp.custo_res select x->>0, x->>1, x->>2, (x->>3)::boolean from jsonb_array_elements(res) x;
end $$;
select 'RESUMO' passo, 'total='||count(*)||' aprovados='||count(*) filter (where ok)||' reprovados='||count(*) filter (where not ok) esperado, '' obtido, true ok from pg_temp.custo_res
union all select passo, esperado, obtido, ok from pg_temp.custo_res where not ok;
