Zica Electoral Analytics 1.1.0

Plugin WordPress dos portais eleitorais 1470.

INSTALACAO
1. No WordPress, acesse Plugins > Adicionar plugin > Enviar plugin.
2. Envie o arquivo zica-electoral-analytics-1.1.0.zip gerado pelo Zica.ai.
3. Ative o plugin.
4. A configuracao de GA4/GTM e da janela de coleta e obtida do Zica.ai. Nao e necessario inserir chave OpenAI nem credencial do WordPress no plugin.

EVENTOS
- zica_page_context
- zica_engaged_30s
- zica_scroll_depth (25/50/75/90)
- zica_internal_link_click
- zica_outbound_link_click
- zica_portal_crosslink_click
- zica_consent_update

PRIVACIDADE
- Consent Mode inicia em denied.
- Google Signals fica desligado.
- Personalizacao de anuncios fica desligada.
- Nao cria perfil individual de eleitor.
- Nao infere preferencia politica.
- Nao coleta bairro individual por IP.
- A camada geografica de relatorio e limitada a cidade agregada.
- A coleta e encerrada automaticamente na data configurada pelo Zica.ai.

PORTAIS PRIORITARIOS
- https://quemvotar.drmadeira1470.com.br/blog/
- https://votardeputadofederal.drmadeira1470.com.br/blog/

CONFIGURACAO CENTRAL
O plugin consulta somente configuracao publica nao sensivel do Zica.ai, com cache curto e comportamento fail-closed. Se a configuracao central nao puder ser obtida, o tracking nao e iniciado.
