/**
 * Hyperlocal 2026 Module — RDM Advogados only
 *
 * Detecta intenção hiperlocal (fórum/delegacia/polo/bairro/comarca),
 * casa a intenção com POIs cadastrados em `public.poi_hyperlocal`,
 * gera templates de prompt hiperlocal e emite Schema.org geo-específico
 * (LegalService + Attorney + areaServed do POI, Place + GeoCoordinates,
 * LocalBusiness 24/7 opcional para urgência, FAQPage hiperlocal).
 *
 * Consumido por brand-seo-geo.buildRDMPrompt e por generate-article.
 */

import type { LegalSubArea } from './geo-aeo-2026.ts';

// ==================== TIPOS ====================

export type PoiType = 'forum' | 'delegacia' | 'polo' | 'tribunal' | 'cartorio' | 'outro';

export interface HyperlocalPoi {
  id: string;
  poi_type: PoiType;
  name: string;
  slug?: string | null;
  full_address?: string | null;
  neighborhood?: string | null;
  city: string;
  state_uf: string;
  comarca?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  neighborhoods_served?: string[] | null;
  opening_hours?: string | null;
  is_24_7?: boolean | null;
  ymyl_subareas?: string[] | null;
  urgency_phone?: string | null;
  virtual_channel_url?: string | null;
  official_url?: string | null;
}

export interface HyperlocalDetection {
  isHyperlocal: boolean;
  poiTypeHint?: PoiType;
  neighborhoodHint?: string;
  cityHint?: string;
  isUrgency: boolean;
  reason: string;
}

// ==================== DETECÇÃO DE INTENÇÃO ====================

const FORUM_RX =
  /\b(f[óo]rum|comarca|juizado especial|vara c[íi]vel|vara criminal|vara empresarial|balc[ãa]o virtual)\b/i;
const DELEGACIA_RX =
  /\b(delegacia|distrito policial|\dª? ?dp\b|dipo|deic|delegacia de crimes eletr[ôo]nicos|plant[ãa]o (policial|criminal)|audi[êe]ncia de cust[óo]dia|preso em flagrante)\b/i;
const POLO_RX =
  /\b(polo (tecnol[óo]gico|comercial|industrial|log[íi]stico)|distrito (industrial|comercial)|centro empresarial|bairro (do|da) [a-zà-ú]+)\b/i;
const URGENCY_RX =
  /\b(audi[êe]ncia de cust[óo]dia|plant[ãa]o (criminal|24|24h|24 ?horas)|preso em flagrante|em flagrante|urg[êe]ncia|24\/?7)\b/i;

const NEIGHBORHOOD_HINT_RX =
  /\b(?:no bairro|do bairro|em (?:um |uma |o |a )?(?:bairro )?|pr[óo]ximo (?:ao|à|a) )([A-ZÁ-Ú][A-Za-zÁ-ú\s]{2,40})\b/;

export function detectHyperlocalIntent(text: string): HyperlocalDetection {
  const t = text || '';
  const forum = FORUM_RX.test(t);
  const delegacia = DELEGACIA_RX.test(t);
  const polo = POLO_RX.test(t);
  const isUrgency = URGENCY_RX.test(t);
  const isHyperlocal = forum || delegacia || polo || isUrgency;

  let poiTypeHint: PoiType | undefined;
  if (delegacia) poiTypeHint = 'delegacia';
  else if (forum) poiTypeHint = 'forum';
  else if (polo) poiTypeHint = 'polo';

  const neighMatch = t.match(NEIGHBORHOOD_HINT_RX);
  const neighborhoodHint = neighMatch?.[1]?.trim();

  return {
    isHyperlocal,
    poiTypeHint,
    neighborhoodHint,
    isUrgency,
    reason: isHyperlocal
      ? `Match: forum=${forum} delegacia=${delegacia} polo=${polo} urg=${isUrgency}`
      : 'sem_match_hiperlocal',
  };
}

// ==================== RESOLVE POI (DB LOOKUP) ====================

/**
 * Busca o melhor POI aprovado do usuário que case com a intenção detectada.
 * Ordem de prioridade: match por tipo + bairro > tipo + cidade > match por nome no texto > primeiro aprovado.
 */
