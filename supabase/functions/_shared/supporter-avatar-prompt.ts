export const SUPPORTER_AVATAR_PROMPT_VERSION = 'supporter-avatar-auto-select-v3.0.0';
export const SUPPORTER_PHOTO_AGENT_NAME = 'NEXUS PHOTO 1470';
export const SUPPORTER_PHOTO_AGENT_ROLE = 'Orquestrador privado e autônomo de composição fotográfica eleitoral com preservação máxima de identidade';

export const SUPPORT_TEXTS = [
  'DR. MADEIRA 1470',
  'EU APOIO DR. MADEIRA 1470',
  'APOIO AO DR. MADEIRA 1470',
  'FEDERAL 1470',
  'Madeiraaa Nelesss! 🪵 1470',
] as const;

export const SUPPORT_STYLES = ['premium', 'clean', 'institucional', 'brasil', 'dark'] as const;

export const SUPPORT_SOCIAL_PACK = {
  square: {
    label: 'Instagram · WhatsApp · Facebook',
    exactWidth: 1080,
    exactHeight: 1080,
    modelSize: '1024x1024',
    safeZone: 'mantenha os dois rostos, o número 1470 e o aviso de IA dentro dos 82% centrais',
  },
  portrait: {
    label: 'Feed vertical 4:5',
    exactWidth: 1080,
    exactHeight: 1350,
    modelSize: '1024x1536',
    safeZone: 'mantenha rostos e elementos essenciais no miolo 4:5, afastados pelo menos 12% do topo e da base',
  },
  landscape: {
    label: 'Facebook · LinkedIn horizontal',
    exactWidth: 1200,
    exactHeight: 630,
    modelSize: '1536x1024',
    safeZone: 'mantenha os dois rostos e o número 1470 na faixa horizontal central, com 10% de margem lateral',
  },
} as const;

export type SupportSocialPackKey = keyof typeof SUPPORT_SOCIAL_PACK;

export const SUPPORT_OUTPUT_FORMATS = {
  'instagram-profile': { label: 'Foto de perfil · Instagram', exactWidth: 1080, exactHeight: 1080, modelSize: '1024x1024', safeZone: SUPPORT_SOCIAL_PACK.square.safeZone },
  'whatsapp-profile': { label: 'Foto de perfil · WhatsApp', exactWidth: 1080, exactHeight: 1080, modelSize: '1024x1024', safeZone: SUPPORT_SOCIAL_PACK.square.safeZone },
  'feed-square': { label: SUPPORT_SOCIAL_PACK.square.label, exactWidth: 1080, exactHeight: 1080, modelSize: '1024x1024', safeZone: SUPPORT_SOCIAL_PACK.square.safeZone },
  'feed-portrait': { label: SUPPORT_SOCIAL_PACK.portrait.label, exactWidth: 1080, exactHeight: 1350, modelSize: '1024x1536', safeZone: SUPPORT_SOCIAL_PACK.portrait.safeZone },
  'feed-landscape': { label: SUPPORT_SOCIAL_PACK.landscape.label, exactWidth: 1200, exactHeight: 630, modelSize: '1536x1024', safeZone: SUPPORT_SOCIAL_PACK.landscape.safeZone },
  'stories-reels-status': { label: 'Stories · Reels · Status', exactWidth: 1080, exactHeight: 1920, modelSize: '1024x1536', safeZone: 'mantenha rostos e identidade visual no miolo central' },
} as const;
export type SupportOutputFormat = keyof typeof SUPPORT_OUTPUT_FORMATS;

export const PHOTO_INTAKE_AGENT_PROMPT = `
AGENTE: PHOTO INTAKE AGENT.
Analise exclusivamente características técnicas das fotografias do apoiador. Nunca identifique a pessoa e nunca infira raça, etnia, religião, saúde, deficiência, ideologia política, orientação sexual, condição econômica ou qualquer atributo pessoal sensível.
Escolha a melhor referência por nitidez facial, visibilidade, crop, perspectiva, luz e espaço útil. Ordene também as alternativas para recuperação automática caso o QA posterior detecte perda de identidade.
Retorne somente os campos do schema fornecido. Não peça ao usuário para escolher uma foto quando houver ao menos uma referência tecnicamente utilizável.
`;

