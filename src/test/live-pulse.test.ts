import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { PULSE_INTERVAL_MS, PULSE_INVALIDATES, ageText, changedAreas, queriesToRefresh, type PulseStamps } from '@/lib/live-pulse';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));

const read = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf8');
const stamps = (o: Partial<PulseStamps> = {}): PulseStamps => ({ events: 'e1', projects: 'p1', articles: 'a1', spend: 's1', ...o });

describe('pulso: o que recarregar', () => {
  it('a primeira leitura só serve de base: nada é recarregado', () => {
    expect(changedAreas(null, stamps())).toEqual([]);
  });
  it('só as áreas cujo carimbo mudou entram; carimbo igual ou ausente (null) não conta', () => {
    expect(changedAreas(stamps(), stamps())).toEqual([]);
    expect(changedAreas(stamps(), stamps({ projects: 'p2' }))).toEqual(['projects']);
    expect(changedAreas(stamps(), stamps({ events: 'e2', articles: 'a2' }))).toEqual(['events', 'articles']);
    expect(changedAreas(stamps(), stamps({ spend: null }))).toEqual([]);
    expect(changedAreas(stamps({ events: null }), stamps({ events: 'e9' }))).toEqual(['events']);
  });
  it('as consultas de cada área existem de verdade nos hooks e são recarregadas sem repetição', () => {
    expect(queriesToRefresh([])).toEqual([]);
    const q = queriesToRefresh(['events', 'projects']);
    expect(new Set(q.map((k) => JSON.stringify(k))).size).toBe(q.length);
    expect(q).toContainEqual(['project-center', 'overview']);
    expect(q).toContainEqual(['projects']);
    // chaves usadas pelas telas (se alguém renomear a chave, este teste avisa)
    expect(read('src/hooks/useArticles.tsx')).toContain("queryKey: ['articles'");
    expect(read('src/hooks/useArticlesList.tsx')).toContain("queryKey: ['articles-list'");
    expect(read('src/hooks/useArticlesList.tsx')).toContain("queryKey: ['articles-counts'");
    expect(read('src/hooks/useProjects.tsx')).toContain("queryKey: ['projects'");
    expect(read('src/hooks/useSpendStatus.ts')).toContain("SPEND_STATUS_KEY = 'spend-status'");
    expect(read('src/pages/ProjectCenter.tsx')).toContain("queryKey: ['project-center', 'overview'");
    expect(read('src/components/project-center/ProjectDetailPanel.tsx')).toContain("queryKey: ['project-center', 'detail'");
    expect(read('src/components/project-events/ProjectTimeline.tsx')).toContain("queryKey: ['project-events'");
    expect(Object.keys(PULSE_INVALIDATES).sort()).toEqual(['articles', 'events', 'projects', 'spend']);
  });
  it('intervalo curto, mas não abusivo (a latência real é este intervalo, não milissegundos)', () => {
    expect(PULSE_INTERVAL_MS).toBeGreaterThanOrEqual(5000);
    expect(PULSE_INTERVAL_MS).toBeLessThanOrEqual(15000);
  });
});

describe('pulso: texto de "atualizado há N s"', () => {
  it('formata sem inventar: nunca lido, agora, segundos, minutos, horas', () => {
    expect(ageText(null)).toBe('ainda não lido');
    expect(ageText(undefined)).toBe('ainda não lido');
    expect(ageText(NaN)).toBe('ainda não lido');
    expect(ageText(500)).toBe('agora');
    expect(ageText(8_000)).toBe('há 8 s');
    expect(ageText(125_000)).toBe('há 2 min');
    expect(ageText(7_300_000)).toBe('há 2 h');
    expect(ageText(-5000)).toBe('agora');
  });
});

describe('pulso: ligação nas telas', () => {
  it('o Layout monta a ponte uma vez; o hook só consulta com a aba visível; a Central mostra a faixa e o botão "Conferir agora" que força a leitura ao vivo', () => {
    expect(read('src/components/layout/Layout.tsx')).toContain('<LivePulseBridge />');
    const hook = read('src/hooks/useLivePulse.ts');
    expect(hook).toContain('refetchIntervalInBackground: false');
    expect(hook).toContain('refetchInterval: PULSE_INTERVAL_MS');
    const page = read('src/pages/ProjectCenter.tsx');
    expect(page).toContain('<FreshnessBar');
    expect(page).toContain('forceNext.current = true');
    expect(page).toContain("{ force: true }");
    expect(read('src/components/project-center/FreshnessBar.tsx')).toContain('Conferir agora');
  });
});
