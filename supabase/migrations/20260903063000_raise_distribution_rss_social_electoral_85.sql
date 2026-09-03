-- Zica.ai 85% foundation: distribution, RSS, interlinks, social and electoral corpus.
-- Non-destructive: preserves all historical jobs, articles and resources.

-- 1) Multisite WordPress queue: active operations are unique per destination.
drop index if exists public.uq_wordpress_operations_active_article;
create unique index if not exists uq_wordpress_operations_active_article_project
  on public.wordpress_operations(article_id, project_id, operation_type)
  where article_id is not null
    and status in ('scheduled','pending','processing','retry');

-- 2) RSS uniqueness, so repeated migrations/configuration never duplicate feeds.
create unique index if not exists uq_rss_schedules_project_feed
  on public.rss_schedules(project_id, feed_url)
  where project_id is not null;
create unique index if not exists uq_monitored_portals_project_feed
  on public.monitored_portals(project_id, rss_feed_url)
  where project_id is not null and rss_feed_url is not null;

-- 3) Project-scoped canonical social profiles and priority links.
update public.projects
set social_instagram = 'https://www.instagram.com/rdmadvogados/',
    social_linkedin = 'https://www.linkedin.com/in/r%C3%A2ndalos-madeira-advogados-associados-544865345/',
    social_twitter = 'https://x.com/rdmadvogados',
    social_tiktok = 'https://www.tiktok.com/@rdmadvogados.podcast',
    links_prioritarios = case
      when domain = 'rdmadvogados.com.br' then array[
        'https://rdmadvogados.com.br/blog/lei-15-358-2026-novo-marco-contra-o-crime-organizado/',
        'https://rdmadvogados.com.br/blog/lei-15-397-2026-o-que-mudou-no-crime-de-furto/',
        'https://rdmadvogados.com.br/blog/progressao-de-regime-e-nova-tabela-da-lep-requisitos-fraco/',
        'https://rdmadvogados.com.br/blog/estelionato-e-fraudes-virtuais-como-identificar-e-agir-dian/',
        'https://rdmadvogados.com.br/blog/provas-digitais-e-cadeia-de-custodia-requisitos-para-a-vali/'
      ]::text[]
      else array['https://direitonews.rdmadvogados.com.br/blog/']::text[]
    end,
    updated_at = now()
where domain in ('rdmadvogados.com.br','direitonews.rdmadvogados.com.br');

update public.projects
set social_instagram = 'https://www.instagram.com/drrandalosmadeira/',
    social_youtube = 'https://www.youtube.com/@dr.madeira/',
    social_linkedin = 'https://www.linkedin.com/in/randalos-madeira/',
    social_tiktok = 'https://www.tiktok.com/@drmadeirarandalos',
    links_prioritarios = case domain
      when 'quemvotar.drmadeira1470.com.br' then array['https://quemvotar.drmadeira1470.com.br/blog/']::text[]
      else array['https://votardeputadofederal.drmadeira1470.com.br/blog/']::text[]
    end,
    cta_comunidade = 'https://queroapoiar.com.br/drrandalosmadeira',
    cta_conclusao = 'https://drmadeira1470.com.br/',
    cta_leads = 'https://wa.me/551150282621',
    updated_at = now()
where domain in ('quemvotar.drmadeira1470.com.br','votardeputadofederal.drmadeira1470.com.br');

-- 4) RSS: verified official/public-interest feeds. The publication gate remains mandatory.
insert into public.rss_schedules
(user_id, project_id, feed_url, feed_name, niche, article_length, frequency, auto_publish, is_active, next_run_at, articles_generated, created_at, updated_at)
select p.user_id, p.id, f.feed_url, f.feed_name, f.niche, 'auto', 'hourly', true, true, now(), 0, now(), now()
from public.projects p
cross join (values
  ('https://res.stj.jus.br/hrestp-c-portalp/RSS.xml','STJ Notícias','jurídico'),
  ('https://scon.stj.jus.br/SCON/PesquisaProntaFeed','STJ Pesquisa Pronta','jurisprudência'),
  ('https://scon.stj.jus.br/SCON/JurisprudenciaEmTesesFeed','STJ Jurisprudência em Teses','jurisprudência'),
  ('https://processo.stj.jus.br/jurisprudencia/externo/InformativoFeed','STJ Informativo de Jurisprudência','jurisprudência')
) as f(feed_url,feed_name,niche)
where p.domain in ('rdmadvogados.com.br','direitonews.rdmadvogados.com.br')
on conflict (project_id, feed_url) where project_id is not null do update
set feed_name=excluded.feed_name, niche=excluded.niche, article_length='auto', frequency='hourly', auto_publish=true, is_active=true, updated_at=now();

