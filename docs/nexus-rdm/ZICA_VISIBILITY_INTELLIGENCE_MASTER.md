# Zica Visibility Intelligence (ZVI): metodologia, arquitetura e roadmap — 13/11/2026

Estado: **proposto**. Nada aqui está em produção. Meta do dono: o melhor sistema do mercado para medir, explicar e **aumentar** a visibilidade de marcas em buscadores e em IAs, para as empresas dele (piloto) e para clientes revendidos, com dashboards diários e **sem teto de escopo**. O concorrente de referência (Promptado) mede e mostra; nós **medimos, explicamos, agimos e comprovamos o efeito** no mesmo sistema.

## 1. Princípios
1. **Metodologia aberta e versionada.** Nota que o cliente não consegue auditar não vira confiança. Toda nota mostra a fórmula, o tamanho da amostra (n), o intervalo de confiança e a versão do método (`zvi-1`).
2. **Visibilidade ≠ resultado.** Mostramos as duas coisas lado a lado: o que as IAs dizem (visibilidade) e o que chegou de verdade (sessões e conversões do GA4, cliques do Search Console).
3. **Ciclo fechado.** Medir → achar a lacuna → gerar o conteúdo → publicar e indexar → medir de novo, com antes/depois.
4. **Dados do cliente são do cliente.** Isolamento por organização; o cliente vê os dados dele e faz solicitações; conexões, chaves, plugin e execução paga só pela conta de gerenciamento.
5. **Extensível por adaptadores.** Novo buscador, nova IA ou nova fonte de dados = um adaptador novo, sem reescrever o resto.
6. **Honestidade de dado.** Sem coleta, "não medido". Nada de número inventado ou preenchido.
7. **Conformidade como serviço, não como barreira.** Ver seção 7.

## 2. Metodologia Zica (v1: `zvi-1`)
Unidade de medida: **observação** = uma pergunta (prompt) × um motor × um mercado (país, idioma, cidade) × uma data × uma repetição. Mínimo de 3 repetições por pergunta e motor nas rodadas oficiais.

### 2.1 Indicadores de marca (por projeto, janela e filtro de motor/segmento/mercado)
| Indicador | Definição | Observação |
|---|---|---|
| **VR** Taxa de visibilidade | observações em que a marca é mencionada ÷ observações válidas | intervalo de Wilson 95%; "baixa confiança" se n < 30 |
| **CR** Taxa de citação | observações com URL da marca citada como fonte ÷ observações válidas | mede quem a IA **usa**, não só menciona |
| **PM** Posição de menção | ordem média em que a marca aparece na resposta (1 = primeira) entre as observações com menção | exige extração por modelo; "n/d" sem ela |
| **SoV** Participação de voz | menções da marca ÷ menções de todas as marcas rastreadas (própria + concorrentes cadastrados) | |
| **REP** Reputação | (menções positivas − negativas) ÷ menções classificadas × 100, faixa −100 a 100 | extração por modelo; "n/d" sem ela |
| **EST** Estabilidade | 1 − desvio padrão da taxa de menção entre repetições da mesma pergunta | 0 a 1; alta = resposta consistente |
| **TPC** Tempo até a 1ª citação | dias entre a publicação de um conteúdo e a 1ª observação que o cita | por conteúdo e mediana por projeto |

### 2.2 Índice composto
`ZVI = 100 × ( 0,35·VR + 0,25·CR + 0,15·SoV + 0,10·P + 0,10·R + 0,05·EST )`, onde `P = clip(1/PM, 0, 1)` e `R = (REP+100)/200`.
Componente indisponível: redistribuir seu peso entre os demais proporcionalmente e marcar o índice **"parcial"** com a lista do que faltou. Pesos são configuráveis por segmento pelo gestor, e a mudança gera nova versão (`zvi-1.1`). Mostrar sempre o índice com o intervalo (propagado por bootstrap das observações).

