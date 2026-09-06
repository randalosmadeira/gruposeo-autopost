type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char] || char)); }
function safeUrl(value: unknown) { const raw=text(value); if(!raw)return ""; try { const url=new URL(raw); return ["http:","https:"].includes(url.protocol)?url.toString():""; } catch { return ""; } }

export function distributeProjectCtas(html: string, project: JsonRecord): string {
  if (!html.trim() || html.includes("<!-- zica-cta:")) return html;
  const commercial=record(project.commercial_info), social=record(project.social_links);
  const leadText=text(project.cta_leads)||text(commercial.default_cta_text);
  const leadUrl=safeUrl(commercial.default_cta_url)||safeUrl(project.cta_leads)||safeUrl(commercial.whatsapp);
  const conclusion=text(project.cta_conclusao)||text(commercial.default_cta_text);
  const networks=[
    ["Instagram",project.social_instagram||social.instagram], ["LinkedIn",project.social_linkedin||social.linkedin],
    ["YouTube",project.social_youtube||social.youtube], ["Facebook",project.social_facebook||social.facebook],
    ["TikTok",project.social_tiktok||social.tiktok], ["X",project.social_twitter||social.twitter],
    ["Google Meu Negócio",project.social_google_maps||social.google_maps||commercial.google_maps_url],
  ].map(([label,url])=>[String(label),safeUrl(url)]).filter(([,url])=>Boolean(url));
  const link=(label:string,url:string)=>`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
  const lead=leadText&&leadUrl?`<!-- zica-cta:contact --><aside class="zica-article-cta zica-article-cta-contact"><p><strong>${escapeHtml(leadText)}</strong></p><p>${link("Saiba mais",leadUrl)}</p></aside>`:"";
  const socialBlock=networks.length?`<!-- zica-cta:social --><aside class="zica-article-cta zica-article-cta-social"><p><strong>${escapeHtml(conclusion||"Acompanhe nossos canais oficiais")}</strong></p><p>${networks.map(([label,url])=>link(label,url)).join(" · ")}</p></aside>`:"";
  if(!lead&&!socialBlock)return html;
  const paragraphs=[...html.matchAll(/<\/p>/gi)]; let output=html;
  if(lead&&paragraphs.length){const at=paragraphs[Math.max(0,Math.floor(paragraphs.length/3)-1)].index!+paragraphs[Math.max(0,Math.floor(paragraphs.length/3)-1)][0].length;output=output.slice(0,at)+lead+output.slice(at);} else output+=lead;
  return output+socialBlock;
}
