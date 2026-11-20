/**
 * Dicionários da tela do Estúdio de Páginas: pt-BR é a fonte (completo); en e es podem ter lacunas (caem no pt-BR, nunca aparece a chave crua).
 * Textos longos gerados pelo servidor (notas e "como corrigir" dos portões, briefing) chegam em pt-BR; os rótulos, botões e avisos da tela seguem o idioma escolhido.
 */
import { useMemo } from 'react';
import { useT, type Locale } from '@/lib/i18n/core';

export const PT = {
  'page.kicker': 'Estúdio de Páginas',
  'page.h1': 'Páginas que buscadores, IAs e pessoas entendem, sem cara de IA',
  'page.intro': 'Briefing de superação a partir dos concorrentes, rascunho por etapas com fatos reais, 29 portões técnicos (SEO, GEO, AEO, AIO), detector de "cara de IA", plano de links, imagens e publicação só depois da aprovação de uma pessoa.',
  'page.project': 'Projeto', 'page.language': 'Idioma da tela', 'page.noProjects': 'Crie um projeto para usar o Estúdio de Páginas.',
  'common.retry': 'Tentar de novo', 'common.failed': 'Não consegui concluir', 'common.loading': 'Carregando…', 'common.back': 'Voltar à lista', 'common.save': 'Salvar revisão', 'common.close': 'Fechar',
  'honest.title': 'Avisos honestos',
  'honest.noinvent': 'O sistema nunca inventa fato, endereço, telefone, depoimento, número ou fonte: o que falta vira pendência e impede a aprovação.',
  'honest.approval': 'Nada é publicado sem a aprovação de uma pessoa, e o que foi aprovado é exatamente o que é publicado (conferido por hash).',
  'honest.cost': 'O custo mostrado é uma ESTIMATIVA pelo preço padrão do projeto (não verificado). O gasto real e o teto do dia estão no Teto Diário de Gasto.',
  'tab.list': 'Páginas', 'tab.new': 'Nova página', 'tab.brief': 'Briefing de superação', 'tab.editor': 'Editor', 'tab.quality': 'Completude técnica', 'tab.ai': 'Anti-IA', 'tab.links': 'Links', 'tab.images': 'Imagens', 'tab.publish': 'Aprovar e publicar',
  'status.rascunho': 'Rascunho', 'status.em_revisao': 'Em revisão', 'status.aprovada': 'Aprovada', 'status.publicada': 'Publicada', 'status.despublicada': 'Despublicada',
  'type.pagina': 'Página', 'type.landing': 'Landing page', 'type.hub': 'Hub', 'type.servico': 'Serviço', 'type.local': 'Local', 'type.guia': 'Guia', 'type.comparativo': 'Comparativo',
  'adapter.wordpress_plugin': 'Plugin do WordPress', 'adapter.site_manifest': 'Pacote para site estático', 'adapter.zica_hosted': 'Hospedado pela Zica (não construído)',
  'list.empty': 'Ainda não há páginas. Crie a primeira a partir de um briefing.', 'list.filterStatus': 'Estado', 'list.filterType': 'Tipo', 'list.search': 'Buscar', 'list.all': 'Todos', 'list.open': 'Abrir',
  'list.counts': '{n} páginas', 'list.pending': '{n} pendência(s)', 'list.quality': 'qualidade {n}', 'list.ai': 'IA {n}', 'list.version': 'v{n}', 'list.live': 'no ar',
  'list.lotTitle': 'Trava de páginas em massa', 'list.lotText': '{used} de {limit} páginas novas nas últimas 24 h (limite do perfil de regras).',
  'new.title': 'Briefing de uma nova página', 'new.query': 'Busca ou assunto que a página responde', 'new.queryPh': 'ex.: advogado criminalista em Guarulhos', 'new.type': 'Tipo (vazio = o formato que vence na busca)', 'new.auto': 'Automático',
  'new.language': 'Idioma da página (BCP 47)', 'new.languagePh': 'pt-BR, en, es, fr…', 'new.place': 'Lugar (opcional)', 'new.subject': 'Serviço ou assunto (opcional)', 'new.slug': 'Endereço (opcional; senão eu proponho)', 'new.adapter': 'Destino da publicação',
  'new.advanced': 'Foco, árvore e território (opcional)', 'new.focus': 'ID do Foco do Radar', 'new.node': 'ID do nó da taxonomia', 'new.geo': 'ID do território', 'new.facts': 'Fatos de campo (com fonte)', 'new.factsHelp': 'Órgãos, endereços, prazos, normas. Só os APROVADOS e com fonte contam; sem eles a página local não passa.',
  'new.addFact': 'Adicionar fato', 'new.factText': 'O fato', 'new.factUrl': 'Endereço (https) da fonte', 'new.factLabel': 'Nome da fonte', 'new.factApproved': 'aprovado', 'new.sources': 'Fontes oficiais ou de referência', 'new.addSource': 'Adicionar fonte', 'new.srcUrl': 'https://…', 'new.srcLabel': 'Nome da fonte', 'new.srcOfficial': 'oficial',
  'new.submit': 'Criar briefing', 'new.busy': 'Montando o briefing…', 'new.created': 'Briefing criado.', 'new.remove': 'Remover',
  'brief.title': 'Briefing de superação', 'brief.radar.radar': 'Fonte: Radar de Mercado', 'brief.radar.serp_local': 'Fonte: SERP do planejador de mercado (só posição e título)', 'brief.radar.ausente': 'Sem dados de concorrentes',
  'brief.intent': '1. O que vence hoje', 'brief.benchmark': '2. As melhores páginas e as identidades dos concorrentes', 'brief.gaps': '3. Lacunas', 'brief.angles': '4. O que dizer de diferente (com a prova)', 'brief.surfaces': '5. Pacote de superfícies da mesma ideia', 'brief.goals': '6. Metas e acompanhamento', 'brief.cited': 'Fontes citadas pelas IAs: onde precisamos aparecer', 'brief.outline': 'Esqueleto sugerido', 'brief.pendings': 'Pendências do briefing',
  'brief.recommended': 'Tipo recomendado', 'brief.median': 'Mediana de palavras', 'brief.p75': '75%', 'brief.videoShare': 'com vídeo', 'brief.age': 'idade mediana (dias)', 'brief.depthPartial': 'Só posição e título: palavras, schema e mídia dependem do Radar medir o conteúdo.',
  'brief.theyCover': 'Eles cobrem e nós não', 'brief.nobody': 'Ninguém cobre bem (oportunidade)', 'brief.weOnly': 'Só nós cobrimos', 'brief.noGaps': 'Sem lacunas calculadas (falta dado do Radar).',
  'brief.ready': 'pronto', 'brief.pending': 'pendente', 'brief.proof': 'Prova', 'brief.missing': 'Falta', 'brief.measured': 'medido', 'brief.current': 'agora', 'brief.target': 'meta', 'brief.hosts': 'Sites mais citados', 'brief.targets': 'Alvos de presença', 'brief.ownShare': 'Nosso site: {share}% das citações',
  'brief.noCopy': 'Só temas e estrutura dos concorrentes entram: o texto deles nunca é copiado.',
  'ed.title': 'Título (SEO)', 'ed.meta': 'Meta descrição', 'ed.h1': 'H1 da página', 'ed.slug': 'Endereço', 'ed.body': 'Corpo (HTML)', 'ed.chars': '{n} caracteres', 'ed.generate': 'Gerar rascunho (IA, dentro do teto)', 'ed.generating': 'Gerando…', 'ed.restart': 'Recomeçar do zero', 'ed.check': 'Verificar qualidade', 'ed.checkLinks': 'Verificar com fontes (HEAD/200)',
  'ed.desktop': 'Computador', 'ed.mobile': 'Celular', 'ed.preview': 'Pré-visualização', 'ed.serp': 'Como aparece na busca', 'ed.ai': 'Resposta que uma IA pode citar', 'ed.noai': 'IA indisponível neste ambiente: o rascunho vira pendências para uma pessoa escrever.', 'ed.stopped': 'A geração parou: {msg}. Continue depois: o que já saiu foi guardado.', 'ed.saved': 'Revisão salva (v{n}).', 'ed.redirect': 'O endereço mudou numa página publicada: o redirecionamento 301 de {from} para {to} é obrigatório no destino.',
  'ed.readonly': 'Seu papel permite ver, mas não alterar.', 'ed.cost': 'Custo estimado por página', 'ed.costDay': 'cabem cerca de {n} páginas por dia no teto de {cap}', 'ed.steps': '{n} passo(s) de IA, custo estimado {cost}',
  'q.title': 'Portões técnicos', 'q.score': 'Nota de completude {n}/100', 'q.blocking': '{n} obrigatório(s) reprovado(s)', 'q.warnings': '{n} aviso(s)', 'q.complete': 'Nenhum portão obrigatório reprovado', 'q.fix': 'Como corrigir', 'q.level.exigir': 'exigir', 'q.level.recomendar': 'recomendar', 'q.level.desligado': 'desligado',
  'q.s.ok': 'ok', 'q.s.aviso': 'aviso', 'q.s.falha': 'falha', 'q.s.info': 'não se aplica', 'q.s.desligado': 'desligado', 'q.doorway': 'Páginas de porta', 'q.invention': 'Dados sem origem', 'q.pendings': 'Pendências no texto',
  'ai.title': 'Detector de padrões de IA', 'ai.score': 'Nota {n}/100 (0 = soa humano)', 'ai.coverage': 'Cobertura do idioma: {c}', 'ai.none': 'Nenhum padrão de IA encontrado.', 'ai.marked': 'Trechos marcados no texto', 'ai.metrics': 'Ritmo das frases {r} · especificidade {s} por 100 palavras', 'ai.note': 'Heurística: aponta tiques de texto automático; não prova autoria.',
  'ln.title': 'Plano de links', 'ln.plan': 'Planejar links', 'ln.planVerify': 'Planejar e verificar fontes', 'ln.internal': 'Internos', 'ln.external': 'Externos (fontes oficiais ou verificadas)', 'ln.inbound': 'Links de entrada sugeridos (hub e páginas fortes)', 'ln.missing': 'Faltam {i} internos e {e} externos', 'ln.rejected': 'Fontes recusadas', 'ln.empty': 'Nenhum link planejado ainda.', 'ln.verified': 'verificado', 'ln.unverified': 'não verificado',
  'im.title': 'Imagens (minimalistas e realistas)', 'im.select': 'Selecionar do acervo', 'im.generate': 'Gerar (política do projeto + teto)', 'im.sceneEn': 'Cena (em inglês, para o gerador)', 'im.alt': 'Texto alternativo (no idioma da página)', 'im.rules': 'Sem rosto de pessoa real inventado, sem lugar ou endereço falso, sem texto nem marca d\'água. WebP/AVIF, com largura e altura.',
  'im.pending': 'pendente', 'im.origin.acervo': 'acervo', 'im.origin.gerada': 'gerada', 'im.origin.pendente': 'pendente', 'im.cost': 'Custo desta rodada (estimado): {c}',
  'pub.title': 'Aprovar e publicar', 'pub.send': 'Enviar para revisão', 'pub.approve': 'Aprovar (sou eu quem aprova)', 'pub.return': 'Devolver para ajustes', 'pub.publish': 'Publicar', 'pub.draft': 'Enviar como rascunho ao WordPress', 'pub.package': 'Gerar pacote para o site estático', 'pub.confirm': 'Já subi o pacote: confirmar no ar', 'pub.unpublish': 'Despublicar', 'pub.confirmRemoved': 'Já removi do site: confirmar',
  'pub.needApproval': 'Só página aprovada por uma pessoa pode ser publicada.', 'pub.approvedBy': 'Aprovada em {date}', 'pub.hash': 'Conteúdo aprovado (hash) {h}', 'pub.history': 'Publicações', 'pub.versions': 'Versões', 'pub.indexation': 'Fila de indexação', 'pub.pkgFiles': '{n} arquivos no pacote', 'pub.download': 'Baixar {name}', 'pub.instructions': 'Instruções do pacote',
  'pub.published': 'Publicada.', 'pub.sentDraft': 'Enviada ao WordPress como rascunho.', 'pub.pkgDone': 'Pacote gerado. Publique no site e volte para confirmar.', 'pub.done': 'Feito.', 'pub.hosted': 'O destino "hospedado pela Zica" ainda não foi construído (só o contrato).',
  'gaps.title': 'Dados que o Perfil ainda não tem', 'gaps.help': 'O Estúdio não inventa: o que falta aparece aqui e vira pendência nas páginas.',
  'cap.title': 'O que está ligado neste ambiente', 'cap.ai': 'IA do projeto', 'cap.images': 'Geração de imagem', 'cap.plugin': 'Plugin do WordPress', 'cap.radar': 'Radar de Mercado', 'cap.serp': 'SERP do planejador', 'cap.obs': 'Observatório de IA', 'cap.tax': 'Taxonomia', 'cap.focus': 'Focos', 'cap.on': 'ligado', 'cap.off': 'não disponível',
} as const;
export type StudioKey = keyof typeof PT;

