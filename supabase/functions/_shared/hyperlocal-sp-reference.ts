/**
 * Reference dataset — Grande São Paulo + crimes federais aeroportuários.
 *
 * Fonte: dados fornecidos pelo cliente RDM Advogados (jul/2026).
 * Uso: expandir a detecção hiperlocal (`detectHyperlocalIntent`) para
 * identificar automaticamente zona (Leste/Norte/Sul/Oeste/Centro),
 * cidade (São Paulo/Guarulhos) e tipo penal aeroportuário (DEAIN/DPAER)
 * a partir do conteúdo/keyword antes de resolver o POI.
 */

// ==================== SÃO PAULO — DISTRITOS POR ZONA ====================

export const SP_ZONE_LESTE = [
  'Água Rasa', 'Anália Franco', 'Artur Alvim', 'Belém', 'Brás', 'Cangaíba',
  'Carrão', 'Cidade Líder', 'Cidade Tiradentes', 'Ermelino Matarazzo',
  'Guaianases', 'Iguatemi', 'Itaim Paulista', 'Itaquera', 'Jardim Helena',
  'José Bonifácio', 'Lajeado', 'Mooca', 'Pari', 'Parque do Carmo', 'Penha',
  'Ponte Rasa', 'São Lucas', 'São Mateus', 'São Miguel Paulista', 'Sapopemba',
  'Tatuapé', 'Vila Curuçá', 'Vila Formosa', 'Vila Jacuí', 'Vila Matilde',
  'Vila Prudente',
] as const;

export const SP_ZONE_NORTE = [
  'Anhangüera', 'Brasilândia', 'Cachoeirinha', 'Casa Verde', 'Freguesia do Ó',
  'Jaçanã', 'Limão', 'Mandaqui', 'Perus', 'Pirituba', 'Santana', 'São Domingos',
  'Tremembé', 'Tucuruvi', 'Vila Guilherme', 'Vila Maria', 'Vila Medeiros',
  'Vila Nova Cachoeirinha',
] as const;

export const SP_ZONE_SUL = [
  'Brooklin', 'Campo Belo', 'Campo Grande', 'Campo Limpo', 'Capão Redondo',
  'Cidade Ademar', 'Cidade Dutra', 'Cursino', 'Grajaú', 'Ipiranga', 'Itaberaba',
  'Jabaquara', 'Jardim Ângela', 'Jardim São Luís', 'Marsilac', 'Moema',
  'Parelheiros', 'Pedreira', 'Sacomã', 'Santo Amaro', 'Saúde', 'Vila Andrade',
  'Vila Mariana', 'Vila Olímpia', 'Vila Sônia',
] as const;

export const SP_ZONE_OESTE = [
  'Alto de Pinheiros', 'Barra Funda', 'Butantã', 'Itaim Bibi', 'Jaguaré',
  'Jardim Paulista', 'Lapa', 'Morumbi', 'Perdizes', 'Pinheiros',
  'Raposo Tavares', 'Rio Pequeno', 'Vila Leopoldina', 'Vila Madalena',
  'Vila Sônia',
] as const;

export const SP_ZONE_CENTRO = [
  'Bela Vista', 'Bom Retiro', 'Cambuci', 'Consolação', 'Liberdade', 'República',
  'Santa Cecília', 'Sé',
] as const;

export type SpZone = 'leste' | 'norte' | 'sul' | 'oeste' | 'centro';

const SP_ZONE_MAP: Record<SpZone, readonly string[]> = {
  leste: SP_ZONE_LESTE,
  norte: SP_ZONE_NORTE,
  sul: SP_ZONE_SUL,
  oeste: SP_ZONE_OESTE,
  centro: SP_ZONE_CENTRO,
};

// ==================== GUARULHOS — BAIRROS OFICIAIS ====================

export const GUARULHOS_NEIGHBORHOODS = [
  'Água Azul', 'Água Chata', 'Bananal', 'Bonsucesso', 'Cabuçu', 'Capelinha',
  'Centro', 'Cocaia', 'Cumbica', 'Fornos', 'Gopoúva', 'Invernada', 'Itaim',
  'Itaquaquecetuba', 'Jardim Fortaleza', 'Jardim Kida', 'Jardim Maia',
  'Jardim Presidente Dutra', 'Jardim São João', 'Lavras', 'Macedo',
  'Mato das Cobras', 'Monte Carmelo', 'Morro Grande', 'Novo Recreio',
  'Paraventi', 'Picanço', 'Pimentas', 'Ponte Grande', 'Porto da Igreja',
  'Sadokim', 'Taboão', 'Tanque Grande', 'Torres de Tibagy', 'Vila Augusta',
  'Vila Galvão', 'Vila Rio de Janeiro',
] as const;

/**
 * Cumbica é o polo aeroportuário (GRU) — usado para roteamento
 * automático de conteúdos criminais federais para a DEAIN.
 */
export const GUARULHOS_AIRPORT_POLE = 'Cumbica';

