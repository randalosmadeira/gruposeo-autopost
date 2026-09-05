-- Reconstitui o pool editorial RDM com masters tratados que já existem no
-- Storage. Nenhum artigo, histórico ou objeto anterior é excluído.
update public.module_image_assets
set source_type = 'storage',
    bucket_name = 'article-images',
    storage_path = case id
      when '98d611f4-72b7-41d0-aece-6d1ee4d259f5'::uuid then '130486c8-b526-4b61-9b0c-0b3e5aedeee9/legacy-preserved/5cd4e0b8f3843352f3696e06d83226d8a82ca8fef4003cc78ac615112d4929c0.png'
      when '211f4ac5-dea7-478a-a836-2d0ff7869ebf'::uuid then '130486c8-b526-4b61-9b0c-0b3e5aedeee9/legacy-preserved/00ef9ccaa392a586e486e92b3fda6d0c66bfa5e7901be21dc3104262aa3c9a3b.png'
      when '521b96ab-bfae-4e5a-b96a-161b5ea6874e'::uuid then '130486c8-b526-4b61-9b0c-0b3e5aedeee9/legacy-preserved/f3ef2acc32be960a0b3dcb6cbb164aaa4da67952b455f1ab687fe48d541da5ae.png'
    end,
    external_url = null,
    background_mode = 'preserve',
    background_prompt = null,
    is_active = true,
    updated_at = now()
where id in (
  '98d611f4-72b7-41d0-aece-6d1ee4d259f5'::uuid,
  '211f4ac5-dea7-478a-a836-2d0ff7869ebf'::uuid,
  '521b96ab-bfae-4e5a-b96a-161b5ea6874e'::uuid
);

do $$
begin
  if exists (
    select 1
    from public.module_image_assets a
    left join storage.objects o on o.bucket_id = a.bucket_name and o.name = a.storage_path
    where a.id in (
      '98d611f4-72b7-41d0-aece-6d1ee4d259f5'::uuid,
      '211f4ac5-dea7-478a-a836-2d0ff7869ebf'::uuid,
      '521b96ab-bfae-4e5a-b96a-161b5ea6874e'::uuid
    ) and o.id is null
  ) then
    raise exception 'rdm_image_pool_object_missing';
  end if;
end;
$$;
