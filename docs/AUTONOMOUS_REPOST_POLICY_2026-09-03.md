# Política Editorial Autônoma de Repostagens

## Escopo

A ingestão e a distribuição RSS são fluxos independentes:

1. Ingestão RSS descobre uma fonte e cria um item editorial.
2. Distribuição RSS confirma que uma postagem publicada no WordPress apareceu no feed de saída.

Publicar no WordPress não equivale a confirmar presença no RSS.

## Origem normalizada

Cada artigo recebe `source_type`, `source_url`, `source_name`, `source_context` e `source_fingerprint`. Origens conhecidas incluem `manual_url`, `manual_text`, `rss_schedule`, `news_agent_rss`, `google_news_rss`, `monitored_portal`, `bulk_generator` e `article_generator`.

## Decisão editorial

O padrão é `ai_autonomous`. Nicho, ângulo, gatilho, intensidade, tom, extensão, palavras-chave, estratégia de título, formato, política de imagem, horário e ação de publicação são definidos por item. Overrides manuais são mantidos, aplicados depois da decisão e registrados em `editorial_policy_decisions`.

## Guardrails

Humor, sarcasmo e sátira são proibidos em conteúdo sensível sobre vítimas, crianças, crimes, morte, violência, tragédias, saúde, calamidades, acusações não julgadas ou processos sensíveis. Baixa confiança, risco alto, fonte primária pendente ou imagem obrigatória indisponível resultam em `publish_action=hold` e `requires_human_review=true`.

## Diversidade

O resolvedor considera até 30 decisões anteriores do mesmo projeto. Ângulo, gatilho, título e palavra-chave são avaliados contra repetição recente antes da geração.

## Imagem

A seleção usa pool autorizado, tentativas limitadas, cooldown por ativo e fallback determinístico. Falhas permanentes não entram em tempestade de retry. A geração sintética ocorre apenas quando a política do módulo e a decisão editorial permitem.

## RSS de saída

Após publicação, a URL é procurada em feeds RSS ou Atom do WordPress. O artigo recebe um dos estados:

- `rss_pending`
- `rss_confirmed`
- `rss_delayed`
- `rss_missing`
- `rss_not_applicable`

Cada tentativa é registrada em `rss_publication_verifications`.

## Rollback

O rollback de aplicação consiste em apontar a branch de release para o SHA anterior e redeployar as Edge Functions anteriores. A migration é aditiva. As colunas e tabelas novas podem permanecer sem interferir no código antigo. Não remover dados de auditoria durante rollback.
