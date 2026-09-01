create table if not exists public.electoral_portal_resources (
  id uuid primary key default gen_random_uuid(),
  campaign_preset_id text not null default 'madeira-1470-sp-2026',
  label text not null,
  url text not null,
  category text not null default 'reference',
  tags text[] not null default '{}'::text[],
  editorial_hook text not null default 'Aproveite também e conheça',
  priority integer not null default 50 check (priority between 0 and 100),
  active boolean not null default true,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_preset_id, url)
);

create table if not exists public.electoral_portal_settings (
  campaign_preset_id text primary key,
  primary_portals text[] not null default '{}'::text[],
  min_links_per_post integer not null default 2 check (min_links_per_post between 0 and 12),
  max_links_per_post integer not null default 5 check (max_links_per_post between 0 and 12),
  contextual_linking_enabled boolean not null default true,
  aggregate_analytics_enabled boolean not null default true,
  analytics_disable_after timestamptz null,
  geo_reporting_level text not null default 'city' check (geo_reporting_level in ('state','city')),
  allow_individual_voter_profiles boolean not null default false,
  allow_political_preference_inference boolean not null default false,
  ga4_measurement_id text null,
  gtm_web_container_id text null,
  gtm_server_container_url text null,
  updated_at timestamptz not null default now()
);

alter table public.electoral_portal_resources enable row level security;
alter table public.electoral_portal_settings enable row level security;

create policy "electoral resources authenticated read"
on public.electoral_portal_resources for select
to authenticated
using (true);

create policy "electoral resources ceo manage"
on public.electoral_portal_resources for all
to authenticated
using (public.is_ceo())
with check (public.is_ceo());

create policy "electoral settings authenticated read"
on public.electoral_portal_settings for select
to authenticated
using (true);

create policy "electoral settings ceo manage"
on public.electoral_portal_settings for all
to authenticated
using (public.is_ceo())
with check (public.is_ceo());

insert into public.electoral_portal_settings (
  campaign_preset_id,
  primary_portals,
  min_links_per_post,
  max_links_per_post,
  contextual_linking_enabled,
  aggregate_analytics_enabled,
  analytics_disable_after,
  geo_reporting_level,
  allow_individual_voter_profiles,
  allow_political_preference_inference
) values (
  'madeira-1470-sp-2026',
  array[
    'https://quemvotar.drmadeira1470.com.br/blog/',
    'https://votardeputadofederal.drmadeira1470.com.br/blog/'
  ],
  2,
  5,
  true,
  true,
  '2026-10-05T00:00:00-03:00',
  'city',
  false,
  false
)
on conflict (campaign_preset_id) do update set
  primary_portals = excluded.primary_portals,
  analytics_disable_after = excluded.analytics_disable_after,
  updated_at = now();

