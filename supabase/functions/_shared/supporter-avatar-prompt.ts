export const SUPPORTER_AVATAR_PROMPT_VERSION = 'supporter-avatar-human-v1.2.0';
export const SUPPORTER_PHOTO_AGENT_NAME = 'NEXUS PHOTO 1470';
export const SUPPORTER_PHOTO_AGENT_ROLE = 'Agente Full-Stack especializado em edição fotográfica, composição, recriação e renderização humanizada';

export const SUPPORT_TEXTS = [
  'DR. MADEIRA 1470',
  'EU APOIO DR. MADEIRA 1470',
  'APOIO AO DR. MADEIRA 1470',
  'FEDERAL 1470',
  'Madeiraaa Nelesss! 🪵 1470',
] as const;

export const SUPPORT_STYLES = ['premium', 'clean', 'institucional', 'brasil', 'dark'] as const;

export const SUPPORT_OUTPUT_FORMATS = {
  'instagram-profile': {
    label: 'Foto de perfil · Instagram',
    exactWidth: 320,
    exactHeight: 320,
    modelSize: '1024x1024',
    safeZone: 'Composição 1:1 preparada para recorte circular. Mantenha rostos e 1470 dentro dos 72% centrais e não encoste texto nas bordas.',
  },
  'whatsapp-profile': {
    label: 'Foto de perfil · WhatsApp',
    exactWidth: 192,
    exactHeight: 192,
    modelSize: '1024x1024',
    safeZone: 'Composição 1:1 preparada para recorte circular. Mantenha rostos, olhos e 1470 dentro dos 72% centrais.',
  },
  'feed-square': {
    label: 'Feed · quadrado',
    exactWidth: 1080,
    exactHeight: 1080,
    modelSize: '1024x1024',
    safeZone: 'Composição quadrada. Preserve ao menos 8% de margem interna em todos os lados para texto, rosto e número 1470.',
  },
  'feed-portrait': {
    label: 'Feed · retrato 4:5',
    exactWidth: 1080,
    exactHeight: 1350,
    modelSize: '1024x1536',
    safeZone: 'Composição vertical 4:5. Concentre rostos, slogan e 1470 nos 80% centrais; reserve margem lateral de 8% e superior/inferior de 10%.',
  },
  'feed-landscape': {
    label: 'Feed · horizontal',
    exactWidth: 1080,
    exactHeight: 566,
    modelSize: '1536x1024',
    safeZone: 'Composição horizontal. Mantenha os dois rostos e 1470 afastados das laterais; preserve 10% de margem lateral e 8% vertical.',
  },
  'stories-reels-status': {
    label: 'Stories · Reels · Status',
    exactWidth: 1080,
    exactHeight: 1920,
    modelSize: '1024x1536',
    safeZone: 'Composição vertical 9:16. O master será adaptado para 1080x1920: mantenha rostos, slogan e 1470 no miolo central; reserve aproximadamente 15% no topo, 18% na base e 8% nas laterais para interfaces das plataformas.',
  },
} as const;

export type SupportOutputFormat = keyof typeof SUPPORT_OUTPUT_FORMATS;

const styleDirections: Record<string, string> = {
  premium: 'fundo escuro premium, verde profundo, amarelo-lima e azul/ciano, iluminação editorial sofisticada, poucos elementos',
  clean: 'fundo limpo e minimalista, contraste alto, branding discreto, sem poluição visual',
  institucional: 'composição institucional, sóbria e profissional, geometria elegante e iluminação de estúdio',
  brasil: 'verde, amarelo e azul em pinceladas e luzes abstratas discretas, sem reproduzir documento oficial ou brasão',
  dark: 'fundo preto e grafite com detalhes verdes e ciano, acabamento fotográfico cinematográfico moderado',
};

