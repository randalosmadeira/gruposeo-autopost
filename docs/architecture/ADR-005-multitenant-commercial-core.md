# ADR-005 - Núcleo multi-tenant comercial do Zica.IA Posts

Status: accepted

## Contexto

O Zica.IA Posts nasceu orientado por `user_id`. O produto passa a atender um painel interno e organizações comerciais com mais de um usuário, planos, cotas, BYOK e identidade visual própria.

## Decisão

- Manter `Zica.IA Posts` como denominação técnica.
- Adotar `organization_id` como fronteira de tenant.
- Preservar `user_id` durante a migração progressiva e para autoria/auditoria.
- Oferecer os planos `internal`, `commercial` e `byok`.
- Aplicar limites de projetos e artigos no banco, não apenas na interface.
- Guardar chaves BYOK somente no Supabase Vault; tabelas públicas mantêm apenas referência, estado e últimos quatro caracteres.
- Manter o ZicaCortex como software independente, sem compartilhar documentos, OCR, autos, minutas ou peças.
- Executar o Zica Copilot por registro de ferramentas permitidas, escopo por organização e confirmação humana para publicação.
- Reutilizar até seis imagens homologadas por organização, armazenando apenas caminhos de Storage e derivações, nunca Base64.

## Consequências

- Rotas e workers legados podem migrar por etapas, usando `user_id` e `organization_id` durante a transição.
- Toda nova tabela de negócio deve incluir RLS por organização.
- Operações de quota usam reserva e confirmação transacionais para impedir estouro por concorrência.
- A chave OpenAI global permanece pausada. BYOK é uma credencial isolada por organização e não é validada por chamada paga nesta fase.