insert into public.rss_schedules
(user_id, project_id, feed_url, feed_name, niche, article_length, frequency, auto_publish, is_active, next_run_at, articles_generated, created_at, updated_at)
select p.user_id, p.id, f.feed_url, f.feed_name, 'notícias', 'auto', 'hourly', true, true, now(), 0, now(), now()
from public.projects p
cross join (values
  ('https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml','Agência Brasil - Últimas Notícias'),
  ('https://agenciabrasil.ebc.com.br/rss/politica/feed.xml','Agência Brasil - Política')
) as f(feed_url,feed_name)
where p.domain = 'direitonews.rdmadvogados.com.br'
on conflict (project_id, feed_url) where project_id is not null do update
set feed_name=excluded.feed_name, article_length='auto', frequency='hourly', auto_publish=true, is_active=true, updated_at=now();

-- Mirror feeds in monitored_portals for the Portais/Monitor UI.
insert into public.monitored_portals
(user_id,project_id,portal_name,portal_url,portal_domain,rss_feed_url,niches,preferred_keywords,excluded_keywords,article_length,default_angle,auto_title,auto_meta_description,preserve_original_seo,seo_preservation_percent,is_active,monitoring_frequency,active_hours,active_days,max_articles_per_day,next_check_at,auto_publish,publish_delay_minutes,update_sitemap,sitemap_priority,articles_generated,created_at,updated_at)
select s.user_id,s.project_id,s.feed_name,
       regexp_replace(s.feed_url,'/[^/]*$','/'),
       split_part(regexp_replace(s.feed_url,'^https?://','',''), '/', 1),
       s.feed_url,
       array[coalesce(s.niche,'notícias')]::text[],
       array[]::text[],array[]::text[],
       'auto','IA define o melhor ângulo conforme intenção, atualidade, SEO/GEO/AEO e fontes.',
       true,true,false,0,true,'hourly',
       array[]::text[],array['mon','tue','wed','thu','fri','sat','sun']::text[],12,now(),true,0,true,0.7,0,now(),now()
from public.rss_schedules s
where s.is_active=true
on conflict (project_id,rss_feed_url) where project_id is not null and rss_feed_url is not null do update
set portal_name=excluded.portal_name,is_active=true,monitoring_frequency='hourly',auto_publish=true,next_check_at=now(),updated_at=now();

-- Feed the two existing news agents from their project schedules.
update public.news_agents a
set rss_feeds = coalesce((select array_agg(s.feed_url order by s.feed_name) from public.rss_schedules s where s.project_id=a.project_id and s.is_active), array[]::text[]),
    search_internal_links = true,
    cite_sources_inline = true,
    cite_sources_footer = true,
    auto_publish = true,
    article_length = null,
    category = case when a.name ilike '%NEWS%' then 'Direitos News › Repostagem Jurídica' else 'Blog RDM › Conteúdo Jurídico Institucional' end,
    prompt_template = 'AUTO IA: reescrita transformativa; creditar veículo e URL; validar fonte primária quando YMYL; IA define nicho, keyword, ângulo e profundidade; linkagem interna obrigatória com URLs reais do projeto; nunca copiar integralmente nem inserir marcadores internos.',
    updated_at = now()
where a.is_active=true;

-- 5) Electoral network settings: campaign social profile, neighborhood reporting, contextual linking without spam.
update public.electoral_portal_settings
set min_links_per_post = 3,
    max_links_per_post = 6,
    contextual_linking_enabled = true,
    geo_reporting_level = 'city_neighborhood',
    allow_individual_voter_profiles = false,
    allow_political_preference_inference = false,
    optin_instagram_enabled = true,
    optin_instagram_url = 'https://www.instagram.com/drrandalosmadeira/',
    optin_instagram_label = 'Acompanhar Dr. Madeira no Instagram',
    updated_at = now()
where campaign_preset_id='madeira-1470-sp-2026';

