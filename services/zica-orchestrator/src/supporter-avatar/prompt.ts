/**
 * Prompts do gerador de apoiadores 1470 (pipeline VPS v8).
 *
 * Princípio: a IA só compõe a FOTOGRAFIA (apoiador + candidato). Nenhum texto,
 * número, logotipo ou selo é pedido ao modelo; a identidade visual entra depois,
 * como vetor, em render.ts. Isso elimina tipografia distorcida, remove o selo
 * de IA da imagem e permite gerar uma única imagem por pedido.
 *
 * As diretrizes de identidade abaixo são espelhadas em
 * supabase/functions/_shared/supporter-avatar-prompt.ts (fonte canônica lida
 * pelos testes). Mantenha os dois arquivos idênticos nesses blocos.
 */
export const PIPELINE_VERSION = 'supporter-avatar-vps-v8';
export const SUPPORTER_AVATAR_PROMPT_VERSION = 'supporter-avatar-vps-v8.0.0';
export const SUPPORTER_PHOTO_AGENT_NAME = 'NEXUS PHOTO 1470';

export const IDENTITY_GUARDIAN_DIRECTIVE = `
IDENTITY GUARDIAN AGENT - prioridade absoluta.
A primeira imagem de referência é o apoiador; a segunda é o candidato. Preserve de cada pessoa os traços reais observáveis: proporções faciais, distância e formato dos olhos, sobrancelhas, nariz, boca, mandíbula, linha do cabelo, orelhas quando visíveis, tom e textura natural da pele, idade aparente e assimetrias.
Não embeleze. Não use face swap. Não reconstrua o rosto. Não altere estrutura óssea, olhos, nariz, mandíbula, idade aparente, tom de pele ou textura natural.
Se cenário, pose, acessório ou composição competirem com a identidade, simplifique todo o resto e preserve a identidade.
`.trim();

export const COMPOSITION_DIRECTOR_DIRECTIVE = `
COMPOSITION DIRECTOR AGENT.
Crie fotografia conjunta plausível, com escala corporal, altura de câmera, distância interpessoal e perspectiva coerentes. Preserve a pose-base das referências sempre que possível.
Não produza membros extras, mãos deformadas, braços atravessando corpos, cabeças mescladas, anatomia quebrada ou perspectiva impossível.
Se a referência autorizada do candidato contiver taco preto de beisebol, preserve sua presença e geometria sem duplicar, entortar ou fazê-lo atravessar o apoiador. Se não contiver, não invente taco.
Preserve o vestuário autorizado da referência escolhida.
`.trim();

export const LIGHTING_HARMONIZER_DIRECTIVE = `
LIGHTING HARMONIZER AGENT.
Harmonize balanço de branco, exposição, direção de luz, densidade de sombras, temperatura de cor e profundidade de campo sem alterar identidade.
Priorize luz frontal suave e difusa. Não use glow facial, HDR excessivo, pele superexposta ou gradação que altere tom de pele.
`.trim();

/** Enquadramento único que serve aos três recortes (1:1 topo, 4:5, 9:16). */
export const FRAMING_DIRECTIVE = `
FRAMING AGENT.
Formato retrato 2:3 (1024x1536). As duas pessoas lado a lado, de meio corpo, com os dois rostos inteiros dentro da faixa entre 12% e 55% da altura e centralizados horizontalmente com pelo menos 8% de margem lateral.
O terço inferior da imagem (abaixo de 68% da altura) deve conter apenas roupa e cenário contínuo, sem rostos, mãos importantes ou objetos: essa área recebe a identidade visual da campanha depois.
Sem bordas, molduras, colagens ou divisão de tela.
`.trim();

export const NO_TEXT_DIRECTIVE = `
PROIBIDO ABSOLUTO: qualquer texto, letra, número, logotipo, selo, legenda, marca d'água, bandeira com escrita, camiseta com texto legível inventado ou grafismo tipográfico dentro da imagem. A identidade visual é aplicada fora do modelo.
`.trim();

export const NEGATIVE_PROMPT = `
generic face, lookalike, identity drift, face replacement, altered bone structure, changed jawline,
changed nose, changed eye shape, deformed eyes, incorrect pupils, beauty filter, airbrushed skin,
plastic skin, wax skin, unnaturally smooth skin, excessive makeup, age modification, altered skin tone,
facial reconstruction, cartoon, anime, illustration, painting, 3D render, CGI appearance, blur,
oversaturated skin, harsh overhead lighting, dramatic side lighting, crushed shadows, extreme contrast,
HDR halo, duplicate person, duplicate face, merged bodies, extra limbs, extra fingers, missing fingers,
deformed hands, broken anatomy, intersecting arms, impossible embrace, duplicated baseball bat,
warped baseball bat, floating object, malformed clothing, any text, any letters, any numbers, logo,
watermark, caption, badge, sticker, artificial smile, uncanny expression.
`.trim();

