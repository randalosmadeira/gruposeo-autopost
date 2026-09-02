Zica Electoral Analytics 1.2.1

Plugin WordPress dos portais eleitorais 1470.

INSTALACAO
1. No WordPress, acesse Plugins > Adicionar plugin > Enviar plugin.
2. Envie o arquivo zica-electoral-analytics-1.2.1.zip gerado pelo Zica.ai.
3. Se houver versao anterior, escolha substituir a instalada.
4. Ative o plugin.
5. GA4, GTM, pop-up e janela de coleta sao obtidos da configuracao central do Zica.ai. Nao e necessario inserir chave OpenAI no plugin.

EVENTOS EDITORIAIS AGREGADOS
- zica_page_context
- zica_engaged_30s
- zica_scroll_depth (25/50/75/90)
- zica_internal_link_click
- zica_outbound_link_click
- zica_portal_crosslink_click
- zica_consent_update

POP-UP CONSENTIDO
- disparo por rolagem configuravel
- exit intent em desktop
- cadastro voluntario por e-mail/WhatsApp
- interesse em voluntariado
- consentimento explicito
- CTA opcional do Instagram @rdmadvogados
- evento agregado zica_optin_instagram_click

PRIVACIDADE
- Consent Mode inicia em denied.
- Google Signals fica desligado.
- Personalizacao de anuncios fica desligada.
- Nao cria perfil individual de eleitor.
- Nao infere preferencia politica.
- Nao coleta bairro individual por IP.
- A camada geografica de relatorio e limitada a cidade agregada.
- O cadastro nao e vinculado ao historico individual de navegacao.
- A coleta e encerrada automaticamente na data configurada pelo Zica.ai.

PORTAIS PRIORITARIOS
- https://quemvotar.drmadeira1470.com.br/blog/
- https://votardeputadofederal.drmadeira1470.com.br/blog/

CONFIGURACAO CENTRAL
O plugin consulta somente configuracao publica nao sensivel do Zica.ai, com cache curto e comportamento fail-closed. Se a configuracao central nao puder ser obtida, o tracking e o pop-up nao sao iniciados.
