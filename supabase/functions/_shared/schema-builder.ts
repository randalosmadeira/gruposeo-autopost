/**
 * Real schema.org JSON-LD builder — Article/TechArticle, LegalService, Attorney,
 * FAQPage (per-article) and Organization/LegalService (per-site homepage).
 *
 * The WordPress plugin (`zica-posts`) accepts a `json_ld_schemas` array on
 * `create_article` (`class-zica-posts-rest.php`) and stores it verbatim in
 * post-meta `_zica_posts_json_ld`, which `output_schema()`
 * (`class-zica-posts-discovery.php`) prints in `wp_head`. That replacement is
 * all-or-nothing, so every function here returns the COMPLETE schema array
 * for its target, never a partial patch.
 *
 * Everything is built from real `article`/`project` data already loaded by
 * the callers (`publish-to-wordpress/index.ts` and, later, the homepage sync
 * endpoint). Nothing here fabricates a person's name, an OAB number, an
 * address or a FAQ pair — see `hasProfessionalAuthor()` and
 * `extractFaqPairs()` for the guards that keep it that way.
 */
import {
  LEGAL_HIGH_COMPLEXITY_SUBAREAS,
  mapSegmentToSector,
  resolveLegalHighComplexitySubArea,
  type SectorType,
} from "./sector-config.ts";

// ─────────────────────────────────────────────────────────────────────────
// Shared helpers (article + homepage)
// ─────────────────────────────────────────────────────────────────────────

