# Plan: 100% Integration of 2026 Electoral Campaign & IndexNow (Dr. Madeira 1470)

I will implement the "100% installation" of the strategic guidelines for the 2026 Electoral Campaign, including the IndexNow protocol and the Dr. Madeira 1470 persona.

## User Review Required

> [!IMPORTANT]
> - **IndexNow Key**: I will generate a default key for `drmadeira1470.com.br`, but you can update it in the settings.
> - **Campaign Phase**: The system will be locked into "Campanha" phase (official propaganda) as requested.
> - **Iconography**: Images will strictly avoid hammers, scales, handcuffs, and shields.

## Proposed Changes

### Backend (Edge Functions)
#### IndexNow Integration
- Create `supabase/functions/indexnow-notify/index.ts` to handle URL submission to IndexNow (Bing/ChatGPT).
- Create `supabase/functions/indexnow-verify/index.ts` to serve the verification `.txt` file required by the protocol.
- Update `generate-article` and `rewrite-news` to automatically trigger IndexNow notification upon successful generation/publication.

#### Strategic Directives & Persona (v5.0 ADV + Dr. Madeira)
- Update `supabase/functions/_shared/behavioral-directives.ts` with:
    - **Persona**: Dr. Madeira, candidate 1470 (Federal Deputy SP).
    - **Target Audience**: "Wanderson" (driver, Zona Leste).
    - **Prohibited Content**: Competitor names, OAB-prohibited iconography (hammers, scales, handcuffs, shields).
    - **Word Count Rules**: Pillars (1500-2200), Satellites (900-1400).
- Update `supabase/functions/_shared/seo-prompt-builder.ts` to incorporate the 2026 GEO/AEO frontloading rules (≤ 30 words first sentence).

### Frontend (React)
#### UI Updates
- **Instructions Page**: Update `src/pages/index.tsx` to the final requested visual text.
- **Electoral Campaign**:
    - Update `src/pages/ElectoralCampaign.tsx` to default to "Campanha" phase and remove the "Comparativo Eleitoral" card as per safety guidelines.
    - Add IndexNow configuration section in `src/pages/SettingsPage.tsx` (Integrations tab).
- **Article Generation**:
    - Integrate word count indicators and AEO compliance checks into the generator UI.

### Database (PostgreSQL)
- Add `indexnow_config` table to store host, key, and notification logs.
- Update `user_settings` to include campaign phase defaults.

## Technical Details
- **IndexNow API**: Calls to `https://api.indexnow.org/indexnow` using POST for batch/single URLs.
- **GEO/AEO 2026**: Strict enforcement of the 40/60 rule (40% cited, 60% original) in the generation prompt.
- **OAB Compliance**: Hard-coded negative prompts for AI image generation to ensure no prohibited symbols are used.
