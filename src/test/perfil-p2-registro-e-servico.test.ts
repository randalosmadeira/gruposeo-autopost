import { describe, expect, it } from 'vitest';
import { PROFILE_FIELDS, cleanStrategy } from '../../supabase/functions/_shared/nexus-business';
import {
  FIELD_BY_KEY, PROFILE_FIELDS_V2, PROFILE_STEPS, isPrivateStore, isVisible, optionList,
} from '../../supabase/functions/_shared/profile-registry';
import {
  applyPatch, buildPatch, dimensionScores, effectiveChanges, emptyStores, isValidCnpj, overallCompleteness, parseMoney,
  profileGapsV2, readValues, stepCompleteness, validateValue,
} from '../../supabase/functions/_shared/profile-model';
import {
  isFailure, isNoop, planModuleDecision, planProfileRestore, planProfileSave, storesOf, type CurrentState, type SavePlan,
} from '../../supabase/functions/_shared/profile-service';

/** Perfil real parecido com os de produção: as 36 chaves preenchidas. */
const perfilAntigo = () => cleanStrategy(Object.fromEntries(PROFILE_FIELDS.map((k) => [k, `antigo:${k}`])));

type Gravacao = Extract<SavePlan, { noop: false }>;
const grava = (p: SavePlan): Gravacao => {
  if (isFailure(p) || isNoop(p)) throw new Error('esperava plano de gravação');
  return p as Gravacao;
};

const estadoVazio = (over: Partial<CurrentState> = {}): CurrentState => ({
  strategy: cleanStrategy({}), strategyVersion: 0, extendedExists: false, extendedVersion: 0, sections: {},
  privateExists: false, privateVersion: 0, finance: {}, goals: {}, ...over,
});

describe('registro único de campos', () => {
  it('chaves únicas, etapas válidas e opções coerentes', () => {
    const keys = PROFILE_FIELDS_V2.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    const steps = new Set(PROFILE_STEPS.map((s) => s.id));
    for (const d of PROFILE_FIELDS_V2) {
      expect(steps.has(d.step), d.key).toBe(true);
      if (d.type === 'single') expect(optionList(d).length, d.key).toBeGreaterThan(1);
      if (d.showIf) expect(FIELD_BY_KEY[d.showIf.key], d.key).toBeTruthy();
      if (d.suggest !== undefined && d.type === 'single') expect(optionList(d).some((o) => o.value === d.suggest), d.key).toBe(true);
      if (d.suggest !== undefined && d.type === 'multi' && !d.allowOther) {
        for (const s of d.suggest as string[]) expect(optionList(d).some((o) => o.value === s), `${d.key}:${s}`).toBe(true);
      }
    }
  });

  it('as 36 chaves antigas continuam existindo, todas no mesmo armazenamento (nexus_strategy)', () => {
    for (const k of PROFILE_FIELDS) {
      const d = FIELD_BY_KEY[k];
      expect(d, k).toBeTruthy();
      expect(d.store, k).toBe('strategy');
    }
    // e nada novo foi para dentro de nexus_strategy
    const novasNaEstrategia = PROFILE_FIELDS_V2.filter((d) => d.store === 'strategy' && !(PROFILE_FIELDS as readonly string[]).includes(d.key));
    expect(novasNaEstrategia).toEqual([]);
  });

  it('financeiro e metas são só dos campos de dinheiro privado e nunca de texto público', () => {
    const privados = PROFILE_FIELDS_V2.filter((d) => isPrivateStore(d.store)).map((d) => d.key).sort();
    expect(privados).toEqual(['anos', 'caixa', 'capital', 'fat', 'func', 'lucro', 'm12', 'm30', 'm6', 'orcamento']);
  });

  it('os campos de venda online só aparecem quando a empresa vende online', () => {
    const pag = FIELD_BY_KEY.pagamento;
    expect(isVisible(pag, { vendeonline: 'Só vendo presencial' })).toBe(false);
    expect(isVisible(pag, { vendeonline: 'Vendo online' })).toBe(true);
    expect(isVisible(pag, {})).toBe(true);
  });

  it('explicações de "Não sei o que é" existem para os termos difíceis, com texto fixo', () => {
    for (const k of ['cnpjstat', 'dominio', 'gbp', 'pixel', 'pagamento', 'crm', 'kanban', 'dif_mkt_pub']) {
      expect(FIELD_BY_KEY[k].gloss?.[1].length, k).toBeGreaterThan(40);
    }
  });
});

