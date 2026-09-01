import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  formatElectoralFooter,
  resolveElectoralPreset,
} from "../_shared/electoral-campaign-presets.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ElectoralConfig = {
  campaignPresetId?: string;
  campaignCnpj?: string;
  campaignPhase?: string;
  electionDate?: string;
  articleType?: 'pillar' | 'satellite' | 'territorial';
  campaignTopics?: string[];
  targetCities?: string[];
  targetDistricts?: string[];
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
  if (digits(config.campaignCnpj).length !== 14) blockers.push('campaignCnpj inválido ou não confirmado');
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
    const preset = resolveElectoralPreset(electoral.campaignPresetId);
    const draftBlockers = validateDraftConfig(electoral);

    if (!String(keyword || '').trim()) draftBlockers.push('keyword ausente');
    if (draftBlockers.length) {
      return new Response(JSON.stringify({
        error: 'electoral_draft_blocked',
        blockers: draftBlockers,
        preset_id: preset.id,
      }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const candidate = escapeHtml(preset.ballotName || preset.candidateName);
    const topic = escapeHtml(String(keyword));
    const party = escapeHtml(preset.politicalParty);
    const number = escapeHtml(preset.ballotNumber);
    const role = escapeHtml(preset.candidateRole);
    const slogan = escapeHtml(preset.slogan);
    const cities = Array.isArray(electoral.targetCities) ? electoral.targetCities.map((item) => escapeHtml(String(item))).join(', ') : '';
    const districts = Array.isArray(electoral.targetDistricts) ? electoral.targetDistricts.map((item) => escapeHtml(String(item))).join(', ') : '';
    const sections = Array.isArray(electoral.campaignTopics) ? electoral.campaignTopics.map((item) => escapeHtml(String(item))).join(', ') : '';
    const pendingPublishBlockers = Array.isArray(electoral.compliance?.blockers) ? electoral.compliance?.blockers : [];
    const footer = escapeHtml(formatElectoralFooter(preset, electoral.campaignCnpj));

    const content = [
      `<article data-electoral-draft="true" data-campaign-preset="${escapeHtml(preset.id)}">`,
      `<p><strong>RASCUNHO ELEITORAL — REVISÃO HUMANA OBRIGATÓRIA</strong></p>`,
      `<h1>${topic}</h1>`,
      `<p><strong>Candidatura:</strong> ${candidate} · ${party} · ${number} · ${role}</p>`,
      `<p><strong>Slogan cadastrado:</strong> ${slogan}</p>`,
      cities ? `<p><strong>Municípios para contexto editorial:</strong> ${cities}</p>` : '',
      districts ? `<p><strong>Distritos para contexto editorial:</strong> ${districts}</p>` : '',
      sections ? `<p><strong>Editoria(s):</strong> ${sections}</p>` : '',
      `<h2>1. O problema público</h2>`,
      `<p>[VERIFICAR] Descreva o problema com fonte primária, data e URL. Não inserir estatística sem comprovação.</p>`,
      `<h2>2. Contexto e impacto</h2>`,
      `<p>[VERIFICAR] Explique o contexto de forma factual. A localidade pode contextualizar dados públicos, mas não deve ser usada para personalização persuasiva de mensagem política.</p>`,
      `<h2>3. Proposta cadastrada pela candidatura</h2>`,
      `<p>[VERIFICAR] Vincule a pauta a uma das bandeiras cadastradas e diferencie proposta de resultado garantido.</p>`,
      `<ul>${preset.fixedIssues.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`,
      `<h2>4. Competência real do cargo</h2>`,
      `<p>[VERIFICAR] Informe o que o cargo pode propor, votar ou fiscalizar, sem promessa de resultado dependente de terceiros.</p>`,
      `<h2>5. Fontes</h2>`,
      `<ul><li>[FONTE PRIMÁRIA — URL — DATA — AFIRMAÇÃO SUPORTADA]</li></ul>`,
      electoral.usesSyntheticMedia
        ? `<p><strong>ROTULAGEM DE IA:</strong> conteúdo sintético/multimídia deve identificar de modo explícito e destacado a fabricação/manipulação e a tecnologia utilizada.</p>`
        : `<p><strong>TRILHA DE IA:</strong> assistência editorial registrada; verificar se alguma peça multimídia exige rotulagem específica.</p>`,
      pendingPublishBlockers.length
        ? `<p><strong>PUBLICAÇÃO BLOQUEADA:</strong> ${pendingPublishBlockers.map((item) => escapeHtml(String(item))).join(' | ')}</p>`
        : `<p><strong>PUBLICAÇÃO:</strong> ainda depende de confirmação humana/jurídica da peça final.</p>`,
      `<footer>${footer}</footer>`,
      `</article>`,
    ].filter(Boolean).join('\n');

    return new Response(JSON.stringify({
      ok: true,
      message: `Rascunho eleitoral preparado para ${keyword}`,
      preset_id: preset.id,
      fixed_campaign_identity: {
        candidate_name: preset.candidateName,
        ballot_name: preset.ballotName,
        ballot_number: preset.ballotNumber,
        role: preset.candidateRole,
        party: preset.politicalParty,
        slogan: preset.slogan,
        state: preset.state,
      },
      phase: electoral.campaignPhase || 'não informada',
      target_words: targetWords(electoral.articleType),
      template: template || 'authority-article',
      project_id: projectId || null,
      indexnow_requested: Boolean(notifyIndexNow),
      approved_for_draft: true,
      approved_for_publication: false,
      publication_blockers: pendingPublishBlockers,
      campaign_footer: formatElectoralFooter(preset, electoral.campaignCnpj),
      content,
      audit: {
        generated_at: new Date().toISOString(),
        ai_provider: 'not-configured-in-this-endpoint',
        source_verification_required: true,
        human_legal_review_required: true,
        preset_enforced_server_side: true,
        persuasive_geo_personalization: false,
        vote_recommendation: false,
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
