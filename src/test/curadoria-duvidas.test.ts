import { describe, expect, it } from 'vitest';
import { MIN_DUVIDAS, countDuvidas, CURADORIA_VERSION, CURATION_MODULES } from '../../supabase/functions/_shared/curadoria-core.ts';

describe('curadoria: regra "tira dúvidas" (regra primordial do dono, 20/11/2026)', () => {
  it('conta subtítulos em forma de pergunta (h2 a h4), ignora marcação interna e subtítulos sem pergunta', () => {
    const html = '<h2>O que é <b>habeas corpus</b>?</h2><p>x</p><h3>Quem pode pedir?</h3><h4>Quanto tempo leva?</h4><h2>Conclusão</h2><h1>Pergunta fora do alcance?</h1>';
    expect(countDuvidas(html).perguntas).toBe(3);
    expect(countDuvidas('').perguntas).toBe(0);
    expect(countDuvidas(null).perguntas).toBe(0);
  });
  it('reconhece a seção de perguntas frequentes (e variações) e o mínimo é 3', () => {
    expect(countDuvidas('<h2>Perguntas frequentes</h2><h3>a?</h3>').temSecaoFaq).toBe(true);
    expect(countDuvidas('<h2>Dúvidas comuns</h2>').temSecaoFaq).toBe(true);
    expect(countDuvidas('<h2>FAQ</h2>').temSecaoFaq).toBe(true);
    expect(countDuvidas('<h2>Conclusão</h2>').temSecaoFaq).toBe(false);
    expect(MIN_DUVIDAS).toBe(3);
  });
  it('a regra entrou na curadoria como módulo bloqueante e as regras subiram de versão', () => {
    expect(CURATION_MODULES).toContain('duvidas');
    expect(CURADORIA_VERSION).toBe(3);
  });
});