describe('validação de valores', () => {
  it('dinheiro no formato brasileiro', () => {
    expect(parseMoney('R$ 12.000,50')).toBe(12000.5);
    expect(parseMoney('12.000')).toBe(12000);
    expect(parseMoney('12000')).toBe(12000);
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('-5')).toBe(5); // sinal descartado: só dígitos contam
    expect(parseMoney('9'.repeat(20))).toBeNull();
  });

  it('CNPJ confere os dígitos verificadores', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11222333000181')).toBe(true);
    expect(isValidCnpj('11222333000182')).toBe(false);
    expect(isValidCnpj('00000000000000')).toBe(false);
    expect(validateValue(FIELD_BY_KEY.cnpj, '12.345.678/0001-00').ok).toBe(false);
    expect(validateValue(FIELD_BY_KEY.cnpj, '')).toEqual({ ok: true, value: null });
  });

  it('seleção só aceita opção da lista; múltipla aceita só itens da lista (exceto idiomas, que aceitam outros)', () => {
    expect(validateValue(FIELD_BY_KEY.fase, 'Crescendo')).toEqual({ ok: true, value: 'Crescendo' });
    expect(validateValue(FIELD_BY_KEY.fase, 'inventada').ok).toBe(false);
    expect(validateValue(FIELD_BY_KEY.tom, ['Acolhedor', 'Direto'])).toEqual({ ok: true, value: ['Acolhedor', 'Direto'] });
    expect(validateValue(FIELD_BY_KEY.tom, ['Acolhedor', 'xxx']).ok).toBe(false);
    expect(validateValue(FIELD_BY_KEY.tom, 'Acolhedor').ok).toBe(false);
    expect(validateValue(FIELD_BY_KEY.language, ['Português', 'Japonês'])).toEqual({ ok: true, value: ['Português', 'Japonês'] });
    expect(validateValue(FIELD_BY_KEY.tom, [])).toEqual({ ok: true, value: null });
  });

  it('texto longo, número inválido, percentual e cor', () => {
    expect(validateValue(FIELD_BY_KEY.offer, 'x'.repeat(4001)).ok).toBe(false);
    expect(validateValue(FIELD_BY_KEY.func, 'muitos').ok).toBe(false);
    expect(validateValue(FIELD_BY_KEY.low_pct, 101).ok).toBe(false);
    expect(validateValue(FIELD_BY_KEY.low_pct, 40)).toEqual({ ok: true, value: 40 });
    expect(validateValue(FIELD_BY_KEY.c1, '#1A2B3C')).toEqual({ ok: true, value: '#1a2b3c' });
    expect(validateValue(FIELD_BY_KEY.c1, 'vermelho').ok).toBe(false);
  });
});

describe('leitura e fusão sem perder dados', () => {
  it('um perfil antigo com as 36 chaves abre inteiro na tela nova (nada vira "vazio")', () => {
    const values = readValues({ ...emptyStores(), strategy: perfilAntigo() });
    for (const k of PROFILE_FIELDS) {
      if (k === 'model') continue; // `model` é derivado de "Tipo de cliente" e aparece nele
      expect(values[k], k).toBeDefined();
    }
  });

  it('abrir e salvar sem editar nada não muda nada (nenhuma versão nova)', () => {
    const current = estadoVazio({ strategy: perfilAntigo(), strategyVersion: 4, extendedExists: true, extendedVersion: 2 });
    const plan = planProfileSave({ role: 'owner', current, changes: {}, expected: { strategy: 4, extended: 2, private: 0 } });
    expect(plan).toEqual({ ok: true, noop: true, changed: [] });
    // mandar de volta exatamente o que já existe também é "sem mudança"
    const again = planProfileSave({ role: 'owner', current, changes: { offer: 'antigo:offer', sector: 'antigo:sector' }, expected: { strategy: 4, extended: 2, private: 0 } });
    expect(again).toEqual({ ok: true, noop: true, changed: [] });
  });

  it('alterar um campo preserva todos os outros, inclusive chaves de outras seções', () => {
    const base = { ...emptyStores(), strategy: perfilAntigo(), sections: { negocio: { seg: 'Advocacia', fase: 'Crescendo' }, marca: { fontes: 'Inter' } }, finance: { fat: 50000 } };
    const { patch } = buildPatch({ fase: 'Reestruturando' }, true, base);
    const next = applyPatch(base, patch);
    expect(next.sections.negocio).toEqual({ seg: 'Advocacia', fase: 'Reestruturando' });
    expect(next.sections.marca).toEqual({ fontes: 'Inter' });
    expect(next.strategy).toEqual(base.strategy);
    expect(next.finance).toEqual({ fat: 50000 });
    expect(base.sections.negocio.fase).toBe('Crescendo'); // não altera o argumento
  });

  it('limpar um campo (null) apaga só ele', () => {
    const base = { ...emptyStores(), sections: { negocio: { seg: 'Advocacia', fase: 'Crescendo' } } };
    const { patch } = buildPatch({ fase: null }, true, base);
    expect(applyPatch(base, patch).sections.negocio).toEqual({ seg: 'Advocacia' });
    const s = { ...emptyStores(), strategy: cleanStrategy({ offer: 'x', sector: 'y' }) };
    const r = buildPatch({ offer: '' }, true, s);
    expect(applyPatch(s, r.patch).strategy).toMatchObject({ offer: '', sector: 'y' });
  });

  it('chave que não existe no registro é descartada e informada; texto de seleção múltipla vira lista', () => {
    const r = buildPatch({ financeiro: 1, schema_profile: {}, tom: ['Direto'] }, true, emptyStores());
    expect(r.ignored.sort()).toEqual(['financeiro', 'schema_profile']);
    expect(r.patch.sections.publico).toEqual({ tom: ['Direto'] });
  });

  it('"Tipo de cliente" mantém o campo antigo `model` coerente', () => {
    const cur = emptyStores();
    expect(buildPatch({ tipo: ['B2C', 'B2B'] }, true, cur).patch.strategy.model).toBe('mixed');
    expect(buildPatch({ tipo: ['B2B'] }, true, cur).patch.strategy.model).toBe('B2B');
    expect(buildPatch({ tipo: ['B2G'] }, true, cur).patch.strategy).not.toHaveProperty('model');
    // projeto antigo só com `model` abre com o tipo equivalente
    expect(readValues({ ...cur, strategy: cleanStrategy({ model: 'B2C' }) }).tipo).toEqual(['B2C']);
  });

  it('as três partes da receita não passam de 100%', () => {
    const r = buildPatch({ low_pct: 60, high_pct: 30, giro_pct: 20 }, true, emptyStores());
    expect(Object.keys(r.errors).sort()).toEqual(['giro_pct', 'high_pct', 'low_pct']);
    expect(Object.keys(buildPatch({ low_pct: 50, high_pct: 30, giro_pct: 20 }, true, emptyStores()).errors)).toEqual([]);
  });

  it('financeiro: recusado sem papel de dono ou administrador', () => {
    const r = buildPatch({ fat: 1000, offer: 'x' }, false, emptyStores());
    expect(r.errors).toEqual({ fat: 'private_not_allowed' });
  });

  it('mudança efetiva ignora o que já estava igual', () => {
    const base = { ...emptyStores(), sections: { negocio: { fase: 'Crescendo' } } };
    const { patch } = buildPatch({ fase: 'Crescendo', seg: 'Advocacia' }, true, base);
    expect(effectiveChanges(base, patch)).toEqual(['seg']);
  });
});

