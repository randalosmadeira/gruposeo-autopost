# Política de modelos Claude

## Limite aprovado

O Zica Posts aceita somente os snapshots abaixo:

| Perfil | Modelo | Uso |
|---|---|---|
| Principal | `claude-sonnet-4-5-20250929` | geração, revisão editorial, análise, visão e tarefas jurídicas ou eleitorais com revisão humana |
| Econômico | `claude-haiku-4-5-20251001` | subtarefas simples do Claude Code, classificações auxiliares e rotinas curtas que tenham validação determinística |

Opus, Fable, Sonnet 4.6, Sonnet 5 e aliases móveis como `sonnet`, `default` ou `best` ficam fora da política. IDs completos foram escolhidos para impedir mudança silenciosa de versão.

## Aplicação

- `.claude/settings.json` inicia o Claude Code no Sonnet 4.5 e limita o seletor do projeto aos dois snapshots.
- Os consumidores da API Anthropic usam uma lista explícita e falham com `anthropic_model_not_allowed` quando `ANTHROPIC_MODEL` aponta para outro modelo.
- `npm run check:claude-models` examina o repositório e bloqueia IDs fora da política.
- A chave `ANTHROPIC_API_KEY` continua fora do código e deve permanecer no GitHub Environment ou no mecanismo de segredo já adotado.

## Limite da imposição local

A configuração versionada do projeto controla as sessões que respeitam os ajustes do repositório. Em uma frota corporativa, configurações de usuário podem ser combinadas com configurações de projeto. A imposição administrativa integral exige `availableModels` e `enforceAvailableModels` na fonte gerenciada de maior precedência ou restrição equivalente da organização Anthropic.

## Risco de ciclo de vida

Na consulta à documentação oficial em 8 de setembro de 2026, Sonnet 4.5 permanecia ativo, com aposentadoria indicada para não antes de 29 de setembro de 2026. Haiku 4.5 permanecia ativo, com aposentadoria indicada para não antes de 15 de outubro de 2026. A política deve ser revista antes de 22 de setembro de 2026. Se o limite não for ampliado, as chamadas Anthropic poderão deixar de funcionar nas datas informadas pelo provedor.

Fontes:

- https://code.claude.com/docs/llms.txt
- https://code.claude.com/docs/en/model-config
- https://platform.claude.com/docs/en/about-claude/model-deprecations
- https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions
