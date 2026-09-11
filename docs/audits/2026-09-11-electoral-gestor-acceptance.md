# NEXUS-ZP-ELECTORAL-GESTOR-ACCEPTANCE-002

Data da homologação: 2026-09-11 UTC

## Resultado

O usuário GESTOR ativo foi homologado para o espaço operacional eleitoral. A engenharia de prompts permanece deliberadamente restrita ao administrador porque contém configuração privilegiada e não integra o escopo operacional do GESTOR.

## Matriz executada em produção

| Gate | Resultado |
| --- | --- |
| Identidade GESTOR ativa | 1 usuário, e-mail mascarado |
| Papel organizacional | `owner`, status `active` |
| Assinatura | plano `internal`, status `active`, feature `electoral=true` |
| RPC `can_manage_electoral_campaign()` | `true` |
| Recursos visíveis por RLS | 66 |
| Configurações visíveis por RLS | 1 |
| Opt-ins visíveis por RLS | 0, base vazia no momento do teste |
| DML de recurso | insert, update e delete aprovados em transação revertida |
| Rollback | nenhum registro de homologação persistido |
| Controle sem autorização eleitoral | RPC `false` e zero linhas nas três tabelas |
| `/apoiadores` em produção | HTTP 200, shell público válido |
| Edge administrativa sem JWT | HTTP 401 |

## Superfícies aceitas

- Campanha Eleitoral
- Rede & Portais
- Console Editorial e Histórico
- Base de Apoiadores
- Link público canônico `/apoiadores`
- Navegação desktop e entrada mobile

## Proteções preservadas

- RLS e RPC são a fonte de verdade, não o menu do cliente.
- Usuário sem plano e papel eleitoral não lê recursos, configurações ou opt-ins.
- A Edge administrativa exige JWT e repete a autorização eleitoral.
- Hash de token público e fingerprint não são retornados ao GESTOR.
- Nenhum dado real foi criado, alterado ou excluído durante a homologação.
- A ausência de URL de política de privacidade eleitoral não integra este gate.