describe('plano de gravação (papel, versão, o que grava)', () => {
  const quem = (role: string | null, current = estadoVazio(), changes: unknown = { fase: 'Crescendo' }, expected: unknown = { strategy: 0, extended: 0, private: 0 }) => planProfileSave({ role, current, changes, expected });

  it('só dono, administrador e editor gravam; visualizador, sem papel e papel desconhecido não', () => {
    for (const r of ['owner', 'admin', 'editor']) expect(quem(r).ok, r).toBe(true);
    for (const r of ['viewer', 'campaign_manager', 'qualquer', null]) expect(quem(r)).toMatchObject({ ok: false, status: 403 });
  });

  it('só dono e administrador gravam financeiro e metas', () => {
    expect(quem('editor', estadoVazio(), { fat: 1000 })).toMatchObject({ ok: false, status: 422, fields: { fat: 'private_not_allowed' } });
    const plan = quem('admin', estadoVazio(), { fat: 1000, m30: 5000 });
    expect(plan).toMatchObject({ ok: true, private: { insert: true, nextVersion: 1, finance: { fat: 1000 }, goals: { m30: 5000 } } });
  });

  it('primeira gravação cria o perfil estendido na versão 1 e uma versão guardada sem financeiro', () => {
    const plan = grava(quem('owner', estadoVazio(), { fase: 'Crescendo', fat: 1000 }));
    expect(plan.extended).toMatchObject({ insert: true, nextVersion: 1 });
    expect(plan.snapshot.version).toBe(1);
    expect(JSON.stringify(plan.snapshot)).not.toContain('1000');
    expect(plan.strategy).toBeNull(); // só mudou seção: a estratégia antiga nem é tocada
  });

  it('mudar campo da estratégia antiga grava a estratégia com a versão esperada', () => {
    const current = estadoVazio({ strategy: perfilAntigo(), strategyVersion: 4, extendedExists: true, extendedVersion: 2 });
    const plan = grava(quem('editor', current, { offer: 'Nova oferta' }, { strategy: 4, extended: 2, private: 0 }));
    expect(plan.strategy).toMatchObject({ expectedVersion: 4 });
    expect(plan.strategy!.data.offer).toBe('Nova oferta');
    expect(plan.strategy!.data.sector).toBe('antigo:sector');
    expect(plan.extended).toMatchObject({ insert: false, expectedVersion: 2, nextVersion: 3 });
    expect(plan.private).toBeNull();
  });

  it('versão desatualizada vira conflito e diz qual parte mudou (nada é gravado)', () => {
    const current = estadoVazio({ strategy: perfilAntigo(), strategyVersion: 5, extendedExists: true, extendedVersion: 2 });
    const plan = quem('owner', current, { offer: 'x' }, { strategy: 4, extended: 2, private: 0 });
    expect(plan).toMatchObject({ ok: false, status: 409, error: 'profile_changed_reload', stores: ['strategy'] });
    expect(quem('owner', current, { offer: 'x' }, { strategy: 5, extended: 1, private: 0 })).toMatchObject({ ok: false, status: 409, stores: ['extended'] });
    expect(quem('owner', current, { offer: 'x' }, undefined)).toMatchObject({ ok: false, status: 409 });
    expect(quem('owner', current, { offer: 'x' }, { strategy: '5', extended: 2 })).toMatchObject({ ok: false, status: 409 });
  });

  it('erro de validação devolve o campo e não grava nada', () => {
    expect(quem('owner', estadoVazio(), { cnpj: '123', fase: 'Crescendo' })).toMatchObject({ ok: false, status: 422, fields: { cnpj: 'invalid_cnpj' } });
  });

  it('a versão guardada não registra nem os NOMES dos campos privados que mudaram', () => {
    const plan = grava(quem('owner', estadoVazio(), { fase: 'Crescendo', fat: 1000, m30: 5 }));
    expect(plan.changed.sort()).toEqual(['fase', 'fat', 'm30']);
    expect((plan.snapshot.snapshot as { changed: string[] }).changed).toEqual(['fase']);
    expect(JSON.stringify(plan.snapshot)).not.toMatch(/fat|m30|1000/);
  });

  it('completude guardada não depende do financeiro', () => {
    const a = grava(quem('owner', estadoVazio(), { fase: 'Crescendo', fat: 1000 }));
    const b = grava(quem('owner', estadoVazio(), { fase: 'Crescendo' }));
    expect(a.extended.completeness).toBe(b.extended.completeness);
  });

  it('restaurar versão regrava os campos não privados como nova versão e não toca no financeiro', () => {
    const antigo = { strategy: cleanStrategy({ offer: 'Oferta de antes' }), sections: { negocio: { fase: 'Começando' } } };
    const current = estadoVazio({ strategy: cleanStrategy({ offer: 'Oferta de agora' }), strategyVersion: 3, extendedExists: true, extendedVersion: 5, sections: { negocio: { fase: 'Crescendo' } }, privateExists: true, privateVersion: 2, finance: { fat: 99 } });
    const plan = grava(planProfileRestore({ role: 'owner', current, snapshot: antigo, version: 2, expected: { strategy: 3, extended: 5, private: 2 } }));
    expect(plan.strategy!.data.offer).toBe('Oferta de antes');
    expect(plan.extended.sections.negocio).toEqual({ fase: 'Começando' });
    expect(plan.extended.nextVersion).toBe(6);
    expect(plan.private).toBeNull();
    expect(plan.snapshot.reason).toBe('Restaurado da versão 2');
    // visualizador não restaura
    expect(planProfileRestore({ role: 'viewer', current, snapshot: antigo, version: 2, expected: { strategy: 3, extended: 5, private: 2 } })).toMatchObject({ ok: false, status: 403 });
  });
});

