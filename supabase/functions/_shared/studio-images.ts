/**
 * Imagens do Estúdio de Páginas: minimalistas e realistas, pela política do projeto (module_image_policies, module_key 'estudio_paginas').
 *
 * Regras (as mesmas para acervo e geração):
 *  - SELECIONAR do acervo do projeto (module_image_assets) é o padrão; GERAR (gpt-image-2) só se a política permitir (`allow_ai_generation`, desligado por padrão),
 *    só dentro do teto diário (a porta de imagem passa pelo gate de gasto) e nunca nos testes (porta injetada, resposta gravada);
 *  - sem rosto de pessoa real inventado, sem lugar ou endereço falso, sem logotipo, texto ou marca d'água na imagem; composição simples, luz natural, assunto central e margens limpas;
 *  - alt descritivo no IDIOMA da página (descreve o que a imagem MOSTRA; nunca "imagem de"), nome de arquivo semântico, largura e altura, WebP ou AVIF, carregamento tardio abaixo da dobra, crédito;
 *  - imagem social (og:image) 1200x630 coerente com a principal.
 * Sem imagem disponível: o slot vira PENDÊNCIA (origin 'pendente'), nunca imagem inventada.
 */
import { DEFAULT_PRICE_BOOK, type PriceBook } from './spend-gate-core.ts';
import { slugifySegment } from './studio-url.ts';
import type { PageImage, Pending } from './studio-types.ts';

export const MODULE_KEY = 'estudio_paginas';
export interface ImagePolicy { allow_ai_generation: boolean; auto_select: boolean; hero_width: number; hero_height: number; body_width: number; preferred_format: 'webp' | 'avif'; max_hero_kb: number; max_body_kb: number }
export const DEFAULT_IMAGE_POLICY: ImagePolicy = { allow_ai_generation: false, auto_select: true, hero_width: 1200, hero_height: 675, body_width: 800, preferred_format: 'webp', max_hero_kb: 200, max_body_kb: 100 };
export const OG_SIZE = { width: 1200, height: 630 };

export function resolvePolicy(rows: Array<Record<string, unknown> | null | undefined>): ImagePolicy {
  const p: ImagePolicy = { ...DEFAULT_IMAGE_POLICY };
  for (const r of rows) {
    if (!r) continue;
    if (typeof r.allow_ai_generation === 'boolean') p.allow_ai_generation = r.allow_ai_generation;
    if (typeof r.auto_select === 'boolean') p.auto_select = r.auto_select;
    for (const k of ['hero_width', 'hero_height', 'body_width', 'max_hero_kb', 'max_body_kb'] as const) if (Number.isFinite(Number(r[k])) && Number(r[k]) > 0) p[k] = Number(r[k]);
    if (r.preferred_format === 'webp' || r.preferred_format === 'avif') p.preferred_format = r.preferred_format;
  }
  return p;
}

/** Linha de module_image_assets. */
export interface AssetRow { id: string; label: string; source_type: 'storage' | 'external_url'; external_url?: string | null; public_url?: string | null; alt_text: string; semantic_filename: string; caption?: string | null; semantic_tags: string[]; is_active: boolean; usage_count?: number | null; width?: number | null; height?: number | null; bytes?: number | null }

const fold = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const toks = (s: string) => new Set(fold(s).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2));

export interface Selection { asset: AssetRow; score: number; matched: boolean }
/** Escolhe a imagem do acervo cuja etiqueta/rótulo mais combina com o assunto e o lugar; empate: a menos usada. `matched: false` = sem relação de tema (pessoa confere). */
export function selectFromAcervo(assets: AssetRow[], topic: { subject: string; place?: string | null; keywords?: string[] }, exclude: string[] = []): Selection | null {
  const want = toks([topic.subject, topic.place || '', ...(topic.keywords || [])].join(' '));
  const list = assets.filter((a) => a.is_active && !exclude.includes(a.id) && (a.external_url || a.public_url));
  if (!list.length) return null;
  const scored = list.map((a) => { const have = toks([...a.semantic_tags, a.label, a.alt_text].join(' ')); let s = 0; for (const w of want) if (have.has(w)) s++; return { asset: a, score: s, matched: s > 0 }; });
  scored.sort((x, y) => y.score - x.score || (x.asset.usage_count || 0) - (y.asset.usage_count || 0));
  return scored[0];
}

