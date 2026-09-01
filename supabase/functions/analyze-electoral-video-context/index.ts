import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  formatElectoralFooter,
  resolveElectoralPreset,
} from '../_shared/electoral-campaign-presets.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const issueMatchers = [
  { re: /(score|serasa|cadastro positivo|scr|bacen|banco|cr[eé]dito)/i, issueIndex: 0 },
  { re: /(bndes|microempresa|pequena empresa|m[eé]dia empresa|empreendedor|capital de giro)/i, issueIndex: 1 },
  { re: /(cnh|habilita[cç][aã]o|tr[aâ]nsito|16 anos)/i, issueIndex: 2 },
  { re: /(irpf|imposto de renda|sa[uú]de|educa[cç][aã]o|seguran[cç]a p[uú]blica)/i, issueIndex: 3 },
  { re: /(arma|porte|firearm|defesa pessoal)/i, issueIndex: 4 },
  { re: /(rouanet|cultura|gospel|funk|lgbt|pagode|samba)/i, issueIndex: 5 },
];

function safeUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return ['youtube.com', 'www.youtube.com', 'youtu.be', 'instagram.com', 'www.instagram.com']
      .some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

function normalize(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
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
    const payload = await req.json();
    const videoUrl = normalize(payload.videoUrl);
    const context = normalize(payload.context);
    const campaign = payload.campaign ?? {};
    const geography = payload.geography ?? {};
    const preset = resolveElectoralPreset(campaign.campaignPresetId);

    if (!safeUrl(videoUrl)) {
      return new Response(JSON.stringify({ error: 'Use uma URL válida do YouTube ou Instagram.' }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (context.length < 20) {
      return new Response(JSON.stringify({ error: 'Descreva o teor do vídeo com pelo menos 20 caracteres.' }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const matched = issueMatchers.find((item) => item.re.test(context));
    const matchedIssue = matched
      ? preset.fixedIssues[matched.issueIndex]
      : 'Pauta eleitoral a classificar manualmente';

    const places = [
      ...(Array.isArray(geography.cities) ? geography.cities : []),
      ...(Array.isArray(geography.districts) ? geography.districts : []),
    ].map(normalize).filter(Boolean);
    const geoContext = places.length ? places.slice(0, 8).join(', ') : `Estado de ${preset.state}`;
    const cnpj = normalize(campaign.campaignCnpj);
    const campaignFooter = formatElectoralFooter(preset, cnpj);

    const title = `${matchedIssue.replace(/\.$/, '')}: contexto explicado no vídeo`;
    const description = [
      `Vídeo vinculado à pauta “${matchedIssue}”.`,
      `Contexto informado pelo operador: ${context}`,
      `Abrangência editorial selecionada: ${geoContext}.`,
      `Candidatura cadastrada no backend: ${preset.ballotName} ${preset.ballotNumber} · ${preset.politicalParty}.`,
      'O material deve permanecer factual, com fontes primárias para dados e sem recomendação automatizada de voto.',
    ].join(' ');

    const tags = Array.from(new Set([
      matchedIssue.split(':')[0].replace(/\.$/, ''),
      ...places.slice(0, 5),
      preset.ballotName,
      preset.ballotNumber,
      'Eleições 2026',
      preset.state,
    ].filter(Boolean)));

    const schema = {
      '@context': 'https://schema.org',
      '@type': 'VideoObject',
      name: title,
      description,
      contentUrl: videoUrl,
      uploadDate: '[VERIFICAR]',
      thumbnailUrl: '[VERIFICAR]',
      about: matchedIssue,
      spatialCoverage: geoContext,
      publisher: {
        '@type': 'Organization',
        name: `${preset.ballotName} ${preset.ballotNumber}`,
      },
    };

    return new Response(JSON.stringify({
      preset_id: preset.id,
      matched_issue: matchedIssue,
      title,
      description,
      geo_context: geoContext,
      tags,
      schema,
      campaign_footer: campaignFooter,
      compliance: [
        'Rascunho factual: não recomenda voto, não ranqueia candidaturas e não faz microdirecionamento persuasivo.',
        'Metadados não obtidos diretamente da plataforma permanecem como [VERIFICAR].',
        cnpj ? 'CNPJ recebido do perfil da campanha; conferir validade antes de publicação.' : 'CNPJ oficial da campanha ainda não confirmado; publicação permanece bloqueada.',
        'Se houver mídia sintética ou manipulada, aplicar a rotulagem específica antes de publicar.',
      ],
      audit: {
        generated_at: new Date().toISOString(),
        preset_enforced_server_side: true,
        video_transcription_performed: false,
        operator_context_used: true,
        persuasive_geo_personalization: false,
        vote_recommendation: false,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'unknown_error' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