describe('módulos', () => {
  const catalog = [{ code: 'articles', core: false }, { code: 'dashboard', core: true }];
  it('dono e administrador decidem; módulo nuclear nunca desliga; módulo desconhecido é recusado', () => {
    expect(planModuleDecision({ role: 'owner', catalog, moduleCode: 'articles', enabled: false, reason: ' sem uso ' })).toEqual({ ok: true, row: { module_code: 'articles', enabled: false, reason: 'sem uso' } });
    expect(planModuleDecision({ role: 'editor', catalog, moduleCode: 'articles', enabled: false, reason: '' })).toMatchObject({ ok: false, status: 403 });
    expect(planModuleDecision({ role: 'admin', catalog, moduleCode: 'dashboard', enabled: false, reason: '' })).toMatchObject({ ok: false, error: 'core_module_cannot_be_disabled' });
    expect(planModuleDecision({ role: 'admin', catalog, moduleCode: 'dashboard', enabled: true, reason: '' }).ok).toBe(true);
    expect(planModuleDecision({ role: 'admin', catalog, moduleCode: 'nao_existe', enabled: true, reason: '' })).toMatchObject({ ok: false, error: 'module_unknown' });
    expect(planModuleDecision({ role: 'admin', catalog, moduleCode: 'articles', enabled: 'sim', reason: '' })).toMatchObject({ ok: false, error: 'enabled_required' });
  });
});

describe('completude, maturidade e lacunas (só das respostas)', () => {
  it('sem resposta nenhuma aparece "sem dados" (null), nunca número inventado', () => {
    for (const d of dimensionScores({})) expect(d.score, d.name).toBeNull();
    expect(overallCompleteness({})).toBe(0);
    expect(profileGapsV2({})).toEqual([]);
  });

  it('pontua e lista lacunas a partir do que foi respondido', () => {
    const v = readValues({ ...emptyStores(), sections: { negocio: { cnpjstat: 'Ainda não tenho CNPJ' }, presenca: { dominio: 'Tenho e está no meu nome', gbp: 'Não sei o que é' } } });
    const scores = Object.fromEntries(dimensionScores(v).map((d) => [d.name, d.score]));
    expect(scores['Fundamentos legais']).toBe(0);
    expect(scores['Presença']).toBe(50);
    const gaps = profileGapsV2(v).map((g) => g.item);
    expect(gaps).toContain('Abrir a empresa (CNPJ)');
    expect(gaps).toContain('Perfil no Google Meu Negócio');
    expect(gaps).not.toContain('Domínio no seu nome');
  });

  it('quem só vende presencial não recebe lacuna de pagamento online', () => {
    const v = readValues({ ...emptyStores(), sections: { vendas: { vendeonline: 'Só vendo presencial', pagamento: 'Não sei o que é' } } });
    expect(profileGapsV2(v).map((g) => g.item)).not.toContain('Gateway de pagamento');
    expect(dimensionScores(v).map((d) => d.name)).not.toContain('Vendas online');
  });

  it('a completude por etapa ignora campos privados para quem não os vê e campos ocultos pela condição', () => {
    const v = readValues({ ...emptyStores(), finance: { fat: 10 }, sections: { vendas: { vendeonline: 'Só vendo presencial' } } });
    expect(stepCompleteness('negocio', v, true)).toBeGreaterThan(stepCompleteness('negocio', v, false) ?? 0);
    const vendas = stepCompleteness('vendas', v, false);
    expect(vendas).toBeGreaterThan(0);
  });

  it('storesOf normaliza o estado do banco (seções inválidas viram objeto vazio)', () => {
    const s = storesOf(estadoVazio({ sections: 'lixo' as unknown as Record<string, Record<string, unknown>> }));
    expect(s.sections).toEqual({});
  });
});
