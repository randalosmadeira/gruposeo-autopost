# Plan - Wipe and Clean All Prompt Templates

The objective is to remove all current prompt templates and clean the system as requested in `instrucoes.md`. This involves clearing the `public.prompt_templates` table in the database and removing hardcoded prompt files or sections that are no longer needed, ensuring a "100% clean" state for the prompt module.

## User Review Required

> [!IMPORTANT]
> This action is destructive and will remove all custom and default prompt templates stored in the database. 

- Should I only clear the `public.prompt_templates` table, or should I also remove the hardcoded fallback prompts in the edge functions (like `JOURNALISTIC_SYSTEM_PROMPT` in `rewrite-news`)?
- Are there specific "types of articles" (Modelos de Prompt) that should be preserved, or is the "wipe all" instruction absolute?

## Proposed Changes

### Database (Supabase)
- Create a migration to `TRUNCATE` the `public.prompt_templates` and `public.hyperlocal_title_templates` tables (since titles were also part of the recent prompt work).
- Ensure RLS policies remain intact but the data is wiped.

### Edge Functions
- **rewrite-news**: Remove `JOURNALISTIC_SYSTEM_PROMPT` and `MADEIRA_NELES_SYSTEM_PROMPT` if they are considered "modelos de prompt" to be cleaned.
- **generate-article**: Clean up hardcoded templates and fallback prompts.
- **_shared**: Review `behavioral-directives.ts` and `verniz-orchestrator.ts` to see if the user considers these "prompts" to be wiped (they are more like behavioral rules, but often contain prompt logic).
- **generate-landing-page**: Remove the hardcoded `buildSystemPrompt` logic if it falls under the "wipe" request.

### Frontend
- Update `Hiperlocal.tsx` and other pages to handle the empty state of templates gracefully.
- Remove any hardcoded "seed" templates in the UI (like `DEFAULT_TEMPLATES` in `Hiperlocal.tsx`).

## Technical Details
- SQL command: `TRUNCATE TABLE public.prompt_templates CASCADE;`
- Verification: Run a query to ensure count is 0.
- Code cleanup: Manual removal of string constants containing large prompts.

