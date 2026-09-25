import sharp from 'sharp';
import { BRAND_COLORS, LOGO_1470_BOX, LOGO_COMPACT_BOX, LOGO_FULL_BOX, LOGO_GROUPS, TEXT_PATHS, type BrandPath } from './brand-1470.js';

/**
 * Renderização determinística dos 3 formatos do apoiador a partir de UM master
 * gerado pela IA (composição fotográfica sem texto). Toda a tipografia, o número
 * de chapa e a identidade visual entram como vetor (SVG) via sharp/librsvg, o que
 * garante texto nítido, consistente e sem "tipografia alucinada" pelo modelo.
 *
 * Formatos (únicos entregues desde 2026-09-25):
 *  - whatsapp  1080x1080  foto de perfil (WhatsApp/Instagram), composta para a máscara circular
 *  - instagram 1080x1350  feed 4:5
 *  - story     1080x1920  Stories / Reels / Status 9:16
 *
 * Nenhum selo "gerada por IA" é desenhado na imagem: a informação fica na página.
 */
export const SUPPORTER_OUTPUTS = {
  whatsapp: { width: 1080, height: 1080, label: 'Foto de perfil · WhatsApp / Instagram', mime: 'image/jpeg' },
  instagram: { width: 1080, height: 1350, label: 'Feed · Instagram 4:5', mime: 'image/jpeg' },
  story: { width: 1080, height: 1920, label: 'Story · Reels · Status 9:16', mime: 'image/jpeg' },
} as const;
export type SupporterOutputKey = keyof typeof SUPPORTER_OUTPUTS;
export const SUPPORTER_OUTPUT_KEYS = Object.keys(SUPPORTER_OUTPUTS) as SupporterOutputKey[];
/** Tamanho pedido ao modelo: retrato 2:3, base para os três recortes. */
export const MASTER_SIZE = { width: 1024, height: 1536, openai: '1024x1536' } as const;
export const RENDER_VERSION = 'brand-vector-v2-slogan';

type Color = keyof typeof BRAND_COLORS;
type Palette = Partial<Record<BrandPath['fill'], Color>>;

function paths(group: BrandPath[], palette: Palette = {}) {
  return group.map((p) => `<path d="${p.d}" fill="${BRAND_COLORS[palette[p.fill] || p.fill]}"${p.evenOdd ? ' fill-rule="evenodd"' : ''}/>`).join('');
}

/** Logo completo (DR. MADEIRA + onça + taco + 1470 + garras [+ DEPUTADO FEDERAL]). */
export function logoGroup(opts: { x: number; y: number; width: number; deputado?: boolean; palette?: Palette }) {
  const box = opts.deputado === false ? LOGO_COMPACT_BOX : LOGO_FULL_BOX;
  const scale = opts.width / box.width;
  const g = LOGO_GROUPS;
  const body = paths(g.dr, opts.palette) + paths(g.madeira, opts.palette) + paths(g.bat, opts.palette) + paths(g.jaguar, opts.palette)
    + paths(g.num1470, opts.palette) + paths(g.claws, opts.palette) + (opts.deputado === false ? '' : paths(g.deputado, opts.palette));
  return { svg: `<g transform="translate(${opts.x} ${opts.y}) scale(${scale}) translate(${-box.x} ${-box.y})">${body}</g>`, height: box.height * scale };
}

/** Só o número 1470 (para carimbos e faixas). */
export function number1470(opts: { x: number; y: number; width: number; fill?: Color }) {
  const scale = opts.width / LOGO_1470_BOX.width;
  const palette: Palette = opts.fill ? { light: opts.fill } : {};
  return { svg: `<g transform="translate(${opts.x} ${opts.y}) scale(${scale}) translate(${-LOGO_1470_BOX.x} ${-LOGO_1470_BOX.y})">${paths(LOGO_GROUPS.num1470, palette)}</g>`, height: LOGO_1470_BOX.height * scale };
}

