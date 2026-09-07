# Chaves de IA: origem única no GitHub

Desde 2026-09-07 as credenciais de **OpenAI** e **Anthropic** da plataforma vêm
exclusivamente do GitHub e são sincronizadas com o Supabase Vault pelo workflow
`Deploy zica-ia-posts VPS`.

| Item | Onde |
|---|---|
| Secrets | GitHub → repositório → Settings → Environments → `zica-ai-production` → `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` (opcional) |
| Validação | o workflow chama a API do provedor e só grava no Vault se a chave for aceita |
| Destino | Vault: `zica_ai_openai_api_key`, `zica_ai_anthropic_api_key` (RPC `sync_zica_ai_provider_secret_from_ci`, somente service_role) |
| Leitura em runtime | `_shared/byok-resolver.ts` → `get_zica_ai_provider_secret` |

## Rotas desativadas (migração `ai_keys_github_single_source`)

- Chaves por usuário (`user_settings.openai_api_key`, `anthropic_api_key`, `byok_enabled`) são
  limpas e mantidas vazias por gatilho. A tela **Motor de IA & Chaves** ainda valida uma chave
  colada, mas não a grava; a resposta informa qual secret do GitHub deve ser atualizado.
- `persist_validated_user_ai_key` recusa `openai`/`anthropic` (`provider_managed_by_github`).
  Gemini e Serper continuam por usuário.
- `set_zica_ai_provider_secret` / `delete_zica_ai_provider_secret` não são mais executáveis por
  usuários logados (apenas service_role).
- Backups `paused_*` do Vault (05/09) removidos.

## Para trocar uma chave

1. Atualizar o secret no environment `zica-ai-production`.
2. Rodar o workflow `Deploy zica-ia-posts VPS` (ou fazer push em `main`).
3. Conferir no resumo do run os passos "Validate OpenAI secret" e "Synchronize ... with Supabase Vault".
