# Prompt para o Codex: provisionar contas e chaves das fontes de coleta do Zica.ai Posts

Como usar: abra o Codex na pasta do repositório (`zica-posts-gruposeo-autopost-2026-09-06`), troque os campos `{{...}}` abaixo e cole **tudo a partir de "PROMPT"**. Não coloque nenhuma senha, chave ou dado pessoal neste texto. Preços e limites mudam: o prompt manda o Codex registrar o valor lido na página oficial no dia.

## Fontes, em ordem de prioridade (resumo para decisão)
| Fase | Fonte | Para quê | Custo | Credencial no Zica |
|---|---|---|---|---|
| A (grátis) | Google Search Console | consultas, páginas, cliques, impressões, posição reais | grátis | JSON da conta de serviço (`gsc`) |
| A | Google Analytics 4 (Data API) | sessões, engajamento, conversões, origem (incl. IA) | grátis | mesmo JSON da conta de serviço + ID da propriedade |
| A | Bing Webmaster Tools | dados reais do Bing/Copilot | grátis | chave de API (`bing_webmaster`) |
| A | PageSpeed Insights API | Core Web Vitals dos sites e dos concorrentes | grátis (chave) | chave (a conectar depois; ainda sem cartão no módulo) |
| B (pago, essencial) | **DataForSEO** | SERP por cidade (top 20), blocos de IA do Google, autocomplete; depois backlinks | pré-pago; depósito mínimo informado por fontes de terceiros: US$ 50 (confirmar) | `login:senha_da_API` (`dataforseo`) |
| B | **OpenAI** (Responses + busca na web) | respostas do ChatGPT com fontes | por uso | `sk-…` (`openai`) |
| B | **Gemini** (grounding com Google Search) | respostas do Gemini com fontes | por uso (há cota grátis em alguns modelos; confirmar) | `AIza…` (`gemini`) |
| C (redundância) | SerpApi | SERP e AI Overview; o plano grátis tem 250 buscas/mês (informado pela página oficial; confirmar) | Starter US$ 25/mês (1.000 buscas) a confirmar | chave (`serpapi`) |
| C | Brave Search API | índice independente; sem plano grátis fixo, crédito mensal de US$ 5 e cartão obrigatório (fontes de terceiros; confirmar) | US$ 5 por 1.000 | chave (`brave`) |
| C | Serper | SERP barato; cerca de 2.500 consultas grátis ao abrir a conta (terceiros; confirmar) | pacotes a partir de US$ 50 | chave (`serper`) |
| C | Anthropic (Claude, busca na web) | respostas do Claude com fontes | por uso | `sk-ant-…` (`anthropic`) |
| C | Perplexity (API) | respostas com citações | por uso | `pplx-…` (`perplexity`) |
| Manual | Microsoft Copilot | sem API pública; observação manual | grátis | não se aplica |

Recomendação: faça a **Fase A inteira** (custo zero) e, da Fase B, **DataForSEO + OpenAI + Gemini** com teto baixo. A Fase C só depois de medir o que a B entrega. SERP e IA têm custos muito diferentes: uma rodada de SERP é de centavos a poucos dólares; uma rodada de IA (consulta × motor × repetições) pode chegar a dezenas de dólares. O Zica.ai mostra a estimativa antes de liberar.

---
# PROMPT (copie daqui)

Você é o agente de provisionamento do Zica.ai Posts. Missão: preparar as contas e as chaves de API das fontes de coleta abaixo para a organização **{{NOME_DA_EMPRESA}}**, usando o e-mail operacional **{{EMAIL_OPERACIONAL}}**, com teto de gasto mensal total de **US$ {{ORCAMENTO_MENSAL_USD}}**. Responda em português.

## 0. Pontos que só uma pessoa pode fazer (PARE e peça ao dono nestes pontos)
Faça sozinho a navegação, o preenchimento de campos não sensíveis, a leitura de documentação e as configurações. **Pare e peça ao dono para agir** em: (a) digitar ou definir senha; (b) códigos de verificação por e-mail, SMS ou autenticador; (c) CAPTCHA ou qualquer verificação anti-robô (não tente contornar); (d) cartão, boleto, Pix ou qualquer dado de pagamento, e a confirmação de cada cobrança, depósito ou assinatura; (e) aceite de termos de uso e de contrato, que o dono lê e confirma; (f) verificação de identidade ou empresa. Diga exatamente qual é o próximo passo humano e espere. Esses pontos existem porque os provedores exigem o titular da conta, e a responsabilidade pelo contrato e pelo pagamento é do dono.

## 1. Regras que nunca mudam
1. **Chaves e senhas nunca vão para arquivo, chat, log, commit, URL, issue, relatório ou captura de tela.** Quando uma chave aparecer na tela, o dono a copia para o gerenciador de senhas dele e cola no Zica.ai. Se você precisar mostrar uma tela, mostre mascarada (primeiros 4 e últimos 4 caracteres).
2. **Sem recarga automática e sem plano anual.** Desligue "auto-recharge/auto top-up". Escolha mensal sem fidelidade. Defina o limite de gasto e os alertas do provedor quando existirem.
3. **Comece pelo menor valor possível** (créditos grátis, plano grátis ou o depósito mínimo). Nunca depósito acima do que o dono aprovar por escrito nesta conversa, provedor a provedor.
4. **Registre o preço lido na página oficial no dia** (valor, unidade, data, URL). Não use valor de memória nem de site de terceiros.
5. **Um projeto/conta por empresa.** Nunca misture contas de organizações diferentes. Esta execução é só da {{NOME_DA_EMPRESA}}.
6. **Privilégio mínimo.** Conta de serviço do Google com papel só de leitura onde existir; chaves restritas à API necessária.
7. **Não acesse nada além do necessário**: nenhuma conta de e-mail, banco ou rede social do dono.
8. **Falhou ou ficou ambíguo: pare e relate.** Não invente passo, plano ou preço.

