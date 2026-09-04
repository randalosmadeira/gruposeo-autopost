-- Repostagens podem gerar composição editorial própria quando não há ativo fixo autorizado.
-- A publicação continua condicionada à presença de imagem e às demais barreiras editoriais.
update public.module_image_policies
set allow_ai_generation = true,
    updated_at = now()
where module_key = 'news'
  and allow_ai_generation is distinct from true;