export async function resolvePoiForContent(
  supabase: any,
  userId: string,
  contentHint: string,
): Promise<HyperlocalPoi | null> {
  const detection = detectHyperlocalIntent(contentHint);
  if (!detection.isHyperlocal) return null;

  const { data: pois, error } = await supabase
    .from('poi_hyperlocal')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'approved')
    .limit(50);

  if (error || !pois || pois.length === 0) return null;

  const textLower = contentHint.toLowerCase();

  // 1) Match direto por nome do POI no texto
  const byName = pois.find((p: HyperlocalPoi) =>
    p.name && textLower.includes(p.name.toLowerCase()),
  );
  if (byName) return byName;

  // 2) Match por tipo + bairro (se houver hint)
  if (detection.poiTypeHint && detection.neighborhoodHint) {
    const byTypeNeigh = pois.find((p: HyperlocalPoi) =>
      p.poi_type === detection.poiTypeHint &&
      (p.neighborhood || '').toLowerCase().includes(detection.neighborhoodHint!.toLowerCase()),
    );
    if (byTypeNeigh) return byTypeNeigh;
  }

  // 3) Match por tipo apenas
  if (detection.poiTypeHint) {
    const byType = pois.find((p: HyperlocalPoi) => p.poi_type === detection.poiTypeHint);
    if (byType) return byType;
  }

  // 4) Urgência → prefere POI 24/7
  if (detection.isUrgency) {
    const urg = pois.find((p: HyperlocalPoi) => p.is_24_7);
    if (urg) return urg;
  }

  return null;
}

// ==================== TEMPLATES DE PROMPT ====================

function poiHeader(poi: HyperlocalPoi): string {
  const parts = [
    poi.name,
    poi.full_address && `Endereço: ${poi.full_address}`,
    poi.neighborhood && `Bairro: ${poi.neighborhood}`,
    `${poi.city}/${poi.state_uf}`,
    poi.comarca && `Comarca: ${poi.comarca}`,
    poi.opening_hours && `Funcionamento: ${poi.opening_hours}`,
    poi.neighborhoods_served?.length &&
      `Atende os bairros: ${poi.neighborhoods_served.join(', ')}`,
    poi.official_url && `Site oficial: ${poi.official_url}`,
  ].filter(Boolean);
  return parts.join(' | ');
}

export function buildForumTemplate(poi: HyperlocalPoi): string {
  return `
## 📍 TEMPLATE HIPERLOCAL — FÓRUM (Cível/Empresarial/Consumidor)

**POI de referência:** ${poiHeader(poi)}

### Estrutura obrigatória do artigo:
1. **§1 Frontload (40-60 palavras):** definir o que é o Juizado/Vara + base legal (art./Lei) + jurisdição (${poi.city}/${poi.state_uf}).
2. **H2 = pergunta natural:** "Como funciona o Juizado Especial Cível no ${poi.name}?"
3. **Bloco de utilidade pública (obrigatório):**
   - Endereço completo do fórum: ${poi.full_address || '{{endereco_forum}}'}
   - Horário de atendimento físico: ${poi.opening_hours || '{{horario}}'}
   - Balcão virtual: ${poi.virtual_channel_url || '{{link_balcao_virtual}}'}
   - Bairros/comarcas atendidos: ${poi.neighborhoods_served?.join(', ') || '{{bairros}}'}
4. **Contexto econômico local:** cite o perfil das causas mais recorrentes naquela comarca (empresas, consumo, PME).
5. **Gancho RDM (parágrafo final, sem promessa de resultado):**
   > "O escritório RDM Advogados realiza defesas empresariais e representação em litígios de consumo com atuação frequente nesta comarca."
6. **Não** citar nome de juiz, servidor ou processo específico.

### AEO Answer Block do H2 principal:
Explicar em 2 frases (30-50 palavras) competência do juizado + valor de alçada + necessidade ou não de advogado.`.trim();
}

export function buildDelegaciaTemplate(poi: HyperlocalPoi): string {
  return `
## 🚨 TEMPLATE HIPERLOCAL — DELEGACIA (Plantão Penal / Custódia)

**POI de referência:** ${poiHeader(poi)}

### Estrutura obrigatória do artigo:
1. **§1 Frontload (40-60 palavras):** o que é a intimação/flagrante + direito ao silêncio (art. 5º LXIII CF) + jurisdição.
2. **H2 = pergunta natural:** "Fui intimado a depor na ${poi.name}: o que fazer?"
3. **Bloco de direitos fundamentais (obrigatório):**
   - Direito ao silêncio (art. 5º, LXIII CF).
   - Direito a advogado desde o primeiro momento (art. 5º, LXIII CF + Súmula Vinculante 14 STF).
   - Prazo de audiência de custódia: 24h (Resolução CNJ 213/2015 + art. 310 CPP).
4. **Dinâmica local:** onde ocorre a audiência de custódia dessa circunscrição (DIPO ou vara plantonista).
5. **Bloco de urgência (destaque visual — <strong> e cor):**
   - Telefone de plantão RDM: {{telefone_plantao_rdm}}
   - WhatsApp 24h: {{whatsapp_rdm}}
   ${poi.urgency_phone ? `- Contato do POI (${poi.name}): ${poi.urgency_phone}` : ''}
6. **Compliance OAB:** nenhuma promessa de soltura, revogação de prisão ou arquivamento.

### AEO Answer Block:
Em 2 frases explicar prazo de 24h + presença obrigatória de defensor + poderes do juiz da custódia.

### ⚠️ SCHEMA OBRIGATÓRIO:
LocalBusiness com openingHours **24/7** + telephone + geo. Botão WhatsApp above-the-fold.`.trim();
}