export const EN: Partial<Record<StudioKey, string>> = {
  'page.kicker': 'Page Studio', 'page.h1': 'Pages that search engines, AIs and people understand, without the AI look',
  'page.intro': 'A competitor-driven brief, a staged draft built on real facts, 29 technical gates (SEO, GEO, AEO, AIO), an "AI-look" detector, link plan, images and publishing only after a person approves.',
  'page.project': 'Project', 'page.language': 'Screen language', 'page.noProjects': 'Create a project to use the Page Studio.',
  'common.retry': 'Try again', 'common.failed': 'Could not finish', 'common.loading': 'Loading…', 'common.back': 'Back to list', 'common.save': 'Save revision', 'common.close': 'Close',
  'honest.title': 'Honest notes', 'honest.noinvent': 'The system never invents facts, addresses, phone numbers, testimonials, numbers or sources: what is missing becomes a pending item and blocks approval.',
  'honest.approval': 'Nothing is published without a person approving it, and what was approved is exactly what gets published (checked by hash).',
  'tab.list': 'Pages', 'tab.new': 'New page', 'tab.brief': 'Superiority brief', 'tab.editor': 'Editor', 'tab.quality': 'Technical completeness', 'tab.ai': 'Anti-AI', 'tab.links': 'Links', 'tab.images': 'Images', 'tab.publish': 'Approve and publish',
  'status.rascunho': 'Draft', 'status.em_revisao': 'In review', 'status.aprovada': 'Approved', 'status.publicada': 'Published', 'status.despublicada': 'Unpublished',
  'type.pagina': 'Page', 'type.landing': 'Landing page', 'type.hub': 'Hub', 'type.servico': 'Service', 'type.local': 'Local', 'type.guia': 'Guide', 'type.comparativo': 'Comparison',
  'list.empty': 'No pages yet. Create the first one from a brief.', 'list.filterStatus': 'Status', 'list.filterType': 'Type', 'list.search': 'Search', 'list.all': 'All', 'list.open': 'Open',
  'new.title': 'Brief for a new page', 'new.query': 'Search or topic the page answers', 'new.type': 'Type (empty = the format that wins in search)', 'new.auto': 'Automatic', 'new.language': 'Page language (BCP 47)', 'new.place': 'Place (optional)', 'new.subject': 'Service or subject (optional)', 'new.slug': 'Address (optional; otherwise I propose one)', 'new.adapter': 'Publishing target', 'new.submit': 'Create brief', 'new.busy': 'Building the brief…',
  'brief.title': 'Superiority brief', 'brief.intent': '1. What wins today', 'brief.benchmark': '2. Top pages and competitor identities', 'brief.gaps': '3. Gaps', 'brief.angles': '4. What to say differently (with proof)', 'brief.surfaces': '5. Surface package for the same idea', 'brief.goals': '6. Goals and tracking', 'brief.cited': 'Sources cited by AIs: where we need to appear',
  'ed.title': 'Title (SEO)', 'ed.meta': 'Meta description', 'ed.h1': 'Page H1', 'ed.slug': 'Address', 'ed.body': 'Body (HTML)', 'ed.generate': 'Generate draft (AI, within the cap)', 'ed.generating': 'Generating…', 'ed.check': 'Check quality', 'ed.desktop': 'Desktop', 'ed.mobile': 'Mobile', 'ed.preview': 'Preview', 'ed.serp': 'How it looks in search',
  'q.title': 'Technical gates', 'ai.title': 'AI-pattern detector', 'ln.title': 'Link plan', 'im.title': 'Images (minimalist and realistic)', 'pub.title': 'Approve and publish', 'pub.send': 'Send for review', 'pub.approve': 'Approve (I am approving)', 'pub.return': 'Return for changes', 'pub.publish': 'Publish', 'pub.unpublish': 'Unpublish',
  'q.s.ok': 'ok', 'q.s.aviso': 'warning', 'q.s.falha': 'fail', 'q.s.info': 'n/a', 'q.s.desligado': 'off', 'q.fix': 'How to fix',
};
export const ES: Partial<Record<StudioKey, string>> = {
  'page.kicker': 'Estudio de Páginas', 'page.h1': 'Páginas que buscadores, IAs y personas entienden, sin cara de IA',
  'page.project': 'Proyecto', 'page.language': 'Idioma de la pantalla', 'page.noProjects': 'Cree un proyecto para usar el Estudio de Páginas.',
  'common.retry': 'Intentar de nuevo', 'common.failed': 'No pude terminar', 'common.loading': 'Cargando…', 'common.back': 'Volver a la lista', 'common.save': 'Guardar revisión',
  'honest.title': 'Avisos honestos', 'honest.noinvent': 'El sistema nunca inventa hechos, direcciones, teléfonos, testimonios, cifras ni fuentes: lo que falta queda pendiente e impide la aprobación.',
  'tab.list': 'Páginas', 'tab.new': 'Nueva página', 'tab.brief': 'Briefing de superación', 'tab.editor': 'Editor', 'tab.quality': 'Completitud técnica', 'tab.ai': 'Anti-IA', 'tab.links': 'Enlaces', 'tab.images': 'Imágenes', 'tab.publish': 'Aprobar y publicar',
  'status.rascunho': 'Borrador', 'status.em_revisao': 'En revisión', 'status.aprovada': 'Aprobada', 'status.publicada': 'Publicada', 'status.despublicada': 'Despublicada',
  'type.pagina': 'Página', 'type.landing': 'Landing page', 'type.hub': 'Hub', 'type.servico': 'Servicio', 'type.local': 'Local', 'type.guia': 'Guía', 'type.comparativo': 'Comparativo',
  'list.empty': 'Aún no hay páginas. Cree la primera a partir de un briefing.', 'list.filterStatus': 'Estado', 'list.filterType': 'Tipo', 'list.search': 'Buscar', 'list.all': 'Todos', 'list.open': 'Abrir',
  'new.title': 'Briefing de una nueva página', 'new.query': 'Búsqueda o tema que responde la página', 'new.auto': 'Automático', 'new.language': 'Idioma de la página (BCP 47)', 'new.place': 'Lugar (opcional)', 'new.subject': 'Servicio o tema (opcional)', 'new.submit': 'Crear briefing', 'new.busy': 'Armando el briefing…',
  'brief.title': 'Briefing de superación', 'brief.intent': '1. Qué gana hoy', 'brief.gaps': '3. Brechas', 'brief.surfaces': '5. Paquete de superficies de la misma idea',
  'ed.title': 'Título (SEO)', 'ed.meta': 'Meta descripción', 'ed.generate': 'Generar borrador (IA, dentro del tope)', 'ed.check': 'Verificar calidad', 'ed.desktop': 'Computadora', 'ed.mobile': 'Celular', 'ed.preview': 'Vista previa',
  'q.title': 'Puertas técnicas', 'ai.title': 'Detector de patrones de IA', 'ln.title': 'Plan de enlaces', 'im.title': 'Imágenes (minimalistas y realistas)', 'pub.title': 'Aprobar y publicar', 'pub.send': 'Enviar a revisión', 'pub.approve': 'Aprobar (apruebo yo)', 'pub.publish': 'Publicar', 'pub.unpublish': 'Despublicar',
  'q.s.ok': 'ok', 'q.s.aviso': 'aviso', 'q.s.falha': 'falla', 'q.s.info': 'no aplica', 'q.s.desligado': 'apagado', 'q.fix': 'Cómo corregir',
};

const DICTS: Record<Locale, Partial<Record<StudioKey, string>>> = { 'pt-BR': PT, en: EN, es: ES };
export type StudioT = (key: StudioKey, vars?: Record<string, string | number>) => string;
export function makeStudioT(locale: Locale): StudioT {
  return (key, vars) => {
    const raw = DICTS[locale][key] ?? PT[key] ?? key;
    return vars ? raw.replace(/\{(\w+)\}/g, (_m, k: string) => (k in vars ? String(vars[k]) : `{${k}}`)) : raw;
  };
}
/** Tradutor da tela do Estúdio, no idioma escolhido no provedor de idioma (sem provedor: pt-BR). */
export function useStudioT(): { t: StudioT; locale: Locale; n: (v: number) => string; date: (iso: string) => string; setLocale: (l: Locale) => void } {
  const { locale, n, date, setLocale } = useT();
  const t = useMemo(() => makeStudioT(locale), [locale]);
  return { t, locale, n, date, setLocale };
}
