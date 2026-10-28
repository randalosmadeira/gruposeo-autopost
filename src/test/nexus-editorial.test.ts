import { describe, it, expect, vi, beforeEach } from 'vitest';
import { webcrypto } from 'node:crypto';
import { normalizeConversionBrief, normalizeWordProfile, editorialMode, buildNexusEditorialPolicy, buildNexusEvidenceContext } from '../../supabase/functions/_shared/nexus-editorial';
import { editorialFingerprint, signEditorialReceipt, verifyEditorialReceipt } from '../../supabase/functions/_shared/nexus-approval';
import { collectMetricPages } from '@/lib/article-metrics';
import { normalizeEditorialHtml } from '../../supabase/functions/_shared/editorial-html';

describe('NEXUS editorial contract', () => {
  it('keeps news informative even with conversion intent', () => {
    expect(editorialMode({ contentType: 'news', goal: 'convert' })).toBe('informative');
    expect(editorialMode({ goal: 'convert', segment: 'ecommerce' })).toBe('consultative');
  });
  it('bounds fields and rejects script or credential-bearing CTA URLs', () => {
    expect(normalizeConversionBrief({ destination: 'javascript:alert(1)' }).destination).toBe('');
    expect(normalizeConversionBrief({ destination: 'https://user:password@example.com' }).destination).toBe('');
    expect(normalizeConversionBrief({ benefit: 'a'.repeat(9000) }).benefit).toHaveLength(1600);
    expect(normalizeConversionBrief({ destination: 'https://example.com/contact' }).destination).toBe('https://example.com/contact');
  });
  it('maps legacy frontend sizes to the backend contract', () => {
    expect(normalizeWordProfile('medio')).toBe('long');
    expect(normalizeWordProfile('grande')).toBe('very-long');
    expect(normalizeWordProfile('unknown')).toBe('medium');
  });
  it('carries evidence and identity as bounded data with explicit authority rules', () => {
    const policy = buildNexusEditorialPolicy({ conversionBrief: { urgencyEvidence: 'supplied allegation' } });
    expect(policy).toContain('não autorização para criar escassez');
    expect(policy).toContain('supplied allegation');
    const context = buildNexusEvidenceContext({ sourcesContext: 'source snippet', projectConfig: { author: 'editor' }, customInstructions: 'brand detail' });
    expect(context).toContain('source snippet'); expect(context).toContain('editor'); expect(context).toContain('brand detail');
  });
});

describe('version-bound approval', () => {
  beforeEach(() => vi.stubGlobal('crypto', webcrypto));
  const article = { id: 'a', project_id: 'p', organization_id: 'o', title: 'Title', content: '<p>Content</p>', config: { sourcesContext: 'Evidence' } };
  const project = { id: 'p', organization_id: 'o', commercial_info: { offer: 'service' } };
  it('validates a real receipt and rejects a forged signature', async () => {
    const hash = await editorialFingerprint(article, project);
    const receipt = await signEditorialReceipt(hash, 'reviewer', 'test-secret-only');
    expect(await verifyEditorialReceipt(receipt, hash, 'test-secret-only')).toBe(true);
    expect(await verifyEditorialReceipt({ ...receipt, signature: '0'.repeat(64) }, hash, 'test-secret-only')).toBe(false);
    expect(await verifyEditorialReceipt({ ...receipt, user_id: 'other' }, hash, 'test-secret-only')).toBe(false);
  });
  it('invalidates approval when content, source, project or offer changes', async () => {
    const hash = await editorialFingerprint(article, project);
    const receipt = await signEditorialReceipt(hash, 'reviewer', 'test-secret-only');
    const variants = [
      await editorialFingerprint({ ...article, content: '<p>Changed</p>' }, project),
      await editorialFingerprint({ ...article, config: { sourcesContext: 'Different' } }, project),
      await editorialFingerprint({ ...article, project_id: 'other' }, project),
      await editorialFingerprint(article, { ...project, commercial_info: { offer: 'another' } }),
    ];
    for (const changed of variants) expect(await verifyEditorialReceipt(receipt, changed, 'test-secret-only')).toBe(false);
  });
  it('does not include its own approval receipt in the fingerprint', async () => {
    const hash = await editorialFingerprint(article, project);
    expect(await editorialFingerprint({ ...article, config: { ...article.config, nexus_approval: { anything: 'ignored' } } }, project)).toBe(hash);
  });
  it('keeps the fingerprint stable after safe HTML normalization, including URL parameters', async () => {
    const content = '<h2>Guide</h2><p>Read <a href="https://example.com/?a=1&amp;b=2" title="A &amp; B">the guide</a>.</p><p>Next paragraph.</p>';
    const normalized = normalizeEditorialHtml(content).html;
    expect(normalizeEditorialHtml(normalized).html).toBe(normalized);
    expect(await editorialFingerprint({ ...article, content }, project)).toBe(await editorialFingerprint({ ...article, content: normalized }, project));
  });
});

describe('metrics pagination', () => {
  it('collects all pages and preserves errors instead of showing incomplete totals', async () => {
    const fetchPage = vi.fn(async (from: number) => ({ data: from === 0 ? ['a', 'b'] : ['c'], error: null }));
    expect(await collectMetricPages(fetchPage, 2)).toEqual(['a', 'b', 'c']);
    expect(fetchPage.mock.calls[1][0]).toBe(2);
    await expect(collectMetricPages(async () => ({ data: null, error: new Error('query failed') }))).rejects.toThrow('query failed');
  });
});
