/**
 * Prompts do gerador de apoiadores 1470 (pipeline VPS v8).
 *
 * Princípio: a IA só compõe a FOTOGRAFIA (apoiador + candidato). Nenhum texto,
 * número, logotipo ou selo NOVO é pedido ao modelo; a identidade visual da
 * campanha entra depois, como vetor, em render.ts. Estampas e logotipos que já
 * existem nas roupas das referências (camiseta oficial da campanha) são parte
 * da referência e devem ser preservados.
 *
 * As diretrizes abaixo são espelhadas em
 * supabase/functions/_shared/supporter-avatar-prompt.ts (fonte canônica lida
 * pelos testes). Mantenha os dois arquivos idênticos nesses blocos.
 */
export const PIPELINE_VERSION = 'supporter-avatar-vps-v8';
export const SUPPORTER_AVATAR_PROMPT_VERSION = 'supporter-avatar-vps-v8.2.0';
export const SUPPORTER_PHOTO_AGENT_NAME = 'NEXUS PHOTO 1470';

export const IDENTITY_GUARDIAN_DIRECTIVE = `
IDENTITY GUARDIAN AGENT - prioridade absoluta, acima de qualquer outra diretriz.
A primeira imagem de referência é o apoiador; a segunda é o candidato. As duas pessoas devem ser reproduzidas como recortes fotográficos das referências, SEMPRE O ORIGINAL: mesma pessoa, mesma idade aparente, mesmo formato de rosto, mesmos olhos, sobrancelhas, nariz, boca, dentes, orelhas, mandíbula, barba ou bigode, cabelo (corte, volume, textura e cor), tom e textura natural da pele, rugas, sinais, pintas, manchas, cicatrizes e assimetrias.
TATUAGENS, PIERCINGS, ÓCULOS, BRINCOS, COLARES, PULSEIRAS, RELÓGIOS E QUALQUER MARCA NA PELE QUE APAREÇAM NAS REFERÊNCIAS DEVEM SER MANTIDOS NO MESMO LUGAR, COM O MESMO DESENHO E TAMANHO. Nunca remova, apague, cubra, suavize ou invente tatuagens, sinais ou acessórios.
CORPO: preserve o peso, a silhueta, a largura dos ombros, o volume do rosto, do pescoço, dos braços e do tronco exatamente como nas referências. Não emagreça, não engorde, não alongue, não afine o rosto ou o corpo, não corrija postura, não "melhore" a forma física.
Não embeleze. Não use face swap. Não reconstrua o rosto. Não rejuvenesça, não suavize a pele, não altere a expressão, não altere estrutura óssea, olhos, nariz, mandíbula, idade aparente, tom de pele ou textura natural.
Qualquer mudança perceptível de fisionomia, corpo, marcas na pele ou acessórios em qualquer uma das duas pessoas é falha grave e invalida a imagem.
Se cenário, pose, acessório ou composição competirem com a identidade, simplifique todo o resto e preserve a identidade.
`.trim();

export const WARDROBE_DIRECTIVE = `
WARDROBE GUARDIAN AGENT.
Preserve integralmente o vestuário das duas pessoas conforme as referências: peça, cor, caimento e acessórios.
A camiseta oficial da campanha do candidato, com sua estampa, número, logotipo e textos impressos, deve aparecer exatamente como na referência. É proibido apagar, borrar, trocar, cobrir ou "limpar" essa estampa. O mesmo vale para estampas na roupa do apoiador.
`.trim();

export const COMPOSITION_DIRECTOR_DIRECTIVE = `
COMPOSITION DIRECTOR AGENT.
Crie fotografia conjunta plausível, com escala corporal, altura de câmera, distância interpessoal e perspectiva coerentes. Preserve a pose-base das referências sempre que possível.
Não produza membros extras, mãos deformadas, braços atravessando corpos, cabeças mescladas, anatomia quebrada ou perspectiva impossível.
Se a referência autorizada do candidato contiver taco preto de beisebol, preserve-o inteiro, nítido, na mesma posição relativa ao corpo, segurado pelo candidato, sem duplicar, entortar, encurtar ou fazê-lo atravessar o apoiador ou cobrir rostos. Se não contiver, não invente taco.
`.trim();

export const LIGHTING_HARMONIZER_DIRECTIVE = `
LIGHTING HARMONIZER AGENT.
Harmonize balanço de branco, exposição, direção de luz, densidade de sombras, temperatura de cor e profundidade de campo sem alterar identidade.
Priorize luz frontal suave e difusa. Não use glow facial, HDR excessivo, pele superexposta ou gradação que altere tom de pele.
`.trim();

/** Enquadramento único que serve aos três recortes (1:1 topo, 4:5, 9:16) e às faixas de slogan. */
export const FRAMING_DIRECTIVE = `
FRAMING AGENT.
Formato retrato 2:3 (1024x1536). As duas pessoas lado a lado, próximas, de meio corpo, com os dois rostos inteiros dentro da faixa entre 22% e 58% da altura e centralizados horizontalmente com pelo menos 8% de margem lateral.
Os 15% superiores da imagem devem conter apenas cenário, sem topo de cabeça cortado e sem elementos importantes: essa faixa recebe o slogan da campanha depois.
O terço inferior (abaixo de 68% da altura) deve conter apenas roupa e cenário contínuo, sem rostos, mãos importantes ou objetos: essa área recebe o nome e o número do candidato depois.
Sem bordas, molduras, colagens ou divisão de tela.
`.trim();

