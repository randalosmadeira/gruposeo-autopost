/**
 * Caminho do projeto (P6): maturidade MEDIDA, lacunas e fase 2.
 *
 * Regras:
 *  - Só pontua o que foi medido: uma verificação do pente fino que não respondeu ("erro") ou não se aplicava ("não executada") NÃO conta, nem como zero.
 *    Sem nenhuma verificação respondida, o grupo mostra "sem medição" (score nulo), nunca um número.
 *  - A pontuação medida é separada da declarada (respostas da pessoa): as duas aparecem lado a lado, cada uma dizendo de onde veio.
 *  - A classificação "faz sozinho × vale delegar" dos achados medidos é uma SUGESTÃO fixa por tipo de verificação, não uma opinião gerada por IA.
 *  - O resumo da fase 2 usa só dados públicos do perfil e do pente fino; nunca financeiro, metas ou campos privados.
 */
import type { AnalysisCheck, AnalysisFinding, CheckStatus } from '@/lib/profile-api';

export interface MeasuredGroup { key: string; name: string; score: number | null; measured: number; unmeasured: number; ok: number; warn: number; fail: number }

const GROUPS: Array<{ key: string; name: string; checks: string[] }> = [
  { key: 'empresa', name: 'Empresa e documentos', checks: ['cnpj_formato', 'cnpj_receita', 'cep'] },
  { key: 'dominio', name: 'Domínio e e-mail', checks: ['dominio_rdap', 'dns'] },
  { key: 'site', name: 'Site e SEO técnico', checks: ['site_resposta', 'robots_txt', 'sitemap', 'llms_txt'] },
  { key: 'redes', name: 'Redes (formato do link)', checks: ['redes_formato'] },
];
const WEIGHT: Partial<Record<CheckStatus, number>> = { ok: 1, warn: 0.5, fail: 0 };

export function measuredGroups(checks: readonly AnalysisCheck[]): MeasuredGroup[] {
  return GROUPS.map((g) => {
    const mine = checks.filter((c) => g.checks.includes(c.check_key));
    let sum = 0, measured = 0, ok = 0, warn = 0, fail = 0;
    for (const c of mine) {
      const w = WEIGHT[c.status];
      if (w === undefined) continue; // erro ou não executada: sem medição, não entra na conta
      measured++;
      sum += w;
      if (c.status === 'ok') ok++; else if (c.status === 'warn') warn++; else fail++;
    }
    return { key: g.key, name: g.name, score: measured ? Math.round((sum / measured) * 100) : null, measured, unmeasured: g.checks.length - measured, ok, warn, fail };
  });
}

export type Who = 'sozinho' | 'sozinho_com_ajuda' | 'delegar';
export interface PathGap { item: string; who: string; why: string; source: 'respostas' | 'medido' }

const WHO_LABEL: Record<Who, string> = { sozinho: 'Dá para fazer sozinho', sozinho_com_ajuda: 'Dá para fazer sozinho, com ajuda', delegar: 'Vale delegar' };

/** Sugestão fixa por tipo de verificação. Achado alto do site (servidor fora do ar, sem HTTPS, página-padrão) pede quem entenda; ajustes de página, não. */
function classify(f: AnalysisFinding): Who {
  switch (f.check_key) {
    case 'cnpj_formato': case 'cep': case 'dominio_rdap': case 'redes_formato': return 'sozinho';
    case 'cnpj_receita': case 'dns': return 'delegar';
    case 'robots_txt': case 'sitemap': case 'llms_txt': return 'sozinho_com_ajuda';
    case 'site_resposta': return f.severity === 'alta' ? 'delegar' : 'sozinho_com_ajuda';
    default: return 'sozinho_com_ajuda';
  }
}

/** Lacunas que vieram da MEDIÇÃO: achados em aberto de gravidade alta ou média (baixa e informação não entram no caminho). */
export function measuredGaps(findings: readonly AnalysisFinding[]): PathGap[] {
  return findings
    .filter((f) => f.state === 'open' && (f.severity === 'alta' || f.severity === 'media'))
    .map((f) => ({ item: f.title, who: WHO_LABEL[classify(f)], why: f.detail || f.suggested_action || 'Medido no pente fino.', source: 'medido' as const }));
}

export const isDelegable = (who: string): boolean => /delegar/i.test(who);

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** Texto do pedido de orçamento da fase 2 (cabe nos 3 a 1.000 caracteres da caixa de solicitações do gestor). */
export function buildHelpSummary(input: { projectName: string; delegable: readonly string[]; highFindings: readonly string[]; measuredAt?: string | null }): string {
  const unique = (xs: readonly string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
  const norm = (x: string) => x.trim().toLowerCase();
  const delegableAll = unique(input.delegable).slice(0, 8);
  const already = new Set(delegableAll.map(norm));
  const delegable = delegableAll.map((x) => clip(x, 90));
  // o mesmo item não aparece duas vezes: se já está em "o que vale delegar", sai de "achados altos"
  const findings = unique(input.highFindings).filter((x) => !already.has(norm(x))).slice(0, 5).map((x) => clip(x, 90));
  const parts = [`[Perfil · fase 2] Pedido de orçamento do projeto "${clip(input.projectName, 60)}".`];
  if (delegable.length) parts.push(`O que vale delegar: ${delegable.join('; ')}.`);
  if (findings.length) parts.push(`Achados altos do pente fino${input.measuredAt ? ` (${input.measuredAt})` : ''}: ${findings.join('; ')}.`);
  if (!delegable.length && !findings.length) parts.push('Quero conversar sobre ajuda com o marketing deste projeto.');
  parts.push('Resumo gerado do perfil, sem dados financeiros. Responder ao responsável pelo projeto.');
  return clip(parts.join(' '), 1000);
}
