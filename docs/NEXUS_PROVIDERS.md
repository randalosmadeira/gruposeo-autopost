# NEXUS · Motores & APIs: guia de conexão, segurança e auditoria

Guia para o dono do escritório, sem linguagem técnica desnecessária. Descreve o módulo `/nexus/motores` do Zica.ai: como conectar cada serviço de dados, como testar, quanto pode custar, como ler os painéis e como o sistema se vigia sozinho.

Fatos verificados em 12/11/2026. Todo preço, plano ou limite citado aqui é **valor de referência — confirmar no site do provedor**, porque esses números mudam sem aviso.

## Sumário

1. Visão geral e arquitetura
2. Tabela dos provedores
3. Passo a passo por provedor
4. Ativação dos gratuitos (Google Search Console e Bing)
5. Segurança
6. Como ler status, pontuação e qualidade
7. Auditoria contínua
8. Checklist de ativação em ordem e rollback
9. Operação
10. Compliance (Provimento 205/2021 da OAB)

---

## 1. Visão geral e arquitetura

O módulo reúne, em uma tela só, **10 provedores de API e 1 fonte manual (Copilot)**. Para cada um você vê: link para contratar, documentação, se a conexão está funcionando, a qualidade da conexão, o custo e o uso. Você também controla o orçamento e a liberação de qualquer chamada paga.

Três ideias para guardar:

- **Os dados gratuitos são os mais valiosos.** Google Search Console e Bing Webmaster mostram o que realmente aconteceu no seu site (cliques, impressões, posição média, consultas, páginas). Comece por eles.
- **Nada que custa dinheiro roda sozinho.** A execução paga vem desligada, com orçamento zero. Só você liga, com um painel e uma palavra de confirmação.
- **O sistema se vigia.** Uma auditoria roda a cada 15 minutos usando apenas verificações gratuitas e avisa quando algo quebra, vai quebrar ou pode ser melhorado.

### Fluxo

```
  Você cola a credencial no Zica.ai (Conectar / Trocar chave)
            |
            v
  Validação de formato no servidor  --(formato errado)--> erro explicativo
            |
            v
  Vault (cofre criptografado): o servidor guarda a chave;
  a tela só mostra "...últimos 4 caracteres"
            |
            v
  Teste de saúde (gratuito, com URLs fixas do próprio sistema)
  -> registra sucesso/falha, latência, quota e custo
            |
            v
  Coleta
  - gratuitos (GSC, Bing): sincronização automática de tráfego real
  - pagos (SERP, IAs): só com execução liberada + orçamento + provedor habilitado
            |
            v
  Painel (/nexus/motores)
  - faixa de saúde, cartões por provedor, aba de tráfego orgânico
  - atualização em tempo real (reserva: consulta a cada 60 s)
            |
            v
  Auditoria contínua (a cada 15 min, só leituras e testes gratuitos)
  -> achados corretivos, preventivos e de melhoria, com correção de 1 clique quando seguro
```

### Onde fica cada coisa

- Tela: `/nexus/motores`, item de menu "NEXUS · Motores & APIs", logo após "NEXUS · Observatório".
- No topo há um seletor de projeto. Os dados mostrados são os da **organização do projeto escolhido**; confira sempre qual projeto está ativo antes de conectar uma chave.
- Abas por categoria: Verdade dos buscadores, Posições e SERP, Citações em IAs, Manual; mais as abas de tráfego orgânico (Google Search Console) e Saúde do sistema.

---

## 2. Tabela dos provedores

Categorias: **Verdade dos buscadores** (grátis, dados reais de tráfego), **Posições e SERP**, **Citações em IAs** e **Manual**.

Valores de referência — confirmar no site do provedor.

