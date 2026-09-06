import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const settings = readFileSync(resolve(process.cwd(), 'src/pages/SettingsPage.tsx'), 'utf8');
const media = readFileSync(resolve(process.cwd(), 'src/components/settings/BrandAssetsCard.tsx'), 'utf8');
const cta = readFileSync(resolve(process.cwd(), 'src/components/settings/ProjectCtaCard.tsx'), 'utf8');
const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260906143000_client_brand_assets_storage.sql'), 'utf8');

describe('client bulk, brand media and CTA controls', () => {
  it('exposes bulk generation from the client integrations area', () => {
    expect(settings).toContain('to="/keywords/bulk"');
    expect(settings).toContain('Abrir gerador em massa');
  });

  it('keeps internal citation entities out of the client integrations block', () => {
    const clientBlock = settings.slice(settings.indexOf("mode === 'integrations'"), settings.indexOf("mode === 'ai' ? <IndexNowConfigCard"));
    expect(clientBlock).not.toContain('<PressCitationsCard />');
  });

  it('keeps exactly six reusable image slots behind explicit approval', () => {
    expect(media).toContain('const SLOT_COUNT = 6');
    expect(media).toContain("status: 'preview_ready'");
    expect(media).toContain("status: 'ready'");
    expect(media).toContain(".eq('status', 'preview_ready')");
  });

  it('uses deterministic WebP chroma processing without paid AI providers', () => {
    expect(media).toContain("'image/webp', 0.86");
    expect(media).toContain('green - Math.max(red, blue)');
    expect(media).not.toContain('supabase.functions.invoke');
    expect(media).not.toContain('generate-image');
  });

  it('exposes project contacts, networks, Google Business and CTA fields', () => {
    for (const field of ['empresa_telefone', 'empresa_whatsapp', 'email', 'social_instagram', 'social_google_maps', 'cta_leads', 'cta_conclusao']) {
      expect(cta).toContain(field);
    }
  });

  it('isolates private media by organization in Storage RLS', () => {
    expect(migration).toContain("'organization-brand-assets'");
    expect(migration).toContain('organization_id::text = (storage.foldername(name))[1]');
    expect(migration).toContain("membership.role in ('owner','admin','editor')");
    expect(migration).toContain("'preview_ready'");
  });
});