/** Texto vetorial (Anton) centralizado em cx, com baseline em y e altura de caixa `size`. */
export function vectorText(key: keyof typeof TEXT_PATHS, opts: { cx: number; y: number; size: number; fill: string; opacity?: number }) {
  const t = TEXT_PATHS[key];
  const scale = opts.size / 100;
  const width = (t.x2 - t.x1) * scale;
  const x = opts.cx - width / 2 - t.x1 * scale;
  return { svg: `<g transform="translate(${x} ${opts.y}) scale(${scale})"><path d="${t.d}" fill="${opts.fill}"${opts.opacity !== undefined ? ` opacity="${opts.opacity}"` : ''}/></g>`, width };
}

function svgDoc(width: number, height: number, body: string) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`);
}

/** Faixa escura suave no topo para o slogan ficar legível sobre qualquer cenário. */
function topFade(width: number, to: number, opacity = 0.62) {
  return `<defs><linearGradient id="topfade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="${opacity}"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs>`
    + `<rect x="0" y="0" width="${width}" height="${to}" fill="url(#topfade)"/>`;
}

/** Slogan da campanha ("MADEIRA NELES!") em dourado, com sombra, centralizado no topo. */
function slogan(cx: number, y: number, size: number) {
  const shadow = vectorText('madeira_neles', { cx: cx + Math.round(size * 0.05), y: y + Math.round(size * 0.05), size, fill: '#000000', opacity: 0.7 });
  const text = vectorText('madeira_neles', { cx, y, size, fill: BRAND_COLORS.gold });
  return shadow.svg + text.svg;
}

function bottomFade(width: number, height: number, from: number, opacity = 0.92) {
  return `<defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="0.55" stop-color="#000" stop-opacity="${(opacity * 0.85).toFixed(2)}"/><stop offset="1" stop-color="#000" stop-opacity="${opacity}"/></linearGradient></defs>`
    + `<rect x="0" y="${from}" width="${width}" height="${height - from}" fill="url(#fade)"/>`;
}

/** Overlay 1080x1080 pensado para a máscara circular do WhatsApp/Instagram. */
export function whatsappOverlay() {
  const W = 1080;
  const ring = `<circle cx="540" cy="540" r="527" fill="none" stroke="${BRAND_COLORS.gold}" stroke-width="16"/>`;
  // faixa inferior dentro do círculo (corda em y=1000 tem meia-largura ~284; usar 560 de largura em y 850-1010)
  const badgeW = 620, badgeH = 158, badgeY = 852;
  const badge = `<rect x="${(W - badgeW) / 2}" y="${badgeY}" width="${badgeW}" height="${badgeH}" rx="34" fill="${BRAND_COLORS.gold}"/>`;
  const label = vectorText('eu_apoio', { cx: 540, y: badgeY - 22, size: 64, fill: '#FFFFFF' });
  const shadow = vectorText('eu_apoio', { cx: 543, y: badgeY - 19, size: 64, fill: '#000000', opacity: 0.55 });
  const num = number1470({ x: 0, y: 0, width: 440, fill: 'black' });
  const numX = (W - 440) / 2, numY = badgeY + (badgeH - num.height) / 2;
  const numSvg = number1470({ x: numX, y: numY, width: 440, fill: 'black' }).svg;
  const fade = bottomFade(W, W, 640, 0.78);
  // slogan no topo, dentro do círculo (corda em y=200 tem meia-largura ~460)
  const top = topFade(W, 330, 0.7) + slogan(540, 198, 78);
  return svgDoc(W, W, top + fade + shadow.svg + label.svg + badge + numSvg + ring);
}

