import { describe, expect, it } from 'vitest';
import { findKeywordColumn, initialArticleTitle, isValidEditorialKeyword } from '@/lib/keyword-import';
import fs from 'node:fs';

describe('integridade de palavras-chave e títulos em massa', () => {
  it('ignora a coluna numérica de índice e seleciona a pauta textual', () => {
    const rows = [
      { ID: 1151, Título: 'advogado para fraude bancária em São Paulo', Segmento: 'jurídico' },
      { ID: 1157, Título: 'indenização por conta bloqueada no Instagram', Segmento: 'jurídico' },
    ];
    expect(findKeywordColumn(rows)).toBe('Título');
  });

  it('bloqueia índices numéricos, inclusive com quatro dígitos', () => {
    expect(isValidEditorialKeyword('1200')).toBe(false);
    expect(isValidEditorialKeyword(' 1151 ')).toBe(false);
  });

  it('preserva números que pertencem a uma palavra-chave textual', () => {
    expect(isValidEditorialKeyword('direitos do consumidor em 2026')).toBe(true);
  });

  it('não acrescenta ano nem molde genérico ao título inicial', () => {
    const keyword = 'indenização por fraude bancária';
    expect(initialArticleTitle(keyword)).toBe(keyword);
    expect(initialArticleTitle(keyword)).not.toMatch(/Guia Completo|\b\d{4}\b/);
  });

  it('mantém as mesmas regras no frontend e nas Edge Functions', () => {
    const bulk = fs.readFileSync('src/hooks/useBulkGeneration.tsx', 'utf8');
    const generator = fs.readFileSync('supabase/functions/generate-article/index.ts', 'utf8');
    const titleApi = fs.readFileSync('supabase/functions/ai-api/index.ts', 'utf8');
    expect(bulk).not.toContain(': Guia Completo ${new Date().getFullYear()}');
    expect(generator).toContain('invalid_editorial_keyword');
    expect(generator).toContain('Não acrescente ano, número, percentual');
    expect(titleApi).toContain('Palavra-chave editorial inválida');
    expect(titleApi).not.toContain('93% dos Especialistas');
  });
});
