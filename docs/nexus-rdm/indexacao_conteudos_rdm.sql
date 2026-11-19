-- Indexação dos conteúdos publicados (Blog RDM e Direitos News) em public.wordpress_article_index,
-- derivada da própria tabela `articles` (sem chamada paga, sem leitura ao vivo do WordPress).
-- Marcador do método: analysis_version = 1000 (derivado do banco, v1). Reversão: delete from public.wordpress_article_index where analysis_version=1000;
-- Área (topic_cluster) por regras de palavras no título/palavra-chave/slug: HEURÍSTICA, não revisão jurídica.
-- Reclassificar depois: update ... set topic_cluster = <mesma expressão> where analysis_version=1000;
-- Só insere o que falta (unique project_id + wp_post_id); nunca altera linhas existentes.
with src as (
 select distinct on (a.project_id, (a.config->>'wordpress_last_post_id')::bigint)
  a.user_id, a.project_id, (a.config->>'wordpress_last_post_id')::bigint as wp_id,
  coalesce(nullif(a.config->>'wordpress_last_post_url',''), a.published_url) as url,
  a.slug, a.title, a.keyword, a.secondary_keywords, a.excerpt, a.content, a.word_count, a.seo_score, a.published_at,
  lower(translate(coalesce(a.title,'')||' '||coalesce(a.keyword,'')||' '||coalesce(a.slug,''),'áàâãäéèêëíìîïóòôõöúùûüçñ','aaaaaeeeeiiiiooooouuuucn')) as txt
 from public.articles a
 where a.status='published' and (a.config->>'wordpress_last_post_id') ~ '^[0-9]+$' and coalesce(a.title,'')<>''
   and coalesce(nullif(a.config->>'wordpress_last_post_url',''), a.published_url) ~ '^https?://'
 order by a.project_id, (a.config->>'wordpress_last_post_id')::bigint, a.published_at desc nulls last
)
insert into public.wordpress_article_index
 (user_id, project_id, wp_post_id, wp_post_url, wp_post_slug, wp_post_title, wp_post_type, wp_post_status,
  primary_keyword, secondary_keywords, topic_cluster, semantic_summary, content_hash, word_count,
  internal_links_count, external_links_count, seo_score, last_wp_modified_at, last_analyzed_at, analysis_version, sync_status)
select s.user_id, s.project_id, s.wp_id, s.url, s.slug, left(s.title,500), 'post', 'publish',
 nullif(s.keyword,''), s.secondary_keywords,
 case
  when s.txt ~ '(cnh|habilitacao|detran|transito|bafometro|lei seca|dirigir|caminhoneiro|motorista|veiculo|multa de|pontos na)' then 'cnh-transito'
  when s.txt ~ '(inss|aposentadoria|bpc|loas|salario-maternidade|salario maternidade|incapacidade|auxilio|pensao por morte|revisao de beneficio)' then 'previdenciario'
  when s.txt ~ '(clinica|paciente|prontuario|estetic|protese|peeling|queimadura|ortodont|plano de saude|erro medico|sanitaria|profissionais da saude|odontolog|medic)' then 'saude'
  when s.txt ~ '(trabalh|demissao|rescis|fgts|horas extras|justa causa|clt|empregad|vinculo|ferias|aviso previo|assedio moral|salario|ocupacional|pejot|como pj|contratacao fraudulenta|telecomunicac)' then 'trabalhista'
  when s.txt ~ '(preso|prisao|flagrante|habeas|crime|criminal|penal|furto|roubo|trafico|inquerito|delegacia|homicidio|estelionato|custodia|medida protetiva|medidas protetivas|maria da penha|juri|fianca|contrabando|descaminho|policia|reu|acusac|investigad|violencia domestica|lesao corporal|ameaca|injuria|difamacao|calunia|absolvicao|arquivamento|pronuncia|arma|corrupcao|busca e apreensao|depoimento|boletim de ocorrencia|vitima|organizacao criminosa)' then 'criminal'
  when s.txt ~ '(imobiliari|aluguel|locacao|usucapiao|condominio|imovel|despejo|escritura|financiamento)' then 'imobiliario'
  when s.txt ~ '(tribut|imposto|execucao fiscal|fisco|icms|iptu|receita federal|itcmd|divida ativa|certidao negativa)' then 'tributario'
  when s.txt ~ '(instagram|facebook|youtube|perfil|conta bloqueada|conta do|marketplace|plataforma digital|termos de uso|software|licenciamento|vazamento|lgpd|dados pessoais|provedor|internet|conexao|aplicativo|provas digitais|golpe|pix|fraude)' then 'digital'
  when s.txt ~ '(consumidor|negativ|score|serasa|spc|banco|cartao|emprestimo|consignado|voo|operadora|reembolso|garantia|produto|cobranca|dano moral|indenizacao|seguro|telecom)' then 'consumidor'
  when s.txt ~ '(empres|societ|socio|holding|contrato|recuperacao judicial|falencia|cnpj|marca|inpi|franquia|compliance|startup|mei )' then 'empresarial'
  when s.txt ~ '(divorcio|guarda|alimenticia|heranca|inventario|testamento|uniao estavel|responsabilidade civil|pericia|devolucao de objetos)' then 'civil-familia'
  else 'nao-classificado' end,
 left(nullif(s.excerpt,''),600), md5(coalesce(s.content,'')), s.word_count,
 (select count(*)::int from regexp_matches(coalesce(s.content,''),'href="https?://[^"/]*'||regexp_replace(substring(s.url from '^https?://([^/]+)'),'([.\-])','\\\1','g')||'[/"]','g')),
 (select count(*)::int from regexp_matches(coalesce(s.content,''),'href="https?://[^"]+"','g')) -
 (select count(*)::int from regexp_matches(coalesce(s.content,''),'href="https?://[^"/]*'||regexp_replace(substring(s.url from '^https?://([^/]+)'),'([.\-])','\\\1','g')||'[/"]','g')),
 s.seo_score, s.published_at, now(), 1000, 'synced'
from src s
on conflict (project_id, wp_post_id) do nothing;
