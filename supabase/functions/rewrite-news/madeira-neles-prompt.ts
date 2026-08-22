// AGENTE MASTER: Gerador de Conteúdo Jurídico Viral "Madeira Neles"
// Módulo exclusivo para Repostagem Jornalística - Modo Viral Jurídico

export const MADEIRA_NELES_SYSTEM_PROMPT = `Você é um sistema especializado em transformar decisões judiciais em conteúdo de alto engajamento.`;

export const MADEIRA_NELES_JSON_INSTRUCTIONS = `
Retorne a resposta APENAS no formato JSON.
{
  "content": { "html": "..." },
  "seo": { "metaTitle": "...", "metaDescription": "..." }
}
`;

export function buildMadeiraNelessUserPrompt(request: {
  sourceUrl?: string;
  sourceContent: string;
  sourceName: string;
  keyword?: string;
  language?: string;
  internalLinks?: Array<{ anchor: string; url: string }>;
}): string {
  return `
IDIOMA: ${request.language || 'pt-BR'}
MODO: MADEIRA NELES - Conteúdo Viral Jurídico
NICHO: Advocacia / Jurídico (DNA "Madeira Sem Verniz")

═══ FONTE ORIGINAL ═══
Título/Veículo: ${request.sourceName}
URL: ${request.sourceUrl || 'Não informada'}
${request.keyword ? `Palavra-chave SEO principal: ${request.keyword}` : 'Palavra-chave SEO: EXTRAIR automaticamente do conteúdo'}

${request.internalLinks && request.internalLinks.length > 0 ? `
═══ LINKS INTERNOS OBRIGATÓRIOS — ZERO TOLERÂNCIA ═══
Inserir no MÍNIMO 4 e no MÁXIMO 10 dos links abaixo DENTRO do HTML do artigo.
Artigo SEM links internos <a href="..."> no HTML será REJEITADO.

${request.internalLinks.slice(0, 40).map((link, i) => `${i + 1}. "${link.anchor}" → ${link.url}`).join('\n')}

DISTRIBUIÇÃO: 1-2 na introdução, 4-6 no corpo, 1-2 na conclusão.
Formato: <a href="URL" target="_blank" rel="noopener noreferrer">texto âncora</a>
NUNCA usar "clique aqui". VARIE os textos âncora.
` : ''}

═══ CONTEÚDO ORIGINAL ═══
${request.sourceContent.substring(0, 6000)}${request.sourceContent.length > 6000 ? '... (truncado)' : ''}

═══ INSTRUÇÕES DE EXECUÇÃO ═══
1. Execute TODAS as 5 etapas do workflow automaticamente
2. Extraia DADOS ESTRUTURAIS completos (tribunal, instância, relator, partes, legislação)
3. Faça CATEGORIZAÇÃO TEMÁTICA (área do direito, sub-área, tese jurídica)
4. Analise o potencial viral (1-10) com todos os elementos e gatilhos
5. Extraia CONTEXTO NARRATIVO (resumo, pedido, fundamentos, resultado, impacto, precedente)
6. Selecione o ESTILO VISUAL mais adequado entre os 6 estilos
7. Gere 5 hooks diferentes com gatilhos variados e potencial de viralidade
8. Crie CONCEITO VISUAL COMPLETO com paleta de cores, composição, fontes, prompts Midjourney E DALL-E
9. Produza COPY COMPLETA do post com emojis, seções estruturadas, hashtags e CTA forte
10. Gere VARIAÇÕES: Stories (5 cards detalhados), Reels (script 60s com timestamps), Carrossel (10 slides completos)
11. Monte RESUMO EXECUTIVO com métricas esperadas e sugestões extras
12. Aplique tom "Madeira Sem Verniz" nível 8/10
13. Termine com "Madeira Neles! 🪵🔥" quando apropriado
14. RETORNE o JSON completo conforme especificado

═══ REGRAS INEGOCIÁVEIS ═══
- Informação jurídica CORRETA (não inventar dados)
- Linguagem SIMPLES e DIRETA (Flesch 70+)
- Lado do trabalhador/consumidor SEMPRE
- Anti-guru: nunca prometer o impossível
- Crédito à fonte obrigatório
- Mínimo 2.400 palavras no artigo HTML
- Meta-description: 145-160 caracteres
- LINKS INTERNOS: MÍNIMO 4, MÁXIMO 10 inseridos como <a href="..."> no HTML (OBRIGATÓRIO — artigo sem links internos é REJEITADO)
- LINKS EXTERNOS: MÍNIMO 2 para fontes oficiais (.gov, .edu, tribunais, portais jurídicos)
- 5 hooks obrigatórios com gatilhos diferentes
- Conceito visual com paleta hex e prompts para Midjourney + DALL-E
- Copy com TODAS as seções (hook, contexto, caso, decisão, impacto, afetados, ação, CTA)
- Stories: 5 cards com detalhes visuais (fundo, elementos, enquete)
- Reels: script com marcação de tempo a cada 3-8 segundos
- Carrossel: 10 slides com título e conteúdo detalhado
- Crédito: "Com informações de ${request.sourceName}${request.sourceUrl ? ` - ${request.sourceUrl}` : ''}"

⚠️ CHECKLIST FINAL ANTES DE ENTREGAR O JSON:
□ O campo "html" contém tags <a href="..."> de links internos? Se NÃO → ADICIONAR AGORA
□ Contagem de links internos ≥ 4? Se NÃO → ADICIONAR MAIS
□ Links externos para fontes oficiais presentes (mínimo 2)? Se NÃO → ADICIONAR

Retorne o resultado APENAS em formato JSON conforme especificado.`;
}
