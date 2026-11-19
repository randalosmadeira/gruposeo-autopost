/**
 * Lógica pura do Perfil do Projeto (marco P2): leitura, validação, fusão, completude, maturidade e lacunas.
 * Sem Deno, sem React, sem rede: usada pela função de borda (nexus-business), pela tela e pelos testes.
 * Depende só do registro de campos (profile-registry.ts) e da lista fechada das 36 chaves (nexus-business.ts).
 */
import { cleanStrategy } from './nexus-business.ts';
import {
  FIELD_BY_KEY, PROFILE_FIELDS_V2, PROFILE_STEPS, UNKNOWN_LABELS, isPrivateStore, isVisible, optionList,
  type FieldDef, type FieldValue, type StepId,
} from './profile-registry.ts';

export type SectionMap = Record<string, Record<string, unknown>>;
export interface Stores {
  strategy: Record<string, string>;
  sections: SectionMap;
  finance: Record<string, unknown>;
  goals: Record<string, unknown>;
}
export type Values = Record<string, FieldValue | undefined>;

export const emptyStores = (): Stores => ({ strategy: cleanStrategy({}), sections: {}, finance: {}, goals: {} });

// ------------------------------------------------------------------------------------------------------------ utilidades de valor
export function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** "R$ 12.000,50" → 12000.5; "12.000" → 12000; "12000" → 12000; vazio ou inválido → null. */
export function parseMoney(input: unknown): number | null {
  if (typeof input === 'number') return Number.isFinite(input) && input >= 0 ? input : null;
  if (typeof input !== 'string') return null;
  let s = input.replace(/[^\d.,]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 1e12 ? Math.round(n * 100) / 100 : null;
}

/** Confere os dois dígitos verificadores do CNPJ. */
export function isValidCnpj(input: string): boolean {
  const d = input.replace(/\D/g, '');
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    let pos = len - 7;
    for (let i = len; i >= 1; i--) {
      sum += Number(d[len - i]) * pos--;
      if (pos < 2) pos = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

const csvToList = (s: string): string[] => s.split(/\s*,\s*/).map((x) => x.trim()).filter(Boolean);
const listToCsv = (a: string[]): string => a.join(', ');

export function isFilled(value: FieldValue | undefined): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  return typeof value === 'string' && value.trim() !== '';
}

// ------------------------------------------------------------------------------------------------------------ leitura
/**
 * Junta as quatro origens em um mapa único chave → valor. Campo vazio fica `undefined` (nunca um texto "não informado").
 * `includePrivate=false` esconde financeiro e metas (usuário sem papel de dono ou administrador).
 */
export function readValues(stores: Partial<Stores>, includePrivate = true): Values {
  const strategy = asObject(stores.strategy);
  const sections = asObject(stores.sections);
  const out: Values = {};
  for (const field of PROFILE_FIELDS_V2) {
    let raw: unknown;
    if (field.store === 'strategy') raw = strategy[field.key];
    else if (field.store === 'section') raw = asObject(sections[field.step])[field.key];
    else if (!includePrivate) continue;
    else raw = asObject(field.store === 'finance' ? stores.finance : stores.goals)[field.key];
    const v = normalizeRead(field, raw);
    if (v !== undefined) out[field.key] = v;
  }
  // projetos antigos só têm `model`: mostra o tipo de cliente equivalente (sem gravar nada)
  if (out.tipo === undefined && typeof strategy.model === 'string') {
    const implied = strategy.model === 'mixed' ? ['B2C', 'B2B'] : strategy.model === 'B2B' ? ['B2B'] : strategy.model === 'B2C' ? ['B2C'] : null;
    if (implied) out.tipo = implied;
  }
  return out;
}

function normalizeRead(field: FieldDef, raw: unknown): FieldValue | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (field.type === 'multi') {
    const list = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : typeof raw === 'string' ? csvToList(raw) : [];
    return list.length ? list : undefined;
  }
  if (field.type === 'money' || field.type === 'number' || field.type === 'percent') {
    const n = typeof raw === 'number' ? raw : parseMoney(raw);
    return n === null ? undefined : n;
  }
  if (typeof raw !== 'string') return undefined;
  return raw.trim() === '' ? undefined : raw;
}

// ------------------------------------------------------------------------------------------------------------ validação
export type Checked = { ok: true; value: FieldValue | null } | { ok: false; error: string };

/** Valida e normaliza um valor vindo da tela. `null`, texto vazio ou lista vazia significam "limpar o campo". */
export function validateValue(field: FieldDef, raw: unknown): Checked {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  const max = field.max ?? 4000;
  switch (field.type) {
    case 'text':
    case 'textarea': {
      if (typeof raw !== 'string') return { ok: false, error: 'text_expected' };
      const t = raw.trim();
      if (t.length > max) return { ok: false, error: 'too_long' };
      if (field.key === 'cnpj' && t && !isValidCnpj(t)) return { ok: false, error: 'invalid_cnpj' };
      return { ok: true, value: t === '' ? null : t };
    }
    case 'single': {
      if (typeof raw !== 'string') return { ok: false, error: 'text_expected' };
      if (raw === '') return { ok: true, value: null };
      return optionList(field).some((o) => o.value === raw) ? { ok: true, value: raw } : { ok: false, error: 'option_not_allowed' };
    }
    case 'multi': {
      if (!Array.isArray(raw) || raw.some((x) => typeof x !== 'string')) return { ok: false, error: 'list_expected' };
      const list = [...new Set((raw as string[]).map((x) => x.trim()).filter(Boolean))];
      if (list.length > 20 || list.some((x) => x.length > 120)) return { ok: false, error: 'list_too_long' };
      if (!field.allowOther) {
        const allowed = new Set(optionList(field).map((o) => o.value));
        if (list.some((x) => !allowed.has(x))) return { ok: false, error: 'option_not_allowed' };
      }
      if (field.store === 'strategy' && listToCsv(list).length > max) return { ok: false, error: 'too_long' };
      return { ok: true, value: list.length ? list : null };
    }
    case 'money':
    case 'number': {
      if (raw === '') return { ok: true, value: null };
      const n = parseMoney(raw);
      return n === null ? { ok: false, error: 'number_invalid' } : { ok: true, value: n };
    }
    case 'percent': {
      if (raw === '') return { ok: true, value: null };
      const n = typeof raw === 'number' ? raw : Number(raw);
      return Number.isFinite(n) && n >= 0 && n <= 100 ? { ok: true, value: Math.round(n) } : { ok: false, error: 'percent_invalid' };
    }
    case 'color': {
      if (raw === '') return { ok: true, value: null };
      return typeof raw === 'string' && /^#[0-9a-f]{6}$/i.test(raw) ? { ok: true, value: raw.toLowerCase() } : { ok: false, error: 'color_invalid' };
    }
  }
}

// ------------------------------------------------------------------------------------------------------------ patch e fusão
export interface Patch {
  strategy: Record<string, string>;
  sections: SectionMap;
  finance: Record<string, unknown>;
  goals: Record<string, unknown>;
  /** chaves que mudaram (para histórico e para decidir o que gravar). */
  changed: string[];
}
export interface PatchResult {
  patch: Patch;
  errors: Record<string, string>;
  /** chaves recebidas que não existem no registro (descartadas). */
  ignored: string[];
}

/**
 * Converte as mudanças da tela (chave → valor bruto) em um patch roteado por armazenamento.
 * Só o que veio na entrada entra no patch: o resto do perfil nunca é tocado (fusão, não substituição).
 * `canWritePrivate=false` recusa financeiro e metas com erro `private_not_allowed`.
 */
export function buildPatch(changes: unknown, canWritePrivate: boolean, current: Stores): PatchResult {
  const patch: Patch = { strategy: {}, sections: {}, finance: {}, goals: {}, changed: [] };
  const errors: Record<string, string> = {};
  const ignored: string[] = [];
  const input = asObject(changes);
  for (const [key, raw] of Object.entries(input)) {
    const field = FIELD_BY_KEY[key];
    if (!field) { ignored.push(key); continue; }
    if (isPrivateStore(field.store) && !canWritePrivate) { errors[key] = 'private_not_allowed'; continue; }
    const checked = validateValue(field, raw);
    if (checked.ok === false) { errors[key] = checked.error; continue; }
    const v = checked.value;
    if (field.store === 'strategy') {
      patch.strategy[key] = v === null ? '' : Array.isArray(v) ? listToCsv(v) : String(v);
    } else if (field.store === 'section') {
      (patch.sections[field.step] ||= {})[key] = v;
    } else {
      patch[field.store][key] = v;
    }
    patch.changed.push(key);
  }
  // `model` (antigo) acompanha o tipo de cliente, para a tela antiga e a revisão continuarem coerentes
  const tipo = patch.sections.publico && 'tipo' in patch.sections.publico ? patch.sections.publico.tipo : undefined;
  if (tipo !== undefined && !('model' in patch.strategy)) {
    const list = Array.isArray(tipo) ? (tipo as string[]) : [];
    const b2b = list.includes('B2B');
    const b2c = list.includes('B2C');
    const model = b2b && b2c ? 'mixed' : b2b ? 'B2B' : b2c ? 'B2C' : null;
    if (model && current.strategy.model !== model) patch.strategy.model = model;
  }
  // as três partes da receita não podem passar de 100%
  const merged = applyPatch(current, patch);
  const sum = ['low_pct', 'high_pct', 'giro_pct'].reduce((s, k) => s + (typeof asObject(merged.sections.ofertas)[k] === 'number' ? Number(asObject(merged.sections.ofertas)[k]) : 0), 0);
  if (sum > 100) {
    for (const k of ['low_pct', 'high_pct', 'giro_pct']) if (patch.changed.includes(k)) errors[k] = 'percent_sum_exceeds_100';
  }
  return { patch, errors, ignored };
}

/** Aplica o patch sobre os armazenamentos atuais sem alterar nenhum argumento. Valor `null` apaga a chave (estratégia: vira texto vazio). */
export function applyPatch(current: Stores, patch: Patch): Stores {
  const sections: SectionMap = {};
  for (const [name, body] of Object.entries(asObject(current.sections))) sections[name] = { ...asObject(body) };
  for (const [name, body] of Object.entries(patch.sections)) {
    const target = (sections[name] ||= {});
    for (const [k, v] of Object.entries(body)) { if (v === null) delete target[k]; else target[k] = v; }
  }
  const merge = (base: Record<string, unknown>, add: Record<string, unknown>) => {
    const out = { ...asObject(base) };
    for (const [k, v] of Object.entries(add)) { if (v === null) delete out[k]; else out[k] = v; }
    return out;
  };
  return {
    strategy: cleanStrategy({ ...asObject(current.strategy), ...patch.strategy }),
    sections,
    finance: merge(current.finance, patch.finance),
    goals: merge(current.goals, patch.goals),
  };
}

export const patchTouches = (patch: Patch) => ({
  strategy: Object.keys(patch.strategy).some((k) => patch.strategy[k] !== undefined),
  private: Object.keys(patch.finance).length > 0 || Object.keys(patch.goals).length > 0,
  any: patch.changed.length > 0,
});

/** O patch muda de fato algo em relação ao estado atual? (evita gravar e versionar sem mudança) */
export function effectiveChanges(current: Stores, patch: Patch): string[] {
  const before = readValues(current, true);
  const after = readValues(applyPatch(current, patch), true);
  return patch.changed.filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null));
}

