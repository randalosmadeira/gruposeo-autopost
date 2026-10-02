import { describe, expect, it } from 'vitest';
import {
  evaluateTitleQuality,
  findComplianceViolations,
  repairSolicitationCtas,
} from '../../supabase/functions/_shared/publication-quality';
import {
  VERNIZ_DNA_MATRIX,
  buildVernizDNASection,
  detectarAngulo,
  detectarGatilho,
  detectarNicho,
} from '../../supabase/functions/_shared/verniz-orchestrator';
import { describeGateIssues, withGateIssues } from '../lib/publish-gate-issues';

// Origem: publicação em massa de 2026-10-02 no Blog RDM Advogados. De 332 artigos prontos, 44 eram
// bloqueados pelo portão de publicidade; 38 por "Fale agora com um especialista", frase que o próprio
// prompt do redator mandava escrever. Os trechos abaixo são os formatos reais encontrados no banco.

const codes = (content: string, title = 'Como funciona o INSS em Osasco') =>
  findComplianceViolations({ title, content }).map((issue) => issue.code);

function inlineBalance(html: string) {
  const stack: string[] = [];
  const re = /<(\/?)(a|strong|em|b|i|u|span|mark|small)\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const name = match[2].toLowerCase();
    if (!match[1]) stack.push(name);
    else if (stack.pop() !== name) return false;
  }
  return stack.length === 0;
}

describe('reparo de captação direta antes do portão', () => {
  it('troca o link isolado em blockquote e mantém o endereço do WhatsApp', () => {
    const html = '<p>Você corre risco de perder tempo ou até seus direitos.</p>\n<blockquote>\n<p><a href="https://wa.me/5511951730074" target="_blank" rel="noopener noreferrer">Fale agora com um especialista</a></p>\n</blockquote>\n<section>\n<h2>Por que a agência é importante?</h2>';
    const result = repairSolicitationCtas(html);
    expect(result.repaired).toBe(true);
    expect(result.content).toContain('<p><a href="https://wa.me/5511951730074" target="_blank" rel="noopener noreferrer">Converse com a nossa equipe pelo WhatsApp</a></p>');
    expect(result.content).toContain('<h2>Por que a agência é importante?</h2>');
    expect(result.content).toContain('perder tempo ou até seus direitos.</p>');
    expect(codes(result.content)).not.toContain('captacao_direta');
    expect(inlineBalance(result.content)).toBe(true);
  });

  it('preserva a pergunta anterior e remove o resto da oração da chamada', () => {
    const html = '<blockquote><p>Precisa de orientação imediata para um caso envolvendo a Penitenciária Feminina de Santana? <a href="https://wa.me/5511951730074" target="_blank" rel="noopener noreferrer">Fale agora com um especialista pelo WhatsApp</a> da RDM Advogados Associados.\n  </p>\n</blockquote>';
    const result = repairSolicitationCtas(html);
    expect(result.content).toContain('Penitenciária Feminina de Santana? <a href="https://wa.me/5511951730074"');
    expect(result.content).toContain('>Converse com a nossa equipe pelo WhatsApp</a>.');
    expect(result.content).not.toMatch(/fale agora/i);
    expect(result.content).not.toContain('da RDM Advogados Associados');
    expect(inlineBalance(result.content)).toBe(true);
  });

  it('trata link com negrito e exclamação sem deixar marcação aberta', () => {
    const html = '<blockquote><a href="https://wa.me/5511951730074" target="_blank" rel="noopener noreferrer"><strong>Fale agora com um especialista e tire suas dúvidas sobre o INSS Guarulhos!</strong></a></blockquote>';
    const result = repairSolicitationCtas(html);
    expect(result.content).toBe('<blockquote><a href="https://wa.me/5511951730074" target="_blank" rel="noopener noreferrer">Converse com a nossa equipe pelo WhatsApp</a>.</blockquote>');
  });

  it('remove a cauda de medo e urgência que vinha na mesma oração', () => {
    const cases = [
      '<p>Fale agora com um especialista da RDM Advogados pelo WhatsApp e não fique no prejuízo.</p>',
      '<p>Fale agora com um especialista que resolve seu caso sem enrolação</p>',
      '<p><strong>Fale agora com um especialista</strong> para não perder tempo — o relógio está contra você.</p>',
      '<p>Fale agora com um advogado e evite erros que podem custar caro.</p>',
    ];
    for (const html of cases) {
      const result = repairSolicitationCtas(html);
      expect(result.repaired).toBe(true);
      expect(result.content).toMatch(/Converse com a nossa equipe/);
      expect(result.content).not.toMatch(/preju[ií]zo|enrola[cç][aã]o|rel[oó]gio|custar caro|fale agora/i);
      expect(findComplianceViolations({ title: 'INSS em Campinas', content: result.content })).toHaveLength(0);
      expect(inlineBalance(result.content)).toBe(true);
    }
  });

  it('devolve o fechamento de uma marcação aberta antes do trecho', () => {
    const html = '<p><strong>Emergência ou dúvida grave? Fale agora com um especialista</strong> da RDM Advogados. Pergunte antes de agir.</p>';
    const result = repairSolicitationCtas(html);
    expect(result.content).toBe('<p><strong>Emergência ou dúvida grave? </strong>Converse com a nossa equipe para tirar dúvidas sobre a sua situação. Pergunte antes de agir.</p>');
    expect(inlineBalance(result.content)).toBe(true);
  });

  it('repara conteúdo em markdown sem atravessar título nem parágrafo vizinho', () => {
    const markdown = '## O que fazer primeiro\nFale agora com um advogado pelo WhatsApp do [RDM Advogados](https://wa.me/5511951730074).\n\nO prazo de resposta do banco é de dez dias.';
    const result = repairSolicitationCtas(markdown);
    expect(result.content).toBe('## O que fazer primeiro\n[Converse com a nossa equipe pelo WhatsApp](https://wa.me/5511951730074).\n\nO prazo de resposta do banco é de dez dias.');
  });

  it('descarta link do Google Maps usado como contato', () => {
    const result = repairSolicitationCtas('<p>Ligue agora para o <a href="https://www.google.com/maps/place/x">escritório</a>.</p>');
    expect(result.content).toBe('<p>Converse com a nossa equipe para tirar dúvidas sobre a sua situação.</p>');
  });

  it('não mexe em atributo, em texto sem gatilho, nem em entrada vazia', () => {
    const attribute = '<p><img src="a.webp" alt="Fale agora com a equipe" /> Entenda as etapas do pedido.</p>';
    expect(repairSolicitationCtas(attribute)).toMatchObject({ content: attribute, repaired: false });
    const clean = '<p>Atuação em audiência de custódia. Entenda as etapas e os prazos.</p>';
    expect(repairSolicitationCtas(clean)).toMatchObject({ content: clean, repaired: false, repairs: 0 });
    expect(repairSolicitationCtas(null)).toMatchObject({ content: '', repaired: false });
  });

  it('troca só o gatilho quando a oração não termina dentro do limite', () => {
    const tail = ' e veja como funciona cada etapa do processo administrativo'.repeat(10);
    const result = repairSolicitationCtas(`<p>Fale agora com um especialista${tail}</p>`);
    expect(result.content.startsWith('<p>Converse com um especialista e veja como funciona')).toBe(true);
    expect(codes(result.content)).not.toContain('captacao_direta');
  });

  it('repara todas as ocorrências do artigo', () => {
    const html = '<p><a href="https://wa.me/5511951730074">Fale agora com um especialista</a></p><h2>Prazos</h2><p>O prazo é de dez dias.</p><p>Dúvidas? Entre em contato agora pelo telefone.</p>';
    const result = repairSolicitationCtas(html);
    expect(result.repairs).toBe(2);
    expect(findComplianceViolations({ title: 'Prazos do INSS em Osasco', content: result.content })).toHaveLength(0);
  });
});

