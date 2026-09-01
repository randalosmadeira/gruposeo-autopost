# Zica Electoral Analytics

Plugin WordPress para os portais informativos da campanha 1470.

## Finalidade

- carregar GA4 ou GTM Web quando configurados;
- suportar GTM Server por URL first-party;
- registrar eventos editoriais agregados;
- medir origem UTM, pagina, rolagem, tempo de engajamento e cliques;
- distinguir links internos, externos e cruzamentos entre os dois portais eleitorais;
- desligar automaticamente a coleta na data configurada.

## Eventos

- `zica_page_context`
- `zica_engaged_30s`
- `zica_scroll_depth`
- `zica_internal_link_click`
- `zica_outbound_link_click`
- `zica_portal_crosslink_click`
- `zica_consent_update`

## Privacidade e limites

O plugin nao cria perfil individual de eleitor, nao infere preferencia politica, nao coleta bairro por IP, nao envia e-mail, telefone ou identificador do apoiador ao GA4, nao habilita Google Signals nem personalizacao de anuncios. A localizacao por cidade, quando disponivel no GA4, e estimada pela propria plataforma e deve ser usada apenas de forma agregada.

O modo de consentimento inicia com `analytics_storage=denied`. A CMP do portal pode liberar analytics disparando:

```js
window.dispatchEvent(new CustomEvent('zica:analytics-consent', { detail: { granted: true } }));
```

## Configuracao remota

Com o plugin ativo, um administrador WordPress autenticado por Application Password pode atualizar:

`/wp-json/zica/v1/electoral-analytics/config`

Campos aceitos:

- `enabled`
- `portal_id`
- `ga4_measurement_id`
- `gtm_web_container_id`
- `gtm_server_container_url`
- `disable_after`
- `primary_portals`

Os sinalizadores de Google Signals, personalizacao de anuncios e perfil individual permanecem desativados pelo plugin.

## Portais iniciais

- `https://quemvotar.drmadeira1470.com.br/blog/`
- `https://votardeputadofederal.drmadeira1470.com.br/blog/`
