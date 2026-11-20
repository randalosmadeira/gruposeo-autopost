-- Rollback de 20261121100000_prompts_voz_humana: devolve o texto da versão 1 (cópia guardada em prompt_template_versions).
-- O gatilho de versionamento grava o retorno como nova versão (histórico preservado). Só mexe nos modelos que a migração tocou (version >= 2).
update public.prompt_templates pt
   set prompt = v.prompt
  from public.prompt_template_versions v
 where v.prompt_template_id = pt.id
   and v.version = 1
   and pt.version >= 2
   and pt.name in ('🎭 Redator SEO Sênior V4', '📚 Criador de Tutoriais V4', '⚖️ Agente Redator RDM V4', '🏗️ Construtor de Blogs & Clusters', '🔍 Auditor SEO & Indexação', '🏷️ Metadados & Schema Markup', 'legal_news_rdm_v1', 'visual_content_master_v1')
   and pt.prompt is distinct from v.prompt;
