-- APLICADA em produção em 14/11/2026 (apply_migration "revoke_anon_write_grants"; a versão registrada é o horário real da aplicação): tirar a escrita do papel anon (visitante sem login) em public.
-- Hoje o anon tem INSERT/UPDATE/DELETE em 32 objetos (e TRUNCATE em 5: model_pricing_catalog e 4 views). O RLS barra a maioria das tabelas,
-- mas TRUNCATE ignora RLS e o grant é desnecessário: o app usa authenticated e as funções de borda usam a chave de serviço.
-- Nada de authenticated ou service_role é alterado.
-- Retorno (se algum fluxo público quebrar): grant insert, update, delete on table public.<tabela> to anon;  (e truncate onde existia)
do $$
declare r record;
begin
  for r in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','v','m','p')
      and exists (select 1 from information_schema.role_table_grants g
                  where g.table_schema = 'public' and g.table_name = c.relname and g.grantee = 'anon'
                    and g.privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE'))
  loop
    execute format('revoke insert, update, delete, truncate on table public.%I from anon', r.relname);
  end loop;
end $$;
-- objetos novos não nascem com escrita para anon (vale para o papel que roda as migrações)
alter default privileges in schema public revoke insert, update, delete, truncate on tables from anon;
