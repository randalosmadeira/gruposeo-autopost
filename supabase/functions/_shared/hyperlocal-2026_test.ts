/**
 * Testes do módulo hyperlocal-2026.
 * Executar com: deno test supabase/functions/_shared/hyperlocal-2026_test.ts
 */
import { assertEquals, assert } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  detectHyperlocalIntent,
  buildForumTemplate,
  buildDelegaciaTemplate,
  buildPoloTemplate,
  pickHyperlocalTemplate,
  buildHyperlocalSchema,
  buildHyperlocalBlock,
  type HyperlocalPoi,
} from './hyperlocal-2026.ts';

const POI_FORUM: HyperlocalPoi = {
  id: 'p1',
  poi_type: 'forum',
  name: 'Fórum Regional da Barra Funda',
  full_address: 'Av. Thomas Edison, 337 - Barra Funda, São Paulo/SP',
  neighborhood: 'Barra Funda',
  city: 'São Paulo',
  state_uf: 'SP',
  comarca: 'Capital',
  latitude: -23.5245,
  longitude: -46.6683,
  neighborhoods_served: ['Barra Funda', 'Perdizes', 'Lapa'],
  opening_hours: 'Seg-Sex 12h-19h',
  is_24_7: false,
  ymyl_subareas: ['consumidor', 'assessoria_empresarial'],
  official_url: 'https://www.tjsp.jus.br/',
};

const POI_DELEGACIA_24: HyperlocalPoi = {
  id: 'p2',
  poi_type: 'delegacia',
  name: '4ª Delegacia de Polícia',
  full_address: 'Rua Exemplo, 100',
  neighborhood: 'Consolação',
  city: 'São Paulo',
  state_uf: 'SP',
  latitude: -23.55,
  longitude: -46.65,
  is_24_7: true,
  urgency_phone: '(11) 3xxx-xxxx',
  ymyl_subareas: ['audiencia_custodia', 'estelionato'],
};

const POI_POLO_SEMGEO: HyperlocalPoi = {
  id: 'p3',
  poi_type: 'polo',
  name: 'Polo Tecnológico da Vila Olímpia',
  city: 'São Paulo',
  state_uf: 'SP',
  neighborhood: 'Vila Olímpia',
  ymyl_subareas: ['assessoria_isp'],
};

// ==================== detectHyperlocalIntent ====================

Deno.test('detectHyperlocalIntent — texto genérico', () => {
  const d = detectHyperlocalIntent('Como declarar imposto de renda em 2026');
  assertEquals(d.isHyperlocal, false);
});

Deno.test('detectHyperlocalIntent — fórum', () => {
  const d = detectHyperlocalIntent('Como funciona o Fórum Regional da Barra Funda?');
  assert(d.isHyperlocal);
  assertEquals(d.poiTypeHint, 'forum');
  assertEquals(d.isUrgency, false);
});

Deno.test('detectHyperlocalIntent — delegacia + urgência', () => {
  const d = detectHyperlocalIntent(
    'Advogado criminalista para audiência de custódia perto da Delegacia de Crimes Eletrônicos',
  );
  assert(d.isHyperlocal);
  assertEquals(d.poiTypeHint, 'delegacia');
  assertEquals(d.isUrgency, true);
});

Deno.test('detectHyperlocalIntent — polo tecnológico', () => {
  const d = detectHyperlocalIntent(
    'Assessoria jurídica no polo tecnológico da Vila Olímpia',
  );
  assert(d.isHyperlocal);
  assertEquals(d.poiTypeHint, 'polo');
});

Deno.test('detectHyperlocalIntent — urgência sem POI tipo específico', () => {
  const d = detectHyperlocalIntent('Preso em flagrante — plantão 24h');
  assert(d.isHyperlocal);
  assertEquals(d.isUrgency, true);
});

// ==================== templates ====================

Deno.test('buildForumTemplate — inclui endereço, horário e bairros', () => {
  const out = buildForumTemplate(POI_FORUM);
  assert(out.includes('Av. Thomas Edison'));
  assert(out.includes('Seg-Sex 12h-19h'));
  assert(out.includes('Barra Funda'));
  assert(out.includes('Perdizes'));
  assert(out.includes('RDM Advogados'));
});

Deno.test('buildDelegaciaTemplate — inclui direito ao silêncio e urgência', () => {
  const out = buildDelegaciaTemplate(POI_DELEGACIA_24);
  assert(out.includes('art. 5º, LXIII CF'));
  assert(out.includes('CNJ 213/2015'));
  assert(out.includes('LocalBusiness'));
  assert(out.includes('24/7'));
});

Deno.test('buildPoloTemplate — inclui ANATEL/LGPD e contexto econômico', () => {
  const out = buildPoloTemplate(POI_POLO_SEMGEO);
  assert(out.includes('ANATEL'));
  assert(out.includes('LGPD'));
  assert(out.includes('Vila Olímpia'));
});

Deno.test('pickHyperlocalTemplate — roteamento por tipo', () => {
  assert(pickHyperlocalTemplate(POI_FORUM).includes('FÓRUM'));
  assert(pickHyperlocalTemplate(POI_DELEGACIA_24).includes('DELEGACIA'));
  assert(pickHyperlocalTemplate(POI_POLO_SEMGEO).includes('POLO'));
});

