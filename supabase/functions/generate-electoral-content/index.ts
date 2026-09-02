import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { formatElectoralFooter, resolveElectoralPreset } from "../_shared/electoral-campaign-presets.ts";
import { loadSafeElectoralContext } from "../_shared/electoral-content-context.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const admin = SUPABASE_URL && SERVICE_ROLE ? createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } }) : null;

type ElectoralConfig = {
  campaignPresetId?: string;
  campaignCnpj?: string;
  campaignPhase?: string;
  electionDate?: string;
  articleType?: 'pillar' | 'satellite' | 'territorial';
  requestedTargetWords?: number;
  biography?: string;
  legislativeProjects?: string;
  documentedActs?: string;
  factualDifferentials?: string;
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

type PortalResource = {
  label: string;
  url: string;
  category: string;
  tags: string[];
  editorial_hook: string;
  priority: number;
};

type PortalSettings = {
  primary_portals?: string[];
  min_links_per_post?: number;
  max_links_per_post?: number;
  contextual_linking_enabled?: boolean;
};

const digits = (value = '') => value.replace(/\D/g, '');
const clampTarget = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(500, Math.min(6000, Math.round(parsed)));
};
function fallbackTarget(articleType: ElectoralConfig['articleType']) {
  if (articleType === 'pillar') return 4000;
  if (articleType === 'satellite') return 1400;
  return 900;
}
function validateDraftConfig(config: ElectoralConfig) {
  const blockers: string[] = [];
  if (digits(config.campaignCnpj).length !== 14) blockers.push('campaignCnpj inválido ou não confirmado');
  if (config.sourceVerificationRequired !== true) blockers.push('sourceVerificationRequired deve ser true');
  if (config.legalReviewRequired !== true) blockers.push('legalReviewRequired deve ser true');
  if (config.usesSyntheticMedia && !config.syntheticMediaDisclosure) blockers.push('rotulagem de mídia sintética ausente');
  if (config.paidBoosting && /google/i.test(config.paidBoostingProvider || '')) blockers.push('Google Ads político-eleitoral bloqueado no Brasil');
  return blockers;
}
function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] || char));
}
function normalizeTokens(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter((token) => token.length >= 3);
}
async function loadPortalNetwork(presetId: string) {
  if (!admin) return { settings: null as PortalSettings | null, resources: [] as PortalResource[] };
  const [{ data: settings }, { data: resources }] = await Promise.all([
    admin.from('electoral_portal_settings').select('primary_portals,min_links_per_post,max_links_per_post,contextual_linking_enabled').eq('campaign_preset_id', presetId).maybeSingle(),
    admin.from('electoral_portal_resources').select('label,url,category,tags,editorial_hook,priority').eq('campaign_preset_id', presetId).eq('active', true).order('priority', { ascending: false }),
  ]);
  return { settings: (settings || null) as PortalSettings | null, resources: (resources || []) as PortalResource[] };
}
function choosePortalResources(keyword: string, electoral: ElectoralConfig, settings: PortalSettings | null, resources: PortalResource[]) {
  if (!settings?.contextual_linking_enabled || !resources.length) return [] as PortalResource[];
  const context = [keyword, ...(electoral.campaignTopics || []), ...(electoral.targetCities || []), ...(electoral.targetDistricts || [])].join(' ');
  const contextTokens = new Set(normalizeTokens(context));
  const min = Math.max(0, Math.min(12, Number(settings.min_links_per_post ?? 2)));
  const max = Math.max(min, Math.min(12, Number(settings.max_links_per_post ?? 5)));
  const desired = electoral.articleType === 'pillar' ? max : electoral.articleType === 'satellite' ? Math.min(max, min + 1) : min;
  const primary = new Set((settings.primary_portals || []).map((url) => String(url).replace(/\/$/, '')));
  return resources.map((resource) => {
    const searchable = normalizeTokens([resource.label, resource.category, ...(resource.tags || [])].join(' '));
    const matches = searchable.reduce((sum, token) => sum + (contextTokens.has(token) ? 1 : 0), 0);
    const isPrimary = primary.has(String(resource.url).replace(/\/$/, ''));
    return { resource, score: Number(resource.priority || 0) + matches * 25 + (isPrimary ? 1000 : 0) };
  }).sort((a, b) => b.score - a.score || a.resource.label.localeCompare(b.resource.label)).slice(0, desired).map((item) => item.resource);
}
function renderPortalReferences(resources: PortalResource[]) {
  if (!resources.length) return '';
  return [
    '<aside class="zica-related-network" data-editorial-links="contextual">',
    '<h2>Você também pode conhecer</h2>',
    '<p>Referências e canais relacionados selecionados pelo contexto editorial desta publicação. A presença de um link não implica apoio, endosso ou vínculo político da página referenciada.</p>',
    '<ul>',
    ...resources.map((resource) => `<li><strong>${escapeHtml(resource.editorial_hook || 'Veja também')}:</strong> <a href="${escapeHtml(resource.url)}">${escapeHtml(resource.label)}</a></li>`),
    '</ul>',
    '</aside>',
  ].join('\n');
}
function renderCorpusContext(units: any[]) {
  if (!units.length) return '';
  return [
    '<section class="zica-controlled-corpus" data-corpus-mode="safe">',
    '<h2>Base editorial controlada relacionada à pauta</h2>',
    '<p>As unidades abaixo são referências internas para desenvolvimento do rascunho. Propostas devem ser identificadas como propostas. Alegações e fatos pendentes devem ser conferidos na fonte indicada antes da publicação.</p>',
    '<ul>',
    ...units.map((unit) => {
      const marker = unit.verification_status === 'campaign_official'
        ? 'PROPOSTA/POSIÇÃO DA CAMPANHA'
        : unit.verification_status === 'needs_external_verification'
          ? 'RECONSULTAR FONTE EXTERNA'
          : unit.verification_status === 'needs_primary_source'
            ? 'VERIFICAR FONTE PRIMÁRIA'
            : 'REVISÃO HUMANA';
      return `<li data-unit-key="${escapeHtml(unit.unit_key)}"><strong>${escapeHtml(marker)}:</strong> ${escapeHtml(unit.title)} — ${escapeHtml(unit.body)}</li>`;
    }),
    '</ul>',
    '</section>',
  ].join('\n');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  try {
    const { keyword, template, config = {}, projectId, notifyIndexNow } = await req.json();
    const electoral = config as ElectoralConfig;
    const preset = resolveElectoralPreset(electoral.campaignPresetId);
    const draftBlockers = validateDraftConfig(electoral);
    const requestedTargetWords = clampTarget(electoral.requestedTargetWords, fallbackTarget(electoral.articleType));
    if (!String(keyword || '').trim()) draftBlockers.push('keyword ausente');
    if (draftBlockers.length) return new Response(JSON.stringify({ error: 'electoral_draft_blocked', blockers: draftBlockers, preset_id: preset.id }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const [portalNetwork, corpusUnits] = await Promise.all([
      loadPortalNetwork(preset.id),
      admin ? loadSafeElectoralContext(admin, preset.id, [String(keyword), ...(electoral.campaignTopics || [])].join(' '), 12) : Promise.resolve([]),
    ]);
    const linkedResources = choosePortalResources(String(keyword), electoral, portalNetwork.settings, portalNetwork.resources);
    const relatedNetworkHtml = renderPortalReferences(linkedResources);
    const corpusHtml = renderCorpusContext(corpusUnits);

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
      `<article data-electoral-draft="true" data-campaign-preset="${escapeHtml(preset.id)}" data-editorial-target-words="${requestedTargetWords}">`,
      `<p><strong>RASCUNHO ELEITORAL - REVISÃO HUMANA OBRIGATÓRIA</strong></p>`,
      `<p><strong>ALVO EDITORIAL CONFIGURADO:</strong> ${requestedTargetWords} palavras. Este scaffold não representa conteúdo final nem garantia de indexação.</p>`,
      `<h1>${topic}</h1>`,
      `<p><strong>Candidatura:</strong> ${candidate} · ${party} · ${number} · ${role}</p>`,
      `<p><strong>Slogan cadastrado:</strong> ${slogan}</p>`,
      cities ? `<p><strong>Municípios para contexto editorial:</strong> ${cities}</p>` : '',
      districts ? `<p><strong>Distritos para contexto editorial:</strong> ${districts}</p>` : '',
      sections ? `<p><strong>Editoria(s):</strong> ${sections}</p>` : '',
      corpusHtml,
      `<h2>1. Diagnóstico factual</h2>`,
      `<p>[VERIFICAR FONTE PRIMÁRIA] Descreva o tema com fonte, data e URL. Não inserir estatística, fato jurídico ou motivação de terceiro sem comprovação.</p>`,
      `<h2>2. Contexto biográfico verificável</h2>`,
      `<p>[VERIFICAR FONTE PRIMÁRIA] Use somente fatos biográficos documentados. Não fabricar vivências, testemunhos ou experiências pessoais.</p>`,
      electoral.biography ? `<p><strong>Biografia fornecida para revisão:</strong> ${escapeHtml(electoral.biography)}</p>` : '',
      `<h2>3. Análise técnica e institucional</h2>`,
      `<p>[VERIFICAR FONTE PRIMÁRIA] Cite leis, competências, orçamento e atos públicos com fontes. Diferencie União, Estado e Município.</p>`,
      electoral.documentedActs ? `<p><strong>Atos/experiências a verificar:</strong> ${escapeHtml(electoral.documentedActs)}</p>` : '',
      `<h2>4. Propostas e competência do cargo</h2>`,
      `<p>Identifique explicitamente cada item como proposta da campanha e diferencie proposta parlamentar de resultado garantido.</p>`,
      `<ul>${preset.fixedIssues.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`,
      electoral.legislativeProjects ? `<p><strong>Projetos/propostas fornecidos para checagem:</strong> ${escapeHtml(electoral.legislativeProjects)}</p>` : '',
      relatedNetworkHtml,
      `<h2>5. FAQ factual e resumo executivo</h2>`,
      `<p>[VERIFICAR] Preparar perguntas e respostas baseadas nas fontes utilizadas, sem recomendação personalizada de voto.</p>`,
      `<h2>6. Fontes</h2>`,
      `<ul><li>[FONTE PRIMÁRIA - URL - DATA - AFIRMAÇÃO SUPORTADA]</li></ul>`,
      electoral.usesSyntheticMedia ? `<p><strong>ROTULAGEM DE IA:</strong> conteúdo sintético/multimídia deve identificar explicitamente a fabricação/manipulação e a tecnologia utilizada.</p>` : `<p><strong>TRILHA DE IA:</strong> assistência editorial registrada; verificar se alguma peça multimídia exige rotulagem específica.</p>`,
      pendingPublishBlockers.length ? `<p><strong>PUBLICAÇÃO BLOQUEADA:</strong> ${pendingPublishBlockers.map((item) => escapeHtml(String(item))).join(' | ')}</p>` : `<p><strong>PUBLICAÇÃO:</strong> ainda depende de confirmação humana/jurídica da peça final.</p>`,
      `<footer>${footer}</footer>`,
      `</article>`,
    ].filter(Boolean).join('\n');

    return new Response(JSON.stringify({
      ok: true,
      message: `Scaffold eleitoral preparado para ${keyword}`,
      preset_id: preset.id,
      fixed_campaign_identity: { candidate_name: preset.candidateName, ballot_name: preset.ballotName, ballot_number: preset.ballotNumber, role: preset.candidateRole, party: preset.politicalParty, slogan: preset.slogan, state: preset.state, registration_status: preset.registrationStatus, tse_sequence: preset.tseSequence },
      phase: electoral.campaignPhase || 'não informada', target_words: requestedTargetWords, content_is_scaffold: true,
      template: template || 'deep-factual', project_id: projectId || null, indexnow_requested: Boolean(notifyIndexNow), approved_for_draft: true, approved_for_publication: false,
      publication_blockers: pendingPublishBlockers, campaign_footer: formatElectoralFooter(preset, electoral.campaignCnpj),
      related_resources: linkedResources.map((item) => ({ label: item.label, url: item.url, category: item.category })),
      corpus_units: corpusUnits.map((item) => ({ unit_key: item.unit_key, title: item.title, source_slug: item.source_slug, verification_status: item.verification_status, usage_scope: item.usage_scope })),
      content,
      audit: { generated_at: new Date().toISOString(), ai_provider: 'not-configured-in-this-endpoint', requested_target_words: requestedTargetWords, target_is_editorial_configuration_not_ranking_guarantee: true, source_verification_required: true, human_legal_review_required: true, preset_enforced_server_side: true, safe_corpus_enabled: true, safe_corpus_count: corpusUnits.length, blocked_archive_content_excluded: true, contextual_linking: Boolean(portalNetwork.settings?.contextual_linking_enabled), contextual_links_count: linkedResources.length, individual_voter_profiles: false, political_preference_inference: false, persuasive_geo_personalization: false, vote_recommendation: false },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