### 2.3 Índice de fonte (Zica Source Score, ZSS 0–100)
Para cada domínio citado: `ZSS = 100 × ( 0,40·Cobertura + 0,25·Posição + 0,20·Diversidade + 0,10·Recência + 0,05·Relevância )`
- Cobertura = perguntas do segmento em que a fonte aparece ÷ perguntas do segmento.
- Posição = média de 1/posição nas citações (normalizada 0–1).
- Diversidade = motores distintos que a citam ÷ motores ativos.
- Recência = decaimento exponencial com meia-vida de 30 dias sobre a última citação.
- Relevância = citações em temas-alvo do cliente ÷ citações totais da fonte.
Tipo da fonte: `orgao_oficial`, `portal_agregador`, `midia`, `escritorio`, `diretorio`, `rede_social`, `academico`, `outro`. Saída útil: **alvos de presença** (fontes com ZSS alto onde a marca ainda não aparece) e lista para assessoria de imprensa.

### 2.4 Camada de resultado real (separada do ZVI)
Sessões vindas de IA e de buscadores (GA4), conversões/eventos-chave por origem, cliques e impressões de consultas de marca (GSC), CTR e posição por página, receita ou leads atribuídos por área. Painel "Visibilidade → Resultado" correlaciona as duas séries no tempo, **sem afirmar causalidade**; quando houve publicação, mostra antes/depois com janela de comparação declarada.

### 2.5 Concorrentes
Cadastro por projeto (nome, domínios, tipo). Descoberta automática (F3 do agente de concorrência) sugere; o gestor aprova. Ranking por segmento com VR, SoV, ZSS dos domínios e n. Exigência de n ≥ 8 para ranquear.

## 3. Arquitetura em camadas
1. **Coleta:** agendador diário/semanal por conjunto de prompts; adaptadores por motor (ChatGPT, Gemini, Claude, Perplexity, Google AIO/SERP, Bing/Copilot manual, Brave, DataForSEO, SerpApi); mercados; repetições; fila com limite de custo e retentativa; cache por hash da pergunta/motor/mercado/dia.
2. **Extração:** uma passada barata de modelo, com saída estruturada (JSON validado): marcas citadas e ordem, sentimento por marca, fontes e URLs, ferramenta usada pela IA (web, base interna), intenção. Guarda a resposta exata, o prompt e a versão do extrator (reprodutível). Fallback determinístico (regex de marcas cadastradas) quando o modelo não está liberado.
3. **Medição:** funções puras e testadas que implementam a seção 2, sem acesso à rede.
4. **Explicação:** "por que perdemos": perguntas em que a marca não aparece, quem aparece, qual fonte a IA usou, o que a página vencedora tem (schema, tamanho, estrutura, autor). Vem do dossiê dos concorrentes.
5. **Ação:** oportunidades priorizadas (impacto × esforço) viram briefs; o gerador em massa existente produz, publica, indexa (IndexNow) e registra a data para o TPC e o antes/depois.
6. **Relatório e alerta:** painel diário, resumo por e-mail e WhatsApp, PDF white-label, alertas (queda de visibilidade, concorrente ultrapassou, nova fonte citando, conteúdo citado pela 1ª vez, coleta falhou, orçamento).
7. **Multi-cliente:** organizações, papéis, convites, visão de agência (rollup de todos os clientes), white-label (nome, logo, cores, domínio), API pública e webhooks por cliente, exportação CSV/JSON.
8. **Agentes:** agentes de análise, de redação e de monitoramento com níveis de aprovação (apenas sugerir; executar com aprovação; executar dentro de limites). Cada ação registrada e reversível.

## 4. Interface (cliente e gestor)
Princípio: o cliente abre e em 5 segundos sabe se está melhorando. Linguagem simples, tema claro/escuro, rápida, mobile primeiro, sem jargão técnico no cliente.
| Página | Conteúdo |
|---|---|
| **Painel** | 3 números grandes (ZVI, visibilidade, sessões de IA) com variação e mini-gráfico, "o que mudou hoje", próximas ações |
| **IAs e buscadores** | visibilidade e citação por motor, evolução, comparação de períodos |
| **Concorrentes** | ranking com %, SoV, quem ultrapassou quem, por segmento |
| **Fontes** | domínios com ZSS, tipo, quantas IAs citam, alvos de presença |
| **Perguntas** | tabela com segmento, visibilidade, posição, histórico dia a dia e a **resposta exata** de cada IA |
| **Áreas e segmentos** | desempenho por área do direito (ou por categoria do cliente) |
| **Tráfego real** | GSC + GA4: cliques, impressões, sessões, conversões, tráfego de IA |
| **Conteúdo** | melhores páginas por área, TPC, o que une as vencedoras |
| **Oportunidades** | lista priorizada com "gerar conteúdo" e "solicitar ao gestor" |
| **Relatórios** | diário, semanal, mensal; PDF white-label |
| **Solicitações** | pedidos do cliente ao gestor (conectar fonte, plugin, nova rodada) |
Gestor, além disso: conexões e chaves, execução paga e orçamento, saúde das fontes, auditoria, caixa de solicitações, rollup de clientes.

