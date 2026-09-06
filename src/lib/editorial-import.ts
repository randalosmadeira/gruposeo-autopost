import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { EditorialKeywordInput } from '@/lib/editorial-planning';

// CORE-003: pure, testable parsers for the mass planning entry module.
// Nothing here touches Supabase, generation or publication.

export interface RssSourceInput { label: string; url: string }

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_IMAGE_SIZE = 15 * 1024 * 1024;
export const MAX_IMAGES_PER_PLAN = 100;
export const MAX_KEYWORDS_PER_IMPORT = 5000;
export const SPREADSHEET_EXTENSIONS = ['xlsx', 'xls', 'csv'] as const;

type Field = keyof EditorialKeywordInput;

const ALIASES: Record<Field, readonly string[]> = {
  keyword: ['keyword', 'keywords', 'palavra-chave', 'palavra chave', 'palavras-chave', 'termo', 'query', 'kw'],
  category: ['category', 'categoria', 'grupo', 'cluster'],
  intent: ['intent', 'intenção', 'intencao', 'intent type'],
  volume: ['volume', 'search volume', 'buscas mensais', 'volume de busca'],
  difficulty: ['difficulty', 'kd', 'dificuldade', 'keyword difficulty'],
  priority: ['priority', 'prioridade'],
};

const POSITIONAL_ORDER: Field[] = ['keyword', 'category', 'intent', 'volume', 'difficulty', 'priority'];

const RSS_URL_PATTERN = /^https?:\/\/\S+$/i;

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function cell(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  return String(value).trim();
}

function fieldForHeader(header: unknown): Field | undefined {
  const normalized = normalizeHeader(header);
  if (!normalized) return undefined;
  return POSITIONAL_ORDER.find((field) => ALIASES[field].some((alias) => normalizeHeader(alias) === normalized));
}

/** A row is a header when at least one cell matches a known column alias. */
export function detectHeaderRow(row: unknown[]): boolean {
  return row.some((value) => fieldForHeader(value) !== undefined);
}

function buildInput(values: Partial<Record<Field, string>>): EditorialKeywordInput | null {
  const keyword = values.keyword?.trim() ?? '';
  if (!keyword) return null;
  return {
    keyword,
    category: values.category || undefined,
    intent: values.intent || undefined,
    volume: values.volume || undefined,
    difficulty: values.difficulty || undefined,
    priority: values.priority || undefined,
  };
}

/**
 * Converts tabular rows (arrays of cells) into keyword inputs. When the first
 * row is a header, columns are mapped by alias and unknown columns are ignored;
 * otherwise columns are read positionally as
 * keyword, category, intent, volume, difficulty, priority.
 * A header without a recognisable keyword column falls back to the first column.
 */
export function rowsToEditorialKeywords(rows: unknown[][]): EditorialKeywordInput[] {
  const nonEmpty = rows.filter((row) => Array.isArray(row) && row.some((value) => cell(value) !== ''));
  if (!nonEmpty.length) return [];

  const hasHeader = detectHeaderRow(nonEmpty[0]);
  const mapping: Array<Field | undefined> = hasHeader
    ? nonEmpty[0].map((header) => fieldForHeader(header))
    : POSITIONAL_ORDER.slice();
  if (hasHeader && !mapping.includes('keyword')) mapping[0] = 'keyword';

  const body = hasHeader ? nonEmpty.slice(1) : nonEmpty;
  const inputs: EditorialKeywordInput[] = [];
  for (const row of body) {
    const values: Partial<Record<Field, string>> = {};
    mapping.forEach((field, index) => {
      if (!field || values[field]) return;
      values[field] = cell(row[index]);
    });
    const input = buildInput(values);
    if (input) inputs.push(input);
    if (inputs.length >= MAX_KEYWORDS_PER_IMPORT) break;
  }
  return inputs;
}

/** Free text pasted by the user: one keyword per line, optional CSV columns. */
export function parseEditorialText(value: string): EditorialKeywordInput[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const parsed = Papa.parse<string[]>(trimmed, { skipEmptyLines: 'greedy' });
  return rowsToEditorialKeywords(parsed.data);
}

function decodeCsv(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  if (!utf8.includes('�')) return utf8;
  try {
    return new TextDecoder('windows-1252').decode(buffer);
  } catch {
    return utf8;
  }
}

export function spreadsheetExtension(fileName: string): (typeof SPREADSHEET_EXTENSIONS)[number] | null {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  return (SPREADSHEET_EXTENSIONS as readonly string[]).includes(extension) ? (extension as (typeof SPREADSHEET_EXTENSIONS)[number]) : null;
}

/** CSV, XLS or XLSX binary content. Throws on unreadable workbooks. */
export function parseSpreadsheetBuffer(buffer: ArrayBuffer, fileName: string): EditorialKeywordInput[] {
  const extension = spreadsheetExtension(fileName);
  if (!extension) throw new Error('Formato não aceito. Use XLSX, XLS ou CSV.');
  if (extension === 'csv') {
    const parsed = Papa.parse<string[]>(decodeCsv(buffer).trim(), { skipEmptyLines: 'greedy' });
    return rowsToEditorialKeywords(parsed.data);
  }
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('Planilha sem aba legível.');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true });
  return rowsToEditorialKeywords(rows);
}

/** One RSS source per line: `Label,https://…` or a bare URL. */
export function parseRssSources(value: string): RssSourceInput[] {
  const seen = new Set<string>();
  const sources: RssSourceInput[] = [];
  for (const raw of value.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const comma = line.indexOf(',');
    const candidate = comma > 0 && !RSS_URL_PATTERN.test(line)
      ? { label: line.slice(0, comma).trim() || 'Fonte RSS', url: line.slice(comma + 1).trim() }
      : { label: 'Fonte RSS', url: line };
    const key = candidate.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push(candidate);
  }
  return sources;
}

export function isValidRssUrl(url: string): boolean {
  return RSS_URL_PATTERN.test(url) && url.length <= 2048;
}

export interface ImageSelection {
  accepted: File[];
  rejected: Array<{ name: string; reason: 'type' | 'size' | 'limit' }>;
}

/** Keeps only JPEG/PNG/WebP up to 15 MiB, capped at MAX_IMAGES_PER_PLAN. */
export function selectPlanImages(files: Iterable<File>): ImageSelection {
  const accepted: File[] = [];
  const rejected: ImageSelection['rejected'] = [];
  for (const file of files) {
    if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) { rejected.push({ name: file.name, reason: 'type' }); continue; }
    if (file.size <= 0 || file.size > MAX_IMAGE_SIZE) { rejected.push({ name: file.name, reason: 'size' }); continue; }
    if (accepted.length >= MAX_IMAGES_PER_PLAN) { rejected.push({ name: file.name, reason: 'limit' }); continue; }
    accepted.push(file);
  }
  return { accepted, rejected };
}
