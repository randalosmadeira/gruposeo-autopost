import { describe, expect, it } from 'vitest';
import { detectAiPatterns, markFindings, paragraphsOf, sentencesOf } from '../../supabase/functions/_shared/studio-ai-detector';
import { styleGuideFor, styleInstructions } from '../../supabase/functions/_shared/studio-style-guide';

const wrap = (ps: string[]) => ps.map((p) => `<p>${p}</p>`).join('\n');

const PT_IA = wrap([
  'No mundo atual, a defesa criminal é cada vez mais importante. Vale destacar que o atendimento é rápido, eficiente e seguro.',
  'Você já se perguntou o que fazer em caso de flagrante? Não é apenas uma questão jurídica, é uma questão de proteção da sua família.',
  'Nossa equipe oferece uma solução completa, com atendimento personalizado e compromisso com a excelência. Diversos fatores influenciam o resultado.',
  'É importante ressaltar que cada caso é único. Nossa abordagem é robusta, abrangente e inovadora — sempre — focada em você.',
  'Em resumo, se você precisa de um advogado, entre em contato conosco.',
]);
const PT_HUMANO = wrap([
  'Preso em flagrante em Guarulhos, o primeiro endereço é a Delegacia Seccional, na Rua Sete de Setembro. A audiência de custódia sai em até 24 horas.',
  'O advogado precisa do RG do preso e do endereço da família. Sem isso, o pedido de liberdade provisória demora. Já vi demorar dois dias.',
  'Pela Lei 12.850/2013, quem integra organização criminosa responde de 3 a 8 anos. Mas só se houver quatro ou mais pessoas, e o Ministério Público tem de provar a estrutura.',
  'Na dúvida, ligue. O telefone do plantão atende fora do horário comercial e o primeiro conselho é simples: não assine nada sem a presença do advogado.',
  'Leve a certidão de antecedentes, se tiver, e a última conta de luz. O juiz da custódia olha residência fixa antes de qualquer coisa. Depois vem o resto, que depende do caso.',
]);
const EN_IA = wrap([
  "In today's fast-paced world, finding a reliable lawyer is more important than ever. It is worth noting that our approach is robust, seamless and comprehensive.",
  "Have you ever wondered what to do after an arrest? It's not just a legal matter, it's a matter of protecting your family.",
  'Our team delivers a one-stop solution with a commitment to excellence. A variety of factors plays a crucial role in the outcome.',
  "Let's dive in and unlock the power of proper legal defense — today — with us.",
  'In conclusion, if you need a lawyer, contact us.',
]);
const EN_HUMAN = wrap([
  'After an arrest in Harris County, Texas, the first hearing is the magistration, usually within 48 hours. Bring a photo ID and the arrest paperwork.',
  'Bail is set by a judge. For a first-time misdemeanor, a cash bond of a few hundred dollars is common, but it varies.',
  "We handle DWI, theft and assault cases. We don't take cases outside the county.",
  'Call before you talk to the police. Anything you say can be used, and officers are trained to keep you talking.',
  'The clerk at 1201 Franklin Street will tell you the next court date. Write it down.',
]);
const ES_IA = wrap([
  'En el mundo actual, contar con un abogado es cada vez más importante. Cabe destacar que nuestro servicio es rápido, eficiente y seguro.',
  '¿Te has preguntado alguna vez qué hacer ante una detención? No es solo un trámite, sino una forma de proteger a tu familia.',
  'Ofrecemos una solución integral con atención personalizada y compromiso con la excelencia. Diversos factores influyen en el resultado.',
  'En conclusión, si necesitas un abogado, contáctanos.',
]);
const ES_HUMANO = wrap([
  'Si lo detienen en Madrid, la comisaría de la calle Leganitos le tomará declaración y tiene derecho a un abogado desde el primer minuto.',
  'El plazo máximo de detención policial es de 72 horas según el artículo 520 de la Ley de Enjuiciamiento Criminal. Pasado ese tiempo, el juez decide.',
  'Lleve el DNI y el nombre del familiar a quien avisar. Sin el DNI, el trámite se retrasa.',
  'No firme nada. Pida al agente que anote que usted solicita abogado de oficio, si no tiene uno propio.',
  'Llámenos antes de declarar: respondemos de 9 a 21 horas, y los fines de semana por turno.',
]);

