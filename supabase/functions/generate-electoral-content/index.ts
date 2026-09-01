import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ElectoralConfig = {
  candidateName?: string;
  ballotName?: string;
  ballotNumber?: string;
  politicalParty?: string;
  federationOrCoalition?: string;
  candidateRole?: string;
  campaignCnpj?: string;
  campaignPhase?: string;
  electionDate?: string;
  articleType?: 'pillar' | 'satellite' | 'territorial';
  campaignTopics?: string[];
  targetCities?: string[];
  usesSyntheticMedia?: boolean;
  syntheticMediaDisclosure?: boolean;
  sourceVerificationRequired?: boolean;
  legalReviewRequired?: boolean;
  legalReviewConfirmed?: boolean;
  paidBoosting?: boolean;
  paidBoostingProvider?: string;
  compliance?: { blockers?: string[]; warnings?: string[]; canPublish?: boolean; score?: number };
};

const digits = (value = '') => value.replace(/\D/g, '');

function validateDraftConfig(config: ElectoralConfig) {
  const blockers: string[] = [];
  if (!config.candidateName?.trim()) blockers.push('candidateName ausente');
  if (!config.ballotName?.trim()) blockers.push('ballotName ausente');
  if (!config.ballotNumber?.trim()) blockers.push('ballotNumber ausente');
  if (!config.politicalParty?.trim()) blockers.push('politicalParty ausente');
  if (!config.candidateRole?.trim()) blockers.push('candidateRole ausente');
  if (digits(config.campaignCnpj).length !== 14) blockers.push('campaignCnpj inválido');
  if (config.sourceVerificationRequired !== true) blockers.push('sourceVerificationRequired deve ser true');
  if (config.legalReviewRequired !== true) blockers.push('legalReviewRequired deve ser true');
  if (config.usesSyntheticMedia && !config.syntheticMediaDisclosure) blockers.push('rotulagem de mídia sintética ausente');
  if (config.paidBoosting && /google/i.test(config.paidBoostingProvider || '')) blockers.push('Google Ads político-eleitoral bloqueado no Brasil');
  return blockers;
}

function targetWords(articleType: ElectoralConfig['articleType']) {
  if (articleType === 'pillar') return 2200;
  if (articleType === 'satellite') return 1400;
  return 900;
}

function escapeHtml(value = '') {
  return value.replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[char] || char));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { keyword, template, config = {}, projectId, notifyIndexNow } = await req.json();
    const electoral = config as ElectoralConfig;
    const draftBlockers = validateDraftConfig(electoral);

    if (!String(keyword || '').trim()) draftBlockers.push('keyword ausente');
    if (draftBlockers.length) {
      return new Response(JSON.stringify({
        error: 'electoral_draft_blocked',
        blockers: draftBlockers,
      }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const candidate = escapeHtml(electoral.ballotName || electoral.candidateName || 'Candidatura');
    const topic = escapeHtml(String(keyword));
    const party = escapeHtml(electoral.politicalParty || '');
    const number = escapeHtml(electoral.ballotNumber || '');
    const role = escapeHtml(electoral.candidateRole || '');
    const cities = Array.isArray(electoral.targetCities) ? electoral.targetCities.map(escapeHtml).join(', ') : '';
    const sections = Array.isArray(electoral.campaignTopics) ? electoral.campaignTopics.map(escapeHtml).join(', ') : '';
    const pendingPublishBlockers = Array.isArray(electoral.compliance?.blockers) ? electoral.compliance?.blockers : [];

    // This endpoint deliberately returns a compliance-safe scaffold until a configured AI provider
    // is wired to the same factual directives. It never auto-approves electoral publication.
    const content = [
      `<article data-electoral-draft="true">`,
      `<p><strong>RASCUNHO ELEITORAL — REVISÃO HUMANA OBRIGATÓRIA</strong></p>`,
      `<h1>${topic}</h1>`,
      `<p><strong>Candidatura:</strong> ${candidate} · ${party} · ${number} · ${role}</p>`,
      cities ? `<p><strong>Território editorial:</strong> ${cities}</p>` : '',
      sections ? `<p><strong>Editoria(s):</strong> ${sections}</p>` : '',
      `<h2>1. O problema público</h2>`,
      `<p>[VERIFICAR] Descreva o problema com fonte primária, data e URL. Não inserir estatística sem comprovação.</p>`,
      `<h2>2. Contexto e impacto</h2>`,
      `<p>[VERIFICAR] Explique o contexto de forma factual, sem perfilamento político individual e sem atribuir intenção a terceiros.</p>`,
      `<h2>3. Proposta declarada pela candidatura</h2>`,
      `<p>[VERIFICAR] Registre a proposta exatamente como aprovada pela campanha e diferencie proposta de resultado garantido.</p>`,
      `<h2>4. Competência real do cargo</h2>`,
      `<p>[VERIFICAR] Informe o que o cargo pode propor, votar, fiscalizar ou executar, sem promessa de resultado dependente de terceiros.</p>`,
      `<h2>5. Fontes</h2>`,
      `<ul><li>[FONTE PRIMÁRIA — URL — DATA — AFIRMAÇÃO SUPORTADA]</li></ul>`,
      electoral.usesSyntheticMedia
        ? `<p><strong>ROTULAGEM DE IA:</strong> conteúdo sintético/multimídia deve identificar de modo explícito e destacado a fabricação/manipulação e a tecnologia utilizada.</p>`
        : `<p><strong>TRILHA DE IA:</strong> assistência editorial registrada; verificar se alguma peça multimídia exige rotulagem específica.</p>`,
      pendingPublishBlockers.length
        ? `<p><strong>PUBLICAÇÃO BLOQUEADA:</strong> ${pendingPublishBlockers.map(escapeHtml).join(' | ')}</p>`
        : `<p><strong>PUBLICAÇÃO:</strong> ainda depende de confirmação humana/jurídica da peça final.</p>`,
      `</article>`,
    ].filter(Boolean).join('\n');

    return new Response(JSON.stringify({
      ok: true,
      message: `Rascunho eleitoral preparado para ${keyword}`,
      phase: electoral.campaignPhase || 'não informada',
      target_words: targetWords(electoral.articleType),
      template: template || 'authority-article',
      project_id: projectId || null,
      indexnow_requested: Boolean(notifyIndexNow),
      approved_for_draft: true,
      approved_for_publication: false,
      publication_blockers: pendingPublishBlockers,
      content,
      audit: {
        generated_at: new Date().toISOString(),
        ai_provider: 'not-configured-in-this-endpoint',
        source_verification_required: true,
        human_legal_review_required: true,
        cross_tenant_hardcodes: false,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
