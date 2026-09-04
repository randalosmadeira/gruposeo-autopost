-- Evaluate stable auth helpers once per statement instead of once per row.
-- The predicates and access semantics remain unchanged.
do $optimize$
declare
  policy_row record;
  optimized_using text;
  optimized_check text;
  command text;
begin
  for policy_row in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname in ('public','storage')
      and (
        coalesce(qual,'') ~ 'auth\.(uid|jwt|role)\(\)'
        or coalesce(with_check,'') ~ 'auth\.(uid|jwt|role)\(\)'
      )
  loop
    optimized_using := policy_row.qual;
    optimized_check := policy_row.with_check;
    if optimized_using is not null and optimized_using not ilike '%select auth.uid()%' then
      optimized_using := replace(optimized_using, 'auth.uid()', '(select auth.uid())');
    end if;
    if optimized_using is not null and optimized_using not ilike '%select auth.jwt()%' then
      optimized_using := replace(optimized_using, 'auth.jwt()', '(select auth.jwt())');
    end if;
    if optimized_using is not null and optimized_using not ilike '%select auth.role()%' then
      optimized_using := replace(optimized_using, 'auth.role()', '(select auth.role())');
    end if;
    if optimized_check is not null and optimized_check not ilike '%select auth.uid()%' then
      optimized_check := replace(optimized_check, 'auth.uid()', '(select auth.uid())');
    end if;
    if optimized_check is not null and optimized_check not ilike '%select auth.jwt()%' then
      optimized_check := replace(optimized_check, 'auth.jwt()', '(select auth.jwt())');
    end if;
    if optimized_check is not null and optimized_check not ilike '%select auth.role()%' then
      optimized_check := replace(optimized_check, 'auth.role()', '(select auth.role())');
    end if;

    command := format('alter policy %I on %I.%I',
      policy_row.policyname, policy_row.schemaname, policy_row.tablename);
    if optimized_using is not null then
      command := command || format(' using (%s)', optimized_using);
    end if;
    if optimized_check is not null then
      command := command || format(' with check (%s)', optimized_check);
    end if;
    execute command;
  end loop;
end
$optimize$;