describe('portão de promessa de resultado não reprova a negação nem a análise do tema', () => {
  const allowed = [
    '<p>Responder em liberdade não é sinônimo de absolvição nem de sucesso garantido no processo.</p>',
    '<p>O Conar adverte para o risco de anúncios que possam sugerir garantia de resultado ou criar expectativa ilusória.</p>',
    '<p>As clínicas não podem prometer resultado garantido aos seus clientes.</p>',
    '<table><tr><td>Cláusula de garantia de resultado</td><td>Deve ser clara quanto às limitações</td></tr></table>',
    '<p>A presença do advogado garante resultado favorável? Não há garantia de resultado, mas assegura que os direitos sejam protegidos.</p>',
  ];
  it.each(allowed)('aprova: %s', (content) => {
    expect(codes(content, 'Quando procurar advogado para depoimento em inquérito')).not.toContain('promessa_resultado');
  });

  const blocked = [
    '<p>Garantimos a absolvição do seu familiar.</p>',
    '<p>Com a nossa equipe o resultado garantido chega em poucos dias.</p>',
    '<p>Não se preocupe: garantimos o resultado.</p>',
    '<p>Você não precisa esperar. Aqui o sucesso garantido é a regra.</p>',
    '<p>Sem burocracia e sem demora — vitória garantida para o seu caso.</p>',
  ];
  it.each(blocked)('reprova: %s', (content) => {
    expect(codes(content, 'Defesa criminal em São Paulo')).toContain('promessa_resultado');
  });
});

