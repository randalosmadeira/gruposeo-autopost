export type SpreadsheetRow = Record<string, unknown>;

const KEYWORD_HEADER_ALIASES = [
  'keyword', 'palavra-chave', 'palavra chave', 'termo', 'query', 'search term',
  'titulo', 'título', 'pauta', 'assunto', 'tema',
] as const;

export function normalizeImportHeader(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

export function importCellText(value: unknown) {
  return value == null ? '' : String(value).replace(/\s+/g, ' ').trim();
}

export function isValidEditorialKeyword(value: unknown) {
  const keyword = importCellText(value);
  if (keyword.length < 3 || keyword.length > 240) return false;
  if (!/\p{L}/u.test(keyword)) return false;
  if (/^(?:id|indice|índice|linha|row)?\s*#?\s*\d+$/iu.test(keyword)) return false;
  return true;
}

export function findKeywordColumn(rows: SpreadsheetRow[]) {
  if (!rows.length) return null;
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const normalizedAliases = KEYWORD_HEADER_ALIASES.map(normalizeImportHeader);
  const explicit = headers.find((header) => normalizedAliases.includes(normalizeImportHeader(header)));
  if (explicit && rows.some((row) => isValidEditorialKeyword(row[explicit]))) return explicit;

  const ranked = headers
    .map((header) => ({
      header,
      valid: rows.filter((row) => isValidEditorialKeyword(row[header])).length,
      numeric: rows.filter((row) => /^\s*\d+\s*$/.test(importCellText(row[header]))).length,
    }))
    .sort((a, b) => (b.valid - b.numeric) - (a.valid - a.numeric));

  return ranked[0]?.valid ? ranked[0].header : null;
}

export function initialArticleTitle(keyword: string) {
  return importCellText(keyword);
}