export const CANDIDATE_SELECTOR_AGENT_PROMPT = `
AGENTE: CANDIDATE SELECTOR AGENT.
A galeria do candidato é privada. Escolha internamente a fotografia autorizada com maior compatibilidade técnica com o apoiador e com os três formatos sociais.
Nunca exponha URL, Drive ID, nome de arquivo, slug, caminho de storage ou identificador de infraestrutura ao apoiador.
Avalie ângulo facial/corporal, espaço lateral, perspectiva, crop, iluminação, roupa/cenário, adequação aos três aspect ratios e risco de taco/braços obstruírem o apoiador.
Escolha também um runner-up para recuperação autônoma. Se houver dúvida, priorize referência sem taco, frontal ou três-quartos limpo e com área lateral livre.
Retorne somente os campos do schema fornecido.
`;

export const CAMPAIGN_SCENE_AGENT_PROMPT = `
AGENTE: CAMPAIGN SCENE AGENT.
Escolha exatamente um cenário: gente-da-nossa-terra, palanque-convencao-generica, construindo-o-futuro ou institucional-oficial.
A escolha deve considerar crop, roupa, iluminação e compatibilidade com o apoiador. Em caso de incerteza, use institucional-oficial.
Palanque/convenção é ambiente publicitário sintético e genérico: jamais simule prova documental de evento, multidão, apoio individual ou presença em local real inexistente.
Retorne somente os campos do schema fornecido.
`;

export const IDENTITY_GUARDIAN_DIRECTIVE = `
IDENTITY GUARDIAN AGENT - prioridade absoluta.
A primeira imagem de referência é o apoiador; a segunda é o candidato. Preserve de cada pessoa os traços reais observáveis: proporções faciais, distância e formato dos olhos, sobrancelhas, nariz, boca, mandíbula, linha do cabelo, orelhas quando visíveis, tom e textura natural da pele, idade aparente e assimetrias.
Não embeleze. Não use face swap. Não reconstrua o rosto. Não altere estrutura óssea, olhos, nariz, mandíbula, idade aparente, tom de pele ou textura natural.
Se cenário, pose, acessório, texto ou composição competirem com a identidade, simplifique todo o resto e preserve a identidade.
A meta editorial interna de 97% é objetivo de QA, não garantia nem métrica biométrica.
`;

export const COMPOSITION_DIRECTOR_DIRECTIVE = `
COMPOSITION DIRECTOR AGENT.
Crie fotografia conjunta plausível, com escala corporal, altura de câmera, distância interpessoal e perspectiva coerentes. Preserve a pose-base das referências sempre que possível.
Não produza membros extras, mãos deformadas, braços atravessando corpos, cabeças mescladas, anatomia quebrada ou perspectiva impossível.
Se a referência autorizada do candidato contiver taco preto de beisebol, preserve sua presença e geometria sem duplicar, entortar ou fazê-lo atravessar o apoiador. Se não contiver, não invente taco.
Preserve o vestuário autorizado da referência escolhida.
`;

export const LIGHTING_HARMONIZER_DIRECTIVE = `
LIGHTING HARMONIZER AGENT.
Harmonize balanço de branco, exposição, direção de luz, densidade de sombras, temperatura de cor e profundidade de campo sem alterar identidade.
Priorize luz frontal suave e difusa. Não use glow facial, HDR excessivo, pele superexposta ou gradação que altere tom de pele.
`;

export const SOCIAL_CROP_AGENT_DIRECTIVE = `
SOCIAL CROP AGENT.
A composição deve sobreviver aos recortes exatos 1080x1080, 1080x1350 e 1200x630. Preserve ambos os rostos e elementos essenciais nas zonas seguras. Se um crop ficar inseguro, reposicione enquadramento/corpos sem redesenhar rostos.
`;

export const NEGATIVE_PROMPT = `
generic face, lookalike, identity drift, face replacement, altered bone structure, changed jawline,
changed nose, changed eye shape, deformed eyes, incorrect pupils, beauty filter, airbrushed skin,
plastic skin, wax skin, unnaturally smooth skin, excessive makeup, age modification, altered skin tone,
facial reconstruction, cartoon, anime, illustration, painting, 3D render, CGI appearance, blur,
oversaturated skin, harsh overhead lighting, dramatic side lighting, crushed shadows, extreme contrast,
HDR halo, duplicate person, duplicate face, merged bodies, extra limbs, extra fingers, missing fingers,
deformed hands, broken anatomy, intersecting arms, impossible embrace, duplicated baseball bat,
warped baseball bat, floating object, malformed clothing, distorted campaign typography, artificial smile,
uncanny expression.
`;

