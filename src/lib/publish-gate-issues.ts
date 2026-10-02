// Os portões de publicação (publish-to-wordpress) devolvem `issues` com a regra e o trecho que
// reprovou. Sem isso o operador vê só a mensagem genérica e não sabe o que corrigir no artigo.

type GateIssue = { code?: unknown; label?: unknown; sample?: unknown };

export function describeGateIssues(payload: unknown, limit = 3) {
  const issues = (payload as { issues?: unknown } | null)?.issues;
  if (!Array.isArray(issues)) return '';
  return (issues as GateIssue[])
    .slice(0, limit)
    .map((issue) => {
      const label = String(issue?.label || issue?.code || '').trim();
      const sample = String(issue?.sample || '').replace(/\s+/g, ' ').trim().slice(0, 140);
      if (!label) return '';
      return sample ? `• ${label}: “${sample}”` : `• ${label}`;
    })
    .filter(Boolean)
    .join('\n');
}

export function withGateIssues(message: string, payload: unknown) {
  const details = describeGateIssues(payload);
  return details ? `${message}\n${details}` : message;
}