export function buildPoloTemplate(poi: HyperlocalPoi): string {
  return `
## 🏭 TEMPLATE HIPERLOCAL — POLO / BAIRRO (ISPs / Empresas / ICMS)

**POI de referência:** ${poiHeader(poi)}

### Estrutura obrigatória do artigo:
1. **§1 Frontload (40-60 palavras):** desafio jurídico específico + base legal + jurisdição (${poi.city}/${poi.state_uf}).
2. **H2 = pergunta natural:** "Assessoria jurídica para provedores de internet e empresas de tecnologia no ${poi.neighborhood || poi.name}?"
3. **Contexto econômico local (obrigatório, 2-3 parágrafos):**
   - Perfil das empresas do polo: ${poi.name}${poi.neighborhood ? ` (${poi.neighborhood})` : ''}.
   - Desafios fiscais recorrentes (ICMS, LC 87/1996, decretos SP).
   - Desafios regulatórios (ANATEL SCM, LGPD, Marco Civil).
4. **Base legal citada** em blocos <cite> com fonte + data (planalto.gov.br, anatel.gov.br).
5. **Gancho RDM (sem promessa):**
   > "A RDM Advogados atende empresas de tecnologia e ISPs com atuação recorrente nesta região."

### AEO Answer Block:
Em 2 frases, resumir 1 obrigação regulatória crítica + 1 risco tributário típico do polo.`.trim();
}

export type TemplateKind = 'forum' | 'delegacia' | 'polo';

export function poiTypeToTemplateKind(t: HyperlocalPoi['poi_type']): TemplateKind {
  if (t === 'delegacia') return 'delegacia';
  if (t === 'forum' || t === 'tribunal') return 'forum';
  return 'polo';
}

/**
 * Interpola placeholders {{name}} de um template livre com dados do POI.
 * Usado quando o usuário definiu um override no painel /hiperlocal.
 */
function interpolateTemplate(tpl: string, poi: HyperlocalPoi): string {
  const map: Record<string, string> = {
    name: poi.name,
    poi_name: poi.name,
    full_address: poi.full_address || '',
    neighborhood: poi.neighborhood || '',
    city: poi.city,
    state_uf: poi.state_uf,
    comarca: poi.comarca || '',
    opening_hours: poi.opening_hours || (poi.is_24_7 ? '24 horas por dia, 7 dias por semana' : ''),
    neighborhoods_served: (poi.neighborhoods_served || []).join(', '),
    urgency_phone: poi.urgency_phone || '',
    virtual_channel_url: poi.virtual_channel_url || '',
    official_url: poi.official_url || '',
  };
  return tpl.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, k) => map[k.toLowerCase()] ?? '');
}

export function pickHyperlocalTemplate(poi: HyperlocalPoi, override?: string | null): string {
  if (override && override.trim().length > 0) {
    return interpolateTemplate(override, poi);
  }
  switch (poiTypeToTemplateKind(poi.poi_type)) {
    case 'delegacia':
      return buildDelegaciaTemplate(poi);
    case 'forum':
      return buildForumTemplate(poi);
    case 'polo':
    default:
      return buildPoloTemplate(poi);
  }
}

// ==================== SCHEMA HIPERLOCAL ====================

export interface HyperlocalSchemaConfig {
  poi: HyperlocalPoi;
  subArea?: LegalSubArea;
  isUrgency?: boolean;
  attorneyName?: string;
  officeAddress?: string;
  officeGeo?: { lat: number; lng: number };
  officePhone?: string;
  siteUrl?: string;
}

const ALL_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Regra unificada de emissão do LocalBusiness:
 *   emite se POI é 24/7 OU se o artigo é de urgência (plantão/custódia).
 * openingHoursSpecification reflete o estado real:
 *   - is_24_7 → 24/7
 *   - isUrgency (não 24/7) → 24/7 (o plantão RDM opera 24h)
 *   - caso contrário → tenta parsear opening_hours livre; se não parsear, cai em 24/7
 */