| Id | Provedor | Categoria | Credencial | Contratar | Documentação | Custo/limites de referência |
|---|---|---|---|---|---|---|
| `gsc` | Google Search Console API | Verdade dos buscadores | JSON de conta de serviço | [Search Console](https://search.google.com/search-console) | [Search Analytics: query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query) · [Ativar a API](https://console.cloud.google.com/apis/library/searchconsole.googleapis.com) | Grátis; país nativo |
| `bing_webmaster` | Bing Webmaster Tools API | Verdade dos buscadores | Chave de API (texto) | [Bing Webmaster](https://www.bing.com/webmasters) | [Acesso à API](https://learn.microsoft.com/en-us/bingwebmaster/getting-access) | Grátis; a API já teve instabilidades |
| `serper` | Serper | Posições e SERP | Chave (texto) | [serper.dev](https://serper.dev) | [serper.dev](https://serper.dev) | ~US$ 0,001 a 0,003 por consulta |
| `dataforseo` | DataForSEO SERP API | Posições e SERP | `login:senha_da_API` | [Cadastro](https://app.dataforseo.com/register) | [user_data](https://docs.dataforseo.com/v3/appendix/user_data/) | ~US$ 0,002 a 0,006 por consulta |
| `serpapi` | SerpApi | Posições e SERP | Chave (texto) | [Cadastro](https://serpapi.com/users/sign_up) | [Account API](https://serpapi.com/account-api) | A partir de ~US$ 0,01 por consulta |
| `brave` | Brave Search API | Posições e SERP | Token (texto) | [Painel Brave](https://api-dashboard.search.brave.com) | [Documentação](https://api-dashboard.search.brave.com/documentation) · [Limites](https://api-dashboard.search.brave.com/documentation/guides/rate-limiting) | Cobrança por crédito (ver capítulo 3) |
| `openai` | OpenAI Responses + web_search | Citações em IAs | Chave `sk-...` | [Chaves](https://platform.openai.com/api-keys) | [Models list](https://platform.openai.com/docs/api-reference/models/list) | Tokens + busca (~US$ 0,01 a 0,03 por resposta com modelo mini) |
| `gemini` | Gemini API + Grounding com Google Search | Citações em IAs | Chave `AIza...` | [AI Studio](https://aistudio.google.com/apikey) | [Grounding](https://ai.google.dev/gemini-api/docs/google-search) | Gemini 2.5: ~US$ 35 por mil prompts com grounding |
| `anthropic` | Anthropic Messages + web_search | Citações em IAs | Chave `sk-ant-...` | [Chaves](https://platform.claude.com/settings/keys) | [Models list](https://platform.claude.com/docs/en/api/models/list) | US$ 10 por mil buscas + tokens |
| `perplexity` | Perplexity Search API | Citações em IAs | Chave `pplx-...` | [Chaves](https://www.perplexity.ai/account/api/keys) | [Documentação](https://docs.perplexity.ai/) | ~US$ 5 por mil buscas |
| `copilot` | Microsoft Copilot (manual) | Manual | Não há (sem API pública de chat) | [Bing Webmaster](https://www.bing.com/webmasters) | [Acesso à API](https://learn.microsoft.com/en-us/bingwebmaster/getting-access) | Observação manual pelo Observatório |

### Teste de saúde de cada provedor

O teste usa sempre endereços fixos, definidos no sistema. Nunca é possível mandar o teste para outro endereço.

| Provedor | O que o teste faz | Custo do teste |
|---|---|---|
| `gsc` | Troca a chave da conta de serviço por um token em [oauth2.googleapis.com/token](https://oauth2.googleapis.com/token) e lista as propriedades em [webmasters/v3/sites](https://www.googleapis.com/webmasters/v3/sites) | Grátis |
| `bing_webmaster` | Consulta [GetUserSites](https://ssl.bing.com/webmaster/api.svc/json/GetUserSites) com a chave; a resposta vem no campo `d` | Grátis |
| `serper` | Faz 1 busca em [google.serper.dev/search](https://google.serper.dev/search) | **Com custo** (1 crédito, ~US$ 0,001); pede confirmação |
| `dataforseo` | Consulta [user_data](https://api.dataforseo.com/v3/appendix/user_data); devolve saldo e limites | Grátis |
| `serpapi` | Consulta [account.json](https://serpapi.com/account.json); devolve plano e buscas restantes | Grátis |
| `brave` | Faz 1 requisição em [web/search](https://api.search.brave.com/res/v1/web/search) e lê os cabeçalhos `X-RateLimit-*` | **Com custo** (1 requisição); pede confirmação |
| `openai` | Lista modelos em [v1/models](https://api.openai.com/v1/models) | Grátis |
| `gemini` | Lista 1 modelo em [v1beta/models](https://generativelanguage.googleapis.com/v1beta/models?pageSize=1) | Grátis |
| `anthropic` | Lista 1 modelo em [v1/models](https://api.anthropic.com/v1/models?limit=1) | Grátis |
| `perplexity` | Faz 1 busca em [api.perplexity.ai/search](https://api.perplexity.ai/search) | **Com custo** (~US$ 0,005); pede confirmação |
| `copilot` | Não há teste | Não se aplica |

---

## 3. Passo a passo por provedor

Em todos os casos, "colar no Zica.ai" significa: abrir `/nexus/motores`, escolher o projeto, localizar o cartão do provedor e clicar em **Conectar** (ou **Trocar chave**). Cole a credencial no campo de senha e salve. Para provedores com teste gratuito, o resultado aparece logo após salvar.

Formato aceito de cada credencial (o servidor recusa com `secret_format_invalid` e uma dica se estiver errado; tamanho total máximo de 4096 caracteres):

| Provedor | Formato |
|---|---|
| `openai` | Começa com `sk-` |
| `anthropic` | Começa com `sk-ant-` |
| `gemini` | Começa com `AIza` |
| `perplexity` | Começa com `pplx-` |
| `serper`, `serpapi`, `bing_webmaster`, `brave` | 16 a 200 caracteres, apenas letras, números, `_` e `-` |
| `dataforseo` | Exatamente um `:`, com login e senha não vazios (`login:senha_da_API`) |
| `gsc` | JSON válido com `type` igual a `service_account`, `client_email` e `private_key` começando em `-----BEGIN PRIVATE KEY-----` |

Erros comuns que valem para todos:

- `secret_format_invalid`: a credencial não tem o formato da tabela acima. Costuma ser espaço sobrando no começo ou no fim, ou chave de outro serviço.
- Erro 401 ou 403 no teste: a chave está errada, expirada, revogada ou sem permissão. O sistema marca a credencial como inválida. Gere uma chave nova no provedor e use **Trocar chave**.
- Teste demorou mais de 15 segundos: o teste é interrompido e registrado como falha. Tente de novo em alguns minutos.
- "Confirmação de custo necessária" (`cost_confirmation_required`): o teste desse provedor consome crédito; confirme o diálogo ou teste só quando quiser.

### 3.1 Google Search Console (`gsc`)

O passo a passo completo está no **capítulo 4**. Resumo:

- **Criar conta:** conta Google que já administra o site em [Search Console](https://search.google.com/search-console).
- **Credencial:** arquivo JSON de uma conta de serviço do Google Cloud.
- **O teste faz:** troca a chave por um token e lista suas propriedades (grátis).
- **Permissões e limites:** o e-mail da conta de serviço precisa estar cadastrado na propriedade. A sincronização lê até 25 000 linhas por consulta, no máximo 5 consultas por vez.
- **Custo:** grátis.
- **Erros comuns:** `gsc_not_configured` (nenhuma credencial guardada), `gsc_forbidden` (a conta de serviço não foi adicionada à propriedade), `gsc_unreachable` (Google fora do ar ou sem resposta).
- **Documentação:** [Search Analytics: query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query).

### 3.2 Bing Webmaster Tools (`bing_webmaster`)

O passo a passo completo está no **capítulo 4**. Resumo:

- **Criar conta:** entre em [Bing Webmaster](https://www.bing.com/webmasters) e cadastre/verifique o site.
- **Credencial:** chave de API em Configurações, Acesso à API. Veja a [documentação](https://learn.microsoft.com/en-us/bingwebmaster/getting-access).
- **O teste faz:** consulta a lista de sites da conta ([GetUserSites](https://ssl.bing.com/webmaster/api.svc/json/GetUserSites)); grátis.
- **Permissões e limites:** os dados do Bing não trazem país nem dispositivo (ficam em branco).
- **Custo:** grátis.
- **Erros comuns:** `bing_unreachable` (a API do Bing já teve instabilidades; o sistema tenta de novo uma vez antes de desistir). Se persistir, aguarde e teste depois.

### 3.3 Serper (`serper`)

1. **Criar conta:** em [serper.dev](https://serper.dev).
2. **Obter credencial:** copie a chave de API do painel da conta.
3. **Colar no Zica.ai:** **Conectar** no cartão Serper.
4. **O que o teste faz:** uma busca real em [google.serper.dev/search](https://google.serper.dev/search) com a consulta de teste "zica health", 1 resultado, enviando a chave no cabeçalho `X-API-KEY`.
   **Atenção: não existe endpoint gratuito para validar a chave do Serper.** Por isso o teste **consome 1 crédito (cerca de US$ 0,001)** e só roda depois de você confirmar o diálogo de custo. Salvar a chave não dispara o teste sozinho.
5. **Permissões e limites:** aceita parâmetros de país (`gl`), idioma (`hl`) e localização (`location`).
6. **Custo de referência:** ~US$ 0,001 a 0,003 por consulta. Valores de referência — confirmar no site do provedor.
7. **Erros comuns:** 401/403 (chave errada ou sem créditos: confira o saldo no painel); formato inválido (use 16 a 200 caracteres sem espaços).

### 3.4 DataForSEO (`dataforseo`)

1. **Criar conta:** em [app.dataforseo.com/register](https://app.dataforseo.com/register).
2. **Obter credencial:** use o **login** e a **senha da API** (não é necessariamente a senha do site). Veja a [documentação](https://docs.dataforseo.com/v3/appendix/user_data/).
3. **Colar no Zica.ai:** no formato `login:senha_da_API`, com um único dois-pontos. Exemplo de formato: `COLE_AQUI:COLE_AQUI` (login, dois-pontos, senha da API).
4. **O que o teste faz:** consulta [user_data](https://api.dataforseo.com/v3/appendix/user_data) com autenticação Basic; devolve saldo e limites. Grátis.
5. **Permissões e limites:** coleta Google (inclusive AI Overview) e Bing. Usa `location_code` e `language_code`. Países aceitos pelo Zica.ai: BR, US, PT, ES, IT, FR, GB, DE, AR, MX, CA, CL, CO, UY; fora dessa lista o erro é `country_unsupported`.
6. **Custo de referência:** ~US$ 0,002 a 0,006 por consulta. Valores de referência — confirmar no site do provedor.
7. **Erros comuns:** formato sem `:` ou com login/senha vazios; credencial do painel confundida com a da API; saldo zerado (o teste mostra o saldo); `country_unsupported`.

### 3.5 SerpApi (`serpapi`)

1. **Criar conta:** em [serpapi.com/users/sign_up](https://serpapi.com/users/sign_up).
2. **Obter credencial:** a chave de API fica na conta; veja a [Account API](https://serpapi.com/account-api).
3. **Colar no Zica.ai:** **Conectar** no cartão SerpApi.
4. **O que o teste faz:** consulta [account.json](https://serpapi.com/account.json) e mostra plano e buscas restantes. Grátis.
5. **Permissões e limites:** parâmetros `gl`, `hl`, `location`; bom para pacote local e Maps. Cobre Google e Bing (o Bing usa `cc` no lugar de `gl`).
6. **Custo de referência:** a partir de ~US$ 0,01 por consulta. Valores de referência — confirmar no site do provedor.
7. **Erros comuns:** 401/403 (chave errada); buscas restantes em zero (o cartão mostra a quota baixa e a auditoria avisa).

### 3.6 Brave Search API (`brave`)

> **Mudança em 2026:** o plano gratuito fixo de 2 mil consultas por mês foi substituído por **cobrança por crédito, na ordem de US$ 5 por mil requisições, com crédito mensal incluído**. O valor exato deve ser conferido no site do provedor antes de contratar. Valores de referência — confirmar no site do provedor.

1. **Criar conta:** no [Painel Brave](https://api-dashboard.search.brave.com).
2. **Obter credencial:** gere um token de assinatura no painel. Veja a [documentação](https://api-dashboard.search.brave.com/documentation).
3. **Colar no Zica.ai:** **Conectar** no cartão Brave.
4. **O que o teste faz:** 1 requisição em [web/search](https://api.search.brave.com/res/v1/web/search) (consulta "zica", 1 resultado), com o token no cabeçalho `X-Subscription-Token`, e lê os cabeçalhos `X-RateLimit-*` para mostrar o que resta. **Esse teste consome 1 requisição** e exige confirmação de custo.
5. **Permissões e limites:** parâmetros `country`, `search_lang` e `ui_lang`. Detalhes dos limites em [Limites](https://api-dashboard.search.brave.com/documentation/guides/rate-limiting).
6. **Custo de referência:** ver aviso acima.
7. **Erros comuns:** 401/403 (token errado); 429 ou quota esgotada (aguarde a renovação ou adicione crédito); esperar plano gratuito que não existe mais.

### 3.7 OpenAI (`openai`)

1. **Criar conta:** em [platform.openai.com](https://platform.openai.com/api-keys) (a mesma página gera as chaves).
2. **Obter credencial:** crie uma chave nova em [Chaves](https://platform.openai.com/api-keys). Ela começa com `sk-`; copie-a assim que for criada.
3. **Colar no Zica.ai:** **Conectar** no cartão OpenAI.
4. **O que o teste faz:** lista modelos em [v1/models](https://api.openai.com/v1/models). Grátis. Veja a [documentação](https://platform.openai.com/docs/api-reference/models/list).
5. **Permissões e limites:** usado para observar se o ChatGPT cita o seu site (busca na web). Aceita `user_location` para contexto local.
6. **Custo de referência:** tokens mais busca, na ordem de US$ 0,01 a 0,03 por resposta com modelo mini. Valores de referência — confirmar no site do provedor.
7. **Erros comuns:** 401 (chave revogada ou colada incompleta); chave sem créditos ou sem faturamento ativo na conta da OpenAI.

### 3.8 Gemini (`gemini`)

1. **Criar conta:** conta Google, em [AI Studio](https://aistudio.google.com/apikey).
2. **Obter credencial:** crie a chave de API na mesma página. Ela começa com `AIza`.
3. **Colar no Zica.ai:** **Conectar** no cartão Gemini.
4. **O que o teste faz:** lista 1 modelo em [v1beta/models](https://generativelanguage.googleapis.com/v1beta/models?pageSize=1) com a chave no cabeçalho `x-goog-api-key`. Grátis.
5. **Permissões e limites:** usa Grounding com Google Search (veja a [documentação](https://ai.google.dev/gemini-api/docs/google-search)). Não há país explícito: o resultado reflete o contexto padrão do serviço.
6. **Custo de referência:** Gemini 2.5, ~US$ 35 por mil prompts com grounding. Valores de referência — confirmar no site do provedor.
7. **Erros comuns:** 400/401/403 (chave inválida, restrita a outro serviço ou API não habilitada no projeto da chave).

### 3.9 Anthropic (`anthropic`)

1. **Criar conta:** em [platform.claude.com](https://platform.claude.com/settings/keys).
2. **Obter credencial:** crie uma chave em [Chaves](https://platform.claude.com/settings/keys). Ela começa com `sk-ant-`.
3. **Colar no Zica.ai:** **Conectar** no cartão Anthropic.
4. **O que o teste faz:** lista 1 modelo em [v1/models](https://api.anthropic.com/v1/models?limit=1), com os cabeçalhos `x-api-key` e `anthropic-version: 2023-06-01`. Grátis. Veja a [documentação](https://platform.claude.com/docs/en/api/models/list).
5. **Permissões e limites:** usa busca na web do provedor; aceita `user_location`.
6. **Custo de referência:** US$ 10 por mil buscas mais tokens. Valores de referência — confirmar no site do provedor.
7. **Erros comuns:** 401 (chave incorreta ou revogada); confira também o saldo da conta no provedor.

### 3.10 Perplexity (`perplexity`)

1. **Criar conta:** em [perplexity.ai](https://www.perplexity.ai/account/api/keys).
2. **Obter credencial:** gere a chave em [Chaves](https://www.perplexity.ai/account/api/keys). Ela começa com `pplx-`.
3. **Colar no Zica.ai:** **Conectar** no cartão Perplexity.
4. **O que o teste faz:** 1 busca em [api.perplexity.ai/search](https://api.perplexity.ai/search) (consulta "zica", 1 resultado). **Consome crédito (~US$ 0,005)** e exige confirmação de custo. Veja a [documentação](https://docs.perplexity.ai/).
5. **Permissões e limites:** parâmetro `country`.
6. **Custo de referência:** ~US$ 5 por mil buscas. Valores de referência — confirmar no site do provedor.
7. **Erros comuns:** 401/403 (chave errada); sem crédito na conta.

### 3.11 Microsoft Copilot (`copilot`, manual)

Não existe API pública de chat do Copilot, então **não há chave nem teste**. O cartão é informativo.

- **Fonte oficial de citação:** o relatório "AI Performance" do Bing Webmaster. Acesse pelo [Bing Webmaster](https://www.bing.com/webmasters) (veja o [acesso](https://learn.microsoft.com/en-us/bingwebmaster/getting-access)).
- **Observações manuais:** registre no Observatório, quando você mesmo perguntar ao Copilot e anotar se o escritório foi citado.
- **Custo:** nenhum no Zica.ai.

---

## 4. Ativação dos gratuitos

Os gratuitos são **Google Search Console** e **Bing Webmaster**. Dependem só de credenciais que você gera. Quando estiverem conectados, o sistema coleta sozinho dados reais de tráfego, sem custo. No topo da aba principal existe o cartão **Ativação guiada dos gratuitos** (com passo a passo, botão Conectar e resultado do primeiro teste e da primeira sincronização); ele some quando os dois estão conectados e saudáveis.

### 4.1 Google Search Console com conta de serviço (6 passos)

1. **Criar um projeto no Google Cloud.** Entre no Google Cloud com a conta Google do escritório e crie um projeto novo (por exemplo, com o nome do escritório). Se já existir um projeto, pode reaproveitar.
2. **Ativar a API do Search Console.** Abra a [página da API do Search Console](https://console.cloud.google.com/apis/library/searchconsole.googleapis.com), confirme que o projeto certo está selecionado e clique em **Ativar**.
3. **Criar a conta de serviço e a chave JSON.** No Google Cloud, crie uma conta de serviço no mesmo projeto e, nela, crie uma chave do tipo **JSON**. O navegador baixa um arquivo. Anote o **e-mail da conta de serviço** (campo `client_email`, algo como `nome@projeto.iam.gserviceaccount.com`). Guarde o arquivo em local seguro e não o envie por e-mail ou mensagem.
4. **Adicionar a conta de serviço ao Search Console.** Em [Search Console](https://search.google.com/search-console), escolha a propriedade do site e vá em **Configurações, Usuários e permissões**. Adicione o e-mail da conta de serviço como usuário. Sem este passo, o teste funciona, mas a sincronização falha com `gsc_forbidden`.
5. **Colar o JSON no Zica.ai.** Em `/nexus/motores`, cartão Google Search Console, **Conectar**, cole o conteúdo inteiro do arquivo JSON no campo (é um campo de texto grande). O sistema valida o formato e roda o teste gratuito. Depois de colar, apague o arquivo baixado do computador se não for mais precisar dele.
6. **Sincronizar.** Clique em **Sincronizar agora** (aba Tráfego orgânico). O sistema busca os dados do Google e preenche cliques, impressões, CTR e posição média.

Detalhes que ajudam:

- **Qual propriedade é lida:** por padrão `sc-domain:<seu domínio>` (sem `www.`). Se o seu Search Console usa propriedade por prefixo de URL, a propriedade do projeto precisa ser informada (campo `gsc_property` nas informações comerciais do projeto).
- **Quanto de dados:** o botão sincroniza 28 dias por padrão (1 a 90 dias).
- **Automático:** depois de conectado, a auditoria sincroniza a cada 12 horas (janela de 7 dias) e uma vez por semana com 90 dias.
- **Referência da API:** [Search Analytics: query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query).

Problemas frequentes:

| Mensagem | Causa provável | Solução |
|---|---|---|
| `secret_format_invalid` | Colou só parte do JSON, ou um arquivo que não é de conta de serviço | Cole o arquivo inteiro; confira `type` = `service_account` |
| `gsc_not_configured` | Nenhuma credencial guardada para a organização | Refaça o passo 5 |
| `gsc_forbidden` | E-mail da conta de serviço não está na propriedade | Refaça o passo 4 e confirme a propriedade certa |
| `gsc_unreachable` | Google fora do ar ou sem resposta | Aguarde e sincronize de novo |
| Teste ok, sem dados | Propriedade nova, ou propriedade com nome diferente do padrão | Confira a propriedade e a permissão; a auditoria sinaliza (`search.no_data`) |

### 4.2 Bing Webmaster

1. **Ter o site no Bing Webmaster.** Acesse [Bing Webmaster](https://www.bing.com/webmasters) e confirme que o site está cadastrado e verificado.
2. **Gerar a chave.** Em **Configurações, Acesso à API**, gere a chave. Veja a [documentação do Bing](https://learn.microsoft.com/en-us/bingwebmaster/getting-access).
3. **Colar no Zica.ai.** Em `/nexus/motores`, cartão Bing Webmaster Tools, **Conectar**, cole a chave. O teste gratuito roda em seguida.
4. **Sincronizar.** Use **Sincronizar agora** na aba de tráfego orgânico (a fonte padrão é "todas": Google e Bing).

Observações:

- O Bing não informa país nem dispositivo; esses campos ficam em branco nos relatórios do Bing.
- A API do Bing já teve instabilidades. O sistema trata resposta ausente, erro do provedor ou falha 5xx com **uma nova tentativa**; se continuar falhando, o erro é `bing_unreachable`. Nesse caso, espere e tente de novo; o agendamento tentará sozinho.
- A sincronização é segura para repetir: não duplica dados.

---

## 5. Segurança

- **Vault.** Chaves e JSONs ficam no cofre (Vault) do banco, nunca em código, logs, e-mails ou na tela. O banco guarda só o nome do segredo e os **4 últimos caracteres** para você reconhecer qual chave está em uso. A leitura do segredo é permitida apenas ao serviço do servidor.
- **Nunca exibir a chave.** Depois de salva, a chave não volta em nenhuma resposta nem em nenhum log. Para trocar, cole uma nova. O campo de conexão é do tipo senha.
- **Quem pode o quê.** Qualquer membro da organização vê o painel. Remover credencial, ajustar a liberação de execução e sincronizar tráfego exigem **dono ou administrador**.
- **Isolamento.** Cada organização tem suas credenciais e seus dados; as consultas respeitam a organização do projeto.
- **Allowlist de URLs.** Os testes e as coletas só falam com os endereços fixos da tabela do capítulo 2. O endereço nunca vem do navegador; é montado no servidor. Só o plugin do WordPress do próprio projeto é contatado por outras vias (para as correções de 1 clique da auditoria).
- **Portão de execução.** Nenhuma chamada paga acontece sem **três condições ao mesmo tempo**: (1) execução ligada para a organização; (2) orçamento maior que zero; (3) o provedor da chamada está habilitado. Se faltar qualquer uma, a chamada é recusada (`budget_paused` ou `provider_not_enabled`) e nada é executado.
- **Orçamento.** Antes de cada chamada paga o sistema **reserva** o valor, depois registra o custo real. Se a resposta for incerta, a operação fica marcada como incerta, para você revisar. O orçamento mensal vai de US$ 0 a US$ 200.
- **Tudo desligado por padrão.** Execução desligada, orçamento zero, nenhum provedor habilitado. O bloqueio geral de serviços pagos continua valendo para o resto do sistema; o módulo só abre uma exceção controlada, por organização, para as chamadas de coleta.
- **Teste de saúde não gasta sem aviso.** Os testes em lote usam apenas verificações gratuitas. Os testes com custo (Serper, Brave, Perplexity) só rodam individualmente e com confirmação.
- **Auditoria só lê.** A auditoria contínua nunca faz chamada paga.

---

## 6. Como ler status, pontuação e qualidade

### 6.1 Faixa de saúde geral

No topo aparece algo como: "N de 11 conectados · X saudáveis · Y com atenção · Z com erro · custo do mês US$ A de US$ B · última verificação há N s". O indicador **ao vivo** fica verde com o canal em tempo real conectado, e âmbar quando o painel está usando a consulta de reserva (a cada 60 segundos).

O semáforo geral (`overall`):

| Situação | Quando |
|---|---|
| Vazio | Nenhum provedor conectado |
| Crítico | Algum conectado com erro e nenhum saudável |
| Atenção | Algum com erro ou degradado |
| Ok | Todos os conectados saudáveis |

### 6.2 Status de cada cartão

O status aparece sempre com **cor, texto e ícone** (não depende só da cor).

| Status | Significado | Regra |
|---|---|---|
| Não configurado | Sem credencial | Nada guardado |
| Guardado, não verificado | Chave salva, nenhum teste feito | Rode **Testar conexão** |
| Saudável | Funcionando bem | Último teste ok há menos de 24 h, latência de até 4000 ms e (sem quota, ou quota restante de pelo menos 10%) |
| Degradado | Funciona, mas com ressalva | Último teste ok porém com latência acima de 4000 ms; ou quota abaixo de 10%; ou teste mais velho que 24 h; ou taxa de sucesso em 7 dias abaixo de 80% |
| Erro | Falhou | O último teste falhou |
| Manual | Sem API | Copilot |

### 6.3 Pontuação de qualidade (0 a 100)

A pontuação resume a confiabilidade da conexão. Vem vazia quando o provedor não está configurado. Pesos:

| Componente | Peso | Como pontua |
|---|---|---|
| Sucesso nos testes dos últimos 7 dias | 40 | Proporção de testes ok |
| Sucesso nas operações dos últimos 30 dias | 30 | Proporção de operações válidas; se não houver operações, esse peso vai para os testes |
| Frescor | 20 | 1 se o último teste tem menos de 24 h; 0,5 se menos de 72 h; 0 se mais velho |
| Latência | 10 | 1 se até 1500 ms; 0 se 6000 ms ou mais; proporcional entre os dois |

A pontuação geral do módulo é a média dos conectados. Leitura prática: acima de 80, tranquilo; entre 50 e 80, vale olhar o cartão; abaixo de 50, algo precisa de atenção. Essas faixas são uma sugestão de leitura, não uma regra do sistema.

### 6.4 Outros números do cartão

- **Latência:** tempo de resposta do último teste.
- **Taxa de sucesso 7 d:** testes ok sobre testes feitos nos últimos 7 dias.
- **Uso 30 dias:** operações válidas, falhas e incertas.
- **Quota/saldo:** quando o provedor informa (DataForSEO, SerpApi, Brave).
- **Custo de referência:** vale a regra "valores de referência — confirmar no site do provedor".

### 6.5 Aba de tráfego orgânico

Mostra cliques, impressões, CTR e posição média do Google Search Console e do Bing, gráfico diário, principais consultas e páginas, por país e dispositivo, e a última sincronização. A posição média é ponderada pelas impressões. São dados **observados** no passado, não previsões.

---

## 7. Auditoria contínua

A "Saúde do sistema" é uma auditoria automática do módulo e dos recursos ligados a ele. Roda **a cada 15 minutos** e também sob demanda (botão **Auditar agora**, para dono/administrador; no máximo uma execução manual por minuto por organização, senão `audit_rate_limited`).

Ela usa **somente verificações gratuitas e leituras**: testes de saúde sem custo, acessos públicos aos seus próprios sites e consultas ao banco. **Nunca faz chamada paga.**

### 7.1 Categorias

| Categoria | Pergunta que responde |
|---|---|
| Corretiva | O que está quebrado agora |
| Preventiva | O que vai quebrar ou ficar caro se nada for feito |
| Melhoria | O que pode ficar melhor |

### 7.2 Severidades

`critical` (crítica), `high` (alta), `medium` (média), `low` (baixa) e `info` (informativa). A severidade aparece com cor, texto e ícone.

### 7.3 Tabela de regras

| Regra | Categoria | Severidade | Quando dispara | O que fazer |
|---|---|---|---|---|
| `provider.never_verified` | Corretiva | Média | Credencial guardada sem nenhum teste | Testar (correção de 1 clique) |
| `provider.check_failed` | Corretiva | Alta (crítica se GSC ou Bing) | Último teste falhou | Reconferir chave e permissões; testar de novo |
| `provider.latency_high` | Preventiva | Baixa | Latência média em 7 dias acima de 4000 ms | Acompanhar |
| `provider.quota_low` | Preventiva | Alta (abaixo de 10%) ou média (abaixo de 25%) | Quota restante baixa | Recarregar créditos |
| `provider.unused_30d` | Melhoria | Info | Configurado, sem operações em 30 dias | Usar ou remover |
| `provider.free_not_connected` | Melhoria | Alta | GSC ou Bing sem credencial | Abrir a Ativação guiada |
| `search.sync_stale` | Corretiva | Média (alta se passar de 7 dias) | Última sincronização GSC/Bing há mais de 48 h, com credencial ativa | Sincronizar (correção de 1 clique) |
| `search.no_data` | Melhoria | Média | Credencial ativa e zero linhas | Conferir propriedade e permissão |
| `observatory.stale` | Preventiva | Baixa | Nenhuma observação nova há 14 dias | Registrar ou preparar rodada |
| `observatory.no_prompts` | Melhoria | Média | Projeto sem conjunto de prompts | Criar conjunto |
| `signals.no_batch` | Corretiva | Média | Chave de sinais criada há mais de 24 h sem nenhum lote recebido | Conferir o snippet |
| `signals.snippet_missing` | Corretiva | Alta | Chave existe e a página inicial não contém `zica-signals` | Instalar o snippet |
| `plugin.outdated` | Preventiva | Média | Plugin do WordPress em versão anterior à atual do Zica.ai | Instalar o zip novo |
| `plugin.unreachable` | Corretiva | Alta | A API do plugin não responde com sucesso | Verificar plugin e firewall |
| `site.llms_missing` | Corretiva | Média | `/llms.txt` ou `/robots.txt` fora do ar | Atualizar descoberta (correção de 1 clique) |
| `site.schema_thin` | Melhoria | Baixa | Página inicial sem dados estruturados de Organização/Escritório com nome, endereço do site e perfis oficiais | Aplicar perfil de schema |
| `runtime.function_down` | Corretiva | Crítica | As funções `nexus-intelligence` ou `zica-signals` respondem erro 5xx ou não respondem | Acionar suporte |
| `runtime.cron_failing` | Preventiva | Média | Tarefas agendadas `zica-*` ou `nexus-*` com 3 ou mais falhas em 24 h | Investigar |
| `security.anon_write` | Preventiva | Alta | Há tabelas em que usuário anônimo pode escrever | Revogar escrita anônima (sem correção automática) |
| `security.rls_off` | Preventiva | Alta | Há tabelas sem proteção por linha (RLS) | Habilitar RLS |
| `cost.budget_80` | Preventiva | Alta | Consumido mais reservado chegou a 80% do orçamento | Ajustar orçamento |
| `cost.enabled_without_provider` | Corretiva | Baixa | Execução ligada sem nenhum provedor habilitado | Habilitar provedor ou desligar |
| `execution.enabled_info` | Melhoria | Info | Execução paga está ligada | Revisar orçamento |

### 7.4 Correções aplicáveis com um clique

Só quatro tipos de correção existem, e **nenhuma faz chamada paga**:

| Tipo | O que faz |
|---|---|
| `provider_health_check` | Roda o teste de saúde gratuito do provedor |
| `search_performance_sync` | Sincroniza Google Search Console e Bing |
| `plugin_discovery_refresh` | Pede ao plugin do WordPress do projeto para recriar os arquivos de descoberta (`llms.txt` e afins) |
| `open_route` | Abre a tela certa do sistema (por exemplo, a Ativação guiada) |

O botão **Aplicar correção** aparece só quando o achado tem uma correção segura, e é exclusivo de dono/administrador. Pede confirmação, executa, grava o resultado no achado e reavalia a regra. Qualquer outro tipo de correção é rejeitado.

### 7.5 Como interpretar os achados

- **Comece pelas críticas e altas, depois pelas corretivas.** Preventivas avisam antes do problema; melhorias são opcionais.
- **Achados se resolvem sozinhos** quando a condição desaparece, **reabrem** se voltarem e **não se duplicam** (cada achado tem uma impressão digital formada por regra, projeto e assunto). O campo "ocorrências" mostra quantas vezes foi visto.
- **Reconhecer** significa "vi e estou cuidando"; o achado continua listado. **Adiar** (1 hora, 24 horas ou 7 dias; no máximo 720 horas) esconde o aviso até o prazo; se a condição persistir depois, ele volta.
- Cada achado mostra **evidência** (o dado que provou a condição), ação sugerida e, se houver, a correção.
- A auditoria é resiliente: se uma regra falhar, as outras continuam, e a falha fica registrada no detalhe da execução.
- Estado vazio positivo ("nada a corrigir") é o resultado esperado quando tudo está em ordem.
- A auditoria **não substitui** a sua revisão jurídica nem a do responsável técnico. Ela só observa o que é verificável.

### 7.6 Como pausar o agendamento

A auditoria agendada é a tarefa `nexus-audit-every-15-min` do agendador do banco (pg_cron). Para **pausar**, peça ao responsável técnico para executar no editor SQL do banco:

```sql
update cron.job set active=false where jobname='nexus-audit-every-15-min';
```

Para **retomar**, a mesma instrução invertida:

```sql
update cron.job set active=true where jobname='nexus-audit-every-15-min';
```

Pausar o agendamento não apaga achados nem histórico, e o botão **Auditar agora** continua funcionando. Enquanto estiver pausada, nenhum aviso automático novo aparece e a sincronização automática de GSC/Bing (que pega carona na auditoria) também para; use **Sincronizar agora**.

### 7.7 Retenção

- **Execuções da auditoria:** limpar as mais antigas que 90 dias.
- **Achados resolvidos:** limpar os resolvidos há mais de 180 dias.
- **Histórico de testes de saúde:** limpar o que for mais antigo que 90 dias.

A limpeza não é automática. Ver capítulo 9.

---

## 8. Checklist de ativação em ordem e rollback

Faça nesta ordem. Não pule etapas: cada uma reduz o risco da seguinte.

1. **GSC e Bing (grátis).** Siga o capítulo 4 para os dois. Confirme que o teste ficou verde e que a primeira sincronização trouxe dados.
2. **Chaves de IA.** Conecte OpenAI, Gemini, Anthropic e/ou Perplexity, conforme o capítulo 3. Os testes de OpenAI, Gemini e Anthropic são gratuitos; o da Perplexity tem custo e pede confirmação.
3. **SERP.** Conecte DataForSEO e/ou SerpApi (testes gratuitos) e, se desejar, Serper e Brave (testes com custo, com confirmação).
4. **Orçamento inicial sugerido: US$ 5.** No painel **Liberação de execução paga**, defina o orçamento mensal em US$ 5 (o máximo permitido é US$ 200). Comece pequeno e aumente só depois de ver o consumo real.
5. **Liberar execução.** No mesmo painel: marque os provedores que podem gastar (só aparecem os conectados), digite `LIBERAR` no campo de confirmação e confirme. Exige orçamento maior que zero e pelo menos 1 provedor. Só dono/administrador consegue.
6. **Acompanhar.** Veja o custo na faixa de saúde e na aba Saúde do sistema (a regra `cost.budget_80` avisa em 80% do orçamento).

### Rollback: desligar tudo

O botão **Desligar tudo** do painel de liberação fica sempre visível e é sempre permitido. Efeito: execução paga volta ao estado desligado, nenhuma chamada paga é feita.

Para um recuo mais completo:

1. Clique em **Desligar tudo** (execução desligada).
2. Zere o orçamento, se quiser (execução desligada com orçamento zero é o estado padrão de fábrica).
3. Remova credenciais que não vai usar (capítulo 9). Remover uma credencial também retira o provedor da lista de habilitados.
4. Opcional: pause a auditoria agendada (capítulo 7.6).

Os dados já coletados e o histórico permanecem; nada é apagado por desligar.

---

## 9. Operação

### 9.1 Rotacionar uma chave

1. Gere a chave nova no provedor (links do capítulo 2).
2. No cartão do provedor, **Trocar chave** e cole a nova. O formato é validado e o teste gratuito roda.
3. Confirme o status Saudável.
4. Só depois **revogue a chave antiga** no site do provedor.

Faça rotação quando houver suspeita de vazamento, saída de alguém que conhecia a chave, ou como rotina periódica a critério do escritório.

### 9.2 Remover uma chave

Apenas dono/administrador. No cartão, **Remover** e confirme. O sistema apaga o segredo do Vault e a linha da credencial, e desabilita o provedor na lista de habilitados da execução. Se for por segurança, revogue também no provedor.

### 9.3 Limpezas de retenção

Não há limpeza automática. Sugestão: a cada mês, o responsável técnico executa no editor SQL do banco as instruções abaixo, que usam os nomes de tabela e colunas definidos para o módulo.

```sql
delete from public.nexus_provider_health where checked_at < now() - interval '90 days';
delete from public.nexus_audit_runs where started_at < now() - interval '90 days';
delete from public.nexus_audit_findings where status = 'resolved' and resolved_at < now() - interval '180 days';
```

Antes de apagar, vale fazer cópia de segurança do banco. As instruções são uma proposta baseada nas colunas do contrato do módulo; confirme-as com o responsável técnico antes de executar.

### 9.4 Rotina semanal sugerida

- Abrir `/nexus/motores` e conferir a faixa de saúde.
- Tratar achados críticos e altos.
- Conferir a data da última sincronização do Google e do Bing.
- Conferir o gasto do mês frente ao orçamento.

---

## 10. Compliance (Provimento 205/2021 da OAB)

O Zica.ai atende advogados e este módulo é de **observação e medição**. Ao usar seus resultados em qualquer comunicação do escritório:

- **Sem promessa de resultado.** Nada neste módulo autoriza prometer ou garantir resultado, posição, visibilidade ou captação de clientes.
- **Nenhuma estimativa de tráfego ou de posição garantida.** Os números de cliques, impressões e posição são **dados observados do passado**, não previsão. Citações em IAs são **observações pontuais** e podem mudar de uma consulta para outra.
- **Sem superlativos sem título formal, sem comparação com concorrentes e sem urgência comercial** em peças que usem esses dados.
- **Valores de referência — confirmar no site do provedor.** Os preços citados são estimativas para planejar orçamento, não compromisso de custo.
- **Dados pessoais.** Mantenha as credenciais restritas a quem precisa e não compartilhe capturas de tela que mostrem consultas de pesquisa de clientes identificáveis.
- **Responsabilidade.** O conteúdo final divulgado continua sob responsabilidade do advogado inscrito. Em dúvida sobre uma peça, consulte o responsável por ética e publicidade do escritório.

---

*Fontes: contrato do módulo "NEXUS · Motores & APIs" e seu adendo (12/11/2026). Em caso de divergência, a fonte é o contrato.*
