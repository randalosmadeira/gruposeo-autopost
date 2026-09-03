# Auditoria de publicação em massa - 2026-09-03

## Causa raiz

1. `articleHasContent()` considerava apenas `word_count > 0`, permitindo que drafts bloqueados e até artigo eleitoral com `content=''` e `word_count=1504` fossem enviados ao modal como publicáveis.
2. `BulkPublishModal` define `readyArticles` por `hasContent !== false`, portanto herdava a classificação incorreta e multiplicava cada bloqueio por destino WordPress.
3. `useBulkGeneration` tenta gravar `status='ready'` depois da geração; o trigger de banco rebaixa conteúdo com `[VERIFICAR]` para draft, mas o frontend ainda contabiliza a geração como concluída.
4. `generate-article` instruía o modelo a inserir `[VERIFICAR]` no próprio corpo quando faltava fonte. Isso é seguro como bloqueio, mas incorreto como contrato editorial.
5. O publisher fez o correto ao recusar os artigos com `needs_primary_source=true` / `review_pass=false`.

## Conectividade

Blog RDM Advogados e Direitos News estavam conectados por `zica-posts/v1`, plugin 3.10.2, credenciais via Vault e verificação recente. Uma publicação posterior criou posts nos dois destinos, comprovando conectividade funcional. Os erros do lote analisado eram editoriais, não de rede/autenticação.

## Correções

- `articleHasContent()` agora exige status `ready|published`, ausência de erro, preflight/review válidos, ausência de bloqueio de origem e compliance eleitoral liberado.
- `config` passou a fazer parte do select da listagem.
- `generate-article` não pode mais emitir marcadores `[VERIFICAR|VALIDAR|CONFIRMAR|RECONSULTAR]` como artigo final.
- Quando fonte primária indispensável estiver ausente, a função retorna `409 primary_source_required`, fora do corpo.
- TITLE_SEO/META_DESCRIPTION deixam de ser solicitados dentro do conteúdo.
- Trigger `guard_article_ready_preflight` endurecido para conteúdo vazio, bloqueio de origem, fonte/review e compliance eleitoral.
- Quatro artigos atuais foram saneados com fontes oficiais e backups em `article_versions`.