function buildOpeningHours(poi: HyperlocalPoi, isUrgency: boolean) {
  if (poi.is_24_7 || isUrgency) {
    return {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ALL_WEEK,
      opens: '00:00',
      closes: '23:59',
    };
  }
  // Fallback: mantém string livre em `description` para não mentir
  return {
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: ALL_WEEK,
    description: poi.opening_hours || 'Consulte horário no site oficial',
  };
}

/**
 * areaServed consistente: sempre bairro (se houver) + cidade + comarca + bairros_atendidos.
 * Sem duplicatas por nome.
 */
function buildAreaServed(poi: HyperlocalPoi): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  const push = (entry: { '@type': string; name: string; containedInPlace?: any }) => {
    const key = `${entry['@type']}::${entry.name.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(entry);
  };

  if (poi.neighborhood) {
    push({
      '@type': 'AdministrativeArea',
      name: poi.neighborhood,
      containedInPlace: { '@type': 'City', name: poi.city },
    });
  }
  push({ '@type': 'City', name: poi.city });
  if (poi.comarca) {
    push({ '@type': 'AdministrativeArea', name: `Comarca de ${poi.comarca}` });
  }
  for (const b of poi.neighborhoods_served || []) {
    push({ '@type': 'AdministrativeArea', name: b });
  }
  return out;
}

export function buildHyperlocalSchema(cfg: HyperlocalSchemaConfig): string {
  const { poi } = cfg;
  const attorney = cfg.attorneyName || 'Dr. Rândalos Madeira';
  const isUrgency = !!cfg.isUrgency;
  const emitLocalBusiness = !!poi.is_24_7 || isUrgency;

  // GeoCoordinates: prefere office (do escritório RDM), cai no POI
  const officeGeoResolved =
    cfg.officeGeo ??
    (poi.latitude != null && poi.longitude != null
      ? { lat: Number(poi.latitude), lng: Number(poi.longitude) }
      : undefined);

  // 1) LegalService + Attorney com areaServed do POI
  const areaServed = buildAreaServed(poi);

  const legalService: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'LegalService',
    name: 'RDM Advogados Associados',
    provider: {
      '@type': 'Attorney',
      name: attorney,
      memberOf: { '@type': 'Organization', name: 'OAB/SP' },
    },
    areaServed,
    ...(cfg.officeAddress
      ? {
          address: {
            '@type': 'PostalAddress',
            streetAddress: cfg.officeAddress,
            addressLocality: poi.city,
            addressRegion: poi.state_uf,
            addressCountry: 'BR',
          },
        }
      : {}),
    ...(officeGeoResolved
      ? {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: officeGeoResolved.lat,
            longitude: officeGeoResolved.lng,
          },
        }
      : {}),
    ...(cfg.officePhone ? { telephone: cfg.officePhone } : {}),
    ...(cfg.siteUrl ? { url: cfg.siteUrl } : {}),
  };

  // 2) Place com GeoCoordinates do POI (referenciado pela LegalService via areaServed)
  const place: Record<string, unknown> | null =
    poi.latitude != null && poi.longitude != null
      ? {
          '@context': 'https://schema.org',
          '@type': 'Place',
          name: poi.name,
          ...(poi.full_address
            ? {
                address: {
                  '@type': 'PostalAddress',
                  streetAddress: poi.full_address,
                  addressLocality: poi.city,
                  addressRegion: poi.state_uf,
                  addressCountry: 'BR',
                },
              }
            : {}),
          geo: {
            '@type': 'GeoCoordinates',
            latitude: Number(poi.latitude),
            longitude: Number(poi.longitude),
          },
          ...(poi.official_url ? { url: poi.official_url } : {}),
        }
      : null;

  // 3) LocalBusiness — reflete is_24_7 do POI OU urgência
  const localBusiness: Record<string, unknown> | null = emitLocalBusiness
    ? {
        '@context': 'https://schema.org',
        '@type': 'LocalBusiness',
        name: isUrgency || poi.is_24_7 ? 'RDM Advogados — Plantão 24h' : 'RDM Advogados Associados',
        ...(cfg.officeAddress
          ? {
              address: {
                '@type': 'PostalAddress',
                streetAddress: cfg.officeAddress,
                addressLocality: poi.city,
                addressRegion: poi.state_uf,
                addressCountry: 'BR',
              },
            }
          : {}),
        ...(officeGeoResolved
          ? {
              geo: {
                '@type': 'GeoCoordinates',
                latitude: officeGeoResolved.lat,
                longitude: officeGeoResolved.lng,
              },
            }
          : {}),
        openingHoursSpecification: buildOpeningHours(poi, isUrgency),
        areaServed,
        ...(cfg.officePhone ? { telephone: cfg.officePhone } : {}),
        ...(cfg.siteUrl ? { url: cfg.siteUrl } : {}),
      }
    : null;

  // 4) FAQPage hiperlocal (skeleton — modelos preenchem)
  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `Qual o endereço do ${poi.name}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: poi.full_address || '{{ENDERECO}}',
        },
      },
      {
        '@type': 'Question',
        name: `Quais bairros o ${poi.name} atende?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: poi.neighborhoods_served?.join(', ') || '{{BAIRROS_ATENDIDOS}}',
        },
      },
      {
        '@type': 'Question',
        name: `Qual o horário de atendimento do ${poi.name}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: poi.opening_hours || (poi.is_24_7 ? '24 horas por dia, 7 dias por semana' : '{{HORARIO}}'),
        },
      },
    ],
  };

  const blocks: string[] = [];
  blocks.push(
    `### 1) LegalService + Attorney + areaServed do POI\n\`\`\`json\n${JSON.stringify(legalService, null, 2)}\n\`\`\``,
  );
  if (place) {
    blocks.push(
      `### 2) Place + GeoCoordinates do POI (${poi.name})\n\`\`\`json\n${JSON.stringify(place, null, 2)}\n\`\`\``,
    );
  }
  if (localBusiness) {
    const label = poi.is_24_7 && !isUrgency
      ? 'LocalBusiness (POI 24/7)'
      : isUrgency
      ? 'LocalBusiness 24/7 (urgência — plantão)'
      : 'LocalBusiness';
    blocks.push(
      `### 3) ${label}\n\`\`\`json\n${JSON.stringify(localBusiness, null, 2)}\n\`\`\``,
    );
  }
  blocks.push(
    `### 4) FAQPage hiperlocal (mínimo 3 perguntas)\n\`\`\`json\n${JSON.stringify(faq, null, 2)}\n\`\`\``,
  );

  return `
## 🗺️ SCHEMA.ORG HIPERLOCAL 2026 (JSON-LD obrigatório)

Emitir os blocos abaixo em \`<script type="application/ld+json">\` no <head> da página. Estes blocos **substituem** o LegalService genérico do módulo GEO/AEO quando o artigo é hiperlocal.

${blocks.join('\n\n')}
`.trim();
}

