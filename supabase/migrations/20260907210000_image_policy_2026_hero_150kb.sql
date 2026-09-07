-- Image policy 2026-09: hero 1200x675 (16:9), WebP, <= 150 KB, safe zone,
-- no text inside pixels. Aligns every stored module policy with the shared
-- runtime constants in supabase/functions/_shared/image-policy.ts.
-- Applied to Autopublic-prod on 2026-09-07.

update public.module_image_policies
   set hero_width = 1200,
       hero_height = 675,
       preferred_format = 'webp',
       max_hero_kb = 150,
       updated_at = now()
 where hero_width is distinct from 1200
    or hero_height is distinct from 675
    or preferred_format is distinct from 'webp'
    or max_hero_kb is distinct from 150;

alter table public.module_image_policies
  alter column hero_width set default 1200,
  alter column hero_height set default 675,
  alter column preferred_format set default 'webp',
  alter column max_hero_kb set default 150;

comment on table public.module_image_policies is
  'Per-module image policy. Hero defaults follow the 2026-09 image policy: 1200x675 (16:9) or 1200x900 (4:3), WebP <= 150 KB, 15-20% safe margins, no text in the image.';