export function buildSupporterAvatarPrompt(input: {
  supporterName?: string;
  supportText: string;
  style: string;
  candidatePresetLabel?: string;
  candidatePresetHint?: string;
  outputFormat?: SupportOutputFormat;
  socialHandles?: Record<string, string>;
}) {
  const style = styleDirections[input.style] || styleDirections.premium;
  const supportText = SUPPORT_TEXTS.includes(input.supportText as typeof SUPPORT_TEXTS[number])
    ? input.supportText
    : SUPPORT_TEXTS[0];
  const outputFormat = input.outputFormat && SUPPORT_OUTPUT_FORMATS[input.outputFormat]
    ? input.outputFormat
    : 'feed-square';
  const format = SUPPORT_OUTPUT_FORMATS[outputFormat];

  return `
AGENTE RESPONSÁVEL: ${SUPPORTER_PHOTO_AGENT_NAME}
FUNÇÃO: ${SUPPORTER_PHOTO_AGENT_ROLE}.
META OPERACIONAL: máxima fidelidade visual e aparência humana natural, com alvo interno de 99% de preservação perceptual dos traços observáveis. Isso é um objetivo editorial/técnico, NÃO uma medição biométrica e NÃO uma garantia matemática de identidade.

TAREFA:
Criar uma única composição fotográfica final com DUAS pessoas reais a partir das referências fornecidas:
- REFERÊNCIA 1 = APOIADOR. É a pessoa que enviou a própria fotografia e deve permanecer reconhecível por seus traços visuais naturais.
- REFERÊNCIA 2 = DR. MADEIRA / MODELO OFICIAL DA CAMPANHA. Use somente essa fotografia fixa para roupa, pose, presença e objeto indicados no preset “${input.candidatePresetLabel || 'modelo oficial'}”.
- REGRA CRÍTICA: não misture, funda ou troque os rostos das duas pessoas. Não transforme o apoiador no candidato nem o candidato no apoiador. Cada pessoa deve conservar identidade visual, pele, cabelo, idade aparente e anatomia próprias.
- REFERÊNCIA OFICIAL: ${input.candidatePresetHint || 'preserve roupa, pose e elementos existentes da foto oficial selecionada'}.

PRIORIDADE ABSOLUTA — HUMANIZAÇÃO E FIDELIDADE:
1. Preserve formato e proporção de cada rosto, testa, sobrancelhas, distância/formato dos olhos, pálpebras, nariz, lábios, boca, mandíbula, queixo, orelhas, linha capilar, cabelo, barba/bigode, idade aparente e tom de pele.
2. Preserve assimetrias naturais, microtextura, poros, pequenas linhas de expressão e detalhes humanos visíveis. Não produza rosto genérico, plástico, ceroso, CGI ou excessivamente retocado.
3. Não afine/alargue rosto, não aumente olhos, não redesenhe nariz ou boca, não invente sorriso/dentes, não altere cor dos olhos, não rejuvenesça nem envelheça e não altere características corporais sem necessidade técnica.
4. Respeite cabelo, barba, óculos, roupas e acessórios existentes. Na referência oficial, preserve também o taco quando o preset escolhido tiver taco; quando o preset for sem taco, não invente taco.
5. Não crie membros extras, mãos deformadas, dedos duplicados, olhos desalinhados ou sobreposição impossível entre as pessoas.
6. O apoiador pode ser reposicionado apenas o suficiente para formar uma foto conjunta natural; a referência oficial deve orientar a pose do candidato sem substituir o rosto do apoiador.

COMPOSIÇÃO:
- Direção visual: ${style}.
- Criar aparência de fotografia conjunta real, coerente em luz, perspectiva, escala e temperatura de cor.
- Recorte limpo de cabelo, ombros, roupa e, quando existir, taco.
- Não colocar uma pessoa atrás da outra a ponto de ocultar o rosto.
- Manter contraste de pele natural e textura de tecido.
- ${format.safeZone}

BRANDING:
- Texto principal exato quando selecionado: “${supportText}”.
- Dar alto destaque ao número “1470”, sem cobrir olhos, boca ou elementos importantes.
- Para o slogan “Madeiraaa Nelesss! 🪵 1470”, manter exatamente três letras “a” adicionais em “Madeiraaa”, três letras “s” em “Nelesss”, o símbolo 🪵 e o número 1470; não corrigir ou simplificar a grafia.
- Branding de aparência geométrica/vetorial; pessoas sempre fotográficas.
- Não inventar brasões, números, logos, nomes de partido ou slogans além dos elementos fornecidos.

FORMATO ESCOLHIDO:
- ${format.label}.
- Master do modelo: ${format.modelSize}.
- Arquivo final após aprovação: ${format.exactWidth}x${format.exactHeight}px.
- A adaptação final de pixels será feita pela aplicação, portanto preserve a zona segura descrita acima.

ACABAMENTO:
- Fotorealismo alto, iluminação plausível, nitidez natural e contraste controlado.
- Sem HDR exagerado, glow excessivo, filtros de beleza fortes, watermark, assinatura de IA ou mockup de aparelho.
- Não inserir texto microscópico nas bordas.

SAÍDA:
- Entregar somente UMA imagem final no formato master solicitado.
- Sem ZIP e sem variações extras.
- A aplicação somente libera o download depois da aprovação visual explícita do apoiador.
`;
}

export const SUPPORTER_AVATAR_QA_PROMPT = `
Você é o revisor técnico do ${SUPPORTER_PHOTO_AGENT_NAME}. Compare as referências e a composição final sem tentar identificar pessoas pelo nome e sem inferir atributos sensíveis.
Avalie apenas fidelidade visual, naturalidade, anatomia, preservação de roupas/objeto, legibilidade e segurança de recorte.
Retorne JSON válido com:
- supporter_fidelity_score: 0-100;
- candidate_reference_fidelity_score: 0-100;
- human_texture_score: 0-100;
- anatomy_score: 0-100;
- crop_safe_score: 0-100;
- branding_legibility_score: 0-100;
- artifacts: lista objetiva de defeitos;
- pass: true somente se supporter_fidelity_score >= 92, candidate_reference_fidelity_score >= 90, human_texture_score >= 92, anatomy_score >= 90 e crop_safe_score >= 90.
A meta de 99% é operacional/editorial e não deve ser apresentada como score biométrico garantido.
`;