export const NO_TEXT_DIRECTIVE = `
PROIBIDO ADICIONAR: qualquer texto, letra, número, logotipo, selo, legenda, marca d'água, bandeira com escrita ou grafismo tipográfico que NÃO exista nas fotografias de referência. Estampas, números e logotipos já presentes nas roupas das referências devem ser mantidos fielmente. Nome, número e slogan da campanha são aplicados depois, fora do modelo.
`.trim();

export const NEGATIVE_PROMPT = `
generic face, lookalike, identity drift, face replacement, altered bone structure, changed jawline,
changed nose, changed eye shape, deformed eyes, incorrect pupils, beauty filter, airbrushed skin,
plastic skin, wax skin, unnaturally smooth skin, excessive makeup, age modification, altered skin tone,
younger face, slimmer face, facial reconstruction, cartoon, anime, illustration, painting, 3D render,
CGI appearance, blur, oversaturated skin, harsh overhead lighting, dramatic side lighting, crushed shadows,
extreme contrast, HDR halo, removed tattoo, missing tattoo, altered tattoo, invented tattoo, removed mole,
removed scar, removed birthmark, removed piercing, removed glasses, removed earrings, slimmer body, heavier body,
thinner face, changed body proportions, changed shoulder width, idealized physique, corrected posture,
duplicate person, duplicate face, merged bodies, extra limbs, extra fingers,
missing fingers, deformed hands, broken anatomy, intersecting arms, impossible embrace, duplicated baseball bat,
warped baseball bat, missing baseball bat, floating object, malformed clothing, erased shirt print,
altered clothing, plain shirt replacing printed shirt, added text, invented letters, invented numbers,
invented logo, watermark, caption, badge, sticker, artificial smile, uncanny expression.
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
2) Entre as referências privadas do candidato, escolha a de maior compatibilidade técnica com a foto do apoiador (ângulo, escala, luz, roupa). O taco de beisebol é o símbolo do slogan da campanha: PREFIRA referências com taco; escolha uma sem taco apenas quando a compatibilidade técnica for claramente inferior ou quando o taco inevitavelmente cobriria um rosto.
3) Escolha um cenário entre: institucional-oficial, gente-da-nossa-terra, construindo-o-futuro. Em dúvida, institucional-oficial.
Nunca exponha URL, ID, nome de arquivo ou caminho. Retorne somente o JSON do schema.
`.trim();

export const QA_PROMPT = `
AGENTE: QUALITY AUDITOR.
Compare tecnicamente a referência do apoiador (imagem 0), a referência do candidato (imagem 1) e a composição final (imagem 2). Nunca identifique pessoas nem infira atributos sensíveis.
Pontue de 0 a 100: supporter_fidelity_score (o rosto do apoiador na composição é a mesma pessoa da imagem 0, com os mesmos traços, idade, cabelo e pele), candidate_reference_fidelity_score (idem para o candidato), wardrobe_fidelity_score (roupas e estampas iguais às referências, inclusive a estampa da camiseta do candidato), body_shape_score (peso, silhueta, largura de ombros e volume de rosto e corpo iguais às referências; emagrecer, engordar ou afinar reduz a nota), anatomy_score, human_texture_score, lighting_consistency_score.
Informe face_count na composição, identity_marks_preserved (true somente se TODAS as tatuagens, sinais, pintas, cicatrizes, piercings, óculos e acessórios visíveis nas referências aparecem na composição no mesmo lugar e sem invenções; se as referências não tiverem marcas, true) e added_text_detected (true apenas se houver texto, número ou logotipo que NÃO exista nas referências; estampas presentes nas roupas das referências não contam).
Liste artifacts e remediation curtos e específicos (ex.: "olhos do apoiador mais estreitos que a referência"). Não tente forçar aprovação: o backend recalcula o veredito.
`.trim();

export function buildCompositionPrompt(input: {
  candidatePresetLabel?: string;
  candidatePresetHint?: string | null;
  candidateHasBat?: boolean;
  scene?: string;
  compositionPlan?: string;
  qaFeedback?: string;
}) {
  const scene = SCENES[(input.scene as SceneKey) || 'institucional-oficial'] || SCENES['institucional-oficial'];
  const batRule = input.candidateHasBat
    ? 'A referência do candidato contém seu taco preto de beisebol, símbolo do slogan da campanha. Preserve-o inteiro, visível e nítido, na mesma posição relativa ao corpo, sem obstruir os rostos.'
    : 'Não invente taco se ele não existir na referência selecionada.';
  const feedback = input.qaFeedback ? `\nCORREÇÃO OBRIGATÓRIA DA TENTATIVA ANTERIOR (falha de fidelidade): ${input.qaFeedback}\nRefaça mantendo os rostos idênticos às referências.` : '';
  return `
${SUPPORTER_PHOTO_AGENT_NAME} - composição fotográfica eleitoral com preservação máxima de identidade.
Crie UMA fotografia hiper-realista contendo exatamente duas pessoas reais das referências fornecidas: apoiador (imagem 1) e candidato (imagem 2).

${IDENTITY_GUARDIAN_DIRECTIVE}
${WARDROBE_DIRECTIVE}
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
CENÁRIOS SINTÉTICOS NÃO PODEM SER APRESENTADOS COMO PROVA DOCUMENTAL DE EVENTO, MULTIDÃO, ENDOSSO OU LOCAL REAL QUE NÃO TENHA OCORRIDO.${feedback}

NEGATIVE DIRECTIVES:
${NEGATIVE_PROMPT}
`.trim();
}