describe('portão de título truncado com palavra acentuada no fim', () => {
  const whole = [
    'O que fazer em caso de acusação de receptação',
    'O que fazer em caso de aposentadoria por tempo de contribuição',
    'Documentos necessários para processos éticos de profissionais da saúde',
    'Como funciona sanção administrativa em licitação',
    'Quando procurar advogado para CNH provisória e infração',
    'Apartamento com infiltração',
    'Revisão de pensão por morte: quem tem direito à pensão',
  ];
  it.each(whole)('aprova título completo: %s', (title) => {
    expect(evaluateTitleQuality(title).issues.map((issue) => issue.code)).not.toContain('title_truncated');
  });

  const cut = [
    'STF discute julgamento simultâneo dos casos dos ministros Alexandre de',
    'Como pedir a revisão da aposentadoria por invalidez no',
    'Direitos do consumidor em caso de cobrança indevida e a',
    'Quem tem direito à',
  ];
  it.each(cut)('reprova título cortado: %s', (title) => {
    expect(evaluateTitleQuality(title).issues.map((issue) => issue.code)).toContain('title_truncated');
  });
});

describe('link do convite reparado', () => {
  it('usa o WhatsApp do projeto quando a chamada apontava para a própria página', () => {
    const html = '<blockquote><a href="https://rdmadvogados.com.br/blog/delegacias-de-guarulhos/">Fale agora com um especialista</a> do RDM Advogados Associados e tire suas dúvidas jurídicas sem compromisso.</blockquote>';
    expect(repairSolicitationCtas(html, '+55 (11) 95173-0074').content)
      .toBe('<blockquote><a href="https://wa.me/5511951730074" target="_blank" rel="noopener noreferrer">Converse com a nossa equipe pelo WhatsApp</a>.</blockquote>');
    expect(repairSolicitationCtas(html).content)
      .toBe('<blockquote><a href="https://rdmadvogados.com.br/blog/delegacias-de-guarulhos/" target="_blank" rel="noopener noreferrer">Converse com a nossa equipe</a>.</blockquote>');
  });

  it('prefere o canal de contato que já estava na chamada e mantém o link do artigo que vinha antes', () => {
    const html = '<p>Veja o <a href="https://rdmadvogados.com.br/blog/prazos/">guia de prazos</a> e <a href="https://api.whatsapp.com/send?phone=5511951730074">fale agora com um especialista</a>.</p>';
    expect(repairSolicitationCtas(html, '5511999990000').content)
      .toBe('<p>Veja o <a href="https://rdmadvogados.com.br/blog/prazos/">guia de prazos</a> e <a href="https://api.whatsapp.com/send?phone=5511951730074" target="_blank" rel="noopener noreferrer">converse com a nossa equipe pelo WhatsApp</a>.</p>');
  });

  it('cria o link quando a chamada era só texto e o projeto tem WhatsApp', () => {
    expect(repairSolicitationCtas('<p>Fale agora com nossa equipe para resolver dúvidas e evitar prejuízos.</p>', '5511951730074').content)
      .toBe('<p><a href="https://wa.me/5511951730074" target="_blank" rel="noopener noreferrer">Converse com a nossa equipe pelo WhatsApp</a>.</p>');
    expect(repairSolicitationCtas('<p>Ligue agora.</p>', '123').content).toBe('<p>Converse com a nossa equipe para tirar dúvidas sobre a sua situação.</p>');
  });
});

describe('superlativo ambíguo só reprova quando fala de advocacia ou do escritório', () => {
  const news = [
    '<p>O plano prevê acabar com o Bolsa Família, referência nacional em assistência social, e criar as frentes cidadãs.</p>',
    '<p>O modelo de clássicos com torcida única reflete debates sobre segurança, enquanto a presença das maiores equipes valoriza a competição.</p>',
    '<p>Ludemir ressalta que figuras como a filósofa Djamila Ribeiro, referência nacional sobre feminismo negro, têm em sua ancestralidade mulheres trabalhadoras.</p>',
  ];
  it.each(news)('aprova notícia: %s', (content) => {
    expect(findComplianceViolations({ title: 'Brasileirão Feminino volta a ser decidido em São Paulo', content, brand: 'Direitos News' })).toHaveLength(0);
  });

  const ads = [
    ['<p>Somos referência nacional em defesa criminal.</p>', undefined],
    ['<p>O escritório é líder de mercado e o mais premiado do estado.</p>', undefined],
    ['<p>Conte com os melhores especialistas em direito penal.</p>', undefined],
    ['<p>A RDM é referência nacional em casos de alta complexidade.</p>', 'RDM Advogados Associados'],
    ['<p>O melhor advogado criminalista de São Paulo atende aqui.</p>', undefined],
  ] as const;
  it.each(ads)('reprova publicidade: %s', (content, brand) => {
    expect(findComplianceViolations({ title: 'Defesa criminal em São Paulo', content, brand }).map((issue) => issue.code)).toContain('superlativo');
  });

  it('devolve um único problema de superlativo por campo', () => {
    const issues = findComplianceViolations({ title: 'Defesa criminal', content: '<p>O melhor advogado do estado. Somos referência nacional em direito penal.</p>' });
    expect(issues.filter((issue) => issue.code === 'superlativo')).toHaveLength(1);
  });
});

