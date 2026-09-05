import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const profileCard = readFileSync('src/components/settings/ProfileIdentityCard.tsx', 'utf8');
const settingsPage = readFileSync('src/pages/SettingsPage.tsx', 'utf8');

describe('editable profile identity', () => {
  it('updates only the authenticated profile display name', () => {
    expect(profileCard).toContain("updateProfile.mutateAsync({ full_name: normalizedName })");
    expect(profileCard).toContain('O e-mail e o nível de acesso não são modificados');
    expect(profileCard).toContain('readOnly');
  });

  it('normalizes and validates the display name', () => {
    expect(profileCard).toContain("displayName.trim().replace(/\\s+/g, ' ')");
    expect(profileCard).toContain('normalizedName.length >= 2');
    expect(profileCard).toContain('MAX_DISPLAY_NAME_LENGTH = 120');
  });

  it('shows the editor only in Minha Conta', () => {
    expect(settingsPage).toContain('<ProfileIdentityCard />');
    expect(settingsPage.indexOf('<ProfileIdentityCard />')).toBeGreaterThan(settingsPage.indexOf("mode === 'account'"));
  });
});
