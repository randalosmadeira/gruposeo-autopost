-- Deterministic project-scoped internal-link seeds.

insert into public.keyword_link_rules(user_id,project_id,keyword,match_type,case_sensitive,target_url,target_title,max_links_per_article,priority,is_active,times_applied,created_at,updated_at)
select p.user_id,p.id,r.keyword,'contains',false,r.url,r.title,1,r.priority,true,0,now(),now()
from public.projects p cross join (values
 ('provas digitais','https://rdmadvogados.com.br/blog/provas-digitais-e-cadeia-de-custodia-requisitos-para-a-vali/','Provas Digitais e Cadeia de Custódia',100),
 ('crime organizado','https://rdmadvogados.com.br/blog/lei-15-358-2026-novo-marco-contra-o-crime-organizado/','Lei 15.358/2026 e crime organizado',95),
 ('furto','https://rdmadvogados.com.br/blog/lei-15-397-2026-o-que-mudou-no-crime-de-furto/','Lei 15.397/2026 e o crime de furto',90),
 ('progressão de regime','https://rdmadvogados.com.br/blog/progressao-de-regime-e-nova-tabela-da-lep-requisitos-fraco/','Progressão de Regime e LEP',90),
 ('fraudes','https://rdmadvogados.com.br/blog/estelionato-e-fraudes-virtuais-como-identificar-e-agir-dian/','Estelionato e Fraudes Virtuais',90)
) as r(keyword,url,title,priority)
where p.domain='rdmadvogados.com.br'
on conflict (project_id,keyword) do update set target_url=excluded.target_url,target_title=excluded.target_title,priority=excluded.priority,is_active=true,updated_at=now();

insert into public.keyword_link_rules(user_id,project_id,keyword,match_type,case_sensitive,target_url,target_title,max_links_per_article,priority,is_active,times_applied,created_at,updated_at)
select p.user_id,p.id,r.keyword,'contains',false,
       case p.domain when 'quemvotar.drmadeira1470.com.br' then 'https://quemvotar.drmadeira1470.com.br/blog/' else 'https://votardeputadofederal.drmadeira1470.com.br/blog/' end,
       r.title,1,r.priority,true,0,now(),now()
from public.projects p cross join (values
 ('Dr. Madeira','Portal eleitoral Dr. Madeira',100),
 ('deputado federal','Conteúdo sobre deputado federal em São Paulo',95),
 ('propostas','Propostas e bandeiras da candidatura',90)
) as r(keyword,title,priority)
where p.domain in ('quemvotar.drmadeira1470.com.br','votardeputadofederal.drmadeira1470.com.br')
on conflict (project_id,keyword) do update set target_url=excluded.target_url,target_title=excluded.target_title,priority=excluded.priority,is_active=true,updated_at=now();