// ------------------------------------------------------------------------------------------------------------ completude
export function stepCompleteness(step: StepId, values: Values, includePrivate: boolean): number | null {
  const fields = PROFILE_FIELDS_V2.filter((d) => d.step === step && isVisible(d, values) && (includePrivate || !isPrivateStore(d.store)));
  if (!fields.length) return null;
  const filled = fields.filter((d) => isFilled(values[d.key])).length;
  return Math.round((filled / fields.length) * 100);
}

/** Média das etapas com campos (módulos e pente fino não entram). Sem dado privado, para o número armazenado não depender de quem vê. */
export function overallCompleteness(values: Values, includePrivate = false): number {
  const parts = PROFILE_STEPS.map((s) => stepCompleteness(s.id, values, includePrivate)).filter((x): x is number => x !== null);
  return parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : 0;
}

// ------------------------------------------------------------------------------------------------------------ maturidade e lacunas (só das respostas)
const K4P: Record<string, number> = { 'Já fiz sozinho': 0.7, 'Agência ou terceiro faz': 1, 'Nunca fiz': 0, 'Não sei o que é': 0 };
const POINTS: Record<string, Record<string, number>> = {
  cnpjstat: { 'Tenho CNPJ': 1, 'Sou MEI': 0.8, 'Ainda não tenho CNPJ': 0, 'Não sei o que é': 0 },
  registro: { 'Marca registrada no INPI': 1, 'Pedido em andamento': 0.6, 'Não registrei': 0, 'Não sei o que é': 0 },
  logo: { 'Tenho e guardo o arquivo': 1, 'Só tenho imagem de baixa qualidade': 0.4, 'Não tenho': 0, 'Não sei o que é': 0 },
  manual: { 'Tenho (PDF)': 1, 'Tenho só as cores e fontes': 0.5, 'Não tenho': 0, 'Não sei o que é': 0 },
  sitestat: { 'Tenho site': 1, 'Em construção': 0.4, 'Não tenho site': 0, 'Não sei': 0 },
  dominio: { 'Tenho e está no meu nome': 1, 'Está no nome de terceiro': 0.3, 'Não tenho': 0, 'Não sei o que é': 0 },
  hospedagem: { 'Sei onde está': 1, 'Não sei onde está': 0.3, 'Não sei o que é': 0 },
  gbp: { 'Tenho e administro': 1, 'Tenho, mas sem acesso': 0.4, 'Não tenho': 0, 'Não sei o que é': 0 },
  redesstat: { 'Tenho todas as que preciso': 1, 'Tenho algumas': 0.5, 'Não tenho nenhuma': 0, 'Não sei qual escolher': 0 },
  ads_google: K4P, ads_meta: K4P, org_ig: K4P, org_li: K4P, org_tt: K4P, org_yt: K4P, org_fb: K4P, email_mkt: K4P,
  metricas: { 'Acompanho toda semana': 1, 'Olho de vez em quando': 0.5, 'Não acompanho': 0, 'Não sei o que é': 0 },
  pixel: { Instalado: 1, 'Não sei se está': 0.3, 'Não tenho': 0, 'Não sei o que é': 0 },
  leads: { 'Eu mesmo': 0.7, 'Equipe comercial': 1, Agência: 0.8, 'Ninguém ainda': 0 },
  crm: { CRM: 1, Planilha: 0.6, 'WhatsApp apenas': 0.3, Nada: 0, 'Não sei o que é': 0 },
  fbstat: { 'Tenho página e administro': 1, 'Tenho página, mas sem acesso': 0.4, 'Só perfil pessoal': 0.1, 'Não tenho': 0, 'Não sei o que é': 0 },
  pagamento: { 'Gateway ou provedor de pagamento': 1, 'Link de pagamento avulso': 0.5, 'Só Pix ou transferência manual': 0.3, 'Ainda não recebo online': 0, 'Não sei o que é': 0 },
  integracoes: { 'Tudo integrado': 1, 'Algumas integrações': 0.5, 'Nada integrado, faço manual': 0, 'Não sei o que é': 0 },
  followup: { 'Tenho rotina fixa': 1, 'Faço quando lembro': 0.4, 'Não faço': 0, 'Não sei o que é': 0 },
  kanban: { 'Uso funil ou Kanban': 1, 'Uso planilha': 0.5, 'Não uso': 0, 'Não sei o que é': 0 },
};