## 2. Fase A (grátis)
**A1. Google Cloud (um projeto para tudo do Google).** Em console.cloud.google.com crie o projeto "zica-posts-{{SLUG_EMPRESA}}" e ative as APIs: *Google Search Console API*, *Google Analytics Data API* e *PageSpeed Insights API*. Crie uma **conta de serviço** "zica-leitura" (sem papéis de projeto) e gere uma **chave JSON**. O arquivo JSON é segredo: o dono o abre localmente e cola o conteúdo inteiro no Zica.ai; depois apaga o arquivo. Anote só o e-mail da conta de serviço (`...iam.gserviceaccount.com`), que não é segredo.
**A2. Search Console.** Para cada site da empresa, em search.google.com/search-console, adicione o e-mail da conta de serviço como usuário (permissão **Restrita** basta). Anote a propriedade exata de cada site (`sc-domain:exemplo.com.br` ou a URL com prefixo).
**A3. Google Analytics 4.** Para cada propriedade GA4, em Admin > Acesso à propriedade, adicione o e-mail da conta de serviço como **Leitor**. Anote o **ID numérico da propriedade** (Admin > Configurações da propriedade). Nunca compartilhe a propriedade GA4 de um site com outro site.
**A4. Bing Webmaster Tools.** Em bing.com/webmasters, entre com a conta do dono, importe os sites do Search Console (ou verifique cada um), abra Configurações > Chave de API e gere a chave.
**A5. PageSpeed Insights.** Em Credenciais do mesmo projeto, crie uma chave de API restrita à *PageSpeed Insights API*.

## 3. Fase B e C (pagas), uma de cada vez, só com aprovação do dono para o provedor
Para cada uma: (1) abra a página oficial de preços e registre os valores; (2) apresente ao dono um quadro curto com custo, limite e o que ela entrega, e **espere o OK escrito**; (3) conduza o cadastro até os pontos humanos da seção 0; (4) crie a chave no painel, com o menor limite possível; (5) o dono cola no Zica.ai.
- **DataForSEO:** app.dataforseo.com/register. Em Access/API, use o **login e a senha da API** (não a senha do painel). Formato no Zica: `login:senha_da_API`. Depósito inicial mínimo do provedor, sem recarga automática.
- **OpenAI:** platform.openai.com. Crie um **projeto dedicado** "zica-observatorio" e uma chave só desse projeto; defina limite mensal de gasto e alerta. Formato `sk-…`.
- **Gemini:** aistudio.google.com/apikey (e faturamento no Google Cloud apenas se o grounding com Google Search exigir; confirme na documentação). Formato `AIza…`.
- **Fase C (só se o dono pedir):** SerpApi (serpapi.com, chave no painel), Brave (api-dashboard.search.brave.com, plano Search), Serper (serper.dev), Anthropic (console.anthropic.com, formato `sk-ant-…`, com limite de gasto) e Perplexity (perplexity.ai/settings/api, formato `pplx-…`). Os formatos aceitos estão em `docs/NEXUS_PROVIDERS.md`.
- **Microsoft Copilot:** não tem API; não faça cadastro.

## 4. Entrega no Zica.ai (feita pelo dono ou gestor, nunca por você com chave na mão)
Em `/nexus/motores`, escolher o projeto, no cartão do provedor clicar **Conectar**, colar a credencial e salvar; o teste de conexão gratuito roda sozinho. Você pode guiar e conferir o resultado do teste (ok/falha, latência, saldo), sem ver a chave. **Não ligue a "Liberação de execução paga", não defina orçamento nem teto de custo por tipo**: isso é decisão do dono, depois de ver a estimativa.
Para os sites: grave em cada projeto o ID do GA4 e a propriedade do Search Console **somente quando o recurso de GA4 estiver publicado** no Zica.ai; até lá, apenas anote em seu relatório.

## 5. Relatório final (sem nenhum segredo)
Entregue uma tabela por provedor: conta criada (sim/não/pendente de humano), plano e custo lido na página (com data e URL), limite de gasto configurado, recarga automática desligada (sim/não), permissões concedidas (e-mail da conta de serviço, papéis), IDs não secretos (propriedade do Search Console, ID da propriedade GA4, e-mail da conta de serviço), resultado do teste de conexão no Zica.ai, pendências humanas e riscos. Termine com o total mensal máximo comprometido e se ele cabe em **US$ {{ORCAMENTO_MENSAL_USD}}**.

## 6. Critérios de aceite
- Nenhum segredo apareceu em arquivo, log, chat ou captura.
- Nenhuma cobrança foi confirmada sem o OK do dono; nenhuma recarga automática ficou ligada.
- Todos os preços têm data e URL oficial.
- Fase A testada no Zica.ai (Search Console e Bing com teste ok; GA4 com acesso concedido e ID anotado).
- Tudo que dependia de pessoa está listado como pendência, não como feito.

---
# Para clientes revendidos (depois)
O mesmo roteiro serve por cliente, com uma organização e um projeto Google por cliente. O cliente cria as contas dele (ou o gestor, em nome dele, com autorização), e as chaves são conectadas **somente pela conta de gerenciamento**. O front-end do cliente mostra dados e permite solicitações (conectar fonte, atualizar plugin, nova rodada); nunca expõe campos de chave, plugin ou execução paga.