-- Official campaign network resources. These do not inherit RDM institutional profiles.
insert into public.electoral_portal_resources
(campaign_preset_id,label,url,category,tags,editorial_hook,priority,active,created_at,updated_at)
values
('madeira-1470-sp-2026','Site oficial Dr. Madeira 1470','https://drmadeira1470.com.br/','official-campaign',array['site','perfil','propostas'],'Fonte canônica da identidade, bandeiras e cobertura territorial da candidatura.',100,true,now(),now()),
('madeira-1470-sp-2026','Instagram oficial Dr. Madeira','https://www.instagram.com/drrandalosmadeira/','social-official',array['instagram','social'],'Rede oficial da candidatura.',100,true,now(),now()),
('madeira-1470-sp-2026','YouTube oficial Dr. Madeira','https://www.youtube.com/@dr.madeira/','social-official',array['youtube','video'],'Canal oficial de vídeos e entrevistas.',100,true,now(),now()),
('madeira-1470-sp-2026','TikTok Dr. Madeira','https://www.tiktok.com/@drmadeirarandalos','social-official',array['tiktok','social'],'Perfil informado pelo site oficial; manter como identidade de campanha sem inferir métricas.',90,true,now(),now()),
('madeira-1470-sp-2026','LinkedIn Rândalos Madeira','https://www.linkedin.com/in/randalos-madeira/','social-official',array['linkedin','perfil'],'Perfil profissional informado pelo site oficial da candidatura.',90,true,now(),now()),
('madeira-1470-sp-2026','WhatsApp da campanha','https://wa.me/551150282621','campaign-contact',array['whatsapp','contato'],'Canal de contato da campanha informado pelo site oficial.',95,true,now(),now()),
('madeira-1470-sp-2026','Vaquinha oficial da campanha','https://queroapoiar.com.br/drrandalosmadeira','campaign-support',array['apoio','vaquinha'],'Canal de apoio informado pelo site oficial.',95,true,now(),now())
on conflict (campaign_preset_id,url) do update
set label=excluded.label,category=excluded.category,tags=excluded.tags,editorial_hook=excluded.editorial_hook,priority=excluded.priority,active=true,updated_at=now();

-- 6) Complete explicit proposal corpus from the canonical campaign website source.
with src as (
  select id from public.electoral_content_sources
  where campaign_preset_id='madeira-1470-sp-2026' and slug='site-oficial-dr-madeira-1470-2026'
  limit 1
), proposals(unit_key,title,topic,body,priority,tags) as (values
 ('proposta-site-porte-arma-cnh','Porte de arma equiparado à CNH','segurança e armas','Proposta de campanha: após aprovação nos exames psicológico, técnico e de antecedentes, reduzir burocracia para concessão do porte. Tratar sempre como proposta, não como direito vigente.',91,array['segurança','proposta']::text[]),
 ('proposta-site-carro-roubado-fipe','Carro roubado: ressarcimento de 100% da FIPE','segurança patrimonial','Proposta de campanha: se o veículo não for recuperado em 30 dias, prever ressarcimento integral pela tabela FIPE. Tratar como proposta legislativa, não como regra vigente.',91,array['veículo','segurança','FIPE']::text[]),
 ('proposta-site-irpf-zero','IRPF zero para Segurança Pública, Educação e Saúde','tributação e serviços essenciais','Proposta de campanha de isenção de Imposto de Renda para trabalhadores das áreas de segurança pública, educação e saúde.',90,array['IRPF','educação','saúde','segurança']::text[]),
 ('proposta-site-minha-casa-nao-minha-divida','Minha casa, não minha dívida','habitação e crédito','Proposta de campanha para condições reais de quitação e enfrentamento de juros considerados abusivos no primeiro imóvel.',89,array['habitação','financiamento','primeiro imóvel']::text[]),
 ('proposta-site-pedagios','Revisão de concessões e pedágios considerados abusivos','mobilidade e infraestrutura','Bandeira de campanha por revisão de concessões e cobrança de pedágios consideradas abusivas. Evitar apresentar o slogan como constatação factual de ilegalidade.',88,array['pedágio','IPVA','infraestrutura']::text[]),
 ('proposta-site-bndes','BNDES sem burocracia e revisão de empréstimos políticos internacionais','crédito e desenvolvimento','Bandeira de campanha por simplificação de acesso ao BNDES e oposição a empréstimos internacionais classificados politicamente pela candidatura. Separar proposta/opinião de fato institucional.',86,array['BNDES','crédito','empreendedorismo']::text[]),
 ('proposta-site-cultura-periferia','Acesso a fomento cultural para artistas de periferia','cultura e economia criativa','Bandeira de campanha por ampliação do acesso de artistas de favela, funk, gospel e outras expressões periféricas a mecanismos de fomento cultural, com linguagem inclusiva e sem afirmar direito já existente.',86,array['cultura','periferia','funk','economia criativa']::text[])
)
insert into public.electoral_content_units
(source_id,campaign_preset_id,unit_key,unit_type,title,body,topic,tags,verification_status,usage_scope,risk_flags,priority,source_locator,metadata,active,created_at,updated_at)
select src.id,'madeira-1470-sp-2026',p.unit_key,'proposal',p.title,p.body,p.topic,p.tags,'campaign_official','proposal_generation',array[]::text[],p.priority,
       jsonb_build_object('source','drmadeira1470.com.br','section','bandeiras'),
       jsonb_build_object('canonical_campaign_source',true,'must_label_as_proposal',true),true,now(),now()
