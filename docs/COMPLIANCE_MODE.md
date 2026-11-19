# Modo de conformidade publicitária (Provimento 205/2021 da OAB)

Cada organização escolhe como o sistema trata os trechos que a verificação do Provimento 205/2021 aponta
(promessa de resultado, superlativo, comparação, urgência comercial, apelo ao desespero, captação direta).

A responsabilidade pela publicidade é do responsável pelo escritório. O sistema só orienta: avisa, explica e,
por padrão, deixa publicar. Só bloqueia se a própria organização escolher o modo rígido.

## Os três modos

| Modo | Valor no banco | O que acontece |
| --- | --- | --- |
| Desligado | `off` | A verificação não roda. Nada é mostrado, nada é registrado. |
| Aviso (padrão) | `advisory` | A verificação roda, o editor mostra os pontos com explicação e sugestão, e a publicação **nunca é bloqueada**. |
| Rígido | `strict` | Comportamento antigo: qualquer ponto apontado bloqueia a publicação (HTTP 409, código `compliance_gate`). |

Ausente, nulo ou inválido vale `advisory`. As organizações já existentes entram em `advisory` ao aplicar a
migração. Como o padrão antigo era o bloqueio, isso é uma mudança de comportamento: quem quiser manter o
bloqueio escolhe "Rígido" em Minha Conta.

## Como o cliente muda

Minha Conta, cartão "Verificação de publicidade (OAB)". Aparece só para o dono e os administradores da
organização. Escolher uma opção e clicar em Salvar.

Quem pode gravar é decidido no banco, não na tela: a política `organizations_admin_update` já limita o
UPDATE de `organizations` a `owner` e `admin`. A migração não cria políticas nem concede permissões. Qualquer
membro da organização consegue ler o modo (política `organizations_member_select`), o que o editor precisa.

## Onde é aplicado

| Ponto | Efeito |
| --- | --- |
| `supabase/functions/publish-to-wordpress` (único portão de publicação; a fila, a API WordPress, o agendamento e o piloto automático passam por ele) | `strict` bloqueia com 409 `compliance_gate`. `advisory` publica, grava `articles.config.compliance_advisory` e devolve `compliance_warnings`. `off` não verifica. |
| `supabase/functions/_shared/nexus-review-import.ts` (importação de revisão confiável) | Só em `strict` o achado reprova a importação (`publication_quality_failure`). Em `advisory` o achado vai em `compliance_warnings` no resultado de cada artigo. |
| Editor, aba de conformidade (`ComplianceChecker`) | `off`: informa que está desligada. `advisory`: pontos com explicação e sugestão, sem linguagem de reprovação. `strict`: tela anterior, sem mudança. |
| Editor, botão Publicar (`ArticleEditor`) | `advisory` com pontos: abre a janela "Publicar mesmo assim (ciente)" / "Voltar e revisar". Sem pontos, publica direto. |
| Publicação em massa (`BulkPublishModal`) | Mostra "Publicado com N aviso(s)" nas linhas publicadas com pontos. |
| Configurações, Minha Conta (`ComplianceModeCard`) | Seletor do modo. |

Os demais portões de publicação (título, CTA quebrada, slug duplicado, resíduos, imagem, revisão e fonte
primária, aprovação NEXUS, tamanho e estrutura do texto) não dependem do modo e seguem como estavam.

A regra em si (`COMPLIANCE_RULES` e `findComplianceViolations` em `_shared/publication-quality.ts`) não mudou.
A lógica do modo mora em `supabase/functions/_shared/compliance-mode.ts` (`normalizeComplianceMode`,
`resolveComplianceMode`, `evaluateCompliance`, `runComplianceCheck`), que o front-end reexporta em
`src/lib/compliance-mode.ts`.

## O que é registrado

No modo aviso, quando há pontos, o artigo recebe em `config.compliance_advisory`:

```json
{
  "mode": "advisory",
  "issues": [{ "code": "promessa_resultado", "label": "...", "field": "content", "sample": "trecho..." }],
  "checked_at": "2026-11-13T12:00:00.000Z",
  "acknowledged_by": "<id do usuário que deu o ciente, ou null>"
}
```

- `acknowledged_by` só é preenchido quando o corpo da chamada traz `acknowledgeCompliance: true`, o que o
  editor faz ao clicar em "Publicar mesmo assim (ciente)". Publicação em massa, agendada e automática gravam `null`.
- Sem pontos, ou nos modos `strict` e `off`, a chave é removida (não fica aviso velho no artigo).
- Esse campo não entra na impressão digital editorial (`editorialFingerprint`), então não invalida a revisão NEXUS.
- Quem mudou o modo da organização e quando: `organizations.compliance_mode_updated_by` e `compliance_mode_updated_at`,
  preenchidos por gatilho no banco (o cliente não escolhe esses valores).

A resposta de sucesso do publicador ganha `compliance_mode` e `compliance_warnings` (lista vazia quando não há pontos).

## Falhas e casos limite

- Coluna ainda inexistente (migração não aplicada): o publicador trata como `advisory`.
- Qualquer outra falha ao ler o modo é lançada (o publicador responde 502 e a fila tenta de novo). Uma
  organização no modo rígido não vira "aviso" por causa de uma falha passageira do banco.
- O reparo automático de captação direta (`repairSolicitationCtas`, troca "Fale agora com..." por um convite
  sóbrio) continua rodando em todos os modos, porque não é um portão. Decisão pendente do dono: desligá-lo no modo `off`.

## Migração e reversão

Arquivo: `supabase/migrations/20261113110000_compliance_mode.sql` (idempotente; **não executada** na produção
por esta entrega). Cria `compliance_mode` (`not null default 'advisory'`, restrição aos três valores),
`compliance_mode_updated_by`, `compliance_mode_updated_at` e o gatilho `compliance_mode_audit`.

Reversão (também comentada no próprio arquivo):

```sql
drop trigger if exists compliance_mode_audit on public.organizations;
drop function if exists private.compliance_mode_audit();
alter table public.organizations drop constraint if exists organizations_compliance_mode_check;
alter table public.organizations drop column if exists compliance_mode_updated_at,
  drop column if exists compliance_mode_updated_by, drop column if exists compliance_mode;
```

Sem a coluna o publicador volta a tratar toda organização como `advisory`. Para restaurar o bloqueio antigo para
todos antes de remover a coluna: `update public.organizations set compliance_mode = 'strict';`.

## Testes

`src/test/compliance-mode.test.ts` (módulo, importação de revisão, fonte do publicador, migração),
`src/test/compliance-mode-ui.test.tsx` (editor, janela de ciente, cartão de configuração),
`src/test/use-compliance-mode.test.tsx` (hook), além de `publication-quality-gates.test.ts` e
`compliance-gate-generator-alignment.test.ts`, que seguem cobrindo a regra.
