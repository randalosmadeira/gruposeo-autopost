export const SUPPORTER_AVATAR_PROMPT_VERSION = 'supporter-avatar-human-v1.1.0';

export const SUPPORT_TEXTS = [
  'DR. MADEIRA 1470',
  'EU APOIO DR. MADEIRA 1470',
  'APOIO AO DR. MADEIRA 1470',
  'FEDERAL 1470',
  'MADEIRA NELES 1470',
] as const;

export const SUPPORT_STYLES = ['premium', 'clean', 'institucional', 'brasil', 'dark'] as const;

const styleDirections: Record<string, string> = {
  premium: 'fundo escuro premium, verde profundo, amarelo dourado e azul-marinho, luz editorial sofisticada, poucos elementos',
  clean: 'fundo limpo e minimalista, contraste alto, branding discreto, sem poluição visual',
  institucional: 'composição institucional, sóbria e profissional, geometria elegante e iluminação de estúdio',
  brasil: 'verde, amarelo e azul em pinceladas e luzes abstratas discretas, sem reproduzir documento oficial ou brasão',
  dark: 'fundo preto e grafite com detalhes verdes e dourados, acabamento fotográfico cinematográfico moderado',
};

export function buildSupporterAvatarPrompt(input: {
  supporterName?: string;
  supportText: string;
  style: string;
  socialHandles?: Record<string, string>;
}) {
  const style = styleDirections[input.style] || styleDirections.premium;
  const supportText = SUPPORT_TEXTS.includes(input.supportText as typeof SUPPORT_TEXTS[number])
    ? input.supportText
    : SUPPORT_TEXTS[0];

  return `
TAREFA: editar a fotografia real enviada pelo próprio apoiador e criar uma única arte final quadrada de apoio visual. Esta é uma edição da pessoa real da imagem de entrada, não a criação de uma pessoa nova.

PRIORIDADE ABSOLUTA - IDENTIDADE HUMANA E NATURALIDADE:
1. Preserve com prioridade máxima os traços faciais existentes na foto: formato e proporção do rosto, testa, sobrancelhas, distância e formato dos olhos, pálpebras, nariz, lábios, boca, mandíbula, queixo, orelhas, linha capilar, cabelo, barba/bigode, idade aparente e tom de pele.
2. Preserve assimetrias naturais, microtextura, poros, pequenas linhas de expressão e características humanas visíveis. Não transforme a face em um rosto genérico ou idealizado.
3. Não afine ou alargue rosto, não aumente olhos, não altere nariz, não altere formato da boca, não invente sorriso/dentes, não mude cor dos olhos, não rejuvenesça nem envelheça, não altere etnia, sexo/gênero ou compleição corporal.
4. Pele deve permanecer humana e fotográfica. Retocar apenas imperfeições temporárias de iluminação/ruído; nunca usar aparência de plástico, boneco, cera, CGI, ilustração ou filtro de beleza intenso.
5. Se houver cabelo, barba, óculos, roupa, joias ou acessórios na fonte, preserve-os salvo quando a remoção for indispensável para um recorte técnico solicitado. Não adicionar acessórios que não existem na imagem.
6. Não alterar pose corporal além do mínimo necessário para enquadramento quadrado. Não criar mãos, braços ou partes corporais fora da fotografia original se não forem necessárias.

FUNDO E COMPOSIÇÃO:
- Remover/adaptar o fundo original com recorte limpo, preservando cabelo e bordas naturais.
- Direção visual: ${style}.
- Criar profundidade suave e realista, sem halo artificial em torno da pessoa.
- A face deve ser o elemento dominante e permanecer legível mesmo em miniatura.
- Compor para recorte circular: manter olhos, nariz, boca e todo o contorno principal da cabeça dentro da zona central de aproximadamente 78% do quadro.
- Evitar elementos importantes nos cantos.

BRANDING:
- Inserir de forma compacta e legível: “${supportText}”.
- Dar destaque visual ao número 1470 sem cobrir rosto, pescoço ou olhos.
- Manter texto dentro da zona segura circular; preferir selo/faixa compacta na área inferior interna.
- Não inventar logos, brasões, números, nomes de partido ou slogans não fornecidos.
- O branding deve ter aparência geométrica limpa, equivalente a composição vetorial, mas a fotografia humana deve permanecer fotográfica e não ser convertida em ilustração vetorial.

ACABAMENTO:
- Fotorealismo alto, iluminação plausível, contraste controlado, cor de pele natural, nitidez realista.
- Preservar ruído fotográfico fino e textura de tecido quando existentes.
- Sem HDR exagerado, sem glow excessivo, sem bordas serrilhadas, sem artefatos, sem watermark, sem assinatura de IA.
- Não afirmar ou representar uma métrica biométrica de similaridade. O alvo operacional de fidelidade do sistema é 0,99, sujeito à validação visual da pessoa.

SAÍDA:
- Uma única arte final 1:1, master 1024x1024, preparada para uso manual pelo apoiador em redes sociais.
- Entregar somente a imagem final, sem variantes por plataforma, sem ZIP, sem mockup, sem moldura externa de dispositivo e sem explicações.
- A liberação para download deverá ocorrer somente depois da aprovação visual explícita do apoiador na aplicação.
`;
}

export const SUPPORTER_AVATAR_QA_PROMPT = `
Você é um revisor técnico de edição fotográfica. Compare a foto de referência e a imagem candidata sem tentar identificar a pessoa pelo nome. Avalie apenas características visuais e qualidade da edição.
Retorne JSON válido com:
- reference_index: índice recomendado da melhor referência quando houver várias imagens;
- technical_source_score: 0-100 para nitidez, iluminação, oclusão e utilidade da referência;
- facial_fidelity_score: 0-100 para preservação visual de formato do rosto, olhos, nariz, boca, mandíbula, cabelo/barba e idade aparente;
- human_texture_score: 0-100 para naturalidade de pele/cabelo/tecido;
- circular_crop_score: 0-100 para segurança em recorte circular;
- branding_legibility_score: 0-100;
- artifacts: lista objetiva de defeitos observados;
- pass: true somente se facial_fidelity_score >= 92, human_texture_score >= 92 e circular_crop_score >= 90.
Não faça inferências de raça, religião, saúde, personalidade, opinião política ou outros atributos sensíveis. Não identifique a pessoa.
`;