describe('detector de padrões de IA', () => {
  it('pt: texto de IA tem nota alta e achados com trecho; texto humano e específico tem nota baixa', () => {
    const ia = detectAiPatterns(PT_IA, 'pt');
    const hu = detectAiPatterns(PT_HUMANO, 'pt');
    expect(ia.score).toBeGreaterThan(60);
    expect(hu.score).toBeLessThan(25);
    expect(ia.score).toBeGreaterThan(hu.score + 35);
    const codes = ia.findings.map((f) => f.code);
    expect(codes).toEqual(expect.arrayContaining(['no_mundo_atual', 'vale_destacar', 'pergunta_retorica', 'nao_apenas', 'garantia_vazia', 'fecha_resumo', 'lista_de_tres']));
    expect(ia.findings.every((f) => f.excerpt.length > 0 && f.fix.length > 0)).toBe(true);
    expect(ia.coverage).toBe('completa');
  });
  it('en: mesma separação', () => {
    const ia = detectAiPatterns(EN_IA, 'en'); const hu = detectAiPatterns(EN_HUMAN, 'en');
    expect(ia.score).toBeGreaterThan(55); expect(hu.score).toBeLessThan(25);
    expect(ia.findings.map((f) => f.code)).toEqual(expect.arrayContaining(['in_todays_world', 'worth_noting', 'rhetorical_opener', 'not_just', 'dive_in', 'closes_summary']));
  });
  it('es: mesma separação', () => {
    const ia = detectAiPatterns(ES_IA, 'es'); const hu = detectAiPatterns(ES_HUMANO, 'es');
    expect(ia.score).toBeGreaterThan(55); expect(hu.score).toBeLessThan(25);
    expect(ia.findings.map((f) => f.code)).toEqual(expect.arrayContaining(['en_el_mundo_actual', 'cabe_destacar', 'cierra_resumen']));
  });
  it('estrutura: ritmo uniforme, parágrafos simétricos, travessão em excesso e início repetido são achados', () => {
    const frase = 'A equipe atende o cliente com cuidado e prazo certo hoje';
    const robotico = wrap(Array.from({ length: 6 }, () => `${frase}. ${frase}. ${frase}.`));
    const r = detectAiPatterns(robotico, 'pt');
    expect(r.findings.map((f) => f.code)).toEqual(expect.arrayContaining(['ritmo_uniforme', 'paragrafos_simetricos', 'inicio_repetido']));
    const dashes = detectAiPatterns(wrap(['Um — dois — três — quatro. Palavra outra coisa mais ainda aqui para somar texto e tamanho de verdade.']), 'pt');
    expect(dashes.findings.some((f) => f.code === 'travessao_excesso')).toBe(true);
  });
  it('FAQ de molde é achado; FAQ com perguntas reais não', () => {
    const molde = '<h2>O que é guarda compartilhada?</h2><p>x</p><h2>Como funciona o inventário?</h2><p>y</p><h2>Quanto custa um divórcio?</h2><p>z</p>';
    expect(detectAiPatterns(molde, 'pt').findings.some((f) => f.code === 'faq_de_molde')).toBe(true);
    const real = '<h2>Posso sair de casa antes da audiência de custódia?</h2><p>x</p><h2>Meu irmão foi levado ao 1º DP de Guarulhos: quem avisa a família?</h2><p>y</p>';
    expect(detectAiPatterns(real, 'pt').findings.some((f) => f.code === 'faq_de_molde')).toBe(false);
  });
  it('falta de especificidade em texto longo é achado (e números, nomes e normas a eliminam)', () => {
    const vago = wrap(Array.from({ length: 6 }, (_, i) => `Nós trabalhamos para ajudar as pessoas que procuram atendimento ${'com cuidado e atenção a cada detalhe '.repeat(2)}na rotina de cada família número ${i === 99 ? 1 : ''} sempre que possível e quando for preciso.`));
    expect(detectAiPatterns(vago, 'pt').findings.some((f) => f.code === 'sem_especificidade')).toBe(true);
  });
  it('idioma sem guia: só verificações estruturais, e o relatório diz isso (cobertura)', () => {
    const r = detectAiPatterns(wrap(['Teksti on pitkä ja tylsä. '.repeat(10)]), 'fi');
    expect(r.coverage).toBe('estrutural');
    expect(styleGuideFor('fi')).toBeNull();
    expect(styleGuideFor('fr')!.coverage).toBe('parcial');
  });
  it('trechos marcados e utilitários de texto', () => {
    const r = detectAiPatterns(PT_IA, 'pt');
    const marked = markFindings(PT_IA, r.findings);
    expect(marked).toContain('<mark data-ai="no_mundo_atual"');
    expect(paragraphsOf('<h1>t</h1><p>a b</p><ul><li>c d</li></ul>')).toEqual(['a b', 'c d']);
    expect(sentencesOf('Veja o art. 5. Depois leia. Pronto!')).toHaveLength(3);
  });
  it('as instruções de geração repetem as proibições do detector e exigem pendência em vez de invenção', () => {
    const s = styleInstructions('pt', { tones: ['Acolhedor'], never: 'garantimos resultado' });
    expect(s).toMatch(/no mundo atual|contexto genérico/i);
    expect(s).toMatch(/PENDENTE/);
    expect(s).toMatch(/NEVER invent/);
    expect(s).toMatch(/garantimos resultado/);
  });
});