insert into public.electoral_portal_resources (campaign_preset_id,label,url,category,tags,editorial_hook,priority)
values
('madeira-1470-sp-2026','Portal Quem Votar','https://quemvotar.drmadeira1470.com.br/blog/','electoral-portal',array['eleicoes-2026','informacao-eleitoral','sao-paulo'],'Veja também este conteúdo do portal eleitoral',100),
('madeira-1470-sp-2026','Portal Votar Deputado Federal','https://votardeputadofederal.drmadeira1470.com.br/blog/','electoral-portal',array['eleicoes-2026','deputado-federal','sao-paulo'],'Conheça também esta área do portal eleitoral',100),
('madeira-1470-sp-2026','RDM Advogados','https://rdmadvogados.com.br/','institutional',array['institucional','direito'],'Você conhece?',70),
('madeira-1470-sp-2026','RDM Defesa do Consumidor','https://rdmadvogados.com.br/advocacia-em-defesa-do-consumidor','legal-reference',array['consumidor','direitos'],'Aproveite também e conheça',60),
('madeira-1470-sp-2026','RDM Advogado Criminalista','https://rdmadvogados.com.br/advogado-criminalista/','legal-reference',array['criminal','seguranca','direitos'],'Aproveite também e conheça',60),
('madeira-1470-sp-2026','RDM Assessoria Empresarial Jurídica','https://rdmadvogados.com.br/assessoria-empresarial-juridica','legal-reference',array['empresas','empreendedorismo','economia'],'Você já ouviu falar?',60),
('madeira-1470-sp-2026','RDM Assessoria Provedores Fibra Óptica','https://rdmadvogados.com.br/assessoria-provedores-fibra-optica','legal-reference',array['telecom','fibra-optica','empresas'],'Aproveite também e conheça',55),
('madeira-1470-sp-2026','RDM Advogado Trabalhista','https://rdmadvogados.com.br/advogado-trabalhista','legal-reference',array['trabalho','emprego','direitos'],'Você conhece?',60),
('madeira-1470-sp-2026','RDM Links','https://rdmadvogados.com.br/links','institutional',array['links','rdm'],'Veja também',55),
('madeira-1470-sp-2026','Revisão de Contratos Bancários','https://revisionaljuroslei.rdmadvogados.com.br/','legal-reference',array['bancos','credito','contratos','juros'],'Aproveite também e conheça',60),
('madeira-1470-sp-2026','Meu Direito INSS','https://meudireitoinss.rdmadvogados.com.br/','legal-reference',array['inss','previdencia','direitos'],'Você conhece?',60),
('madeira-1470-sp-2026','Elas Tracy','https://elastracy.com.br/','community',array['comunidade','mulheres'],'Você já ouviu falar?',50),
('madeira-1470-sp-2026','Elas Tracy Cursos','https://elastracy.com.br/cursos','education',array['cursos','educacao'],'Aproveite também e conheça',50),
('madeira-1470-sp-2026','Elas Tracy Serviços','https://elastracy.com.br/#servicos','community',array['servicos','comunidade'],'Veja também',45),
('madeira-1470-sp-2026','Grupo SEO MKT','https://gruposeomkt.com.br/','institutional',array['marketing','tecnologia','comunicacao'],'Você conhece?',50),
('madeira-1470-sp-2026','Estúdio do Futuro','https://www.instagram.com/estudiodofuturooficial/','social',array['instagram','midia','cultura'],'Você já segue?',45),
('madeira-1470-sp-2026','Cutucast Instagram','https://www.instagram.com/cutucast/','social',array['instagram','podcast','entrevista'],'Você já segue?',50),
('madeira-1470-sp-2026','Grupo SEO MKT Instagram','https://www.instagram.com/gruposeomkt_/','social',array['instagram','marketing'],'Você já segue?',40),
('madeira-1470-sp-2026','M Boi Online','https://www.instagram.com/mboionline/','local-media',array['instagram','m-boi-mirim','zona-sul','sao-paulo'],'Você conhece?',55),
('madeira-1470-sp-2026','M Boi Mirim News','https://www.instagram.com/mboimirimnews/','local-media',array['instagram','m-boi-mirim','zona-sul','sao-paulo'],'Você já segue?',55),
('madeira-1470-sp-2026','Podcast Spotify 6Q1opOJ9BEcNRwpPCNmojQ','https://open.spotify.com/show/6Q1opOJ9BEcNRwpPCNmojQ','podcast',array['spotify','podcast'],'Já ouviu falar?',45),
('madeira-1470-sp-2026','Canal YouTube UCgZHftk-RFNCxe8CtdIOkxw','https://www.youtube.com/channel/UCgZHftk-RFNCxe8CtdIOkxw','video',array['youtube','video'],'Você já acompanha?',45),
('madeira-1470-sp-2026','Canal YouTube UCd2L8ws3vtbH-x-jIvbE7dA','https://www.youtube.com/channel/UCd2L8ws3vtbH-x-jIvbE7dA','video',array['youtube','video'],'Você já acompanha?',45),
('madeira-1470-sp-2026','MC Latyffa','https://www.youtube.com/@MCLatyffa','video',array['youtube','cultura','musica'],'Você conhece?',45),
('madeira-1470-sp-2026','Cutucast','https://cutucast.com.br/','media',array['podcast','entrevista','cultura'],'Aproveite também e conheça',55),
('madeira-1470-sp-2026','Pod Agora Podcast','https://www.youtube.com/@Podagorapodcast','video',array['youtube','podcast'],'Você já acompanha?',45),
('madeira-1470-sp-2026','Olhar Cínico TV','https://www.youtube.com/@OlharCinicoTV','video',array['youtube','midia'],'Você já acompanha?',45),
('madeira-1470-sp-2026','RedCast Oficial','https://www.youtube.com/@RedCastOficial','video',array['youtube','podcast'],'Você já acompanha?',50),
('madeira-1470-sp-2026','RedCast Spotify','https://open.spotify.com/show/2qGNLUOtkA55qknCHicdoT','podcast',array['spotify','podcast'],'Já ouviu falar?',45),
('madeira-1470-sp-2026','RedCast Instagram','https://www.instagram.com/redcastoficial/','social',array['instagram','podcast'],'Você já segue?',45),
('madeira-1470-sp-2026','Helipa Festival','https://www.instagram.com/helipafestival_/','community',array['instagram','helipa','heliopolis','cultura'],'Você conhece?',55),
('madeira-1470-sp-2026','De Quebrada','https://www.dequebrada.com/','local-media',array['quebrada','cultura','comunidade'],'Aproveite também e conheça',55),
('madeira-1470-sp-2026','Helipa Festival Reserva','https://www.instagram.com/helipafestivalreserva/','community',array['instagram','helipa','heliopolis','cultura'],'Você já segue?',45),
('madeira-1470-sp-2026','Baile do Helipa','https://www.instagram.com/bailedohelipa.ofc/','community',array['instagram','helipa','heliopolis','cultura'],'Você já segue?',45),
('madeira-1470-sp-2026','Pancadão do Helipa','https://www.instagram.com/pancadaodohelipa/','community',array['instagram','helipa','heliopolis','cultura'],'Você já segue?',45),
('madeira-1470-sp-2026','Helipa Mil Graus','https://www.instagram.com/helipamilgrauu_ofc/','community',array['instagram','helipa','heliopolis','cultura'],'Você já segue?',45)
on conflict (campaign_preset_id,url) do nothing;