export const QUALITY_AUDITOR_AGENT_PROMPT = `
AGENTE: QUALITY AUDITOR AGENT.
Compare tecnicamente a referência do apoiador, a referência privada do candidato e a composição final. Nunca identifique pessoas nem infira atributos sensíveis.
Se houver falha, descreva remediação operacional curta e específica para permitir regeneração automática: identity_supporter, identity_candidate, anatomy, crop, lighting, disclosure ou prop.
O campo pass deve ser conservador. O backend também recalculará os thresholds, portanto não tente forçar aprovação.
Retorne somente os campos do schema fornecido.
`;

const sceneDirections: Record<string, string> = {
  'gente-da-nossa-terra': 'rua ou praça brasileira genérica, presença comunitária, fundo desfocado, luz natural suave, sem localização real identificável',
  'palanque-convencao-generica': 'ambiente eleitoral genérico de estúdio/evento, painéis e bandeiras abstratas desfocadas, sem simular documentação de evento real ou multidão identificável',
  'construindo-o-futuro': 'ambiente urbano e de planejamento contemporâneo, infraestrutura genérica, tons limpos e luz de trabalho, sem afirmar obra pública específica',
  'institucional-oficial': 'estúdio de campanha minimalista, grafismos discretos da identidade 1470, fundo profissional e não documental',
};

export function buildSupporterAvatarPrompt(input: {
  supportText?: string;
  style?: string;
  candidatePresetLabel?: string;
  candidatePresetHint?: string;
  candidateHasBat?: boolean;
  scene?: string;
  compositionPlan?: string;
  socialPackKey: SupportSocialPackKey;
  qaFeedback?: string;
}) {
  const supportText = SUPPORT_TEXTS.includes(input.supportText as typeof SUPPORT_TEXTS[number]) ? input.supportText! : 'EU APOIO DR. MADEIRA 1470';
  const spec = SUPPORT_SOCIAL_PACK[input.socialPackKey];
  const scene = sceneDirections[input.scene || 'institucional-oficial'] || sceneDirections['institucional-oficial'];
  const batRule = input.candidateHasBat
    ? 'A referência do candidato contém seu taco preto de beisebol. Preserve-o fielmente e mantenha-o sem obstruir os rostos.'
    : 'Não invente taco se ele não existir na referência selecionada.';
  const feedback = input.qaFeedback ? `CORREÇÃO AUTÔNOMA DA TENTATIVA ANTERIOR: ${input.qaFeedback}` : '';

  return `
${SUPPORTER_PHOTO_AGENT_NAME} - ${SUPPORTER_PHOTO_AGENT_ROLE}.
Crie UMA fotografia de campanha hiper-realista e de alta fidelidade contendo exatamente duas pessoas reais das referências fornecidas: apoiador e candidato.

${IDENTITY_GUARDIAN_DIRECTIVE}
${COMPOSITION_DIRECTOR_DIRECTIVE}
${LIGHTING_HARMONIZER_DIRECTIVE}
${SOCIAL_CROP_AGENT_DIRECTIVE}

REFERÊNCIA PRIVADA DO CANDIDATO: ${input.candidatePresetLabel || 'referência oficial autorizada'}.
DIRETRIZ DA REFERÊNCIA: ${input.candidatePresetHint || 'preserve roupa, pose e acessórios observados'}.
${batRule}
PLANO DE COMPOSIÇÃO: ${input.compositionPlan || 'duas pessoas lado a lado, natural e proporcional'}.
CENÁRIO: ${scene}.
ESTILO: fotografia profissional DSLR, textura de pele natural, poros e microexpressões preservados, olhos nítidos, perspectiva óptica realista, luz frontal suave e difusa.
BRANDING: inserir de forma legível e discreta “${supportText}”. Não inventar logotipos ou slogans adicionais.
TRANSPARÊNCIA: inserir exatamente “Imagem gerada por IA - Campanha Oficial” em selo discreto e legível, dentro da zona segura.
FORMATO DE GERAÇÃO: ${spec.modelSize}. DESTINO EXATO: ${spec.exactWidth}x${spec.exactHeight}. ${spec.safeZone}.
CENÁRIOS SINTÉTICOS NÃO PODEM SER APRESENTADOS COMO PROVA DOCUMENTAL DE EVENTO, MULTIDÃO, ENDOSSO OU LOCAL REAL QUE NÃO TENHA OCORRIDO.
${feedback}

NEGATIVE DIRECTIVES:
${NEGATIVE_PROMPT}
`;
}
