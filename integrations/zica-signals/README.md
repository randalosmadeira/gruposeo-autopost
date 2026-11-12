# Zica Signals: sinais de IA e busca em qualquer site

O Zica Signals conta, por dia, agente e página:

- `ai_bot_hit`: acessos de robôs de IA (GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot etc.);
- `ai_referral`: visitas humanas que chegaram vindas de uma resposta de IA (ChatGPT, Perplexity, Gemini, Copilot, Claude, Grok...);
- `search_referral`: visitas vindas de buscadores (Google, Bing, DuckDuckGo...);
- `human_pageview`: visitas sem origem conhecida (somente se você ligar `data-all="1"`).

Os números alimentam o Observatório do Zica.ai. São contagens observadas: não provam que a IA citou ou vai citar o site.

Não coleta cookies, IP, User-Agent completo, fingerprint nem identificadores de pessoa. O endpoint só recebe dia, tipo, agente, caminho (sem query string) e contagem.

## Por que existem quatro peças

Robôs de IA **não executam JavaScript**. O snippet de navegador (`zica-signals.js`) só enxerga visitas de pessoas. Para contar os robôs é preciso olhar a requisição no servidor. Escolha conforme onde o site roda:

| Situação | Peça | Mede |
|---|---|---|
| WordPress com o plugin Zica Posts 3.16+ | plugin (automático) | robôs no PHP + visitas pelo snippet |
| Qualquer site (HTML, Next.js, Webflow...) | `zica-signals.js` | visitas vindas de IA/busca |
| Site atrás da Cloudflare | `cloudflare-worker/` | robôs (e opcionalmente visitas) |
| Servidor Node/Express próprio | `node/zica-signals-middleware.js` | robôs |
| Nginx/Apache com acesso a logs | `log-shipper/zica_signals_shipper.py` | robôs |

O ideal é combinar: **snippet** (pessoas) + **uma** peça de servidor (robôs). Não ligue a contagem de visitas no servidor (`ZICA_SIGNALS_REFERRALS`, `referrals: true`, `--referrals`) junto com o snippet, ou a mesma visita é contada duas vezes.

Limite conhecido: páginas servidas por cache de página ou CDN não executam o PHP/Node do site; nesse caso o plugin não vê o robô e você deve usar o Worker ou o leitor de logs.

## Primeiro passo: gerar a chave

No Zica.ai, abra **NEXUS · Observatório > Chave de sinais** e crie a chave do projeto. Você recebe:

- `site_id` (12 caracteres) e o snippet pronto;
- o **segredo**, exibido **uma única vez**. Guarde em cofre/variável de ambiente. Nunca coloque em HTML, repositório ou front-end.

Nos exemplos abaixo, `COLE_AQUI` marca o que você preenche. O endpoint tem a forma `https://SEU-PROJETO.supabase.co/functions/v1/zica-signals`.

## Snippet de navegador

```html
<script src="https://SEU-DOMINIO/zica-signals.js"
        data-site="COLE_AQUI_O_SITE_ID"
        data-endpoint="https://COLE_AQUI.supabase.co/functions/v1/zica-signals"
        defer></script>
```

Hospede `zica-signals.js` no seu próprio domínio (ou no do Zica.ai, se for o caso). Atributos:

- `data-site`, `data-endpoint`: obrigatórios (ou `window.ZICA_SIGNALS = { site, endpoint, all }` antes do script);
- `data-all="1"`: opcional; conta também visitas sem origem de IA/busca.

Comportamento: envia **uma vez por carregamento de página**, por `navigator.sendBeacon` (com `fetch` de reserva), com o caminho da página sem query nem hash. **Se o navegador sinaliza Do Not Track (`doNotTrack = "1"`), não envia nada.** Referrers da própria página são ignorados. O corpo vai como `text/plain` para evitar preflight de CORS; o endpoint só aceita origens cadastradas na chave (campo "origens permitidas").

### HTML estático

Cole o `<script>` acima antes de `</body>` (ou no `<head>`, com `defer`).

### Next.js (App Router)

`app/layout.tsx`:

```tsx
import Script from 'next/script';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <Script
          src="/zica-signals.js"
          strategy="afterInteractive"
          data-site="COLE_AQUI_O_SITE_ID"
          data-endpoint="https://COLE_AQUI.supabase.co/functions/v1/zica-signals"
        />
      </body>
    </html>
  );
}
```

Coloque o arquivo em `public/zica-signals.js`. Em navegação interna (SPA) o snippet conta o carregamento inicial; a visita vinda de IA é a que abre o site, então isso é o desejado.

### Nuxt

`nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  app: {
    head: {
      script: [{
        src: '/zica-signals.js',
        defer: true,
        'data-site': 'COLE_AQUI_O_SITE_ID',
        'data-endpoint': 'https://COLE_AQUI.supabase.co/functions/v1/zica-signals',
      }],
    },
  },
});
```

### Webflow, Wix, Framer, Shopify

Use o campo de código personalizado do site (não de uma página só):

