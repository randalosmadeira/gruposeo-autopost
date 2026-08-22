# Plan: Autopost Upgrade - Electoral Campaign 2026

Implement the "Redator Eleitoral com Motor de Conformidade" upgrade based on the 2026 specifications. This includes automatic campaign phase detection, strict competitor restrictions, specific article length targets, and IndexNow integration.

## User Review Required

> [!IMPORTANT]
> The campaign phase is now automatically set to **"Campanha"** (Official Campaign) as the current date (Aug 22, 2026) is within the election period (Aug 16 - Oct 04).

- **Muralha Principle**: The system will strictly enforce the separation between electoral and commercial content. Mentioning commercial brands or lawyers/offices is prohibited in electoral articles.
- **Competitor Restrictions**: Competitor analysis fields are being removed to prevent legal risks (representation/right of response).
- **persona**: Content will be targeted at "Wanderson" (38yo, app driver, Zona Leste).

## Proposed Changes

### 1. Frontend: Electoral Campaign Dashboard Upgrade
- Update `src/pages/ElectoralCampaign.tsx`:
    - Implement a 5-step guided flow: **1. Candidato -> 2. Cidades -> 3. Redes -> 4. Conteúdo -> 5. Review & Publish**.
    - Automate the **Campaign Phase** selection based on the current date (2026-08-22).
    - Remove the **Competitor Analysis** section.
    - Add **Article Length** selector with targets: Pillar (1500-2200 words), Satellite (900-1400 words), and Territorial (~900 words).
    - Add **IndexNow** notification toggle.
- Delete `src/components/electoral/CompetitorAnalysis.tsx`.

### 2. Backend: Directives and Compliance Engine
- Update `supabase/functions/_shared/behavioral-directives.ts`:
    - Refine the **Wanderson** persona (driver, ZL, tired of the system).
    - Add strict "Regra Ouro" for GEO/AEO (first sentence ≤ 30 words).
- Update `supabase/functions/_shared/electoral-directives.ts`:
    - Harden the `TERMOS_BLOQUEIO` to include specific commercial terms and competitor name prevention.
    - Update the system prompt with the "Muralha" separation rules.
- Update `supabase/functions/generate-electoral-content/index.ts`:
    - Integrate the new persona and length constraints.
    - Add automatic [VERIFICAR] tags for any uncertain data.
    - Enforce mandatory CNPJ and IA labeling.

### 3. Infrastructure: IndexNow Notification
- Update `supabase/functions/indexnow-notify/index.ts`:
    - Ensure it handles the configuration from `indexnow_config` and provides the verification key location.

### 4. Text Maintenance
- Verbatim update of the instructional text in `src/pages/index.tsx`.

## Technical Details

- **Date Logic**: `hoje >= 2026-08-16 && hoje <= 2026-10-04` triggers the "Campanha" phase.
- **Validations**: Deterministic server-side checks for blocked terms before content is saved.
- **Word Counts**:
  - `pillar`: 1500 - 2200 words.
  - `satellite`: 900 - 1400 words.
  - `territorial`: ~900 words.
