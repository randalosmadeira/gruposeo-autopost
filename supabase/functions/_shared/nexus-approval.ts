import { normalizeEditorialHtml } from "./editorial-html.ts";
type RecordData = Record<string, unknown>;
export interface EditorialReceipt { version: "1"; hash: string; user_id: string; approved_at: string; review_mode?: "autonomous" | "human"; signature: string }
export async function editorialFingerprint(article: RecordData, project: RecordData): Promise<string> {
  const config = article.config && typeof article.config === "object" ? article.config as RecordData : {};
  const payload = JSON.stringify({
    article: [article.id, article.project_id, article.organization_id, article.title, article.keyword, normalizeEditorialHtml(String(article.content || "")).html, article.excerpt, article.featured_image_url],
    evidence: [config.sourcesContext, config.primary_sources, config.secondary_sources, config.legal_authorities, config.conversionBrief],
    project: [project.id, project.organization_id, project.editorial_identity, project.commercial_info, project.social_links, project.cta_leads, project.cta_conclusao, project.social_instagram, project.social_linkedin, project.social_youtube, project.social_twitter, project.social_tiktok, project.social_google_maps, project.nexus_strategy_version, project.nexus_strategy, project.nexus_profile_status],
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}
async function receiptSignature(receipt: Omit<EditorialReceipt, "signature">, key: string) {
  if (!key) throw new Error("approval_key_unavailable");
  const hmac = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", hmac, new TextEncoder().encode(JSON.stringify([receipt.version, receipt.hash, receipt.user_id, receipt.approved_at, receipt.review_mode])));
  return [...new Uint8Array(signature)].map(b => b.toString(16).padStart(2, "0")).join("");
}
export async function signEditorialReceipt(hash: string, userId: string, key: string, reviewMode: "autonomous" | "human" = "human"): Promise<EditorialReceipt> {
  const receipt = { version: "1" as const, hash, user_id: userId, approved_at: new Date().toISOString(), review_mode: reviewMode };
  return { ...receipt, signature: await receiptSignature(receipt, key) };
}
export async function verifyEditorialReceipt(receipt: unknown, hash: string, key: string): Promise<boolean> {
  if (!receipt || typeof receipt !== "object") return false;
  const r = receipt as EditorialReceipt;
  if (r.version !== "1" || r.hash !== hash || !r.user_id || !r.approved_at || !/^[a-f0-9]{64}$/.test(r.signature || "")) return false;
  const expected = await receiptSignature(r, key);
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ r.signature.charCodeAt(i);
  return mismatch === 0;
}