- **Webflow**: Site settings > Custom code > Footer code.
- **Wix**: Configurações > Código personalizado > Adicionar código (carregar em todas as páginas, no fim do `body`).
- **Framer**: Site settings > General > Custom Code > End of `<body>`.
- **Shopify**: Online Store > Themes > Edit code > `theme.liquid`, antes de `</body>`.

Cole o `<script ... defer>` com o endereço onde o arquivo estiver hospedado. Se a plataforma não permite hospedar o arquivo, cole o conteúdo de `zica-signals.js` inline dentro de uma tag `<script>` e defina antes `window.ZICA_SIGNALS = { site: '...', endpoint: '...' };`.

### Google Tag Manager

Nova tag > **HTML personalizado**, disparo **All Pages**:

```html
<script>
  window.ZICA_SIGNALS = {
    site: 'COLE_AQUI_O_SITE_ID',
    endpoint: 'https://COLE_AQUI.supabase.co/functions/v1/zica-signals'
  };
</script>
<script src="https://SEU-DOMINIO/zica-signals.js" defer></script>
```

Quando o snippet é carregado por GTM, `document.currentScript` não existe: por isso as configurações vão em `window.ZICA_SIGNALS`. Respeite o consentimento do site: se a política do site exigir consentimento para scripts de medição, dispare a tag só após o consentimento.

## Cloudflare Worker (robôs)

1. Copie `cloudflare-worker/worker.js` e `wrangler.toml.example` (renomeie para `wrangler.toml`).
2. Preencha `ZICA_SIGNALS_SITE_ID`, `ZICA_SIGNALS_ENDPOINT` e a rota do seu domínio.
3. `npx wrangler secret put ZICA_SIGNALS_SECRET` e cole o segredo quando o comando pedir.
4. `npx wrangler deploy`.

O Worker devolve a resposta original sem alterá-la. Se o User-Agent for um robô de IA, agrega em memória e envia um lote assinado a cada 60 s via `ctx.waitUntil`. A memória é por isolate: lotes de isolates diferentes se somam no servidor; um isolate reciclado pode perder até 60 s de contagem (limite aceito para não depender de armazenamento).

## Middleware Node (robôs)

```js
const zicaSignals = require('./zica-signals-middleware');

app.use(zicaSignals({
  siteId: process.env.ZICA_SIGNALS_SITE_ID,
  secret: process.env.ZICA_SIGNALS_SECRET,
  endpoint: process.env.ZICA_SIGNALS_ENDPOINT,
  siteHost: 'meusite.com.br',
}));
```

Sem dependências, formato `(req, res, next)`. Opções: `flushIntervalMs` (padrão 60000), `timeZone` (padrão `America/Sao_Paulo`), `referrals` (padrão `false`), `onError`. Chame `middleware.flush()` antes de encerrar o processo, se quiser.

## Leitor de logs (robôs)

Para nginx/Apache em formato `combined`:

```bash
export ZICA_SIGNALS_SECRET='COLE_AQUI'
python3 zica_signals_shipper.py \
  --log /var/log/nginx/access.log \
  --site-id COLE_AQUI_O_SITE_ID --site-host meusite.com.br \
  --endpoint https://COLE_AQUI.supabase.co/functions/v1/zica-signals \
  --state /var/lib/zica-signals/state.json
```

- `--dry-run` imprime o lote que seria enviado, sem rede e sem assinatura. Rode isso primeiro.
- `--state` lembra até onde cada log foi lido (rodar de hora em hora no cron). Se o log for rotacionado (menor que o ponto salvo), a leitura recomeça do início.
- Somente biblioteca padrão do Python 3.8+.

## Como a assinatura funciona

As peças de servidor assinam cada lote como o plugin:

```
assinatura = hex(hmac_sha256(segredo, timestamp + "\n" + nonce + "\n" + sha256hex(corpo)))
```

Cabeçalhos: `X-Zica-Site` (site_id), `X-Zica-Timestamp` (segundos Unix, tolerância de 300 s), `X-Zica-Nonce` (16+ caracteres), `X-Zica-Signature`. Corpo: `{ "site_host", "batch_id", "events": [{ "day", "kind", "agent", "path", "hits" }] }` com até 500 eventos. O `batch_id` evita contar o mesmo lote duas vezes numa nova tentativa.

## Lista de robôs e referrers

A lista canônica está em `signals-catalog.json`. Para alterar, edite o JSON e rode:

```bash
node integrations/zica-signals/generate-catalog.mjs        # reescreve snippet, plugin, worker, middleware e shipper
node integrations/zica-signals/generate-catalog.mjs --check # falha se algum arquivo estiver fora de sincronia
```

Depois copie `public/zica-signals.js` e o plugin atualizados para onde estiverem hospedados.

## Verificação

Confira a chave no Zica.ai (**último lote recebido**). Para o snippet: abra o site vindo de um link com `?utm_source=chatgpt.com` e veja o contador subir. Para robôs: `curl -A "GPTBot/1.1" https://seusite/` e aguarde o próximo envio (até 60 s no Worker/middleware, 1 h no plugin).