from src cross join proposals p
on conflict (campaign_preset_id,unit_key) do update
set source_id=excluded.source_id,title=excluded.title,body=excluded.body,topic=excluded.topic,tags=excluded.tags,verification_status='campaign_official',usage_scope='proposal_generation',priority=excluded.priority,metadata=excluded.metadata,active=true,updated_at=now();

-- 7) Canonical geo editorial coverage. These rows authorize LOCAL TOPICS only; they do not assert visits, support or voter preference.
insert into public.electoral_content_sources
(campaign_preset_id,slug,title,source_type,source_filename,authority_level,factual_use_status,raw_text,source_sha256,metadata,active,created_at,updated_at)
values (
 'madeira-1470-sp-2026','geo-cobertura-editorial-grande-sp-2026','Cobertura geográfica editorial Grande São Paulo 2026','public_geography_reference','generated-from-canonical-site-and-editorial-coverage','public_geography','allowed_for_geo_context',
 'Cobertura editorial por cidade e bairro. Não significa apoio, visita, presença pessoal nem preferência política. Base do site oficial: Guarulhos Centro, Pimentas, Cumbica, Bonsucesso, Macedo, Vila Augusta, Maia, Cocaia, Taboão; São Paulo Tatuapé, Penha, Itaquera, São Miguel Paulista, Itaim Paulista, Jardim Helena, Guaianases, Jardim Pantanal, Santo Amaro, Jabaquara, Santana, Lapa, Butantã; Alto Tietê: Itaquaquecetuba, Poá, Ferraz de Vasconcelos, Mogi das Cruzes; adicional editorial do Centro Expandido/Grande SP: Sé, República, Bela Vista, Consolação, Santa Cecília, Liberdade, Cambuci, Aclimação, Brás, Mooca, Pari, Bom Retiro, Barra Funda, Perdizes, Pinheiros, Vila Mariana, Ipiranga, Saúde, Osasco, Barueri, Carapicuíba, Taboão da Serra, Embu das Artes, Santo André, São Bernardo do Campo, São Caetano do Sul, Mauá, Diadema, Arujá.',
 encode(digest('geo-cobertura-editorial-grande-sp-2026-v1','sha256'),'hex'),
 jsonb_build_object('coverage_mode','editorial_geo','candidate_presence_claim',false,'voter_profile',false,'political_preference_inference',false,'sources',jsonb_build_array('site oficial da candidatura','geografia pública')),
 true,now(),now()
)
on conflict (campaign_preset_id,slug) do update
set title=excluded.title,raw_text=excluded.raw_text,source_sha256=excluded.source_sha256,metadata=excluded.metadata,active=true,updated_at=now();

with src as (
 select id from public.electoral_content_sources where campaign_preset_id='madeira-1470-sp-2026' and slug='geo-cobertura-editorial-grande-sp-2026' limit 1
), geos(unit_key,title,topic,body,priority,tags) as (values
 ('geo-guarulhos','Guarulhos','Guarulhos','Cobertura editorial de Guarulhos: Centro, Pimentas, Cumbica, Bonsucesso, Macedo, Vila Augusta, Maia, Cocaia e Taboão.',100,array['Guarulhos','Grande SP']::text[]),
 ('geo-sao-paulo-zona-leste','São Paulo - Zona Leste','São Paulo','Cobertura editorial: Tatuapé, Penha, Itaquera, São Miguel Paulista, Itaim Paulista, Jardim Helena, Guaianases e Jardim Pantanal.',98,array['São Paulo','Zona Leste']::text[]),
 ('geo-sao-paulo-centro-expandido','São Paulo - Centro Expandido','São Paulo','Cobertura editorial: Sé, República, Bela Vista, Consolação, Santa Cecília, Liberdade, Cambuci, Aclimação, Brás, Mooca, Pari, Bom Retiro, Barra Funda, Perdizes, Pinheiros, Vila Mariana, Ipiranga e Saúde.',96,array['São Paulo','Centro Expandido']::text[]),
 ('geo-sao-paulo-demais-prioridades','São Paulo - demais regiões prioritárias','São Paulo','Cobertura editorial: Santo Amaro, Jabaquara, Santana, Lapa e Butantã.',92,array['São Paulo','Capital']::text[]),
 ('geo-alto-tiete','Alto Tietê','Grande São Paulo','Cobertura editorial: Itaquaquecetuba, Poá, Ferraz de Vasconcelos e Mogi das Cruzes.',92,array['Alto Tietê','Grande SP']::text[]),
 ('geo-oeste-grande-sp','Oeste da Grande São Paulo','Grande São Paulo','Cobertura editorial: Osasco, Barueri, Carapicuíba, Taboão da Serra e Embu das Artes.',88,array['Grande SP','Oeste']::text[]),
 ('geo-abcd','ABCD e entorno','Grande São Paulo','Cobertura editorial: Santo André, São Bernardo do Campo, São Caetano do Sul, Diadema e Mauá.',88,array['ABCD','Grande SP']::text[]),
 ('geo-aruja','Arujá','Grande São Paulo','Cobertura editorial temática para Arujá, sem inferência de preferência política individual.',82,array['Arujá','Grande SP']::text[])
)
insert into public.electoral_content_units
(source_id,campaign_preset_id,unit_key,unit_type,title,body,topic,tags,verification_status,usage_scope,risk_flags,priority,source_locator,metadata,active,created_at,updated_at)
select src.id,'madeira-1470-sp-2026',g.unit_key,'geo_coverage',g.title,g.body,g.topic,g.tags,'public_geography','geo_content_generation',array['no_individual_targeting']::text[],g.priority,
       jsonb_build_object('scope','city_neighborhood'),
       jsonb_build_object('candidate_presence_claim',false,'support_claim',false,'preference_inference',false),true,now(),now()