// ==================== NORMALIZAÇÃO ====================

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function containsWord(haystack: string, needle: string): boolean {
  const h = stripDiacritics(haystack);
  const n = stripDiacritics(needle);
  const re = new RegExp(`(^|[^a-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i');
  return re.test(h);
}

// ==================== DETECÇÃO DE ZONA / CIDADE ====================

export interface SpLocationDetection {
  city?: 'sao_paulo' | 'guarulhos';
  spZone?: SpZone;
  matchedDistrict?: string;
  matchedGuarulhosNeighborhood?: string;
  isGuarulhosAirportPole: boolean;
}

export function detectSpLocation(text: string): SpLocationDetection {
  const t = text || '';
  const out: SpLocationDetection = { isGuarulhosAirportPole: false };

  // Guarulhos primeiro (mais específico)
  const isGuarulhos = /\bguarulhos\b/i.test(t) || /\bgru\b/i.test(t);
  for (const n of GUARULHOS_NEIGHBORHOODS) {
    if (containsWord(t, n)) {
      out.city = 'guarulhos';
      out.matchedGuarulhosNeighborhood = n;
      if (n === GUARULHOS_AIRPORT_POLE) out.isGuarulhosAirportPole = true;
      break;
    }
  }
  if (!out.matchedGuarulhosNeighborhood && isGuarulhos) out.city = 'guarulhos';

  // São Paulo por zona
  for (const [zone, list] of Object.entries(SP_ZONE_MAP) as [SpZone, readonly string[]][]) {
    for (const d of list) {
      if (containsWord(t, d)) {
        // Não sobrescreve se já casou Guarulhos (evita conflitos como "Vila Galvão")
        if (out.city !== 'guarulhos') {
          out.city = 'sao_paulo';
          out.spZone = zone;
          out.matchedDistrict = d;
        }
        return out;
      }
    }
  }

  return out;
}

// ==================== CRIMES FEDERAIS AEROPORTUÁRIOS ====================

export interface FederalAirportCrime {
  slug: string;
  label: string;
  legal_basis: string;
  keywords: string[];
  authority: 'DEAIN' | 'DPAER' | 'both';
}

/**
 * Tipos penais federais recorrentes em Guarulhos (DEAIN — GRU) e
 * Congonhas (DPAER — CGH). Base para roteamento automático de
 * conteúdos criminais aeroportuários.
 */
export const FEDERAL_AIRPORT_CRIMES: FederalAirportCrime[] = [
  {
    slug: 'trafico-internacional-entorpecentes',
    label: 'Tráfico Internacional de Entorpecentes',
    legal_basis: 'Art. 33 c/c Art. 40, I da Lei nº 11.343/2006',
    keywords: ['tráfico internacional', 'entorpecentes', 'mula', 'droga no aeroporto'],
    authority: 'both',
  },
  {
    slug: 'evasao-de-divisas',
    label: 'Evasão de Divisas',
    legal_basis: 'Art. 22 da Lei nº 7.492/1986',
    keywords: ['evasão de divisas', 'dinheiro não declarado', 'dólar não declarado'],
    authority: 'both',
  },
  {
    slug: 'contrabando',
    label: 'Contrabando',
    legal_basis: 'Art. 334-A do Código Penal',
    keywords: ['contrabando', 'mercadoria proibida', 'mercadoria restrita'],
    authority: 'both',
  },
  {
    slug: 'descaminho',
    label: 'Descaminho',
    legal_basis: 'Art. 334 do Código Penal',
    keywords: ['descaminho', 'imposto de importação', 'sem declarar imposto'],
    authority: 'both',
  },
  {
    slug: 'uso-documento-falso',
    label: 'Uso de Documento Falso',
    legal_basis: 'Art. 304 do Código Penal',
    keywords: ['documento falso', 'passaporte falso', 'visto falso', 'rne falso'],
    authority: 'both',
  },
  {
    slug: 'trafico-internacional-armas',
    label: 'Tráfico Internacional de Armas / Munições',
    legal_basis: 'Arts. 17 e 18 da Lei nº 10.826/2003',
    keywords: ['tráfico de armas', 'tráfico internacional de armas', 'munição no aeroporto'],
    authority: 'both',
  },
  {
    slug: 'trafico-internacional-pessoas',
    label: 'Tráfico Internacional de Pessoas',
    legal_basis: 'Art. 149-A do Código Penal',
    keywords: ['tráfico de pessoas', 'tráfico humano', 'aliciamento internacional'],
    authority: 'both',
  },
  {
    slug: 'lavagem-de-dinheiro',
    label: 'Lavagem ou Ocultação de Bens e Valores',
    legal_basis: 'Lei nº 9.613/1998',
    keywords: ['lavagem de dinheiro', 'ocultação de bens', 'dinheiro em espécie no aeroporto'],
    authority: 'both',
  },
  {
    slug: 'atentado-seguranca-transporte-aereo',
    label: 'Crimes contra a Segurança do Transporte Aéreo',
    legal_basis: 'Art. 261 do Código Penal',
    keywords: ['segurança do transporte aéreo', 'atentado transporte aéreo', 'perturbação em voo'],
    authority: 'both',
  },
];

export interface AirportCrimeDetection {
  isAirportCrime: boolean;
  crime?: FederalAirportCrime;
  authorityHint?: 'DEAIN' | 'DPAER';
}

const AIRPORT_HINT_RX = /\b(aeroporto|gru airport|congonhas|cumbica|deain|dpaer|pol[íi]cia federal)\b/i;

export function detectAirportCrime(text: string): AirportCrimeDetection {
  const t = text || '';
  const tLow = stripDiacritics(t);
  const isAirportContext = AIRPORT_HINT_RX.test(t);

  const crime = FEDERAL_AIRPORT_CRIMES.find(c =>
    c.keywords.some(k => tLow.includes(stripDiacritics(k))),
  );

  if (!crime && !isAirportContext) return { isAirportCrime: false };

  let authorityHint: 'DEAIN' | 'DPAER' | undefined;
  if (/\b(cumbica|guarulhos|gru airport|deain)\b/i.test(t)) authorityHint = 'DEAIN';
  else if (/\b(congonhas|dpaer|cgh)\b/i.test(t)) authorityHint = 'DPAER';

  return {
    isAirportCrime: Boolean(crime) || isAirportContext,
    crime,
    authorityHint,
  };
}