/** Overlay 1080x1350 (feed 4:5). */
export function instagramOverlay() {
  const W = 1080, H = 1350;
  const fade = bottomFade(W, H, 560, 0.94);
  const label = vectorText('eu_apoio', { cx: 540, y: 868, size: 84, fill: '#FFFFFF' });
  const shadow = vectorText('eu_apoio', { cx: 544, y: 872, size: 84, fill: '#000000', opacity: 0.6 });
  const line = `<rect x="200" y="882" width="680" height="4" fill="${BRAND_COLORS.gold}" opacity="0.9"/>`;
  const logo = logoGroup({ x: (W - 520) / 2, y: 906, width: 520, deputado: false });
  const top = topFade(W, 360, 0.66) + slogan(540, 152, 100);
  return svgDoc(W, H, top + fade + shadow.svg + label.svg + line + logo.svg);
}

/** Overlay 1080x1920 (story 9:16). A foto ocupa 1080x1620 no topo; base sólida. */
export function storyOverlay() {
  const W = 1080, H = 1920;
  const fade = bottomFade(W, H, 980, 0.96);
  const base = `<rect x="0" y="1620" width="${W}" height="300" fill="#000"/>`;
  const label = vectorText('eu_apoio', { cx: 540, y: 1288, size: 110, fill: '#FFFFFF' });
  const shadow = vectorText('eu_apoio', { cx: 545, y: 1293, size: 110, fill: '#000000', opacity: 0.6 });
  const line = `<rect x="160" y="1304" width="760" height="5" fill="${BRAND_COLORS.gold}" opacity="0.9"/>`;
  const logo = logoGroup({ x: (W - 600) / 2, y: 1334, width: 600, deputado: true });
  const top = topFade(W, 460, 0.66) + slogan(540, 206, 118);
  return svgDoc(W, H, top + base + fade + shadow.svg + label.svg + line + logo.svg);
}

export interface RenderedOutput { key: SupporterOutputKey; width: number; height: number; mime: 'image/jpeg'; bytes: Buffer }

/**
 * Deriva os 3 formatos do master. `master` pode ser PNG/JPEG/WebP em qualquer
 * tamanho; é normalizado para 2:3 (cover) antes dos recortes.
 */
export async function renderSupporterPack(master: Buffer, quality = 90): Promise<RenderedOutput[]> {
  const normalized = await sharp(master).rotate().resize(MASTER_SIZE.width, MASTER_SIZE.height, { fit: 'cover', position: 'top' }).toBuffer();
  const jpeg = { quality, mozjpeg: true, chromaSubsampling: '4:4:4' as const };

  // WhatsApp: quadrado a partir do topo do master (rostos), depois ring + faixa.
  const whatsapp = await sharp(normalized).extract({ left: 0, top: 0, width: 1024, height: 1024 }).resize(1080, 1080)
    .composite([{ input: whatsappOverlay(), top: 0, left: 0 }]).jpeg(jpeg).toBuffer();

  // Instagram 4:5: master escalado para 1080x1620 e recortado 1350 a partir do topo com folga.
  const instagram = await sharp(normalized).resize(1080, 1620).extract({ left: 0, top: 40, width: 1080, height: 1350 })
    .composite([{ input: instagramOverlay(), top: 0, left: 0 }]).jpeg(jpeg).toBuffer();

  // Story 9:16: foto no topo (1080x1620) sobre base preta, lockup na base.
  const story = await sharp({ create: { width: 1080, height: 1920, channels: 3, background: '#000000' } })
    .composite([
      { input: await sharp(normalized).resize(1080, 1620).toBuffer(), top: 0, left: 0 },
      { input: storyOverlay(), top: 0, left: 0 },
    ]).jpeg(jpeg).toBuffer();

  return [
    { key: 'whatsapp', width: 1080, height: 1080, mime: 'image/jpeg', bytes: whatsapp },
    { key: 'instagram', width: 1080, height: 1350, mime: 'image/jpeg', bytes: instagram },
    { key: 'story', width: 1080, height: 1920, mime: 'image/jpeg', bytes: story },
  ];
}
