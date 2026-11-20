import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { aiTellScore, findAiTells, humanVoiceBlock, stripQuotedExamples, VOICE_LANGUAGES } from '../../supabase/functions/_shared/human-voice-guide';
import { LIBRARY_DB_NAMES, PROMPT_LIBRARY, renderPromptVariables } from '../../supabase/functions/_shared/prompt-library';
import { parsePromptDirectives } from '../../supabase/functions/_shared/optimization-rules';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
// Instruções para o modelo enumeram coisas à vontade ("documentos, prazos e valores"); a heurística de 'lista de três' e as métricas de ritmo valem para texto de leitor, não para instrução.
const notInstructionNoise = (t: { code: string }) => !/^(lista_de_tres|ritmo|paragrafos|inicio|sem_espec)/.test(t.code);

describe('human-voice-guide: bloco de instruções', () => {
  it('existe em pt, en e es e em outro idioma cai no inglês com a nota de equivalência', () => {
    for (const lang of VOICE_LANGUAGES) expect(humanVoiceBlock(lang)).toMatch(/v1\.0\.0/);
    expect(humanVoiceBlock('fr')).toMatch(/requested language/);
    expect(humanVoiceBlock(undefined)).toMatch(/HUMAN VOICE/);
  });

  it('as instruções (sem os exemplos entre « ») não contêm as marcas que proíbem', () => {
    for (const lang of VOICE_LANGUAGES) {
      for (const mode of ['full', 'compact', 'micro'] as const) {
        const instructions = stripQuotedExamples(humanVoiceBlock(lang, { mode }));
        const tells = findAiTells(instructions, lang).filter(notInstructionNoise);
        expect(tells.map((t) => `${lang}/${mode}:${t.code}:${t.excerpt}`)).toEqual([]);
      }
    }
  });

  it('traz verificabilidade, sem pesquisa própria, atribuição vaga e aviso de segmento', () => {
    const pt = humanVoiceBlock('pt', { segmentNotice: 'publicidade jurídica sem promessa de resultado', brandVoice: 'direta e acolhedora' });
    expect(pt).toMatch(/TODO FATO TEM ORIGEM/);
    expect(pt).toMatch(/SEM PESQUISA PRÓPRIA/);
    expect(pt).toMatch(/ESPECIALISTAS DIZEM/);
    expect(pt).toMatch(/AVISO DO SEGMENTO \(cuidado, não bloqueio\)/);
    expect(pt).toMatch(/VOZ DA MARCA/);
    expect(humanVoiceBlock('pt', { mode: 'micro' }).length).toBeLessThan(250);
  });
});

describe('findAiTells', () => {
  const PT_IA = '<p>No mundo atual, a defesa é cada vez mais importante. Vale destacar que o atendimento é rápido, eficiente e seguro, destacando a importância do tema.</p><p>Segundo especialistas, somos líder de mercado e o melhor escritório da região.</p><p>Em resumo, entre em contato.</p>';
  const PT_HUMANO = '<p>Preso em flagrante em Guarulhos, o primeiro endereço é a Delegacia Seccional. A audiência de custódia sai em até 24 horas, conforme o art. 310 do CPP.</p><p>Leve o RG do preso e o endereço da família ao advogado.</p>';

  it('pega marcas do Estúdio e da Wikipédia e dá nota maior ao texto automático', () => {
    const codes = findAiTells(PT_IA, 'pt').map((t) => t.code);
    expect(codes).toEqual(expect.arrayContaining(['no_mundo_atual', 'vale_destacar', 'fecha_resumo', 'atribuicao_vaga', 'gerundio_importancia', 'elogio_sem_prova']));
    expect(aiTellScore(PT_IA, 'pt')).toBeGreaterThan(aiTellScore(PT_HUMANO, 'pt'));
    expect(findAiTells(PT_HUMANO, 'pt').filter((t) => t.source === 'wikipedia')).toEqual([]);
  });

  it('funciona em inglês e espanhol e não quebra em idioma sem pacote', () => {
    expect(findAiTells('In today\'s world, experts say it is a testament to quality, highlighting the importance of care.', 'en').map((t) => t.code)).toEqual(expect.arrayContaining(['in_todays_world', 'vague_attribution', 'promotional_praise']));
    expect(findAiTells('En el mundo actual, según expertos, cabe destacar la calidad.', 'es').map((t) => t.code)).toEqual(expect.arrayContaining(['en_el_mundo_actual', 'atribucion_vaga', 'cabe_destacar']));
    expect(Array.isArray(findAiTells('Ein kurzer Text.', 'ja'))).toBe(true);
    expect(findAiTells('', 'pt')).toEqual([]);
  });
});

