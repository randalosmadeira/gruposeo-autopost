# Plan: Update Landing Page Text and Process New Guidelines

Update the landing page text to match the requested verbatim phrasing and integrate the new content directives (IndexNow, Media/IA, Persona, and Campaign Review) into the system.

## Proposed Changes

### 1. Landing Page Text Alignment
#### [src/pages/index.tsx]
- Update the text at line 11 to: `"Leia o arquivo instrucoes.md em anexo e siga as instruções. Analise também os demais arquivos anexados."`
- (Note: The user requested a specific change that matches the current visual state in the prompt's `<selected-elements>`, ensuring the exact phrasing is preserved).

### 2. Campaign Phase Logic (Bloqueante #1)
#### [src/pages/ElectoralCampaign.tsx]
- The uploaded files (`revisao-do-gerador-autopost-4.md`, `spec-lovable-upgrade-3.md`) indicate that today (2026-08-22) is officially campaign season (started 16/08).
- Ensure the phase detection correctly defaults to "Campanha" based on `new Date()`.

### 3. Media & IA Labeling (Guidelines Update)
#### [supabase/functions/_shared/electoral-directives.ts]
- Update the mandatory labeling text (Rule #10) to include the new disclaimer from `midia-e-imagens.md`:
  `"Imagem tratada com auxílio de inteligência artificial: correção de cor; redução de ruído. Nenhum elemento da cena foi criado ou alterado."` (for image generation prompts).

### 4. IndexNow Integration (Guidelines Update)
#### [supabase/functions/indexnow/index.ts] (if exists) or shared config
- Verify the IndexNow notification logic aligns with the instructions in `indexnow-e-visibilidade-ia-4.md` (POST to `api.indexnow.org`).

### 5. Prompt Persona Refinement
#### [supabase/functions/_shared/behavioral-directives.ts]
- Refine the "Wanderson" persona description to emphasize the "taxa de aplicativo, score de crédito, juros" focus mentioned in `prompt-persona-gerador-4.md`.

## Technical Details
- **Muralha Principle**: Ensure no commercial brand names (*RDM Advogados*, etc.) are present in electoral outputs.
- **GEO Rule**: Enforce the ≤ 30 words rule for the first technical sentence.
