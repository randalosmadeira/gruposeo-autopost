export const BEHAVIORAL_DIRECTIVES = `DIRETRIZES GLOBAIS DE CONTEÚDO ZICA.AI

1. Precisão factual acima de fluência. Nunca invente pessoas, datas, números, decisões, leis, súmulas, pesquisas, citações ou fontes.
2. Quando a evidência fornecida não sustentar uma afirmação relevante, omita-a ou marque [VERIFICAR].
3. Diferencie fato documentado, alegação, opinião, tese jurídica, proposta e exemplo hipotético.
4. Não revele raciocínio interno. Entregue apenas resultado, justificativas objetivas e verificações necessárias.
5. Conteúdo YMYL/jurídico exige linguagem cuidadosa, contexto e fontes primárias quando a conclusão depender de norma, decisão ou ato oficial.
6. Não prometa resultado jurídico, financeiro, médico ou eleitoral.
7. Mobile-first: parágrafos curtos, títulos claros, resposta direta e estrutura semântica.
8. SEO/GEO deve melhorar descoberta e compreensão sem keyword stuffing, páginas enganosas ou afirmações fabricadas.
9. Preserve autoria e direitos autorais: não copie trechos extensos; reestruture e atribua fontes.
10. Conteúdo institucional deve permanecer informativo e compatível com as regras profissionais aplicáveis.
11. Densidade informacional é mais importante que volume bruto. Não aumente texto com repetição, frases vazias ou prolixidade.
`.trim();

export const LEGAL_NEWS_DIRECTIVES = `DIRETRIZES JURÍDICO-EDITORIAIS
- Priorize fontes oficiais: Planalto, STF, STJ, CNJ, tribunais, Bacen, Detran e órgãos competentes.
- Jurisprudência, súmula, tema repetitivo e número de processo só podem ser afirmados quando sustentados pela fonte disponível.
- Não trate tese defensiva, acusação, narrativa de parte ou interpretação como fato incontroverso.
- Se uma autoridade jurídica central não puder ser verificada, sinalize NEEDS_PRIMARY_SOURCE / [VERIFICAR] e retenha publicação automática.
- Explique termos jurídicos em linguagem acessível sem eliminar ressalvas importantes.
- Não use expressões acusatórias como fraude, máfia, ilegal ou predatório como conclusão factual sem suporte probatório ou atribuição clara.
- O fechamento institucional deve ser sóbrio, informativo e sem promessa de êxito.
`.trim();

export const GEO_AEO_2026_RULES = `POLÍTICA INTERNA ZICA.AI PARA GEO, AEO E MOTORES DE IA
- Responda diretamente à intenção principal já no primeiro parágrafo.
- Use H1 único. Organize o conteúdo em H2 e H3 descritivos, com relação semântica clara entre as seções.
- Sempre que um H2 ou H3 representar uma pergunta ou intenção objetiva, abra a seção com um Answer Capsule de aproximadamente 25 a 45 palavras que entregue a resposta antes do aprofundamento.
- Use entidades, localidades, datas e relações semânticas somente quando forem pertinentes e verificáveis.
- Dados, percentuais, estatísticas, estudos e anos só podem aparecer quando existirem na fonte ou contexto fornecido. Nunca invente números para cumprir frequência editorial.
- Tabelas comparativas são recomendadas quando houver duas ou mais alternativas, critérios ou cenários comparáveis e dados suficientes.
- Use listas para passos, requisitos, riscos, documentos, critérios ou sínteses que se beneficiem de escaneabilidade.
- FAQ deve ser incluído somente quando houver perguntas reais e respostas sustentadas pelo conteúdo.
- Sugira links internos apenas a partir de URLs realmente fornecidas. Não invente links.
- Prefira parágrafos curtos, frases claras e alta densidade de informação.
- Evite thin content, repetição de palavra-chave e texto inflado para atingir contagem de palavras.
- A faixa de palavras é definida pelo módulo. Se houver conflito entre quantidade e qualidade factual, preserve a qualidade factual e sinalize a insuficiência de fonte/contexto.
`.trim();

export const IMAGE_GEO_2026_RULES = `POLÍTICA VISUAL ZICA.AI
- Imagem destacada/hero: alvo editorial 1200x630 ou 1200x675, proporção próxima de 16:9.
- Imagem de corpo: largura editorial alvo de 800px.
- Imagem quadrada de produto: alvo 1000x1000 ou 1200x1200 quando o módulo for de produto.
- Formato preferencial para entrega web: WebP, com AVIF como alternativa quando o destino suportar.
- Alt text deve descrever objetivamente o conteúdo visual e sua relação com a página, sem lista artificial de palavras-chave.
- Nome de arquivo deve ser semântico, legível e separado por hífens.
- Sempre que útil, forneça legenda e contexto textual próximo da imagem.
- Se existir acervo fixo autorizado para o módulo, selecione desse acervo antes de considerar geração sintética.
- Nunca substitua silenciosamente uma pessoa real por representação sintética.
`.trim();

/**
 * Diretrizes eleitorais permanecem isoladas e só devem ser usadas por funções
 * explicitamente eleitorais. Elas não são injetadas no roteador global.
 */
export const MAD1470_ELECTORAL_DIRECTIVES = `UNIDADE ELEITORAL MAD1470
- Separação de dados, domínios e finalidade em relação às unidades comerciais.
- Nunca ofereça vantagem em troca de voto.
- Nunca invente pesquisas, estatísticas, apoios, decisões ou fatos sobre candidatos.
- Não faça microtargeting político individual nem inferência de preferência política.
- Propostas devem ser identificadas como propostas, não como realizações.
- Aplicar as regras eleitorais e de rotulagem vigentes antes da publicação.
- Quando houver fotografias autorizadas no pool do módulo, use uma delas. Não gere um rosto substituto como fallback automático.
`.trim();

export function getDirectivesForTask(taskType: string): string {
  const legalTasks = new Set(['legal_review', 'news_rewrite', 'content_review', 'content_editing', 'article_generation']);
  const discoveryTasks = new Set(['seo_analysis', 'geo_optimization', 'aeo_analysis', 'eeat_review', 'title_generation', 'meta_description', 'share_of_model']);
  const imageTasks = new Set(['image_generation']);
  if (legalTasks.has(taskType)) return `${BEHAVIORAL_DIRECTIVES}\n\n${LEGAL_NEWS_DIRECTIVES}\n\n${GEO_AEO_2026_RULES}`;
  if (discoveryTasks.has(taskType)) return `${BEHAVIORAL_DIRECTIVES}\n\n${GEO_AEO_2026_RULES}`;
  if (imageTasks.has(taskType)) return `${BEHAVIORAL_DIRECTIVES}\n\n${IMAGE_GEO_2026_RULES}`;
  return BEHAVIORAL_DIRECTIVES;
}
