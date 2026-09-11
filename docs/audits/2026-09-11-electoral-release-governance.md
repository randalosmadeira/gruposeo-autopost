# Zica Posts Eleitoral: governança de release

## Estado dos microblocos

| Bloco | PR | Merge SHA | Resultado |
|---|---:|---|---|
| E2E Generation 001 | #101 | `29636fe4c302a5157302b2f958a5ef6291c3ac19` | Aprovado |
| GESTOR Acceptance 002 | #102 | `62399535be613b16cedde12bfad5bed09536baf0` | Aprovado |
| Abuse Protection 003 | #103 | `7c4027197cd7e124ed6775337b206c9faa632a0a` | Aprovado |
| Observability 004 | #104 | `9d2e9c1fd2416386c0f549ca691523b05e6c50fa` | Aprovado |
| Data Reconciliation 005 | #105 | `4a3bfd13888722f12708f5ad6250ab24ef356902` | Aprovado |
| Release Governance 006 | PR do próprio bloco | fixado pelo squash merge | Gate obrigatório |

## Regra de liberação

Merge, migrations, Edge Functions, produção e homologação exigem testes, build, contrato eleitoral, SHA exato da cabeça da PR e ausência de revisão bloqueadora. Falhas de segurança, isolamento, integridade ou proteção de dados nunca são ignoradas.

A ausência da URL da política de privacidade eleitoral está definitivamente cancelada como pendência e não constitui bloqueio técnico, de merge, deploy ou homologação.
