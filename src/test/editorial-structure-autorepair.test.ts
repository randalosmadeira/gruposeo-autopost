import { describe, expect, it } from 'vitest';
import { ensureEditorialHeadingStructure, normalizeEditorialHtml } from '../../supabase/functions/_shared/editorial-html';

const longParagraph = Array.from({ length: 270 }, (_, index) => `palavra${index}`).join(' ');

describe('autocorreção da estrutura editorial', () => {
  it('insere dois H2 neutros em matéria longa com dois parágrafos', () => {
    const initial = normalizeEditorialHtml(`<p>${longParagraph}</p><p>${longParagraph}</p>`);
    const repair = ensureEditorialHeadingStructure(initial.html);
    const audited = normalizeEditorialHtml(repair.html);
    expect(repair.repaired).toBe(true);
    expect(repair.insertedHeadings).toBe(2);
    expect(audited.metrics.h2Count).toBe(2);
    expect(audited.metrics.wordCount).toBeGreaterThanOrEqual(initial.metrics.wordCount);
  });

  it('é idempotente quando o conteúdo já possui H2', () => {
    const html = `<h2>Seção existente</h2><p>${longParagraph}</p><p>${longParagraph}</p>`;
    const repair = ensureEditorialHeadingStructure(html);
    expect(repair.repaired).toBe(false);
    expect(repair.html).toBe(html);
  });

  it('não altera conteúdo curto', () => {
    const html = '<p>Conteúdo curto e válido.</p>';
    expect(ensureEditorialHeadingStructure(html)).toEqual({ html, repaired: false, insertedHeadings: 0 });
  });
});