## 5. Onde estamos atrás hoje e como passamos à frente
| Lacuna | Solução | Bloco |
|---|---|---|
| Coleta diária automática | agendador + adaptadores + custo | V2 |
| Sentimento, posição, marcas por resposta | extração estruturada por modelo | V2 |
| Tela de fontes com nota | ZSS + página Fontes (dados que já temos) | V1 |
| Histórico por pergunta com resposta | RPC + página Perguntas | V1 |
| Concorrentes cadastrados e ranking | cadastro + SoV + ranking | V1 |
| Keywords extraídas dos prompts | extração + página | V1 |
| Interface polida | Painel e páginas da seção 4 | V1, V4 |
| Recomendações e coworker IA | oportunidades + agentes | V3, V6 |
| Escala multi-cliente | rollup, white-label, API | V4 |
**Onde já estamos à frente e vamos ampliar:** produção+publicação+indexação no mesmo sistema (ciclo fechado e experimentos A/B), dados reais GSC+Bing+GA4 (visibilidade → resultado), tráfego de IA por sinais, controle de custo por organização, índice aberto e versionado, descoberta de concorrentes e de prompts a partir do Search Console, mapa de fontes para assessoria de imprensa, benchmarks entre segmentos (agregados e anonimizados, só com consentimento).

## 6. Roadmap em blocos
- **V0 Conformidade configurável (aviso, não bloqueio).** `organizations.settings.compliance_mode = off | advisory | strict`, padrão `advisory`; os portões atuais de publicação passam a respeitar o modo; mostrar aviso com explicação, nunca esconder o motivo.
- **V1 Visibilidade (sem custo, com os dados atuais).** Motor de métricas (seção 2) em funções puras com testes; RPCs de fontes, concorrentes, histórico por pergunta e keywords; página **Visibilidade** polida; cadastro de concorrentes. Dados: `nexus_citations` (89), `nexus_competitor_mentions` (37), observações atuais.
- **V2 Coleta e extração (precisa de chaves e orçamento).** Agendador, adaptadores, repetições, extração por modelo, custos e alertas.
- **V3 Ciclo fechado.** Oportunidades → briefs → geração → publicação/indexação → antes/depois e experimentos.
- **V4 Multi-cliente.** Rollup de agência, white-label, relatórios por e-mail/WhatsApp/PDF, API pública e webhooks, convites e papéis, solicitações com fluxo completo.
- **V5 Descoberta e benchmark.** Prompts e concorrentes automáticos (GSC, People Also Ask, autocomplete), mapa de PR, benchmark anonimizado.
- **V6 Agentes autônomos** com níveis de aprovação.
O GA4 e o plano de gerenciamento (já em construção) são a base de V1, V4 e da camada de resultado.

## 7. Conformidade (OAB) sem travar o negócio
O Provimento 205/2021 é norma do Conselho Federal da OAB; vincula o advogado, e a responsabilidade por descumprir é dele. O sistema trata como **assistência, não como bloqueio**:
- `off`: nenhum aviso (para clientes que não são escritórios).
- `advisory` (padrão): verifica títulos, textos e anúncios, **avisa e explica** (promessa de resultado, superlativo, comparação, urgência comercial, apelo a desespero) e permite publicar com um clique de "ciente"; registra a decisão e quem decidiu.
- `strict`: só se o escritório escolher; exige correção ou justificativa antes de publicar.
O gestor define o modo por organização; o cliente vê o aviso e a explicação, nunca uma parede sem saída.

## 8. Pontos abertos para o dono
1. Nome comercial dos índices (sugestão: Zica Visibility Index e Zica Source Score).
2. Confirmar o padrão `advisory` da conformidade.
3. Escolha de provedores e orçamento mensal para V2.
4. Quais clientes entram primeiro no painel (as empresas próprias servem de piloto).
