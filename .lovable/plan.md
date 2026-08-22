# Plan - Electoral IA Writer & Citation Architecture (MAD1470)

Consolidate the electoral campaign strategy for Dr. Madeira 1470 by integrating the strategic citation architecture, correcting link leaking, and hardening the electoral AI writer directives.

## User Review Required

> [!IMPORTANT]
> - The campaign CNPJ `68.504.175/0001-70` will be used in all electoral content labels.
> - The "Muralha" (Wall) principle is enforced: commercial (ADV) and electoral (MAD1470) units are strictly separated.
> - A human-in-the-loop review process is mandatory for all AI-generated electoral content.

## Proposed Changes

### Backend & AI Directives
- **Update Behavioral Directives:** Integrate "BLOCO 00 — PORTÃO ELEITORAL" and "REGRAS INEGOCIÁVEIS" into `supabase/functions/_shared/behavioral-directives.ts`.
- **Harden `generate-article` and `rewrite-news`:** 
    - Inject the new electoral system prompt when the unit is `MAD1470`.
    - Enforce the 10 rules (no personal advantage, no attacks on third parties, no invented data, etc.).
    - Force JSON output with mandatory `rotulagem_ia` and `verificar` fields.
- **Implement Electoral Citation Validator:** Create a shared validator utility that runs outside the LLM call to block prohibited terms (martelo, balança, promessas de resultado) and ensure OAB/Electoral compliance.

### Technical SEO & Schema
- **Update Dynamic Schema:** Modify `supabase/functions/_shared/geo-aeo-2026.ts` to include the verified `sameAs` entity list (G1, Nexo, Cola Eleitoral, etc.) for the `Person` schema.
- **Implement `/na-imprensa/` Logic:** Ensure article generation for MAD1470 uses internal links to the press page instead of leaking authority through external link blocks.

### Frontend
- **Article Editor Updates:**
    - Update the status indicator to reflect the `[VERIFICAR]` and `[ROTULAGEM PENDENTE]` tags.
    - Add a "Press Citations" selector in settings to manage the `sameAs` entity list.
- **Instructional UI:** Update `src/pages/index.tsx` text as requested.

## Technical Details

- **Muralha Enforcement:** The `validar()` function will use regex to block terms like "advogado", "escritório", "OAB" within the `MAD1470` context.
- **Entity Disambiguation:** `sameAs` array in Schema.org will be hardcoded with the provided high-authority URLs to stabilize the candidate's digital identity for AI crawlers.
- **Output Schema:**
```json
{
  "aprovado": boolean,
  "bloqueios": string[],
  "formato": "legenda|roteiro|carrossel|pagina|resposta|email|release",
  "conteudo": string,
  "rotulagem_ia": "[ROTULAGEM PENDENTE — ...]"
}
```

## Verification Plan

### Automated Tests
- Run `geo-aeo-2026_test.ts` to verify the new Schema.org generation includes the `sameAs` entity list.
- Create a test case for `validar()` to ensure it correctly identifies and blocks "martelo" or "promessa de voto".

### Manual Verification
- Generate an electoral article and verify the presence of the mandatory CNPJ label and IA disclaimer.
- Check the preview of the first sentence to ensure it stays within the 30-word AEO limit.
