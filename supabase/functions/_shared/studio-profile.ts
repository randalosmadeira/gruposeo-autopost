/**
 * Perfil do Projeto -> ProfileFacts (o que o Estúdio pode afirmar sobre o negócio).
 *
 * Fontes reais, nesta ordem: campos do Perfil (readValues), colunas do projeto (empresa_nome, empresa_telefone, empresa_whatsapp, empresa_endereco, redes sociais,
 * commercial_info) e `editorial_identity.studio_profile` (horário, autores e logomarca: o Perfil ainda NÃO tem campos para isso).
 * O que não existe fica vazio/null e o Estúdio aponta a falta como pendência: NUNCA inventa telefone, endereço, horário nem autor.
 */
import { emptyProfile, type ProfileFacts } from './studio-types.ts';

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()) : []);
const https = (u: string | null): string | null => (u && /^https:\/\/[^\s]+$/i.test(u) ? u : null);

export const PROJECT_COLUMNS = 'id,name,domain,wordpress_url,organization_id,nicho,editorial_identity,nexus_strategy,seo_plugin,empresa_nome,empresa_telefone,empresa_endereco,empresa_whatsapp,commercial_info,social_instagram,social_linkedin,social_youtube,social_tiktok,social_twitter,social_google_maps,social_links,updated_at';

export function originOf(project: Obj): string | null {
  const dom = str(project.domain);
  if (dom) { const host = dom.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase(); return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? `https://${host}` : null; }
  const wp = str(project.wordpress_url);
  if (wp) { try { const u = new URL(wp); return u.protocol === 'https:' ? u.origin : null; } catch { return null; } }
  return null;
}
/** Subpasta onde o WordPress vive (ex.: "/blog" em rdmadvogados.com.br/blog): as páginas do plugin nascem sob ela. */
export function wordpressBasePath(project: Obj): string {
  const wp = str(project.wordpress_url);
  if (!wp) return '';
  try { return new URL(wp).pathname.replace(/^\/+|\/+$/g, ''); } catch { return ''; }
}

export interface StudioProfileOverride { hours?: string | null; authors?: Array<{ name?: unknown; credential?: unknown; url?: unknown }>; logo_url?: string | null }

export function profileFromProject(project: Obj, values: Record<string, unknown> = {}): { profile: ProfileFacts; gaps: Array<{ key: string; label: string; where: string }> } {
  const identity = obj(project.editorial_identity);
  const sp = obj(identity.studio_profile) as StudioProfileOverride & Obj;
  const commercial = obj(project.commercial_info);
  const social = obj(project.social_links);
  const p = emptyProfile();
  p.name = str(values.businessName) || str(project.empresa_nome) || str(project.name) || '';
  p.segment = str(values.seg) || str(project.nicho);
  p.offer = str(values.offer);
  p.voice = str(values.voice);
  p.tones = list(values.tom);
  p.never = str(values.nunca);
  p.proof = str(values.proof);
  p.constraints = str(values.constraints);
  const phone = str(project.empresa_telefone) || str(commercial.phone);
  p.phones = phone ? [phone] : [];
  p.whatsapp = str(project.empresa_whatsapp) || str(commercial.whatsapp);
  p.email = str(commercial.email);
  const addr = [str(project.empresa_endereco), ...String(values.endereco || '').split(/\r?\n/).map((l) => l.trim())].filter((x): x is string => !!x);
  p.addresses = Array.from(new Set(addr));
  p.hours = str(sp.hours) || str(commercial.opening_hours) || str(commercial.hours);
  p.sameAs = Array.from(new Set([values.instagram, values.facebook, values.linkedin, values.x, values.tiktok, values.youtube, values.gbpurl, project.social_instagram, project.social_linkedin, project.social_youtube, project.social_tiktok, project.social_twitter, project.social_google_maps, social.facebook, social.instagram, social.linkedin, social.youtube].map((u) => https(str(u))).filter((u): u is string => !!u)));
  p.languages = list(values.language);
  p.regions = str(values.regions);
  p.authors = (Array.isArray(sp.authors) ? sp.authors : []).map((a) => ({ name: str(a?.name) || '', credential: str(a?.credential), url: https(str(a?.url)) })).filter((a) => a.name);
  p.logoUrl = https(str(sp.logo_url));
  p.origin = originOf(project);
  const plug = str(project.seo_plugin)?.toLowerCase().replace(/[\s-]+/g, '_');
  p.seoPlugin = plug && ['rank_math', 'yoast', 'aioseo', 'seopress'].includes(plug) ? plug : null;

  const gaps: Array<{ key: string; label: string; where: string }> = [];
  if (!p.phones.length && !p.whatsapp && !p.email) gaps.push({ key: 'contato', label: 'Telefone, WhatsApp ou e-mail', where: 'Projeto: dados da empresa (telefone/WhatsApp)' });
  if (!p.addresses.length) gaps.push({ key: 'endereco', label: 'Endereço do negócio', where: 'Perfil do Projeto: Documentos e endereços' });
  if (!p.hours) gaps.push({ key: 'horario', label: 'Horário de atendimento (formato "Mo-Fr 09:00-18:00")', where: 'Projeto: editorial_identity.studio_profile.hours' });
  if (!p.authors.length) gaps.push({ key: 'autor', label: 'Autor real com credencial', where: 'Projeto: editorial_identity.studio_profile.authors' });
  if (!p.sameAs.length) gaps.push({ key: 'sameas', label: 'Perfis oficiais (redes e Google Meu Negócio)', where: 'Perfil do Projeto: Presença digital' });
  if (!p.logoUrl) gaps.push({ key: 'logo', label: 'Logomarca (URL https)', where: 'Projeto: editorial_identity.studio_profile.logo_url' });
  if (!p.segment) gaps.push({ key: 'segmento', label: 'Segmento (define o pacote de conformidade)', where: 'Perfil do Projeto: Negócio' });
  if (!p.origin) gaps.push({ key: 'dominio', label: 'Domínio do site', where: 'Projeto: domínio' });
  return { profile: p, gaps };
}
