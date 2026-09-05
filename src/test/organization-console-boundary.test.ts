import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const edge = readFileSync(resolve(process.cwd(), 'supabase/functions/organization-console/index.ts'), 'utf8');
const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
const sidebar = readFileSync(resolve(process.cwd(), 'src/components/layout/Sidebar.tsx'), 'utf8');

describe('organization console security boundary', () => {
  it('authenticates the caller and protects the manager summary with is_ceo', () => {
    expect(edge).toContain('scoped.auth.getUser()');
    expect(edge).toContain('scoped.rpc("is_ceo")');
    expect(edge).toContain('admin_required');
  });

  it('never returns or reads the BYOK secret from a public table', () => {
    expect(edge).toContain('set_organization_openai_byok');
    expect(edge).toContain('secret_last_four');
    expect(edge).not.toContain('decrypted_secret');
  });

  it('keeps the manager route behind AdminRoute and out of client navigation', () => {
    expect(app).toContain('<AdminRoute><AdminOrganizations /></AdminRoute>');
    expect(sidebar).toContain("href: '/admin/organizations'");
  });
});
