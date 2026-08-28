# Plan: Integration of MAD1470 Campaign Directives and Protocol Updates

The user wants to integrate a new strategic prompt for the **Dr. Madeira 1470** campaign (MAD1470 unit). This involves strict separation from commercial units (RDM Advogados), adherence to electoral rules, and specific technical requirements for SEO/GEO/AEO, including SSR validation, specific Schema.org structures, and image guidelines.

## User Preferences & Strategic Rules
- **Unit Separation:** MAD1470 is a separate unit from ADV. Directives must not mix.
- **Electoral Compliance:** OAB Provimento 205/2021 + 2026 Electoral Rules (CNPJ identification, no prohibited iconography, no outcome promises).
- **GEO/AEO 2026:** Rule of 30 words for the first sentence (lead-answer).
- **Personas:** Dr. Madeira (candidato) and "Wanderson" (target audience).
- **Tone:** Direct, popular, "without varnish" (sem verniz).

## Technical Details

### 1. Behavioral Directives Update
Update `supabase/functions/_shared/behavioral-directives.ts` to include the full content of "BLOCO 00 — PORTÃO ELEITORAL" and other strategic blocks from the uploaded file.

### 2. Edge Function Updates
- **`generate-article`**: Update to strictly follow the MAD1470 architecture (Pillar/Satellite clusters) and the "Regra de Resposta Antecipada" (Answer Engine Optimization).
- **`rewrite-news`**: Ensure rewritten content for the campaign follows the 40/60 rule and electoral constraints.

### 3. Component Updates
- **`src/pages/index.tsx`**: Update the instructional text as requested by the user.
- **`src/pages/ElectoralCampaign.tsx`**: Ensure the UI reflects the 6 axes of the campaign and the "Muralha" (separation) principle.

### 4. Schema & Robots
- Update `supabase/functions/_shared/geo-aeo-2026.ts` to reflect the specific Schema.org Person/WebSite structure defined in the new prompt (removing commercial schemas for this unit).
- Ensure the `robots.txt` directives (Allow all AI bots) are ready for deployment.

### 5. Validation
- Verify the 30-word limit in `src/components/articles/editor/FirstSentencePreview.tsx`.

## Proposed Changes

### Backend (Supabase Functions)
- **`_shared/behavioral-directives.ts`**: Replace/Expand with full MAD1470 prompt content.
- **`_shared/geo-aeo-2026.ts`**: Update dynamic schema generation logic for the electoral unit.
- **`generate-article/index.ts`** & **`rewrite-news/index.ts`**: Inject unit-specific few-shot examples and constraints.

### Frontend
- **`src/pages/index.tsx`**: Apply the visual text edit exactly as requested.
- **`src/pages/Hiperlocal.tsx`**: Add support for the new "Eixos de Campanha" categories.

### Documentation & Memory
- Update `mem://features/campaign-madeira-1470` with the latest directives.

---
**Note:** I will use the uploaded `prompt-mad1470-site-campanha.md` as the primary source of truth for all content generation related to the MAD1470 unit.