describe('biblioteca de prompts (v5)', () => {
  it('todo prompt de geração tem o bloco de voz humana e nenhum tem persona, cidade ou autor fixos', () => {
    for (const p of PROMPT_LIBRARY) {
      expect(p.prompt, p.name).toMatch(/VOZ HUMANA E VERIFICABILIDADE|Texto fiel ao conteúdo|SÓ O QUE FOI MEDIDO|DIRETOR DE ARTE/);
      expect(p.prompt, p.name).not.toMatch(/Rândalos|Dr\. Madeira|Tatuap|Av\.? Paulista|maps\.google\.com\/\?q=|MADEIRAAA|Madeira Sem Verniz/);
      expect(p.prompt, p.name).not.toMatch(/-01-01/);
    }
    const geradores = PROMPT_LIBRARY.filter((p) => ['article_generator', 'news_rewriter'].includes(p.targetFunction));
    expect(geradores.length).toBeGreaterThanOrEqual(4);
    for (const p of geradores) expect(p.prompt, p.name).toMatch(/TODO FATO TEM ORIGEM|Todo fato \(/);
  });

  it('as instruções dos prompts (sem exemplos entre « ») não induzem as marcas de IA', () => {
    for (const p of PROMPT_LIBRARY) {
      const tells = findAiTells(stripQuotedExamples(p.prompt), 'pt').filter(notInstructionNoise);
      expect(tells.map((t) => `${p.name}:${t.code}:${t.excerpt}`)).toEqual([]);
    }
  });

  it('nenhum prompt aciona sem querer uma regra EXIGIDA no parsePromptDirectives (palavras, Flesch, links, frases, parágrafos)', () => {
    for (const p of PROMPT_LIBRARY) expect(parsePromptDirectives(p.prompt).matched, p.name).toEqual([]);
  });

  it('não impõe número fixo de CTAs, de palavras ou de imagens', () => {
    for (const p of PROMPT_LIBRARY) {
      expect(p.prompt, p.name).not.toMatch(/\b5 CTAs?\b|11 blocos|10 blocos|6 blocos|\b\d{3,5}\s*(?:a|-)\s*\d{3,5} palavras/i);
    }
  });

  it('nomes batem com os modelos do banco e as variáveis são preenchidas', () => {
    expect(LIBRARY_DB_NAMES).toHaveLength(8);
    const out = renderPromptVariables('T: ${title} | ${idioma} | ${language} | ${currentYear} | ${xyz} | ${tone}', { title: 'A ${language}', language: 'pt-BR', currentYear: 2026 });
    expect(out).toBe('T: A ${language} | pt-BR | pt-BR | 2026 | ${xyz} | não informado');
  });
});

describe('migração 20261121100000 e biblioteca dizem o mesmo', () => {
  const sql = read('supabase/migrations/20261121100000_prompts_voz_humana.sql');
  it('traz cada modelo da biblioteca que existe no banco, sem tocar em nada eleitoral', () => {
    for (const name of LIBRARY_DB_NAMES) {
      const p = PROMPT_LIBRARY.find((x) => x.name === name)!;
      expect(sql, name).toContain(p.prompt);
    }
    expect(sql).not.toMatch(/update public\.prompt_templates[\s\S]*electoral_editorial_1470_v1[\s\S]*set\s+prompt/i);
    expect(sql).not.toMatch(/\b(?:drop|truncate)\s+(?:table|function)/i);
  });
  it('tem o reverso em supabase/rollbacks', () => {
    const down = read('supabase/rollbacks/20261121100000_prompts_voz_humana_rollback.sql');
    expect(down).toMatch(/prompt_template_versions/);
    expect(down).toMatch(/version\s*=\s*1/i);
  });
});
