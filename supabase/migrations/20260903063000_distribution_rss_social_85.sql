-- Distribution, RSS and social foundation. Non-destructive.

drop index if exists public.uq_wordpress_operations_active_article;
create unique index if not exists uq_wordpress_operations_active_article_project
  on public.wordpress_operations(article_id, project_id, operation_type)
  where article_id is not null and status in ('scheduled','pending','processing','retry');

create unique index if not exists uq_rss_schedules_project_feed
  on public.rss_schedules(project_id, feed_url) where project_id is not null;
create unique index if not exists uq_monitored_portals_project_feed
  on public.monitored_portals(project_id, rss_feed_url) where project_id is not null and rss_feed_url is not null;

update public.projects
set social_instagram='https://www.instagram.com/rdmadvogados/',
    social_linkedin='https://www.linkedin.com/in/r%C3%A2ndalos-madeira-advogados-associados-544865345/',
    social_twitter='https://x.com/rdmadvogados',
    social_tiktok='https://www.tiktok.com/@rdmadvogados.podcast',
    links_prioritarios=case when domain='rdmadvogados.com.br' then array[
      'https://rdmadvogados.com.br/blog/lei-15-358-2026-novo-marco-contra-o-crime-organizado/',
      'https://rdmadvogados.com.br/blog/lei-15-397-2026-o-que-mudou-no-crime-de-furto/',
      'https://rdmadvogados.com.br/blog/progressao-de-regime-e-nova-tabela-da-lep-requisitos-fraco/',
      'https://rdmadvogados.com.br/blog/estelionato-e-fraudes-virtuais-como-identificar-e-agir-dian/',
      'https://rdmadvogados.com.br/blog/provas-digitais-e-cadeia-de-custodia-requisitos-para-a-vali/'
    ]::text[] else array['https://direitonews.rdmadvogados.com.br/blog/']::text[] end,
    updated_at=now()
where domain in ('rdmadvogados.com.br','direitonews.rdmadvogados.com.br');

update public.projects
set social_instagram='https://www.instagram.com/drrandalosmadeira/',
    social_youtube='https://www.youtube.com/@dr.madeira/',
    social_linkedin='https://www.linkedin.com/in/randalos-madeira/',
    social_tiktok='https://www.tiktok.com/@drmadeirarandalos',
    links_prioritarios=case domain when 'quemvotar.drmadeira1470.com.br' then array['https://quemvotar.drmadeira1470.com.br/blog/']::text[] else array['https://votardeputadofederal.drmadeira1470.com.br/blog/']::text[] end,
    cta_comunidade='https://queroapoiar.com.br/drrandalosmadeira',
    cta_conclusao='https://drmadeira1470.com.br/',
    cta_leads='https://wa.me/551150282621',updated_at=now()
where domain in ('quemvotar.drmadeira1470.com.br','votardeputadofederal.drmadeira1470.com.br');

insert into public.rss_schedules
(user_id,project_id,feed_url,feed_name,niche,article_length,frequency,auto_publish,is_active,next_run_at,articles_generated,created_at,updated_at)
select p.user_id,p.id,f.feed_url,f.feed_name,f.niche,'auto','hourly',true,true,now(),0,now(),now()
from public.projects p cross join (values
 ('https://res.stj.jus.br/hrestp-c-portalp/RSS.xml','STJ Notícias','jurídico'),
 ('https://scon.stj.jus.br/SCON/PesquisaProntaFeed','STJ Pesquisa Pronta','jurisprudência'),
 ('https://scon.stj.jus.br/SCON/JurisprudenciaEmTesesFeed','STJ Jurisprudência em Teses','jurisprudência'),
 ('https://processo.stj.jus.br/jurisprudencia/externo/InformativoFeed','STJ Informativo de Jurisprudência','jurisprudência')
) as f(feed_url,feed_name,niche)
where p.domain in ('rdmadvogados.com.br','direitonews.rdmadvogados.com.br')
on conflict (project_id,feed_url) where project_id is not null do update set feed_name=excluded.feed_name,niche=excluded.niche,article_length='auto',frequency='hourly',auto_publish=true,is_active=true,updated_at=now();

insert into public.rss_schedules
(user_id,project_id,feed_url,feed_name,niche,article_length,frequency,auto_publish,is_active,next_run_at,articles_generated,created_at,updated_at)
select p.user_id,p.id,f.feed_url,f.feed_name,'notícias','auto','hourly',true,true,now(),0,now(),now()
from public.projects p cross join (values
 ('https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml','Agência Brasil - Últimas Notícias'),
 ('https://agenciabrasil.ebc.com.br/rss/politica/feed.xml','Agência Brasil - Política')
) as f(feed_url,feed_name)
where p.domain='direitonews.rdmadvogados.com.br'
on conflict (project_id,feed_url) where project_id is not null do update set feed_name=excluded.feed_name,article_length='auto',frequency='hourly',auto_publish=true,is_active=true,updated_at=now();

insert into public.monitored_portals
(user_id,project_id,portal_name,portal_url,portal_domain,rss_feed_url,niches,preferred_keywords,excluded_keywords,article_length,default_angle,auto_title,auto_meta_description,preserve_original_seo,seo_preservation_percent,is_active,monitoring_frequency,active_hours,active_days,max_articles_per_day,next_check_at,auto_publish,publish_delay_minutes,update_sitemap,sitemap_priority,articles_generated,created_at,updated_at)
select s.user_id,s.project_id,s.feed_name,regexp_replace(s.feed_url,'/[^/]*$','/'),split_part(regexp_replace(s.feed_url,'^https?://','',''),'/',1),s.feed_url,array[coalesce(s.niche,'notícias')]::text[],array[]::text[],array[]::text[],'medium','IA define o melhor ângulo conforme intenção, atualidade, SEO/GEO/AEO e fontes.',true,true,false,0,true,'hourly',array[]::text[],array['mon','tue','wed','thu','fri','sat','sun']::text[],12,now(),true,0,true,0.7,0,now(),now()
from public.rss_schedules s where s.is_active=true
on conflict (project_id,rss_feed_url) where project_id is not null and rss_feed_url is not null do update set portal_name=excluded.portal_name,is_active=true,monitoring_frequency='hourly',auto_publish=true,next_check_at=now(),updated_at=now();

update public.news_agents a
set rss_feeds=coalesce((select array_agg(s.feed_url order by s.feed_name) from public.rss_schedules s where s.project_id=a.project_id and s.is_active),array[]::text[]),
    search_internal_links=true,cite_sources_inline=true,cite_sources_footer=true,auto_publish=true,
    category=case when a.name ilike '%NEWS%' then 'Direitos News › Repostagem Jurídica' else 'Blog RDM › Conteúdo Jurídico Institucional' end,
    prompt_template='AUTO IA: reescrita transformativa; creditar veículo e URL; validar fonte primária quando YMYL; IA define nicho, keyword, ângulo e profundidade; linkagem interna obrigatória com URLs reais do projeto; nunca copiar integralmente nem inserir marcadores internos.',updated_at=now()
where a.is_active=true;
