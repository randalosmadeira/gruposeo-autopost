import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  MAX_IMAGES_PER_PLAN,
  MAX_KEYWORDS_PER_IMPORT,
  detectHeaderRow,
  isValidRssUrl,
  parseEditorialText,
  parseRssSources,
  parseSpreadsheetBuffer,
  rowsToEditorialKeywords,
  selectPlanImages,
  spreadsheetExtension,
} from '@/lib/editorial-import';

function toArrayBuffer(text: string, encoding: 'utf-8' | 'latin1' = 'utf-8'): ArrayBuffer {
  const bytes = encoding === 'utf-8' ? new TextEncoder().encode(text) : Uint8Array.from(Buffer.from(text, 'latin1'));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function workbookBuffer(rows: unknown[][]): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Planilha');
  const out = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return out;
}

describe('editorial import: text', () => {
  it('reads one keyword per line with optional positional columns', () => {
    const inputs = parseEditorialText('advogado criminal\n"fraude, pix",Consumidor,informacional,1200,35,1\n\n   \n');
    expect(inputs).toEqual([
      { keyword: 'advogado criminal', category: undefined, intent: undefined, volume: undefined, difficulty: undefined, priority: undefined },
      { keyword: 'fraude, pix', category: 'Consumidor', intent: 'informacional', volume: '1200', difficulty: '35', priority: '1' },
    ]);
  });

  it('recognises a header line instead of importing it as a keyword', () => {
    const inputs = parseEditorialText('Palavra-chave,Categoria,Volume\nhabeas corpus,Criminal,900\nrevisão de contrato,Empresarial,300');
    expect(inputs.map((item) => item.keyword)).toEqual(['habeas corpus', 'revisão de contrato']);
    expect(inputs[0]).toMatchObject({ category: 'Criminal', volume: '900' });
  });

  it('returns nothing for blank input', () => {
    expect(parseEditorialText('   \n\n')).toEqual([]);
  });
});

describe('editorial import: rows', () => {
  it('maps header aliases case- and accent-insensitively and ignores unknown columns', () => {
    const inputs = rowsToEditorialKeywords([
      ['ID', 'KEYWORD', 'Intenção', 'Buscas Mensais', 'KD', 'Prioridade', 'Grupo'],
      [1, 'defesa em flagrante', 'transacional', 500, 42, 2, 'Criminal'],
    ]);
    expect(inputs).toEqual([{ keyword: 'defesa em flagrante', category: 'Criminal', intent: 'transacional', volume: '500', difficulty: '42', priority: '2' }]);
  });

  it('falls back to the first column when the header has no keyword alias', () => {
    const inputs = rowsToEditorialKeywords([['Termo buscado?', 'Categoria'], ['audiência de custódia', 'Criminal']]);
    expect(detectHeaderRow(['Termo buscado?', 'Categoria'])).toBe(true);
    expect(inputs).toEqual([{ keyword: 'audiência de custódia', category: 'Criminal', intent: undefined, volume: undefined, difficulty: undefined, priority: undefined }]);
  });

  it('skips empty rows and rows without keyword, and caps the import', () => {
    const rows: unknown[][] = [['', ''], ['', 'só categoria']];
    for (let index = 0; index < MAX_KEYWORDS_PER_IMPORT + 10; index += 1) rows.push([`kw ${index}`]);
    const inputs = rowsToEditorialKeywords(rows);
    expect(inputs).toHaveLength(MAX_KEYWORDS_PER_IMPORT);
    expect(inputs[0].keyword).toBe('kw 0');
  });
});

describe('editorial import: files', () => {
  it('accepts only csv, xls and xlsx extensions', () => {
    expect(spreadsheetExtension('lista.CSV')).toBe('csv');
    expect(spreadsheetExtension('lista.xlsx')).toBe('xlsx');
    expect(spreadsheetExtension('lista.txt')).toBeNull();
    expect(() => parseSpreadsheetBuffer(toArrayBuffer('a'), 'lista.txt')).toThrow(/Formato não aceito/);
  });

  it('parses a UTF-8 CSV with BOM and header', () => {
    const csv = '﻿palavra-chave;categoria\nprisão preventiva;Criminal\n';
    const inputs = parseSpreadsheetBuffer(toArrayBuffer(csv), 'lista.csv');
    expect(inputs).toEqual([{ keyword: 'prisão preventiva', category: 'Criminal', intent: undefined, volume: undefined, difficulty: undefined, priority: undefined }]);
  });

  it('recovers accents from a Latin-1 CSV exported by Excel', () => {
    const inputs = parseSpreadsheetBuffer(toArrayBuffer('keyword\nrescisão indireta\n', 'latin1'), 'excel.csv');
    expect(inputs[0].keyword).toBe('rescisão indireta');
  });

  it('parses the first sheet of an XLSX workbook using the header row', () => {
    const buffer = workbookBuffer([
      ['Keyword', 'Volume', 'Difficulty'],
      ['acordo trabalhista', 1500, 28.5],
      ['', 10, 1],
      ['horas extras', 2200, 31],
    ]);
    const inputs = parseSpreadsheetBuffer(buffer, 'planilha.xlsx');
    expect(inputs.map((item) => item.keyword)).toEqual(['acordo trabalhista', 'horas extras']);
    expect(inputs[0]).toMatchObject({ volume: '1500', difficulty: '28.5' });
  });

  it('returns no keywords for a workbook whose first sheet has only blank cells', () => {
    expect(parseSpreadsheetBuffer(workbookBuffer([['', ''], ['', '']]), 'vazia.xlsx')).toEqual([]);
  });
});

describe('editorial import: rss and images', () => {
  it('parses labelled and bare RSS lines and de-duplicates by URL', () => {
    const sources = parseRssSources('Portal,https://exemplo.com/feed.xml\nhttps://outro.com/rss\n\nHTTPS://EXEMPLO.COM/FEED.XML\nhttps://a.com/x,y');
    expect(sources).toEqual([
      { label: 'Portal', url: 'https://exemplo.com/feed.xml' },
      { label: 'Fonte RSS', url: 'https://outro.com/rss' },
      { label: 'Fonte RSS', url: 'https://a.com/x,y' },
    ]);
    expect(isValidRssUrl('https://a.com/x,y')).toBe(true);
    expect(isValidRssUrl('ftp://a.com/feed')).toBe(false);
    expect(isValidRssUrl('https://a.com/ com espaço')).toBe(false);
  });

  it('keeps only supported image types within the size and count limits', () => {
    const make = (name: string, type: string, size: number) => new File([new Uint8Array(size)], name, { type });
    const files = [
      make('ok.png', 'image/png', 10),
      make('big.jpg', 'image/jpeg', 15 * 1024 * 1024 + 1),
      make('doc.pdf', 'application/pdf', 10),
      make('vazia.webp', 'image/webp', 0),
    ];
    for (let index = 0; index < MAX_IMAGES_PER_PLAN; index += 1) files.push(make(`extra-${index}.webp`, 'image/webp', 5));
    const { accepted, rejected } = selectPlanImages(files);
    expect(accepted).toHaveLength(MAX_IMAGES_PER_PLAN);
    expect(rejected).toEqual(expect.arrayContaining([
      { name: 'big.jpg', reason: 'size' },
      { name: 'doc.pdf', reason: 'type' },
      { name: 'vazia.webp', reason: 'size' },
      { name: `extra-${MAX_IMAGES_PER_PLAN - 1}.webp`, reason: 'limit' },
    ]));
  });
});
