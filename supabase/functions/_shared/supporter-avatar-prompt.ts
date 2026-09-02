export const SUPPORTER_AVATAR_PROMPT_VERSION = 'supporter-avatar-auto-select-v2.0.0';
export const SUPPORTER_PHOTO_AGENT_NAME = 'NEXUS PHOTO 1470';
export const SUPPORTER_PHOTO_AGENT_ROLE = 'Orquestrador privado de composição fotográfica eleitoral com preservação de identidade';

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

// Mantido apenas para compatibilidade com telas administrativas antigas.
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
Analise somente características fotográficas e de composição das fotos do apoiador.
É proibido identificar a pessoa ou inferir raça, etnia, religião, saúde, deficiência, ideologia política, orientação sexual, condição econômica ou qualquer outro atributo pessoal sensível.
Retorne JSON puro com:
reference_index, face_count, primary_subject_detected, face_visibility, face_size_ratio,
yaw_direction (left|frontal|right), yaw_estimate_degrees, subject_position (left|center|right),
crop_type (headshot|upper_body|half_body|full_body), lighting_direction (frontal|left|right|mixed),
lighting_quality (soft|hard|mixed), sharpness_score (0-100), face_quality_score (0-100),
occlusions, glasses, hair_occlusion, framing_score (0-100), usable_for_identity_preservation,
recommended_candidate_composition, technical_notes.
Escolha reference_index pela qualidade técnica, não por aparência pessoal.
`;

export const CANDIDATE_SELECTOR_AGENT_PROMPT = `
AGENTE: CANDIDATE SELECTOR AGENT.
A galeria do candidato é privada. Escolha internamente a fotografia do candidato com maior compatibilidade técnica com a foto do apoiador e com o pacote social quadrado, vertical e horizontal.
Nunca devolva URL, caminho de storage, Drive ID, nome de arquivo ou qualquer identificador de infraestrutura.
Avalie de 0 a 100: ângulo facial, ângulo corporal, espaço lateral, perspectiva, crop, luz, roupa/cenário, identidade visual, adequação aos três aspect ratios e risco de o taco ou braços obstruírem o apoiador.
Retorne JSON puro com selected_index, runner_up_index, selected_score, runner_up_score, score_breakdown, selection_reason e composition_plan.
`;

export const CAMPAIGN_SCENE_AGENT_PROMPT = `
AGENTE: CAMPAIGN SCENE AGENT.
Escolha exatamente um cenário: gente-da-nossa-terra, palanque-convencao-generica, construindo-o-futuro ou institucional-oficial.
A escolha deve considerar a fotografia do apoiador, roupa do candidato e coerência de iluminação.
Palanque/convenção deve ser um ambiente eleitoral genérico e claramente publicitário: não invente local real identificável, evento específico, endosso individual ou multidão que pareça prova documental de comparecimento.
Retorne JSON puro com scene, rationale e lighting_plan.
`;

export const IDENTITY_GUARDIAN_DIRECTIVE = `
IDENTITY GUARDIAN AGENT - prioridade máxima.
Preserve a identidade visual reconhecível das duas pessoas reais das referências autorizadas.
Preserve proporções faciais, estrutura óssea, distância e formato dos olhos, sobrancelhas, nariz, boca, mandíbula, linha do cabelo, orelhas quando visíveis, tom de pele, textura natural, idade aparente e assimetrias observáveis.
Não embeleze, não aplique beauty filter, não faça face swap, não reconstrua o rosto, não altere etnia, idade, tom de pele, formato dos olhos, nariz ou mandíbula.
Se o cenário conflitar com a preservação da identidade, simplifique o cenário.
A meta interna de fidelidade é 97%, apenas como objetivo editorial de QA, nunca como garantia ou medição biométrica.
`;

export const COMPOSITION_DIRECTOR_DIRECTIVE = `
COMPOSITION DIRECTOR AGENT.
Crie uma fotografia conjunta plausível, com escala corporal, altura de câmera, distância interpessoal e perspectiva coerentes.
Não produza sobreposição impossível, membros extras, mãos deformadas, braços atravessando corpos ou anatomia quebrada.
Se a referência autorizada do candidato contiver o taco preto de beisebol, preserve sua geometria e presença, sem duplicar, entortar, trocar por outro objeto ou fazê-lo atravessar o rosto/corpo do apoiador.
Preserve o vestuário autorizado observado na referência.
`;

export const LIGHTING_HARMONIZER_DIRECTIVE = `
LIGHTING HARMONIZER AGENT.
Harmonize balanço de branco, exposição, direção de luz, densidade de sombras, temperatura de cor e profundidade de campo sem alterar identidade.
Priorize luz frontal, suave, difusa e equilibrada. Não use sombras laterais dramáticas, glow facial, HDR, pele superexposta ou gradação que altere o tom de pele.
`;

export const SOCIAL_CROP_AGENT_DIRECTIVE = `
SOCIAL CROP AGENT.
A composição deve sobreviver aos recortes exatos 1080x1080, 1080x1350 e 1200x630.
Mantenha rostos, taco quando houver, número 1470 e a indicação de IA dentro das zonas seguras de cada formato.
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
Compare a referência do apoiador, a referência privada selecionada do candidato e a composição final.
Não identifique pessoas e não infira atributos sensíveis.
Retorne JSON puro com supporter_fidelity_score, candidate_reference_fidelity_score, human_texture_score,
anatomy_score, crop_safe_score, lighting_consistency_score, disclosure_legibility_score, prop_integrity_score,
artifacts, remediation e pass.
pass=true somente se supporter>=92, candidate>=90, texture>=92, anatomy>=92, crop>=90,
lighting>=90, disclosure>=90 e, quando houver taco, prop_integrity>=90.
A meta editorial de 97% não é medição biométrica.
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
  const feedback = input.qaFeedback ? `CORREÇÃO DA TENTATIVA ANTERIOR: ${input.qaFeedback}` : '';

  return `
${SUPPORTER_PHOTO_AGENT_NAME} - ${SUPPORTER_PHOTO_AGENT_ROLE}.
Crie UMA fotografia de campanha de alta fidelidade contendo exatamente duas pessoas reais das referências fornecidas: apoiador e candidato.

${IDENTITY_GUARDIAN_DIRECTIVE}
${COMPOSITION_DIRECTOR_DIRECTIVE}
${LIGHTING_HARMONIZER_DIRECTIVE}
${SOCIAL_CROP_AGENT_DIRECTIVE}

REFERÊNCIA PRIVADA DO CANDIDATO: ${input.candidatePresetLabel || 'referência oficial autorizada'}.
DIRETRIZ DA REFERÊNCIA: ${input.candidatePresetHint || 'preserve roupa, pose e acessórios observados'}.
${batRule}
PLANO DE COMPOSIÇÃO: ${input.compositionPlan || 'duas pessoas lado a lado, natural e proporcional'}.
CENÁRIO: ${scene}.
ESTILO: fotografia profissional DSLR, textura de pele natural, olhos nítidos, perspectiva óptica realista, luz frontal suave e difusa.
BRANDING: inserir de forma legível e discreta “${supportText}”. Não inventar logotipos ou slogans adicionais.
TRANSPARÊNCIA: inserir exatamente “Imagem gerada por IA - Campanha Oficial” em pequeno selo discreto, legível, no quadrante inferior direito porém dentro da zona segura do recorte.
FORMATO DE GERAÇÃO: ${spec.modelSize}. DESTINO EXATO: ${spec.exactWidth}x${spec.exactHeight}. ${spec.safeZone}.
CENÁRIOS SINTÉTICOS NÃO PODEM SER APRESENTADOS COMO PROVA DOCUMENTAL DE EVENTO, MULTIDÃO, ENDOSSO OU LOCAL REAL QUE NÃO TENHA OCORRIDO.
${feedback}

NEGATIVE DIRECTIVES:
${NEGATIVE_PROMPT}
`;
}
