# Política de imagens Zica.ai (2026-09)

Regra única para toda imagem gerada, selecionada do banco visual ou publicada.
Implementação: `supabase/functions/_shared/image-policy.ts` (runtime), `module_image_policies` (banco),
`BrandAssetsCard.tsx` (banco visual), plugin WordPress Zica Posts 3.13.0.

| Critério | Valor aplicado | Onde |
|---|---|---|
| Largura mínima | 1200 px (hero 1200×675) | `deriveHeroImage`, canvas do banco visual |
| Resolução total | ≥ 300.000 px (1200×675 = 810.000) | `HERO_MIN_PIXELS` |
| Proporção | 16:9 (1200×675) padrão; 4:3 (1200×900) quando solicitado | `heroDimensionsFor` |
| Formato | WebP principal + cópia JPEG | Storage render (`format=webp`) + ImageScript (JPEG) |
| Peso | ≤ 150 KB (qualidade reduzida em degraus até caber) | `HERO_MAX_BYTES`, `max_hero_kb` |
| Zona de segurança | 15–20% de margem só com fundo; assunto centralizado | `IMAGE_PROMPT_RULES` em todo prompt de geração/edição |
| Texto na imagem | Proibido (inclui marca d'água). Mensagem vai para alt text e legenda | prompts + `text_in_image:false` no metadado |
| Alt text | Obrigatório, enviado ao WordPress em `_wp_attachment_image_alt` | `uploadPluginImage` → plugin `media()` |
| `max-image-preview:large` | Forçado pelo plugin via filtro `wp_robots` (independe do tema/SEO plugin) | Zica Posts 3.13.0 |
| Responsivo (`srcset`) | Gerado pelo WordPress a partir da imagem destacada na biblioteca de mídia | núcleo do WordPress |

## Fluxo em runtime

1. `generate-image` obtém a imagem (banco visual aprovado, edição de fundo ou geração sintética).
2. O master é gravado em `article-images` (público).
3. `deriveHeroImage` pede ao Storage a versão `1200×675`, `resize=cover`, WebP, baixando a qualidade
   até ficar ≤ 150 KB, e grava `<hash>-1200x675.webp`.
4. `deriveJpegCopy` grava `<hash>-1200x675.jpg` quando o master é PNG/JPEG.
5. `articles.featured_image_url` recebe o WebP; `config.image_geo` guarda master, cópia JPEG,
   dimensões, peso, qualidade e `compliance`.
6. Na publicação, o WordPress recebe o WebP com alt text e legenda; o plugin garante o robots meta.

## Verificação ao vivo (2026-09-07)

- Transformação de imagem do Storage ativa: foto do banco visual (63,9 KB original) → WebP 1200×675 de 51,3 KB.
- Blogs Direitos News, Quem Votar e Votar Deputado Federal já emitem `max-image-preview:large` e `srcset`;
  o Blog RDM (Rank Math) emite nas páginas de post. O filtro do plugin cobre qualquer tema ou plugin de SEO.
