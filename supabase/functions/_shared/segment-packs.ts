/**
 * Pacotes de conformidade por SEGMENTO. O núcleo do sistema não tem regra de nenhum segmento: cada pacote é opcional, cada um avisa por padrão
 * (modo 'aviso') e qualquer um pode ser desligado ('desligado') ou endurecido ('rigido', só por escolha de quem responde pelo projeto).
 *
 * Pacotes: juridico_oab (Provimento 205/2021 da OAB, só Brasil), saude, financas, ecommerce, educacao, eleitoral. 'nenhum' não verifica nada.
 * 'auto' escolhe pelo segmento do projeto (config.segment / nicho); segmento sem pacote = nenhuma verificação. Os padrões de texto são
 * ORIENTAÇÃO (detectam promessas e apelos comuns em pt, en e es), não parecer jurídico: a responsabilidade pela publicidade é de quem publica.
 */
import { findComplianceViolations, type QualityIssue } from './publication-quality.ts';

export const PACK_IDS = ['juridico_oab', 'saude', 'financas', 'ecommerce', 'educacao', 'eleitoral'] as const;
export type PackId = (typeof PACK_IDS)[number];
export type PackChoice = PackId | 'auto' | 'nenhum';
export type PackMode = 'aviso' | 'rigido' | 'desligado';

export const PACK_LABELS: Record<PackId, string> = {
  juridico_oab: 'Jurídico (OAB, Brasil)', saude: 'Saúde', financas: 'Finanças', ecommerce: 'Comércio eletrônico', educacao: 'Educação', eleitoral: 'Política e eleições',
};

interface PatternRule { code: string; label: string; re: RegExp }
const rule = (code: string, label: string, re: RegExp): PatternRule => ({ code, label, re });

const PATTERN_PACKS: Record<Exclude<PackId, 'juridico_oab'>, PatternRule[]> = {
  saude: [
    rule('saude_resultado_garantido', 'Promessa de cura ou resultado garantido em saúde', /cura garantida|garantimos a cura|resultado garantido|100% (?:eficaz|seguro)|sem efeitos colaterais|guaranteed cure|100% (?:effective|safe)|no side effects|miracle (?:cure|treatment)|cura garantizada|sin efectos secundarios|tratamiento milagroso/i),
  ],
  financas: [
    rule('financas_retorno_garantido', 'Promessa de retorno garantido ou ausência de risco', /retorno garantido|rentabilidade garantida|ganho garantido|lucro certo|sem risco|enrique[çc]a r[aá]pido|guaranteed returns?|risk[- ]free|get rich quick|sure profit|rentabilidad garantizada|sin riesgo|ganancias aseguradas|hazte rico/i),
  ],
  ecommerce: [
    rule('ecommerce_urgencia_falsa', 'Urgência comercial ou garantia exagerada', /[uú]ltimas unidades|s[oó] hoje|melhor pre[çc]o garantido|100% satisfa[çc][aã]o garantida|last chance|only today|hurry|best price guaranteed|100% satisfaction guaranteed|[uú]ltima oportunidad|solo hoy|mejor precio garantizado/i),
  ],
  educacao: [
    rule('educacao_resultado_garantido', 'Promessa de aprovação, diploma ou emprego garantidos', /aprova[çc][aã]o garantida|emprego garantido|diploma garantido|guaranteed (?:pass|admission|job)|get your degree fast|aprobaci[oó]n garantizada|empleo garantizado/i),
  ],
  eleitoral: [
    rule('eleitoral_pedido_de_voto', 'Pedido explícito de voto (confira as regras eleitorais da sua jurisdição e do período)', /\bvote (?:em|no|na|por)\b|\bvote for\b|\bvota por\b/i),
  ],
};

const stripTags = (v: string) => v.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export interface PackInput { title?: string | null; content?: string | null; excerpt?: string | null; brand?: string | null }
export interface PackResult { pack: PackId | null; mode: PackMode; blocking: boolean; warnings: QualityIssue[] }

/** Segmento do projeto/artigo -> pacote. Segmento desconhecido ou 'general' = null (nenhum pacote). O pacote jurídico só vale em português (o texto da regra é brasileiro). */
export function packForSegment(segment: unknown, language: { code?: string; region?: string | null } = {}): PackId | null {
  const s = String(segment ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!s) return null;
  if (/^legal|juridic|advoc|law/.test(s)) return language.code === 'pt' && (!language.region || language.region === 'BR') ? 'juridico_oab' : null;
  if (/^health|saude|saúde|medic|dental|clinic/.test(s)) return 'saude';
  if (/^fintech|financ|banking|invest/.test(s)) return 'financas';
  if (/^ecommerce|e_commerce|varejo|retail|loja/.test(s)) return 'ecommerce';
  if (/^educat|educa|escola|school|course|curso/.test(s)) return 'educacao';
  if (/electoral|eleitoral|politic|campaign|campanha/.test(s)) return 'eleitoral';
  return null;
}

export function resolvePack(choice: PackChoice | undefined, segment: unknown, language: { code?: string; region?: string | null } = {}): PackId | null {
  if (!choice || choice === 'auto') return packForSegment(segment, language);
  if (choice === 'nenhum') return null;
  return (PACK_IDS as readonly string[]).includes(choice) ? choice : null;
}

/** Roda UM pacote. 'desligado' ou sem pacote: nada. 'aviso': devolve avisos sem bloquear. 'rigido': marca `blocking` se houver achado. */
export function runPack(pack: PackId | null, mode: PackMode, input: PackInput): PackResult {
  if (!pack || mode === 'desligado') return { pack, mode, blocking: false, warnings: [] };
  let warnings: QualityIssue[] = [];
  if (pack === 'juridico_oab') warnings = findComplianceViolations(input);
  else {
    const text = `${stripTags(String(input.title || ''))} ${stripTags(String(input.content || ''))} ${stripTags(String(input.excerpt || ''))}`;
    for (const r of PATTERN_PACKS[pack]) {
      const m = text.match(r.re);
      if (m) warnings.push({ code: r.code, label: r.label, field: 'content', sample: m[0].slice(0, 80) });
    }
  }
  return { pack, mode, blocking: mode === 'rigido' && warnings.length > 0, warnings };
}