// ==================== BLOCO PRINCIPAL ====================

export function buildHyperlocalBlock(cfg: HyperlocalSchemaConfig): string {
  const template = pickHyperlocalTemplate(cfg.poi);
  const schema = buildHyperlocalSchema(cfg);

  return `
# ============================================
# 📍 DIRETRIZES HIPERLOCAIS 2026 — RDM
# ============================================

**POI ativo:** ${cfg.poi.name} (${cfg.poi.poi_type}) — ${cfg.poi.city}/${cfg.poi.state_uf}${cfg.poi.neighborhood ? ` — Bairro: ${cfg.poi.neighborhood}` : ''}
**Sub-área YMYL:** ${cfg.subArea || 'generico'} | **Urgência local:** ${cfg.isUrgency ? 'SIM (24/7 + WhatsApp above-the-fold)' : 'não'}

${template}

${schema}

## 🎯 LONG-TAIL HIPERLOCAL (usar naturalmente no corpo, sem stuffing)
- "advogado para [sub-área] perto de ${cfg.poi.name}"
- "advogado ${cfg.poi.city}${cfg.poi.neighborhood ? ` bairro ${cfg.poi.neighborhood}` : ''}"
- "escritório de advocacia próximo ${cfg.poi.name}"
${cfg.poi.comarca ? `- "advogado comarca de ${cfg.poi.comarca}"` : ''}

## ✅ Checklist hiperlocal (auto-validar antes de responder)
- [ ] O nome do POI aparece no §1, no primeiro H2 e no gancho RDM.
- [ ] Endereço completo do POI presente no corpo do artigo (não só no schema).
- [ ] areaServed do Schema contém pelo menos: cidade + bairro (se houver) + comarca (se houver).
${cfg.isUrgency ? '- [ ] LocalBusiness 24/7 emitido e botão WhatsApp above-the-fold destacado.' : ''}
- [ ] Zero promessa de resultado. Zero nome de juiz/servidor/parte.
`.trim();
}
