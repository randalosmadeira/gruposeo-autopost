import { normalizeEditorialHtml } from './editorial-html.ts';
import { publicationWordMinimum } from './nexus-word-floor.ts';
import { findPublicationResidues } from './publication-safety.ts';
import { findBrokenContactCtas } from './publication-quality.ts';
import { DEFAULT_COMPLIANCE_MODE, runComplianceCheck, type ComplianceMode } from './compliance-mode.ts';
import type { QualityIssue } from './publication-quality.ts';
export async function sha256(value: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(b => b.toString(16).padStart(2, '0')).join('');
}
export function tokenMatches(actual: string, expected: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(actual) || !/^[a-f0-9]{64}$/.test(expected)) return false;
  let diff = 0; for (let i = 0; i < 64; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
export interface ImportedReview {
  article_id: string; expected_updated_at: string; content_sha256: string;
  approved_vector_sha256?: string;
  verdict: { dimensions: Record<string, boolean>; unsupported_claims: string[]; issues: string[]; notes: string; provenance: string };
}
/** Achados do Provimento 205/2021 segundo o modo da organização: strict bloqueia (via importedReviewIssues), advisory só avisa, off ignora. */
export function importedReviewComplianceWarnings(article: Record<string, unknown>, project: Record<string, unknown>, complianceMode: ComplianceMode = DEFAULT_COMPLIANCE_MODE): QualityIssue[] {
  const text = (value: unknown) => (typeof value === 'string' ? value : null);
  return runComplianceCheck(complianceMode, { title: text(article.title), content: text(article.content), excerpt: text(article.excerpt), brand: text(project.empresa_nome) }).warnings;
}
/** Only called on a manifest loaded from the service-only inbox, never request JSON or article.config. */
export async function importedReviewIssues(item: ImportedReview, article: Record<string, any>, project: Record<string, any>, job: Record<string, any>, alreadyApproved = false, complianceMode: ComplianceMode = DEFAULT_COMPLIANCE_MODE): Promise<string[]> {
  const issues: string[] = []; const c = article.config || {}; const v = item.verdict;
  if (article.id !== item.article_id || article.project_id !== job.project_id || article.user_id !== job.user_id || article.organization_id !== job.organization_id || project.organization_id !== job.organization_id || project.user_id !== job.user_id) issues.push('scope_mismatch');
  if (project.nexus_profile_status !== 'complete') issues.push('profile_incomplete');
  if (project.updated_at !== job.expected_project_updated_at) issues.push('project_changed');
  if (!alreadyApproved && article.updated_at !== item.expected_updated_at) issues.push('article_changed');
  if (await sha256(String(article.content || '')) !== item.content_sha256) issues.push('reviewed_content_changed');
  if (article.status !== 'ready' || article.scheduled_at || article.published_at) issues.push('not_unscheduled_finalized');
  const audit = normalizeEditorialHtml(String(article.content || '')); issues.push(...audit.fatalIssues);
  if (audit.metrics.wordCount < publicationWordMinimum(c)) issues.push('article_below_word_minimum');
  if (findPublicationResidues(article).length || findBrokenContactCtas(article.content).length || runComplianceCheck(complianceMode, { ...article, brand: project.empresa_nome }).blocking) issues.push('publication_quality_failure');
  if (c.needs_primary_source || c.review_pass === false) issues.push('existing_editorial_failure');
  // Legacy waves store claim locators in primary_sources and the URL catalog in sourcesContext.
  const sources = [...(Array.isArray(c.primary_sources) ? c.primary_sources : []), ...Object.values(c.sourcesContext && typeof c.sourcesContext === 'object' ? c.sourcesContext : {})];
  if (!sources.some((s: any) => typeof s?.url === 'string' && /^https:\/\//.test(s.url))) issues.push('primary_sources_missing');
  if (!['passed_for_draft', 'passed_editorial_review'].includes(c.nexus_conversation_review?.status)) issues.push('prior_conversation_review_missing');
  const vectorUrl = `https://app.zica.posts.zicajuris.com.br/rdm-capas/editorial/rdm-capa-${String(c.rdm_manual_topic).padStart(2, '0')}.png`;
  const approvedVector = c.rdm_manual_batch === '20261110-criminal-13' &&
    c.nexus_visual?.kind === 'approved_local_vector' && c.nexus_visual?.user_approved === true &&
    article.featured_image_url === vectorUrl && /^[a-f0-9]{64}$/.test(item.approved_vector_sha256 || '');
  let verifiedVector = false;
  if (approvedVector) {
    try {
      const response = await fetch(vectorUrl, { redirect: 'error', signal: AbortSignal.timeout(15000) });
      const bytes = new Uint8Array(await response.arrayBuffer());
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
      verifiedVector = response.ok && response.headers.get('content-type')?.startsWith('image/') === true && hash === item.approved_vector_sha256;
    } catch { /* A cover must be available and match the reviewed asset. */ }
  }
  const approvedPrivateCover = article.featured_image_url && c.nexus_visual?.private === true && c.nexus_visual?.generated === false;
  if (!approvedPrivateCover && !verifiedVector) issues.push('approved_cover_missing');
  if (!c.nexus_social_drafts || typeof c.nexus_social_drafts !== 'object') issues.push('social_drafts_missing');
  if (!v || !['factuality', 'utility', 'semantic', 'conversion', 'sector_compliance'].every(k => v.dimensions?.[k] === true) || !Array.isArray(v.unsupported_claims) || v.unsupported_claims.length || !Array.isArray(v.issues) || v.issues.length || typeof v.notes !== 'string' || v.notes.length < 80 || v.provenance !== 'codex_conversation_review') issues.push('trusted_review_incomplete');
  return [...new Set(issues)];
}
