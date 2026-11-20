/** Dados SINTÉTICOS do Estúdio de Páginas (nenhum dado de cliente real). Escritório fictício, lugares e fatos de campo de teste. */
import { buildStudioSchema } from '../../../supabase/functions/_shared/studio-schema';
import { renderLinkBlocks } from '../../../supabase/functions/_shared/studio-links';
import { resolveStudioRules, type StudioRules } from '../../../supabase/functions/_shared/studio-rules';
import { emptyProfile, type FieldFact, type PageImage, type ProfileFacts, type StudioPageDoc } from '../../../supabase/functions/_shared/studio-types';
import type { GateContext } from '../../../supabase/functions/_shared/studio-gates';

export const ORIGIN = 'https://aurora-advogados.example';
export const NOW = Date.UTC(2026, 10, 20, 12, 0, 0);

export const profile = (over: Partial<ProfileFacts> = {}): ProfileFacts => ({
  ...emptyProfile(), name: 'Aurora Advogados', segment: 'Advocacia', offer: 'Defesa criminal e plantão para flagrantes na região metropolitana.', tones: ['Acolhedor', 'Direto'],
  voice: 'Fala simples, sem juridiquês.', never: 'garantimos resultado', phones: ['(11) 4002-8922'], whatsapp: '(11) 99999-0001', email: 'contato@aurora-advogados.example',
  addresses: ['Rua das Palmeiras, 120, sala 5, Guarulhos - SP, 07010-000'], hours: 'Mo-Fr 09:00-18:00', sameAs: ['https://www.linkedin.com/company/aurora-advogados-exemplo', 'https://g.page/aurora-advogados-exemplo'],
  languages: ['pt-BR'], regions: 'Guarulhos e Zona Leste de São Paulo', authors: [{ name: 'Marina Souza', credential: 'Advogada, OAB/SP 123456', url: `${ORIGIN}/equipe/marina-souza/` }], logoUrl: `${ORIGIN}/logo.png`, origin: ORIGIN, ...over,
});

export const FACTS: FieldFact[] = [
  { id: 'f1', kind: 'orgao', text: 'A 1ª Delegacia de Polícia de Guarulhos recebe os presos em flagrante da região central.', place: 'Guarulhos', source_url: 'https://www.policiacivil.sp.gov.br/', source_label: 'Polícia Civil de São Paulo', approved: true },
  { id: 'f2', kind: 'prazo', text: 'A audiência de custódia deve ocorrer em até 24 horas após a prisão, conforme a Resolução 213/2015 do CNJ.', place: 'Guarulhos', source_url: 'https://atos.cnj.jus.br/atos/detalhar/2234', source_label: 'Conselho Nacional de Justiça', approved: true },
  { id: 'f3', kind: 'documento', text: 'O pedido de liberdade provisória costuma exigir comprovante de residência e documento de identidade do preso.', place: 'Guarulhos', source_url: 'https://www.planalto.gov.br/ccivil_03/decreto-lei/del3689.htm', source_label: 'Código de Processo Penal', approved: true },
  { id: 'f4', kind: 'local', text: 'O Fórum de Guarulhos atende no centro da cidade.', place: 'Guarulhos', source_url: null, source_label: null, approved: false },
];

export const GOOD_BODY = [
  '<p class="answer">Quem é preso em flagrante em Guarulhos passa primeiro pela delegacia e, em até 24 horas, por uma audiência de custódia. É nessa audiência que o advogado pede a liberdade provisória.</p>',
  '<h2>O que acontece depois de uma prisão em flagrante em Guarulhos?</h2>',
  '<p>A 1ª Delegacia de Polícia de Guarulhos recebe os presos em flagrante da região central. Ali se faz o registro e a família descobre onde a pessoa está. Se o advogado chega cedo, acompanha o depoimento e evita que o preso assine algo sem entender.</p>',
  '<p>Depois vem a custódia. O prazo é de até 24 horas após a prisão, conforme a Resolução 213/2015 do CNJ, e quem decide é o juiz.</p>',
  '<h2>Quais documentos levar ao escritório?</h2>',
  '<ul><li>Documento de identidade do preso.</li><li>Comprovante de residência.</li><li>Nome e telefone de um familiar para avisar.</li></ul>',
  '<p>O pedido de liberdade provisória costuma exigir comprovante de residência e documento de identidade do preso. Sem eles, o juiz tem menos como saber se a pessoa tem endereço fixo.</p>',
  '<h2>Como falar com o escritório?</h2>',
  '<p class="cta">Ligue para <a href="tel:+551140028922" data-zica-cta="phone">(11) 4002-8922</a> ou chame no <a href="https://wa.me/5511999990001" data-zica-cta="whatsapp">WhatsApp</a>. Conte o nome do preso e onde ele está.</p>',
].join('\n');

