import { describe, expect, it } from 'vitest';
import { PROFILE_FIELDS, cleanStrategy, profileGaps } from '../../supabase/functions/_shared/nexus-business';

/**
 * CONTRATO DO PERFIL ATUAL (P0 do novo Perfil do Projeto).
 * Estas 36 chaves são as que existem hoje em projects.nexus_strategy dos projetos reais (conferido no banco em 15/11/2026:
 * Blog RDM v4, Elas Tracy v1, Conquista Prime v1, SEO Marketing v1, Grupo RDM Assessoria v1). Nenhuma pode ser renomeada,
 * removida ou ganhar outro significado: as seções novas do Perfil vão para tabelas próprias (ver 03-perfil-do-projeto-plano-de-construcao.md).
 * Se este teste quebrar, alguém mexeu num campo que já guarda dado de cliente.
 */
const CHAVES_EM_PRODUCAO = [
  'audience', 'blog', 'businessName', 'competitors', 'constraints', 'cta', 'entityType', 'facebook', 'hasArticles',
  'instagram', 'journeys', 'kwai', 'language', 'limits', 'linkedin', 'model', 'objections', 'offer', 'otherChannels',
  'pages', 'parent', 'price', 'primaryGoal', 'proof', 'qualification', 'reach', 'regions', 'sector', 'sitemap',
  'sitemapUrl', 'sites', 'ticket', 'tiktok', 'unknown', 'voice', 'youtube',
];

function perfilCompleto(prefixo: string): Record<string, string> {
  return Object.fromEntries(CHAVES_EM_PRODUCAO.map((k) => [k, `${prefixo}:${k}`]));
}

describe('contrato das 36 chaves do perfil atual', () => {
  it('a lista aceita pela função é exatamente a que existe em produção', () => {
    expect(CHAVES_EM_PRODUCAO).toHaveLength(36);
    expect([...PROFILE_FIELDS].sort()).toEqual([...CHAVES_EM_PRODUCAO].sort());
  });

  it('salvar um perfil completo devolve as 36 chaves sem perder nenhuma e sem alterar o conteúdo', () => {
    const entrada = perfilCompleto('Blog RDM');
    const saida = cleanStrategy(entrada);
    expect(Object.keys(saida).sort()).toEqual([...CHAVES_EM_PRODUCAO].sort());
    expect(saida).toEqual(entrada);
  });

  it('é idempotente: limpar de novo não muda nada (abrir e salvar sem editar não altera o perfil)', () => {
    const uma = cleanStrategy(perfilCompleto('Elas Tracy'));
    expect(cleanStrategy(uma)).toEqual(uma);
  });

  it('perfil parcial ou vazio (projetos "pending") vira as 36 chaves com texto vazio', () => {
    for (const vazio of [null, undefined, {}, 'texto', 7, []]) {
      const saida = cleanStrategy(vazio);
      expect(Object.keys(saida)).toHaveLength(36);
      expect(Object.values(saida).every((v) => v === '')).toBe(true);
    }
  });

  it('descarta qualquer chave fora da lista: seções novas NÃO podem morar em nexus_strategy', () => {
    const saida = cleanStrategy({ ...perfilCompleto('x'), cnpj: '00000000000191', financeiro: { lucro: 1 }, schema_profile: {} });
    expect(saida).not.toHaveProperty('cnpj');
    expect(saida).not.toHaveProperty('financeiro');
    expect(saida).not.toHaveProperty('schema_profile');
    expect(Object.keys(saida)).toHaveLength(36);
  });

  it('valores que não são texto viram vazio, texto é aparado e limitado a 4000 caracteres', () => {
    const saida = cleanStrategy({ offer: '  serviço  ', audience: 5, regions: { a: 1 }, voice: 'x'.repeat(5000) });
    expect(saida.offer).toBe('serviço');
    expect(saida.audience).toBe('');
    expect(saida.regions).toBe('');
    expect(saida.voice).toHaveLength(4000);
  });
});

describe('lacunas essenciais do perfil atual', () => {
  it('as 5 lacunas essenciais continuam as mesmas', () => {
    expect(profileGaps({})).toEqual(['sector', 'offer', 'audience', 'regions', 'primaryGoal']);
    expect(profileGaps(perfilCompleto('x'))).toEqual([]);
    expect(profileGaps({ ...perfilCompleto('x'), primaryGoal: 'unknown' })).toEqual(['primaryGoal']);
  });
});
