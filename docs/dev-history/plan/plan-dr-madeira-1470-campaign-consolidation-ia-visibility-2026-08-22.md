# Plan - Dr. Madeira 1470 Campaign Consolidation & IA Visibility

The goal is to consolidate the **Dr. Madeira 1470** campaign strategy (Deputado Federal SP 2026) by integrating the provided semantic architecture (90 articles), Schema.org JSON-LD, and robots.txt rules into the platform's generation engine and SEO visibility layer (IndexNow/IA Crawlers).

## User Review Required

> [!IMPORTANT]
> The provided `llms.txt` and `schema-jsonld.md` contain multiple `[VERIFICAR]` placeholders (e.g., Party Name, CNPJ, OAB number, Social Media URLs). These must be updated in the system settings or provided to ensure generated content and metadata are legally compliant.

- **Phase Check:** The system is currently locked to the "Campanha" phase. Do you want to finalize the `[VERIFICAR]` placeholders now via the Settings UI, or should the AI continue to use the `[VERIFICAR]` tag in outputs for manual review?

## Proposed Changes

### 1. Content Engine & Semantic Architecture
- Update `supabase/functions/_shared/behavioral-directives.ts` to include the **90-article cluster architecture** from `00-ARQUITETURA-CLUSTER-90.md`.
- Enforce the "Golden Rule of Interlinking": Articles must link back to the "Pilar de Voto" (Cluster 1) or relevant "Pilares de Pauta".
- Integrate the specific intent layers (Decisão, Problema, Território) into the article generation prompt.
- Seed `hyperlocal_title_templates` with the 90 targeted pautas if they are not already present.

### 2. IA Visibility & SEO
- Update the default `robots.txt` generation logic (or the static file in `public/`) to match the provided `robots.txt`, explicitly allowing IA crawlers (GPTBot, ClaudeBot, etc.) to prevent hallucination.
- Update the dynamic Schema.org builder in `supabase/functions/_shared/geo-aeo-2026.ts` to incorporate the specific `Person` and `WebSite` JSON-LD structures provided in `schema-jsonld.md`.
- Ensure `llms.txt` generation logic reflects the trajectory and axes defined in the uploaded `llms.txt`.

### 3. Campaign Directives
- Refine the "Dr. Madeira 1470" persona in `behavioral-directives.ts` using the six eixos: Fim do score secreto, CNH 16 anos, BNDES, Lei Rouanet periférica, Porte de arma (CNH style), and App work regulation.
- Ensure the `[VERIFICAR]` tag logic is strictly applied to any unverified official data (CNPJ, Process numbers).

### 4. UI Adjustments
- Update `src/pages/index.tsx` (and `src/routes/index.tsx` if it exists as a separate entry) to ensure the instructional text is verbatim as requested.

## Technical Details

- **Data Source:** `user-uploads://` files (`llms.txt`, `robots.txt`, `schema-jsonld.md`, `00-ARQUITETURA-CLUSTER-90.md`).
- **Shared Modules:** `_shared/behavioral-directives.ts`, `_shared/geo-aeo-2026.ts`.
- **Database:** New seeds for `hyperlocal_title_templates` to match the 90-article cluster.
- **IndexNow:** Ensure the `indexnow-notify` function uses the `drmadeira1470.com.br` domain context.