export const IMAGE_RULES_EN = [
  'Realistic, minimalist photograph-style image with a simple composition and natural light.',
  'One central subject; keep 15% to 20% clean margin on every side (the image is cropped to 1:1 and smaller formats).',
  'NO identifiable real person and NO invented faces: if people are needed, show hands, silhouettes from behind or objects only.',
  'NO text, letters, numbers, logos, seals or watermarks inside the picture.',
  'NO real address, storefront sign, landmark or place claim: keep the setting generic (a desk, a window, a document, a street seen from afar).',
  'No collage, frame, border or split screen.',
].join(' ');

/** Prompt de imagem (em inglês, que é o idioma que o modelo segue melhor) com a cena já descrita; a cena e o alt vêm no idioma da página. */
export function buildImagePrompt(scene: { sceneEn: string }, aspect: { width: number; height: number }): string {
  return `${scene.sceneEn.trim()}. ${IMAGE_RULES_EN} Landscape ${aspect.width}x${aspect.height}.`;
}

/** Nome de arquivo semântico. */
export function semanticFilename(subject: string, place: string | null, slot: PageImage['slot'], format: string, lang = 'pt'): string {
  const base = slugifySegment([subject, place || ''].filter(Boolean).join(' '), lang) || 'imagem';
  return `${base}${slot === 'hero' ? '' : `-${slot}`}.${format}`;
}

const GENERIC_ALT = /^(?:imagem|foto|fotografia|image|photo|picture|imagen|bild|afbeelding|immagine)\b(?: de| of| d[eo]s?| von)?\b/i;
export interface AltCheck { ok: boolean; problems: string[] }
export function checkAlt(alt: string, filename = ''): AltCheck {
  const problems: string[] = []; const a = alt.trim();
  if (!a) problems.push('alt vazio');
  if (a.length > 125) problems.push('alt com mais de 125 caracteres');
  if (GENERIC_ALT.test(a)) problems.push('alt genérico ("imagem de..."): descreva o que a imagem mostra');
  if (filename && fold(a) === fold(filename.replace(/\.\w+$/, '').replace(/-/g, ' '))) problems.push('alt igual ao nome do arquivo');
  if (a && a.split(/\s+/).length < 3) problems.push('alt curto demais para descrever');
  return { ok: problems.length === 0, problems };
}

export interface ImagePlanSlot { slot: PageImage['slot']; width: number; height: number; format: ImagePolicy['preferred_format']; maxKb: number; lazy: boolean }
export function planSlots(policy: ImagePolicy, inline = 0): ImagePlanSlot[] {
  const slots: ImagePlanSlot[] = [
    { slot: 'hero', width: policy.hero_width, height: policy.hero_height, format: policy.preferred_format, maxKb: policy.max_hero_kb, lazy: false },
    { slot: 'og', width: OG_SIZE.width, height: OG_SIZE.height, format: policy.preferred_format, maxKb: policy.max_hero_kb, lazy: false },
  ];
  for (let i = 0; i < inline; i++) slots.push({ slot: 'inline', width: policy.body_width, height: Math.round(policy.body_width * 0.5625), format: policy.preferred_format, maxKb: policy.max_body_kb, lazy: true });
  return slots;
}

/** Custo estimado (micros de dólar) das imagens que seriam GERADAS. Preço padrão do projeto, não verificado. */
export function estimateImageMicros(slotsToGenerate: number, book: PriceBook = DEFAULT_PRICE_BOOK): number {
  return slotsToGenerate * (book.units['openai:images']?.micros ?? 250_000);
}

export interface ImagePort { generate(req: { slot: PageImage['slot']; prompt: string; width: number; height: number; format: ImagePolicy['preferred_format'] }): Promise<{ url: string; width: number; height: number; bytes: number; costMicros: number }> }
export interface SceneProposal { sceneEn: string; alt: string }

export interface ImageResult { images: PageImage[]; pendings: Pending[]; generated: number; selected: number; costMicros: number; stopped: null | { reason: 'teto' | 'erro'; message: string }; notes: string[] }

/**
 * Monta as imagens da página: acervo primeiro; geração só se a política permite E há porta E há cena com alt válido (vinda de passo de IA pequeno ou da pessoa).
 * O slot que não conseguir fica 'pendente' com o motivo.
 */