function points(key: string, values: Values): number | null {
  const v = values[key];
  if (!isFilled(v)) return null;
  if (POINTS[key]) {
    const p = POINTS[key][String(v)];
    return p === undefined ? null : p;
  }
  if (key === 'conceito') return 1;
  if (key === 'publicos') {
    const n = (Array.isArray(v) ? v : []).filter((x) => x !== 'Não sei o que é').length;
    return Math.min(1, n / 3);
  }
  if (key === 'reputacao') {
    const n = (Array.isArray(v) ? v : []).filter((x) => x !== 'Nada ainda').length;
    return Math.min(1, n / 3);
  }
  return null;
}

export const DIMENSIONS: Array<[string, string[]]> = [
  ['Fundamentos legais', ['cnpjstat', 'registro']],
  ['Identidade', ['logo', 'manual', 'conceito']],
  ['Presença', ['sitestat', 'dominio', 'hospedagem', 'gbp', 'redesstat', 'fbstat']],
  ['Aquisição', ['ads_google', 'ads_meta', 'org_ig', 'org_fb', 'org_li', 'org_tt', 'org_yt', 'email_mkt']],
  ['Medição', ['metricas', 'pixel', 'publicos']],
  ['Atendimento', ['leads', 'crm', 'followup', 'kanban', 'reputacao']],
  ['Vendas online', ['pagamento', 'integracoes']],
];

