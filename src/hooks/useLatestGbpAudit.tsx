import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

/**
 * Hook opt-in: qualquer gerador de conteúdo pode chamar useLatestGbpAudit()
 * e injetar `gbpContext` no prompt para produzir conteúdo local-SEO-aware.
 */
export function useLatestGbpAudit(projectId?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['latest-gbp-audit', user?.id, projectId],
    queryFn: async () => {
      if (!user) return null;
      let q = supabase
        .from('gbp_audits')
        .select('id, business_name, city, category, ai_insights, created_at')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1);
      if (projectId) q = q.eq('project_id', projectId);
      const { data } = await q.maybeSingle();
      return data;
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
  });
}

/** Formata insights de uma auditoria para injetar como contexto em prompts. */
export function buildGbpPromptContext(audit: {
  business_name: string;
  city: string;
  category?: string | null;
  ai_insights: any;
} | null | undefined): string {
  if (!audit?.ai_insights) return '';
  const i = audit.ai_insights;
  const parts: string[] = [];
  parts.push(`## Contexto de SEO Local (Auditoria GBP)`);
  parts.push(`Negócio: ${audit.business_name} — ${audit.city}${audit.category ? ` (${audit.category})` : ''}`);
  if (i.diagnostico_perfil_proprio) parts.push(`Diagnóstico: ${i.diagnostico_perfil_proprio}`);
  if (Array.isArray(i.oportunidades_conteudo) && i.oportunidades_conteudo.length)
    parts.push(`Oportunidades: ${i.oportunidades_conteudo.join('; ')}`);
  if (Array.isArray(i.palavras_chave_locais) && i.palavras_chave_locais.length)
    parts.push(`Palavras-chave locais: ${i.palavras_chave_locais.join(', ')}`);
  if (Array.isArray(i.recomendacoes_prioritarias) && i.recomendacoes_prioritarias.length)
    parts.push(`Prioridades: ${i.recomendacoes_prioritarias.slice(0, 5).join('; ')}`);
  return parts.join('\n');
}