function firstNonEmpty(...values: unknown[]): string | undefined {
  for (const value of values) {
    const str = String(value ?? "").trim();
    if (str) return str;
  }
  return undefined;
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * schema.org recommends a short `headline` (~110 chars) but does not
 * require it. Truncation here is a best-effort, non-blocking courtesy.
 */
function truncateHeadline(title: string, max = 110): string {
  if (title.length <= max) return title;
  return `${title.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

function isoOrNow(value: unknown, fallback: string): string {
  const raw = value ? String(value).trim() : "";
  if (!raw) return fallback;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

/** Site origin used for both article URLs and Organization/LegalService `url`. */
function resolveSiteOrigin(project: Record<string, any>): string | undefined {
  const domain = String(project?.domain || "").trim();
  if (domain) {
    const withProtocol = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
    return withProtocol.replace(/\/+$/, "");
  }
  const wpUrl = String(project?.wordpress_url || "").trim();
  if (wpUrl) return wpUrl.replace(/\/+$/, "");
  return undefined;
}

function resolveArticleUrl(article: Record<string, any>, project: Record<string, any>): string | undefined {
  const published = String(article?.published_url || "").trim();
  if (published) return published;
  const origin = resolveSiteOrigin(project);
  const slug = String(article?.slug || "").trim().replace(/^\/+/, "");
  if (origin && slug) return `${origin}/${slug}`;
  return origin;
}

function resolvePublisherName(project: Record<string, any>): string {
  return firstNonEmpty(project?.empresa_nome, project?.name) || "Zica Posts";
}

// "Redação" is the literal DB default for editorial_identity.author_name
// (see 20260905062252_add_project_brand_context.sql) — a generic byline,
// not a fabricated person. It is a valid Article/TechArticle `author`, but
// NOT enough "professional data" to justify emitting an `Attorney` schema.
const GENERIC_AUTHOR_PLACEHOLDERS = new Set(["redação", "redacao", "equipe editorial", "equipe", "staff", "redator"]);

function rawAuthorName(project: Record<string, any>): string {
  const identity = project?.editorial_identity && typeof project.editorial_identity === "object" ? project.editorial_identity : {};
  return String(identity.author_name || "").trim();
}

function resolveAuthorName(project: Record<string, any>): string {
  return rawAuthorName(project) || resolvePublisherName(project);
}

/** Whether the project has a real professional identity to back an `Attorney` schema. */
function hasProfessionalAuthor(project: Record<string, any>): boolean {
  const authorName = rawAuthorName(project);
  if (!authorName) return false;
  return !GENERIC_AUTHOR_PLACEHOLDERS.has(authorName.toLowerCase());
}

function collectSameAs(project: Record<string, any>): string[] {
  const socialLinks = project?.social_links && typeof project.social_links === "object" ? project.social_links : {};
  const candidates = [
    project?.social_instagram,
    project?.social_youtube,
    project?.social_linkedin,
    project?.social_twitter,
    project?.social_tiktok,
    project?.social_google_maps,
    project?.social_linktree,
    socialLinks.instagram,
    socialLinks.youtube,
    socialLinks.linkedin,
    socialLinks.facebook,
    socialLinks.twitter,
  ];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    if (value && !seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

/**
 * LegalService (+ Attorney when real professional data exists). Shared by
 * `buildArticleJsonLd` (item 2) and `buildHomepageJsonLd` — same rules,
 * built once so the two never drift apart.
 */
function buildLegalServiceAndAttorney(project: Record<string, any>, opts?: { serviceType?: string }): Record<string, unknown>[] {
  const name = resolvePublisherName(project);
  const legalService: Record<string, unknown> = {
    "@type": "LegalService",
    name,
    areaServed: "BR",
  };
  const telephone = firstNonEmpty(project?.empresa_telefone, project?.commercial_info?.phone, project?.empresa_whatsapp, project?.commercial_info?.whatsapp);
  const address = firstNonEmpty(project?.empresa_endereco, project?.commercial_info?.address);
  const url = resolveSiteOrigin(project);
  if (telephone) legalService.telephone = telephone;
  if (address) legalService.address = address;
  if (url) legalService.url = url;
  if (opts?.serviceType) legalService.serviceType = opts.serviceType;

  const schemas: Record<string, unknown>[] = [legalService];
  if (hasProfessionalAuthor(project)) {
    schemas.push({ "@type": "Attorney", name: resolveAuthorName(project) });
  }
  return schemas;
}

// ─────────────────────────────────────────────────────────────────────────
// FAQPage extraction — never fabricates a pair, only reads what the article
// actually wrote following the "Perguntas Frequentes" + <h3>/<p> contract
// (see behavioral-directives.ts GEO_AEO_2026_RULES for the writing rule).
// ─────────────────────────────────────────────────────────────────────────

export function extractFaqPairs(htmlContent: string): Array<{ question: string; answer: string }> {
  const html = String(htmlContent || "");

  const headingRegex = /<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let headingMatch: RegExpExecArray | null;
  let faqHeadingEnd = -1;
  while ((headingMatch = headingRegex.exec(html)) !== null) {
    const text = stripTags(headingMatch[2]);
    if (/perguntas frequentes|faq/i.test(text)) {
      faqHeadingEnd = headingMatch.index + headingMatch[0].length;
      break;
    }
  }
  if (faqHeadingEnd === -1) return [];

  const rest = html.slice(faqHeadingEnd);
  const nextH2 = /<h2\b/i.exec(rest);
  const scope = nextH2 ? rest.slice(0, nextH2.index) : rest;

  const pairRegex = /<h3\b[^>]*>([\s\S]*?)<\/h3>\s*<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  const pairs: Array<{ question: string; answer: string }> = [];
  let pairMatch: RegExpExecArray | null;
  while ((pairMatch = pairRegex.exec(scope)) !== null) {
    const question = stripTags(pairMatch[1]);
    const answer = stripTags(pairMatch[2]);
    if (question && answer) pairs.push({ question, answer });
  }

  // Never emit a FAQPage from a single stray pair — schema.org expects a
  // real FAQ section, and one pair is more likely a formatting accident.
  return pairs.length >= 2 ? pairs : [];
}

// ─────────────────────────────────────────────────────────────────────────
// Per-article schema
// ─────────────────────────────────────────────────────────────────────────

export function buildArticleJsonLd(params: {
  article: Record<string, any>;
  project: Record<string, any>;
  sectorType: SectorType | null;
}): Record<string, unknown>[] {
  const { article, project, sectorType } = params;
  const config = article?.config && typeof article.config === "object" ? article.config : {};
  const isHighComplexity = sectorType === "legal-high-complexity";
  const nowIso = new Date().toISOString();

  const headline = truncateHeadline(String(article?.title || "").trim());
  const description = String(article?.excerpt || "").trim();
  const url = resolveArticleUrl(article, project);
  const image = String(article?.featured_image_url || "").trim();
  const siteOrigin = resolveSiteOrigin(project);

  const baseArticle: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": isHighComplexity ? "TechArticle" : "Article",
    headline,
    datePublished: isoOrNow(article?.published_at, nowIso),
    dateModified: isoOrNow(article?.updated_at, nowIso),
    author: { "@type": "Person", name: resolveAuthorName(project) },
    publisher: {
      "@type": "Organization",
      name: resolvePublisherName(project),
      ...(siteOrigin ? { url: siteOrigin } : {}),
    },
  };
  if (description) baseArticle.description = description;
  if (url) baseArticle.url = url;
  if (image) baseArticle.image = image;

  const schemas: Record<string, unknown>[] = [baseArticle];

  if (sectorType === "legal" || sectorType === "legal-high-complexity") {
    let serviceType: string | undefined;
    if (isHighComplexity) {
      const keyword = String(config.focus_keyword || article?.keyword || "");
      const subArea = resolveLegalHighComplexitySubArea(`${article?.title || ""} ${keyword}`);
      // LEGAL_HIGH_COMPLEXITY_SUBAREAS[subArea].schema (e.g.
      // "LegalService+Attorney+TechArticle+FAQPage+Legislation") is a list of
      // type NAMES to guide which schemas apply here, not a ready-made
      // schema — the actual JSON-LD objects are built by this file. We
      // already emit TechArticle/LegalService/Attorney/FAQPage per that
      // list; the sub-area's human label is used to enrich LegalService.
      if (subArea) serviceType = LEGAL_HIGH_COMPLEXITY_SUBAREAS[subArea].label;
    }
    schemas.push(...buildLegalServiceAndAttorney(project, { serviceType }));
  }

  const faqPairs = extractFaqPairs(String(article?.content || ""));
  if (faqPairs.length > 0) {
    schemas.push({
      "@type": "FAQPage",
      mainEntity: faqPairs.map((pair) => ({
        "@type": "Question",
        name: pair.question,
        acceptedAnswer: { "@type": "Answer", text: pair.answer },
      })),
    });
  }

  return schemas;
}

// ─────────────────────────────────────────────────────────────────────────
// Homepage (sitewide) schema
// ─────────────────────────────────────────────────────────────────────────

export function buildHomepageJsonLd(project: Record<string, any>): Record<string, unknown>[] {
  const url = resolveSiteOrigin(project);
  const telephone = firstNonEmpty(project?.empresa_telefone, project?.commercial_info?.phone, project?.empresa_whatsapp, project?.commercial_info?.whatsapp);
  const address = firstNonEmpty(project?.empresa_endereco, project?.commercial_info?.address);
  const sameAs = collectSameAs(project);

  const organization: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: resolvePublisherName(project),
  };
  if (url) organization.url = url;
  if (telephone) organization.telephone = telephone;
  if (address) organization.address = address;
  if (sameAs.length) organization.sameAs = sameAs;

  const schemas: Record<string, unknown>[] = [organization];

  const sectorType = mapSegmentToSector(String(project?.nicho || ""));
  if (sectorType === "legal" || sectorType === "legal-high-complexity") {
    schemas.push(...buildLegalServiceAndAttorney(project));
  }

  return schemas;
}