from src cross join geos g
on conflict (campaign_preset_id,unit_key) do update
set source_id=excluded.source_id,title=excluded.title,body=excluded.body,topic=excluded.topic,tags=excluded.tags,verification_status='public_geography',usage_scope='geo_content_generation',risk_flags=excluded.risk_flags,priority=excluded.priority,metadata=excluded.metadata,active=true,updated_at=now();

-- 8) Basic deterministic internal-link rules, always same-project and never using the bad Direitos News semantic post.
insert into public.keyword_link_rules
(user_id,project_id,keyword,match_type,case_sensitive,target_url,target_title,max_links_per_article,priority,is_active,times_applied,created_at,updated_at)
select p.user_id,p.id,r.keyword,'contains',false,r.url,r.title,1,r.priority,true,0,now(),now()
from public.projects p
cross join (values
 ('provas digitais','https://rdmadvogados.com.br/blog/provas-digitais-e-cadeia-de-custodia-requisitos-para-a-vali/','Provas Digitais e Cadeia de Custódia',100),
 ('crime organizado','https://rdmadvogados.com.br/blog/lei-15-358-2026-novo-marco-contra-o-crime-organizado/','Lei 15.358/2026 e crime organizado',95),
 ('furto','https://rdmadvogados.com.br/blog/lei-15-397-2026-o-que-mudou-no-crime-de-furto/','Lei 15.397/2026 e o crime de furto',90),
 ('progressão de regime','https://rdmadvogados.com.br/blog/progressao-de-regime-e-nova-tabela-da-lep-requisitos-fraco/','Progressão de Regime e LEP',90),
 ('fraudes','https://rdmadvogados.com.br/blog/estelionato-e-fraudes-virtuais-como-identificar-e-agir-dian/','Estelionato e Fraudes Virtuais',90)
) as r(keyword,url,title,priority)
where p.domain='rdmadvogados.com.br'
on conflict (project_id,keyword) do update
set target_url=excluded.target_url,target_title=excluded.target_title,priority=excluded.priority,is_active=true,updated_at=now();

insert into public.keyword_link_rules
(user_id,project_id,keyword,match_type,case_sensitive,target_url,target_title,max_links_per_article,priority,is_active,times_applied,created_at,updated_at)
select p.user_id,p.id,r.keyword,'contains',false,
       case p.domain when 'quemvotar.drmadeira1470.com.br' then 'https://quemvotar.drmadeira1470.com.br/blog/' else 'https://votardeputadofederal.drmadeira1470.com.br/blog/' end,
       r.title,1,r.priority,true,0,now(),now()
from public.projects p
cross join (values
 ('Dr. Madeira','Portal eleitoral Dr. Madeira',100),
 ('deputado federal','Conteúdo sobre deputado federal em São Paulo',95),
 ('propostas','Propostas e bandeiras da candidatura',90)
) as r(keyword,title,priority)
where p.domain in ('quemvotar.drmadeira1470.com.br','votardeputadofederal.drmadeira1470.com.br')
on conflict (project_id,keyword) do update
set target_url=excluded.target_url,target_title=excluded.target_title,priority=excluded.priority,is_active=true,updated_at=now();