/** Pontuação 0 a 100 por dimensão, ou `null` ("sem dados") quando nada foi respondido. Nunca inventa número. */
export function dimensionScores(values: Values): Array<{ name: string; score: number | null }> {
  const onlyInPerson = values.vendeonline === 'Só vendo presencial';
  return DIMENSIONS.filter(([name]) => !(name === 'Vendas online' && onlyInPerson)).map(([name, keys]) => {
    let sum = 0;
    let n = 0;
    for (const k of keys) {
      const p = points(k, values);
      if (p !== null) { sum += p; n++; }
    }
    return { name, score: n ? Math.round((sum / n) * 100) : null };
  });
}

const GAPS: Array<{ key: string; when: string[]; item: string; who: string; why: string; onlineOnly?: boolean }> = [
  { key: 'cnpjstat', when: ['Ainda não tenho CNPJ', 'Não sei o que é'], item: 'Abrir a empresa (CNPJ)', who: 'Delegar a contador', why: 'Escolher o tipo certo (MEI, ME, outros) muda impostos e limites.' },
  { key: 'registro', when: ['Não registrei', 'Não sei o que é'], item: 'Registrar a marca no INPI', who: 'Vale delegar', why: 'O pedido é feito no INPI. Erro na classe do produto ou do serviço é comum e custa caro.' },
  { key: 'logo', when: ['Não tenho', 'Só tenho imagem de baixa qualidade', 'Não sei o que é'], item: 'Logomarca profissional', who: 'Vale delegar', why: 'Precisa de arquivo vetorial e versões para cada uso.' },
  { key: 'manual', when: ['Não tenho', 'Tenho só as cores e fontes', 'Não sei o que é'], item: 'Manual de identidade visual', who: 'Vale delegar', why: 'Define cores, fontes e tom para tudo ficar com a mesma cara.' },
  { key: 'sitestat', when: ['Não tenho site', 'Em construção'], item: 'Site profissional', who: 'Vale delegar', why: 'Estrutura, velocidade e dados para Google e IAs pedem quem entenda.' },
  { key: 'dominio', when: ['Não tenho', 'Está no nome de terceiro', 'Não sei o que é'], item: 'Domínio no seu nome', who: 'Dá para fazer sozinho', why: 'No Registro.br leva minutos. O essencial é registrar no seu CPF ou CNPJ.' },
  { key: 'hospedagem', when: ['Não sei onde está', 'Não sei o que é'], item: 'Hospedagem e segurança do site', who: 'Vale delegar', why: 'Afeta velocidade, segurança e backup.' },
  { key: 'gbp', when: ['Não tenho', 'Tenho, mas sem acesso', 'Não sei o que é'], item: 'Perfil no Google Meu Negócio', who: 'Dá para fazer sozinho, com ajuda', why: 'Gratuito. A verificação do endereço é a parte que costuma travar.' },
  { key: 'redesstat', when: ['Não tenho nenhuma', 'Não sei qual escolher'], item: 'Presença nas redes certas', who: 'Dá para começar sozinho', why: 'Escolher poucos canais e manter ritmo vale mais que estar em todos.' },
  { key: 'pixel', when: ['Não tenho', 'Não sei se está', 'Não sei o que é'], item: 'Medição (GA4, pixel e Tag Manager)', who: 'Vale delegar', why: 'Instalado errado, conta números errados e estraga as decisões.' },
  { key: 'leads', when: ['Ninguém ainda'], item: 'Atendimento dos contatos', who: 'Dá para fazer sozinho', why: 'De nada adianta atrair se ninguém responde em minutos.' },
  { key: 'fbstat', when: ['Não tenho', 'Só perfil pessoal', 'Não sei o que é'], item: 'Página da empresa no Facebook', who: 'Dá para fazer sozinho, com ajuda', why: 'Gratuita. É pré-requisito para anunciar no Facebook e no Instagram e para ter loja, mensagens e avaliações.' },
  { key: 'pagamento', when: ['Ainda não recebo online', 'Só Pix ou transferência manual', 'Não sei o que é'], item: 'Gateway de pagamento', who: 'Vale delegar', why: 'Liga cartão, Pix e boleto à loja com segurança e concilia os recebimentos.', onlineOnly: true },
  { key: 'integracoes', when: ['Nada integrado, faço manual', 'Não sei o que é'], item: 'Integração entre loja, estoque, pagamento e nota fiscal', who: 'Vale delegar', why: 'Tira o trabalho manual e reduz erro de pedido e de estoque.', onlineOnly: true },
  { key: 'crm', when: ['Nada', 'WhatsApp apenas', 'Não sei o que é'], item: 'CRM para guardar e acompanhar clientes', who: 'Dá para começar sozinho', why: 'Uma ferramenta simples resolve. O importante é todo contato ser registrado.' },
  { key: 'followup', when: ['Não faço', 'Faço quando lembro', 'Não sei o que é'], item: 'Rotina de follow-up', who: 'Dá para fazer sozinho, com modelo', why: 'Muitas vendas só fecham depois de mais de um contato.' },
  { key: 'kanban', when: ['Não uso', 'Não sei o que é'], item: 'Funil ou quadro Kanban de clientes', who: 'Dá para fazer sozinho, com modelo', why: 'Mostra de uma vez quem está parado e quem precisa de retorno.' },
];

export function profileGapsV2(values: Values): Array<{ item: string; who: string; why: string }> {
  const onlyInPerson = values.vendeonline === 'Só vendo presencial';
  const list = GAPS.filter((g) => g.when.includes(String(values[g.key] ?? '')) && !(g.onlineOnly && onlyInPerson)).map(({ item, who, why }) => ({ item, who, why }));
  const others = values.outros;
  if (isFilled(others) && Array.isArray(others) && !others.includes('Política de privacidade (LGPD)')) {
    list.push({ item: 'Política de privacidade (LGPD)', who: 'Vale delegar', why: 'Obrigatória para quem coleta contato pelo site.' });
  }
  return list;
}

export const isUnknownAnswer = (value: unknown): boolean => typeof value === 'string' && UNKNOWN_LABELS.includes(value);
