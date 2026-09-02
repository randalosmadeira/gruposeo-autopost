export type ElectoralCorpusUnit = {
  unit_key: string;
  unit_type: string;
  title: string;
  body: string;
  topic: string;
  tags: string[];
  verification_status: string;
  usage_scope: string;
  risk_flags: string[];
  priority: number;
  source_locator: Record<string, unknown>;
  metadata: Record<string, unknown>;
  source_slug: string;
  source_title: string;
  source_type: string;
  authority_level: string;
};

function normalize(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(value: unknown) {
  return normalize(value).split(/\s+/).filter((item) => item.length >= 3);
}

export async function loadSafeElectoralContext(
  client: any,
  campaignPresetId: string,
  query: string,
  limit = 12,
): Promise<ElectoralCorpusUnit[]> {
  const { data, error } = await client
    .from('electoral_agent_content_context')
    .select('unit_key,unit_type,title,body,topic,tags,verification_status,usage_scope,risk_flags,priority,source_locator,metadata,source_slug,source_title,source_type,authority_level')
    .eq('campaign_preset_id', campaignPresetId)
    .order('priority', { ascending: false })
    .limit(150);
  if (error) throw error;

  const needle = new Set(tokens(query));
  return (data || [])
    .map((item: ElectoralCorpusUnit) => {
      const haystack = [item.title, item.topic, ...(item.tags || []), item.body].join(' ');
      const matches = tokens(haystack).reduce((sum, tokenValue) => sum + (needle.has(tokenValue) ? 1 : 0), 0);
      const officialBoost = item.authority_level === 'official_campaign' ? 20 : 0;
      const verificationPenalty = ['needs_primary_source', 'needs_external_verification'].includes(item.verification_status) ? 8 : 0;
      return { ...item, _score: Number(item.priority || 0) + matches * 12 + officialBoost - verificationPenalty };
    })
    .sort((a: any, b: any) => b._score - a._score || String(a.title).localeCompare(String(b.title)))
    .slice(0, Math.max(1, Math.min(30, limit)))
    .map(({ _score, ...item }: any) => item as ElectoralCorpusUnit);
}

export function formatSafeElectoralContext(units: ElectoralCorpusUnit[]) {
  return units.map((item, index) => {
    const verification = item.verification_status === 'campaign_official'
      ? 'PROPOSTA/POSIÇÃO OFICIAL DA CAMPANHA — não apresentar como resultado garantido.'
      : item.verification_status === 'needs_external_verification'
        ? '[RECONSULTAR FONTE EXTERNA] antes de afirmar como fato.'
        : item.verification_status === 'needs_primary_source'
          ? '[VERIFICAR FONTE PRIMÁRIA] antes de afirmar como fato.'
          : 'Usar com revisão humana.';
    return [
      `UNIDADE ${index + 1}: ${item.title} [${item.unit_key}]`,
      `Fonte: ${item.source_title} (${item.source_slug})`,
      `Tipo: ${item.unit_type} | Tópico: ${item.topic}`,
      `Status: ${item.verification_status} | Regra: ${verification}`,
      `Riscos: ${(item.risk_flags || []).join(', ') || 'nenhum'}`,
      `Localizador: ${JSON.stringify(item.source_locator || {})}`,
      `Base controlada: ${item.body}`,
    ].join('\n');
  }).join('\n\n');
}
