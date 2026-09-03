import { describe, expect, it } from 'vitest';
import { decorateArticleListStatus, formatArticleFailureDetail, isArticleListFailure } from '@/lib/article-list-status';

describe('article list real status', () => {
  it('does not classify a clean draft as an error', () => {
    const article = { status: 'draft', error_message: null, excerpt: 'Resumo editorial' };
    expect(isArticleListFailure(article)).toBe(false);
    expect(decorateArticleListStatus(article)).toEqual(article);
  });

  it('classifies a blocked draft as error and exposes the exact reason', () => {
    const message = 'Preflight editorial bloqueou READY: revisão ou fonte oficial pendente.';
    const article = { status: 'draft', error_message: message, excerpt: 'Resumo editorial' };
    const decorated = decorateArticleListStatus(article);
    expect(decorated.status).toBe('error');
    expect(decorated.excerpt).toBe(`Não publicado: ${message}`);
  });

  it('keeps published articles published even if an old error string exists', () => {
    const article = { status: 'published', error_message: 'erro histórico', excerpt: 'Resumo publicado' };
    expect(decorateArticleListStatus(article)).toEqual(article);
  });

  it('does not invent a technical cause when an error row has no message', () => {
    expect(formatArticleFailureDetail(null)).toBe('Não publicado: erro registrado sem mensagem técnica.');
  });
});
