export type ArticleListStatusSource = {
  status: string;
  error_message?: string | null;
  excerpt?: string | null;
};

export function isArticleListFailure(article: ArticleListStatusSource): boolean {
  return article.status === 'error' || (article.status === 'draft' && Boolean(article.error_message?.trim()));
}

export function formatArticleFailureDetail(errorMessage?: string | null): string {
  const detail = String(errorMessage || '').replace(/\s+/g, ' ').trim();
  return detail
    ? `Não publicado: ${detail}`
    : 'Não publicado: erro registrado sem mensagem técnica.';
}

export function decorateArticleListStatus<T extends ArticleListStatusSource>(article: T): T {
  if (!isArticleListFailure(article)) return article;

  return {
    ...article,
    status: 'error',
    excerpt: formatArticleFailureDetail(article.error_message),
  };
}
