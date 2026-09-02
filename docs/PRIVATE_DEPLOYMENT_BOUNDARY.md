# Zica.ai private deployment boundary

## Canonical infrastructure

The Zica.ai source and control plane must remain restricted to infrastructure controlled by the repository owner:

1. Private GitHub repository as the source of truth.
2. GitHub Actions only for CI and the dedicated VPS deployment workflow.
3. Supabase project `Autopublic-prod` for database, storage, authentication, Vault and Edge Functions.
4. Dedicated VPS/cPanel infrastructure serving the approved Zica.ai domain/subdomain.
5. Production frontend/orchestrator deployment only through `.github/workflows/zica-ai-vps-deploy.yml`.

## Prohibited deployment and builder channels

The production repository must not contain or reintroduce:

- Lovable integrations, SDKs, taggers, domains or deployment hooks.
- GitHub Pages deployment for the Zica.ai application.
- Generic third-party deployment webhooks.
- `ZICA_AI_DEPLOY_WEBHOOK_URL` or `ZICA_AI_DEPLOY_TOKEN` deployment paths.
- Tracked `.env` or runtime secret files.
- External visual builders with write/deploy authority over the production repository.

## CI enforcement

`scripts/verify-private-deployment-boundaries.mjs` is a fail-closed CI gate. A commit that reintroduces Lovable, GitHub Pages actions or the removed generic deploy webhook variables must fail CI.

## Production destination

The dedicated VPS workflow currently targets `app.zica.posts.zicajuris.com.br` and installs isolated releases under `/opt/zica-ai/` on the controlled server.

## Administrative controls outside the repository

Repository visibility, existing GitHub Pages publication state and third-party GitHub App access are account-level controls. They must remain configured so that:

- the repository is private;
- GitHub Pages is disabled for this repository;
- Lovable has no GitHub App/repository authorization;
- the Lovable-side project is disconnected/archived/deleted if it still exists there.

These account-level controls are complementary to the code-level fail-closed boundary above.