export const IMAGES: PageImage[] = [
  { slot: 'hero', url: `${ORIGIN}/wp-content/uploads/advogado-criminalista-guarulhos.webp`, alt: 'Prédio comercial no centro de Guarulhos visto da calçada, de manhã', width: 1200, height: 675, format: 'webp', filename: 'advogado-criminalista-guarulhos.webp', origin: 'acervo', bytes: 90_000 },
  { slot: 'og', url: `${ORIGIN}/wp-content/uploads/advogado-criminalista-guarulhos-og.webp`, alt: 'Prédio comercial no centro de Guarulhos visto da calçada, de manhã', width: 1200, height: 630, format: 'webp', filename: 'advogado-criminalista-guarulhos-og.webp', origin: 'acervo', bytes: 80_000 },
];

export const LINKS = [
  { url: `${ORIGIN}/advogado-criminalista/`, anchor: 'Advogado criminalista', kind: 'interno' as const, reason: 'hub' },
  { url: `${ORIGIN}/advogado-criminalista/flagrante/`, anchor: 'o que fazer no flagrante', kind: 'interno' as const, reason: 'irmã' },
  { url: `${ORIGIN}/advogado-criminalista/audiencia-de-custodia/`, anchor: 'como funciona a custódia', kind: 'interno' as const, reason: 'irmã' },
  { url: 'https://atos.cnj.jus.br/atos/detalhar/2234', anchor: 'Resolução 213/2015 do CNJ', kind: 'externo' as const, reason: 'fonte oficial', verified: true, rel: 'noopener' },
];

export function goodDoc(over: Partial<StudioPageDoc> = {}): StudioPageDoc {
  const base: StudioPageDoc = {
    type: 'local', language: 'pt-BR', title: 'Advogado criminalista em Guarulhos: flagrante, custódia e plantão', metaDescription: 'O que acontece depois de uma prisão em flagrante em Guarulhos, em que prazo sai a audiência de custódia e como falar com o escritório.',
    h1: 'Advogado criminalista em Guarulhos', slugPath: 'advogado-criminalista/guarulhos', origin: ORIGIN, url: `${ORIGIN}/advogado-criminalista/guarulhos/`, bodyHtml: '', faq: [],
    breadcrumbs: [{ name: 'Início', url: `${ORIGIN}/` }, { name: 'Advogado criminalista', url: `${ORIGIN}/advogado-criminalista/` }, { name: 'Advogado criminalista em Guarulhos', url: `${ORIGIN}/advogado-criminalista/guarulhos/` }],
    sources: [{ url: 'https://atos.cnj.jus.br/atos/detalhar/2234', label: 'Resolução 213/2015 do CNJ', official: true, verified: true }], links: LINKS, images: IMAGES,
    author: { name: 'Marina Souza', credential: 'Advogada, OAB/SP 123456', url: `${ORIGIN}/equipe/marina-souza/` }, datePublished: '2026-11-18T10:00:00.000Z', dateModified: '2026-11-19T10:00:00.000Z', noindex: false, hreflang: {}, seoPlugin: null,
    areaServed: ['BR'], subject: 'Advogado criminalista', place: 'Guarulhos', segment: 'Advocacia',
    ...over,
  };
  if (!over.bodyHtml) base.bodyHtml = `${GOOD_BODY}\n${renderLinkBlocks(base.links, { related: 'Veja também', sources: 'Fontes' })}`;
  return base;
}

export const rulesFor = (type: StudioPageDoc['type'] = 'local', over: Record<string, unknown> = {}): StudioRules => resolveStudioRules({ type, projectIdentity: { optimization_rules: { palavras: 120 }, ...over } });

export function ctxFor(doc: StudioPageDoc = goodDoc(), over: Partial<GateContext> = {}): GateContext {
  const prof = over.profile || profile();
  return {
    doc, rules: rulesFor(doc.type), profile: prof, schema: buildStudioSchema(doc, prof), siblings: [], existing: { titles: [], metas: [] }, fieldFacts: FACTS, usedFactIds: ['f1', 'f2', 'f3'],
    keywords: ['advogado criminalista guarulhos'], inboundPlanned: 1, linkChecks: { 'https://atos.cnj.jus.br/atos/detalhar/2234': true }, nowMs: NOW, ...over,
  };
}
