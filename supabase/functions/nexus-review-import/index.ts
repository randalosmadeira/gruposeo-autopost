import '../_shared/nexus-runtime-bootstrap.ts';
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { editorialFingerprint, signEditorialReceipt, verifyEditorialReceipt } from '../_shared/nexus-approval.ts';
import { importedReviewComplianceWarnings, importedReviewIssues, sha256, tokenMatches } from '../_shared/nexus-review-import.ts';
import { resolveComplianceMode } from '../_shared/compliance-mode.ts';
const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': 'https://app.zica.posts.zicajuris.com.br', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const body = await req.json();
    if (!/^[0-9a-f-]{36}$/.test(body.jobId || '') || typeof body.token !== 'string' || body.token.length !== 64 || !['approve', 'inspect'].includes(body.action)) return json({ error: 'invalid_request' }, 400);
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY') || '';
    const admin = createClient(Deno.env.get('SUPABASE_URL') || '', key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: job } = await admin.from('nexus_review_imports').select('*').eq('id', body.jobId).maybeSingle();
    if (!job || !tokenMatches(await sha256(body.token), job.token_sha256) || Date.parse(job.expires_at) <= Date.now()) return json({ error: 'unauthorized' }, 401);
    const { data: project } = await admin.from('projects').select('*').eq('id', job.project_id).eq('user_id', job.user_id).eq('organization_id', job.organization_id).maybeSingle();
    if (!project || project.updated_at !== job.expected_project_updated_at) return json({ error: 'project_changed' }, 409);
    const { data: permission, error: permissionError } = await admin.rpc('check_organization_publication_permission', { p_organization_id: job.organization_id, p_user_id: job.user_id, p_automated: false });
    if (permissionError || permission?.allowed !== true) return json({ error: 'role_forbidden' }, 403);
    if (!Array.isArray(job.manifest) || !job.manifest.length || job.manifest.length > 25) return json({ error: 'manifest_invalid' }, 422);
    const { data: articles, error } = await admin.from('articles').select('*').eq('project_id', job.project_id).eq('user_id', job.user_id).eq('organization_id', job.organization_id).in('id', job.manifest.map((i: any) => i.article_id));
    if (error || articles?.length !== job.manifest.length) return json({ error: 'scope_incomplete' }, 409);
    const complianceMode = await resolveComplianceMode(admin, job.organization_id);
    const results = [];
    for (const item of job.manifest) {
      const article = articles.find((a: any) => a.id === item.article_id)!;
      const hash = await editorialFingerprint(article, project);
      const valid = article.config?.nexus_approval?.review_mode === 'autonomous' && await verifyEditorialReceipt(article.config.nexus_approval, hash, key);
      const issues = await importedReviewIssues(item, article, project, job, valid, complianceMode);
      // Modo aviso: o achado de publicidade não reprova a importação; fica registrado no resultado.
      results.push({ article_id: article.id, hash, valid, issues, compliance_warnings: importedReviewComplianceWarnings(article, project, complianceMode) });
    }
    if (body.action === 'inspect') return json({ results, paid_execution: false, published: false, scheduled: false });
    if (results.some(r => r.issues.length)) return json({ error: 'review_import_rejected', results }, 409);
    if (job.status === 'complete') return json({ success: results.every(r => r.valid), results, idempotent: true, paid_execution: false });
    const { data: claimed } = await admin.from('nexus_review_imports').update({ status: 'processing' }).eq('id', job.id).eq('status', 'pending').select('id').maybeSingle();
    if (!claimed) return json({ error: 'import_already_processing' }, 409);
    for (const result of results) {
      if (result.valid) continue;
      const article = articles.find((a: any) => a.id === result.article_id)!;
      const { data: currentProject } = await admin.from('projects').select('updated_at').eq('id', project.id).single();
      if (currentProject?.updated_at !== project.updated_at) { result.issues.push('project_changed'); break; }
      const receipt = await signEditorialReceipt(result.hash, job.user_id, key, 'autonomous');
      const { data: saved, error: saveError } = await admin.from('articles').update({ config: { ...article.config, nexus_approval_required: true, nexus_approval: receipt, nexus_review_mode: 'autonomous', review_pass: true, nexus_review_import: { job_id: job.id, method: 'codex_conversation_review_import', independent_review: false, paid_execution: false, publication_authorized: false } } }).eq('id', article.id).eq('updated_at', article.updated_at).select('*').maybeSingle();
      result.valid = !saveError && !!saved && await verifyEditorialReceipt(saved.config?.nexus_approval, await editorialFingerprint(saved, project), key);
      if (!result.valid) result.issues.push('article_changed_or_save_failed');
    }
    const success = results.every(r => r.valid && !r.issues.length);
    await admin.from('nexus_review_imports').update({ status: success ? 'complete' : 'failed', results, completed_at: new Date().toISOString() }).eq('id', job.id);
    return json({ success, results, paid_execution: false, published: false, scheduled: false }, success ? 200 : 409);
  } catch { return json({ error: 'review_import_failed' }, 500); }
});
