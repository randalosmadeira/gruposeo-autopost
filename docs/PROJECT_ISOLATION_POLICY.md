# Política de isolamento do Autopublic-prod e Zica.ai

## Identidade vinculante

| Recurso | Valor autorizado |
|---|---|
| Repositório | `randalosmadeira/gruposeo-autopost` |
| Produto | `Autopublic-prod / Zica.ai` |
| Projeto Supabase | `Autopublic-prod` |
| Project ref Supabase | `ubahrbgaxrkjxklytobl` |
| URL Supabase | `https://ubahrbgaxrkjxklytobl.supabase.co` |
| Domínio | `app.zica.posts.zicajuris.com.br` |
| Namespace VPS | `/opt/zica-ai` |
| Prefixo de runtime | `zica-ai-orchestrator` |
| Porta local atual | `127.0.0.1:8787` |
| Prefixo obrigatório de secrets | `ZICA_AI_` |
| Usuário de deploy esperado | `deploy_zica_ai` |

## Regras obrigatórias

1. Este repositório só pode usar chaves Supabase emitidas para `ubahrbgaxrkjxklytobl`.
2. A chave pública deve ser fornecida por `ZICA_AI_SUPABASE_PUBLISHABLE_KEY`; a chave administrativa deve ser fornecida por `ZICA_AI_SUPABASE_SERVICE_ROLE_KEY`.
3. Nenhuma credencial de ZicaJuris, ZICAGlam.IA, JurisExplicado ou ZicaCortex poderá ser usada como fallback.
4. OpenAI, Anthropic, WordPress, Make, NFS-e, Google, provedores de imagem, webhooks e demais integrações devem possuir credenciais exclusivas do Autopublic-prod ou credenciais por destino armazenadas em cofre próprio.
5. Banco, Auth, Storage, Edge Functions, Vault, filas, cron, buckets, webhooks, logs e chaves de automação não podem ser compartilhados com outro software.
6. A VPS HostGator pode ser compartilhada apenas como host. Diretório, usuário Unix, chave SSH, porta, processo, container, rede, volume, logs, backups, cron e virtual host devem permanecer isolados.
7. O usuário de deploy não deve possuir permissão irrestrita para controlar containers, arquivos ou processos dos demais produtos. O acesso deve ser limitado ao namespace `/opt/zica-ai` e aos serviços `zica-ai-orchestrator-*`.
8. `ssh-keyscan` executado durante o deploy não substitui pinagem de host. A identidade SSH deve ser armazenada e conferida por known_hosts dedicado.
9. Arquivos `.env` reais e chaves literais são proibidos no Git e nos workflows.
10. Comunicação com outro produto deve ocorrer por API autenticada, registrada e revogável, nunca por acesso direto ao banco ou compartilhamento de `service_role`.

## Migração sem interrupção

1. inventariar integrações e consumidores atuais em modo somente leitura;
2. gerar backup restaurável de banco, Storage, configuração e filas;
3. provisionar os secrets exclusivos e o usuário `deploy_zica_ai`;
4. validar known_hosts fixo, permissões mínimas e acesso apenas ao namespace autorizado;
5. executar release paralela, health check, testes de fila, publicação, idempotência e rollback;
6. trocar as credenciais no GitHub Environment e no runtime de forma atômica;
7. monitorar a janela de estabilização;
8. revogar credenciais antigas somente após comprovação do rollback.

A separação não autoriza excluir artigos, fontes, filas, agendas, imagens, logs, corpus, publicações ou registros de auditoria.
