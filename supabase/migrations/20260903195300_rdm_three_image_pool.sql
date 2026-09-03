-- RDM Advogados: pool visual exclusivo de 3 imagens.
-- Migration não destrutiva. O conteúdo binário dos assets é provisionado no Storage pelo deploy.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'module_image_policies_required_asset_count_check'
      AND conrelid = 'public.module_image_policies'::regclass
  ) THEN
    ALTER TABLE public.module_image_policies
      DROP CONSTRAINT module_image_policies_required_asset_count_check;
  END IF;
END $$;

ALTER TABLE public.module_image_policies
  ADD CONSTRAINT module_image_policies_required_asset_count_check
  CHECK (required_asset_count BETWEEN 1 AND 6);

WITH cfg(module_key) AS (
  VALUES ('article'::text), ('news'::text), ('repost'::text)
)
INSERT INTO public.module_image_policies (
  user_id, module_key, project_id, required_asset_count,
  allow_ai_generation, auto_select, hero_width, hero_height, body_width,
  preferred_format, max_hero_kb, max_body_kb, allow_background_editing, updated_at
)
SELECT
  '130486c8-b526-4b61-9b0c-0b3e5aedeee9'::uuid,
  cfg.module_key,
  'fab1032d-56a4-4e59-b3d4-4a68d3d4bf0a'::uuid,
  3, false, true, 1200, 630, 800, 'webp', 200, 100, false, now()
FROM cfg
ON CONFLICT (user_id, module_key, project_id) WHERE project_id IS NOT NULL
DO UPDATE SET
  required_asset_count = 3,
  allow_ai_generation = false,
  auto_select = true,
  hero_width = 1200,
  hero_height = 630,
  body_width = 800,
  preferred_format = 'webp',
  max_hero_kb = 200,
  max_body_kb = 100,
  allow_background_editing = false,
  updated_at = now();

WITH modules(module_key) AS (
  VALUES ('article'::text), ('news'::text), ('repost'::text)
), assets(slot,label,path,alt_text,semantic_filename,caption,semantic_tags) AS (
  VALUES
  (1::smallint,'RDM Editorial 01','rdm-advogados/editorial/rdm-editorial-01.webp','Advogado da RDM Advogados em ambiente jurídico institucional, vestindo terno preto e segurando taco de beisebol.','rdm-advogados-editorial-juridico-institucional.webp','Imagem editorial institucional da RDM Advogados.',ARRAY['rdm advogados','advocacia','direito','escritório jurídico','criminal','consumidor']::text[]),
  (2::smallint,'RDM Editorial 02','rdm-advogados/editorial/rdm-editorial-02.webp','Advogado da RDM Advogados em composição editorial séria, com terno preto e taco de beisebol em ambiente jurídico.','rdm-advogados-editorial-analise-juridica.webp','Imagem editorial para análises e conteúdos jurídicos da RDM Advogados.',ARRAY['rdm advogados','análise jurídica','advocacia criminal','direito','jurídico','artigo']::text[]),
  (3::smallint,'RDM Editorial 03','rdm-advogados/editorial/rdm-editorial-03.webp','Advogado da RDM Advogados em escritório executivo, de terno preto, segurando taco de beisebol em composição institucional.','rdm-advogados-editorial-escritorio-executivo.webp','Imagem editorial institucional para conteúdos da RDM Advogados.',ARRAY['rdm advogados','direito empresarial','consumidor','trabalhista','família','advocacia']::text[])
)
INSERT INTO public.module_image_assets (
  user_id,module_key,project_id,slot,label,source_type,bucket_name,storage_path,external_url,
  alt_text,semantic_filename,caption,semantic_tags,is_active,usage_count,last_used_at,
  background_mode,background_prompt,updated_at
)
SELECT
  '130486c8-b526-4b61-9b0c-0b3e5aedeee9'::uuid,
  m.module_key,
  'fab1032d-56a4-4e59-b3d4-4a68d3d4bf0a'::uuid,
  a.slot,a.label,'storage','rdm-brand-assets',a.path,NULL,
  a.alt_text,a.semantic_filename,a.caption,a.semantic_tags,true,0,NULL,'preserve',NULL,now()
FROM modules m CROSS JOIN assets a
ON CONFLICT (user_id,module_key,project_id,slot) WHERE project_id IS NOT NULL
DO UPDATE SET
  label=excluded.label,
  source_type='storage',
  bucket_name='rdm-brand-assets',
  storage_path=excluded.storage_path,
  external_url=NULL,
  alt_text=excluded.alt_text,
  semantic_filename=excluded.semantic_filename,
  caption=excluded.caption,
  semantic_tags=excluded.semantic_tags,
  is_active=true,
  background_mode='preserve',
  background_prompt=NULL,
  updated_at=now();