export const SCENES = {
  'institucional-oficial': 'estúdio de campanha minimalista, fundo verde-escuro profundo com leve gradiente e grafismos geométricos discretos desfocados, iluminação profissional, não documental',
  'gente-da-nossa-terra': 'rua ou praça brasileira genérica, presença comunitária ao fundo desfocada, luz natural suave, sem localização real identificável',
  'construindo-o-futuro': 'ambiente urbano contemporâneo genérico, tons limpos e luz de trabalho, sem afirmar obra pública específica',
} as const;
export type SceneKey = keyof typeof SCENES;

/** Uma única chamada de visão: escolhe a melhor foto do apoiador, a referência do candidato e o cenário. */
export const SELECTOR_PROMPT = `
AGENTE: PHOTO INTAKE + CANDIDATE SELECTOR (uma só etapa).
Analise exclusivamente características técnicas das fotografias. Nunca identifique pessoas e nunca infira raça, etnia, religião, saúde, deficiência, ideologia, orientação sexual, condição econômica ou qualquer atributo sensível.
1) Entre as fotos do apoiador, escolha a melhor referência por nitidez facial, visibilidade do rosto, enquadramento, perspectiva, luz e espaço útil. Marque usable=false somente se nenhuma foto tiver um rosto humano nítido e visível.
2) Entre as referências privadas do candidato, escolha a de maior compatibilidade técnica com a foto do apoiador (ângulo, escala, luz, roupa) e menor risco de obstrução. Prefira referência sem taco quando houver dúvida.
3) Escolha um cenário entre: institucional-oficial, gente-da-nossa-terra, construindo-o-futuro. Em dúvida, institucional-oficial.
Nunca exponha URL, ID, nome de arquivo ou caminho. Retorne somente o JSON do schema.
`.trim();

export const QA_PROMPT = `
AGENTE: QUALITY AUDITOR.
Compare tecnicamente a referência do apoiador (imagem 0), a referência do candidato (imagem 1) e a composição final (imagem 2). Nunca identifique pessoas nem infira atributos sensíveis.
Pontue de 0 a 100: supporter_fidelity_score, candidate_reference_fidelity_score, anatomy_score, human_texture_score, lighting_consistency_score. Informe face_count na composição e text_detected (true se houver qualquer texto, número ou logotipo visível na composição).
Liste artifacts e remediation curtos. Não tente forçar aprovação: o backend recalcula o veredito.
`.trim();

export function buildCompositionPrompt(input: {
  candidatePresetLabel?: string;
  candidatePresetHint?: string | null;
  candidateHasBat?: boolean;
  scene?: string;
  compositionPlan?: string;
}) {
  const scene = SCENES[(input.scene as SceneKey) || 'institucional-oficial'] || SCENES['institucional-oficial'];
  const batRule = input.candidateHasBat
    ? 'A referência do candidato contém seu taco preto de beisebol. Preserve-o fielmente, sem obstruir os rostos.'
    : 'Não invente taco se ele não existir na referência selecionada.';
  return `
${SUPPORTER_PHOTO_AGENT_NAME} - composição fotográfica eleitoral com preservação máxima de identidade.
Crie UMA fotografia hiper-realista contendo exatamente duas pessoas reais das referências fornecidas: apoiador (imagem 1) e candidato (imagem 2).

${IDENTITY_GUARDIAN_DIRECTIVE}
${COMPOSITION_DIRECTOR_DIRECTIVE}
${LIGHTING_HARMONIZER_DIRECTIVE}
${FRAMING_DIRECTIVE}
${NO_TEXT_DIRECTIVE}

REFERÊNCIA PRIVADA DO CANDIDATO: ${input.candidatePresetLabel || 'referência oficial autorizada'}.
DIRETRIZ DA REFERÊNCIA: ${input.candidatePresetHint || 'preserve roupa, pose e acessórios observados'}.
${batRule}
PLANO DE COMPOSIÇÃO: ${input.compositionPlan || 'duas pessoas lado a lado, natural e proporcional'}.
CENÁRIO: ${scene}.
ESTILO: fotografia profissional DSLR, textura de pele natural, poros e microexpressões preservados, olhos nítidos, perspectiva óptica realista, luz frontal suave e difusa.
CENÁRIOS SINTÉTICOS NÃO PODEM SER APRESENTADOS COMO PROVA DOCUMENTAL DE EVENTO, MULTIDÃO, ENDOSSO OU LOCAL REAL QUE NÃO TENHA OCORRIDO.

NEGATIVE DIRECTIVES:
${NEGATIVE_PROMPT}
`.trim();
}
