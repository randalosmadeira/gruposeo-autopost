# Plan: ContentFactory RDM Plugin Upgrade (v3.9.0)

Upgrade the system to version 3.9.0, reflecting the latest semantic, GEO, and electoral compliance architectural changes.

## User Review Required

> [!IMPORTANT]
> This upgrade synchronizes the frontend, backend, and plugin documentation with the "v3.9.0" standards defined in the recent tactical directives (e.g., Muralha principle, Entity Graph, sameAs authority).

- **Plugin Version**: Bumped from 3.8.0 to 3.9.0.
- **Changelog**: Added v3.9.0 entry to the WordPress Plugin page.
- **Visual Text**: Re-verified the landing page instruction text verbatim as requested.

## Proposed Changes

### Versioning & Configuration
#### [src/lib/plugin-version.ts]
- Update `PLUGIN_VERSION` to `'3.9.0'`.
- Update `PLUGIN_LAST_UPDATE` to current timestamp.

#### [supabase/functions/_shared/plugin-version.ts]
- Update `PLUGIN_VERSION` to `"3.9.0"`.
- Update `PLUGIN_RELEASED` to current date.
- (Optional) Add new feature flags if defined in recent instructions.

### Documentation & UI
#### [src/pages/WordPressPlugin.tsx]
- Add a new changelog entry for version 3.9.0 detailing:
    - GEO & Semantic Module (Entity Graph, sameAs).
    - Muralha Principle Integration.
    - TTFB and VPS performance optimizations.

### Landing Page Text
#### [src/pages/index.tsx]
- Ensure the instruction text: "Leia o arquivo instrucoes.md em anexo e siga as instruções contidas nele." is displayed verbatim without hidden separators.

## Technical Details
- Version 3.9.0 introduces the **Entity Graph** for local business and candidate authority.
- Enforces strict **Muralha** (Wall) separation for electoral campaign units.
- Optimizes Deno Edge Functions to handle new semantic schema generation.