// ==================== buildHyperlocalSchema ====================

Deno.test('buildHyperlocalSchema — LegalService.areaServed contém bairro, cidade, comarca', () => {
  const out = buildHyperlocalSchema({ poi: POI_FORUM });
  assert(out.includes('LegalService'));
  assert(out.includes('"Barra Funda"'));
  assert(out.includes('"São Paulo"'));
  assert(out.includes('Comarca de Capital'));
});

Deno.test('buildHyperlocalSchema — Place + GeoCoordinates quando lat/lng existem', () => {
  const out = buildHyperlocalSchema({ poi: POI_FORUM });
  assert(out.includes('"@type": "Place"'));
  assert(out.includes('GeoCoordinates'));
  assert(out.includes('-23.5245'));
});

Deno.test('buildHyperlocalSchema — SEM Place quando POI não tem geo', () => {
  const out = buildHyperlocalSchema({ poi: POI_POLO_SEMGEO });
  assert(!out.includes('"@type": "Place"'));
  assert(!out.includes('GeoCoordinates'));
});

Deno.test('buildHyperlocalSchema — LocalBusiness emitido quando isUrgency=true (opens/closes 00-23:59)', () => {
  const out = buildHyperlocalSchema({
    poi: POI_FORUM, // not 24/7
    isUrgency: true,
    officeAddress: 'Av. Paulista, 100',
    officeGeo: { lat: -23.56, lng: -46.65 },
    officePhone: '(11) 9xxxx-xxxx',
  });
  assert(out.includes('LocalBusiness'));
  assert(out.includes('Plantão 24h'));
  assert(out.includes('"opens": "00:00"'));
  assert(out.includes('"closes": "23:59"'));
});

Deno.test('buildHyperlocalSchema — LocalBusiness emitido quando POI.is_24_7=true mesmo sem isUrgency', () => {
  const out = buildHyperlocalSchema({ poi: POI_DELEGACIA_24, isUrgency: false });
  assert(out.includes('LocalBusiness'));
  assert(out.includes('"opens": "00:00"'));
  assert(out.includes('"closes": "23:59"'));
});

Deno.test('buildHyperlocalSchema — NO LocalBusiness quando POI não é 24/7 e sem urgência', () => {
  const out = buildHyperlocalSchema({ poi: POI_FORUM, isUrgency: false });
  assert(!out.includes('LocalBusiness'));
});

Deno.test('buildHyperlocalSchema — LocalBusiness inclui areaServed e GeoCoordinates', () => {
  const out = buildHyperlocalSchema({
    poi: POI_DELEGACIA_24,
    isUrgency: true,
    officeGeo: { lat: -23.56, lng: -46.65 },
  });
  // areaServed no LocalBusiness (aparece 2x: LegalService + LocalBusiness)
  const areaServedCount = (out.match(/"areaServed"/g) || []).length;
  assert(areaServedCount >= 2, `esperava >=2 areaServed, veio ${areaServedCount}`);
  // GeoCoordinates presente com office geo
  assert(out.includes('"latitude": -23.56'));
});

Deno.test('buildHyperlocalSchema — LegalService.geo cai no POI quando officeGeo ausente', () => {
  const out = buildHyperlocalSchema({ poi: POI_FORUM }); // POI tem lat/lng, sem officeGeo
  assert(out.includes('GeoCoordinates'));
  assert(out.includes('-23.5245'));
});

Deno.test('buildHyperlocalSchema — FAQPage sempre presente com 3 perguntas', () => {
  const out = buildHyperlocalSchema({ poi: POI_FORUM });
  assert(out.includes('FAQPage'));
  assert(out.includes('endereço'));
  assert(out.includes('bairros'));
  assert(out.includes('horário'));
});

// ==================== template override ====================

Deno.test('pickHyperlocalTemplate — usa override e interpola {{name}} e {{city}}', () => {
  const tpl = 'Custom: {{name}} em {{city}}/{{state_uf}} — bairro {{neighborhood}}.';
  const out = pickHyperlocalTemplate(POI_FORUM, tpl);
  assertEquals(
    out,
    'Custom: Fórum Regional da Barra Funda em São Paulo/SP — bairro Barra Funda.',
  );
});

Deno.test('pickHyperlocalTemplate — override vazio cai no default por tipo', () => {
  const out = pickHyperlocalTemplate(POI_DELEGACIA_24, '');
  assert(out.includes('DELEGACIA'));
});

// ==================== buildHyperlocalBlock ====================

Deno.test('buildHyperlocalBlock — junta template + schema + long-tail + checklist', () => {
  const out = buildHyperlocalBlock({
    poi: POI_DELEGACIA_24,
    subArea: 'audiencia_custodia',
    isUrgency: true,
    officeAddress: 'Av. Paulista, 100',
    officeGeo: { lat: -23.56, lng: -46.65 },
    officePhone: '(11) 9xxxx-xxxx',
    siteUrl: 'https://rdmadvogados.com.br',
  });
  assert(out.includes('DIRETRIZES HIPERLOCAIS 2026'));
  assert(out.includes('DELEGACIA'));
  assert(out.includes('LocalBusiness'));
  assert(out.includes('long-tail') || out.includes('LONG-TAIL'));
  assert(out.includes('Checklist') || out.includes('checklist'));
  assert(out.includes('WhatsApp above-the-fold'));
});