export async function buildImages(input: {
  policy: ImagePolicy; assets: AssetRow[]; topic: { subject: string; place?: string | null; keywords?: string[] }; language: string; origin: string; inline?: number;
  scene: SceneProposal | null; port: ImagePort | null; credit?: string | null;
}): Promise<ImageResult> {
  const out: PageImage[] = []; const pendings: Pending[] = []; const notes: string[] = [];
  let generated = 0; let selected = 0; let cost = 0; let stopped: ImageResult['stopped'] = null;
  const used: string[] = [];
  const lang = input.language.slice(0, 2).toLowerCase();
  const slots = planSlots(input.policy, input.inline || 0);
  let heroAlt: string | null = null; let heroUrl: string | null = null;
  for (const s of slots) {
    const filenameFor = (fmt: string) => semanticFilename(input.topic.subject, input.topic.place ?? null, s.slot, fmt, lang);
    // og reaproveita a imagem principal (mesma cena) quando ela existe
    if (s.slot === 'og' && heroUrl) { out.push({ slot: 'og', url: heroUrl, alt: heroAlt || '', width: OG_SIZE.width, height: OG_SIZE.height, format: s.format, filename: filenameFor(s.format), origin: out[0]?.origin || 'acervo', credit: input.credit ?? null, bytes: out[0]?.bytes ?? null }); notes.push('A imagem social usa a mesma cena da imagem principal (recorte 1200x630 feito pelo site/tema).'); continue; }
    const pick = input.policy.auto_select ? selectFromAcervo(input.assets, input.topic, used) : null;
    if (pick) {
      const a = pick.asset; const alt = checkAlt(a.alt_text, a.semantic_filename);
      const fmt = (a.semantic_filename.split('.').pop() || s.format).toLowerCase() as PageImage['format'];
      if (!alt.ok) { pendings.push({ id: `imagem:${s.slot}:alt`, kind: 'imagem', label: `Texto alternativo da imagem "${a.label}"`, reason: `O acervo tem a imagem, mas o alt não serve (${alt.problems.join('; ')}). Corrija no acervo.` }); }
      used.push(a.id); selected++;
      const url = a.public_url || a.external_url || '';
      out.push({ slot: s.slot, url, alt: a.alt_text, width: a.width || s.width, height: a.height || s.height, format: ['webp', 'avif', 'jpeg', 'png'].includes(fmt) ? fmt : 'jpeg', filename: a.semantic_filename, credit: a.caption || input.credit || null, origin: 'acervo', lazy: s.lazy, bytes: a.bytes ?? null });
      if (!pick.matched) notes.push(`A imagem "${a.label}" do acervo não tem relação de tema com a página: confira antes de aprovar.`);
      if (s.slot === 'hero') { heroAlt = a.alt_text; heroUrl = url; }
      continue;
    }
    if (input.policy.allow_ai_generation && input.port && input.scene && !stopped) {
      const alt = checkAlt(input.scene.alt);
      if (!alt.ok) { out.push({ slot: s.slot, url: '', alt: '', width: s.width, height: s.height, format: s.format, filename: filenameFor(s.format), origin: 'pendente' }); pendings.push({ id: `imagem:${s.slot}`, kind: 'imagem', label: `Imagem ${s.slot}`, reason: `A cena proposta tem alt inválido (${alt.problems.join('; ')}).` }); continue; }
      try {
        const r = await input.port.generate({ slot: s.slot, prompt: buildImagePrompt(input.scene, s), width: s.width, height: s.height, format: s.format });
        generated++; cost += r.costMicros;
        out.push({ slot: s.slot, url: r.url, alt: input.scene.alt, width: r.width, height: r.height, format: s.format, filename: filenameFor(s.format), origin: 'gerada', lazy: s.lazy, bytes: r.bytes, credit: input.credit ?? null });
        if (s.slot === 'hero') { heroAlt = input.scene.alt; heroUrl = r.url; }
        continue;
      } catch (e) {
        const x = e as { name?: string; message?: string };
        stopped = x?.name === 'SpendDeniedError' ? { reason: 'teto', message: x.message || 'Teto diário de gasto atingido.' } : { reason: 'erro', message: 'A geração de imagem falhou.' };
      }
    }
    out.push({ slot: s.slot, url: '', alt: '', width: s.width, height: s.height, format: s.format, filename: filenameFor(s.format), origin: 'pendente' });
    pendings.push({ id: `imagem:${s.slot}`, kind: stopped?.reason === 'teto' ? 'teto' : 'imagem', label: `Imagem ${s.slot === 'hero' ? 'principal' : s.slot === 'og' ? 'social (1200x630)' : 'do texto'}`,
      reason: stopped ? stopped.message : !input.policy.allow_ai_generation ? 'Não há imagem do acervo para este assunto e a política do projeto não permite gerar. Envie uma imagem ao acervo (módulo "estudio_paginas") ou permita a geração.' : !input.port ? 'Geração de imagem indisponível neste ambiente.' : 'Falta a descrição da cena (e o alt) para gerar.' });
  }
  return { images: out, pendings, generated, selected, costMicros: cost, stopped, notes };
}