describe('oração que condena a promessa não é promessa', () => {
  it('aprova a explicação de que garantir resultado é infração', () => {
    expect(codes('<p>A oferta de garantia de resultado é considerada infração ética e pode configurar publicidade enganosa.</p>', 'A clínica pode prometer resultado?')).not.toContain('promessa_resultado');
    expect(codes('<p>No contrato, resultado garantido é vedado pelo conselho profissional.</p>', 'Contrato de tratamento odontológico')).not.toContain('promessa_resultado');
    expect(codes('<ul><li>Termos como “resultado garantido”, “cura assegurada” e promessas milagrosas são proibidos.</li></ul>', 'A clínica pode prometer resultado?')).not.toContain('promessa_resultado');
  });

  it('continua reprovando quando a condenação está em outra oração', () => {
    expect(codes('<p>Aqui o resultado garantido é a regra. Isso é considerado infração por alguns.</p>', 'Defesa criminal')).toContain('promessa_resultado');
  });
});

describe('o redator não manda escrever o que o portão bloqueia', () => {
  const sample = 'Advogado explica como funciona o INSS e o processo judicial';
  const section = buildVernizDNASection({
    nichoDetectado: detectarNicho(sample),
    gatilho: detectarGatilho(sample),
    angulo: detectarAngulo(sample),
    empresaNome: 'RDM Advogados Associados',
    empresaEndereco: 'Av. Paulista, São Paulo',
    empresaWhatsapp: '5511951730074',
    socialLinktree: 'https://wa.me/5511951730074',
    socialGoogleMaps: 'https://maps.example/rdm',
    ctaLeads: 'Tire suas dúvidas sobre o seu caso',
    ctaComunidade: 'Acompanhe nas redes',
    ctaConclusao: 'O que aconteceu e qual decisão você precisa tomar?',
  });

  it('todo texto de link sugerido no prompt passa no portão', () => {
    const anchors = [...section.matchAll(/<a href="[^"]*">([^<]+)<\/a>/g)].map((match) => match[1]);
    expect(anchors.length).toBeGreaterThanOrEqual(4);
    for (const text of anchors) {
      expect(findComplianceViolations({ title: 'Guia do INSS em Osasco', content: `<p>${text}</p>` }), text).toHaveLength(0);
    }
  });

  it('não pede bloco de urgência nem avaliação gratuita', () => {
    expect(section).not.toMatch(/Bloco de urg[eê]ncia|Bloco de avalia[cç][aã]o|Avaliar meu caso gratuitamente|Resolver agora/);
    expect(section).toContain('PADRÃO DE PUBLICIDADE');
    expect(section).toContain('Converse com a nossa equipe');
  });

  it('as chamadas da matriz de advocacia passam no portão', () => {
    for (const [trigger, entry] of Object.entries(VERNIZ_DNA_MATRIX.advocacia)) {
      expect(findComplianceViolations({ title: 'Guia do INSS em Osasco', content: `<p>${entry.cta}</p>` }), trigger).toHaveLength(0);
      expect(entry.cta, trigger).not.toMatch(/\bagora\b|n[aã]o perca/i);
    }
  });
});

describe('a tela mostra a regra e o trecho que bloquearam', () => {
  const payload = {
    error: 'Publicação bloqueada: texto viola o padrão de publicidade.',
    issues: [
      { code: 'captacao_direta', label: 'Captação direta de clientela', field: 'content', sample: 'fale agora   com um especialista' },
      { code: 'urgencia_comercial', label: 'Urgência comercial ou gratuidade como isca' },
    ],
  };

  it('lista rótulo e trecho de cada problema', () => {
    expect(describeGateIssues(payload)).toBe('• Captação direta de clientela: “fale agora com um especialista”\n• Urgência comercial ou gratuidade como isca');
    expect(withGateIssues(payload.error, payload)).toBe(`${payload.error}\n• Captação direta de clientela: “fale agora com um especialista”\n• Urgência comercial ou gratuidade como isca`);
  });

  it('mantém a mensagem original quando não há detalhes', () => {
    expect(withGateIssues('Falha ao publicar no WordPress.', { error: 'x' })).toBe('Falha ao publicar no WordPress.');
    expect(describeGateIssues(null)).toBe('');
    expect(describeGateIssues({ issues: 'texto' })).toBe('');
  });
});
