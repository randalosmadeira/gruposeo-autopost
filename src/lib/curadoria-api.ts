/** Cliente da Curadoria de conteúdo: chama o portão `engine` com module='curadoria'. Sem IA e sem custo em nenhuma das ações. */
import { callEngine, EngineError } from '@/lib/engine-api';

export type ArtStatus = 'generating' | 'draft' | 'ready' | 'error';
export type CurState = 'sem_curadoria' | 'desatualizada' | 'aprovado' | 'precisa_correcao' | 'bloqueado';
export const STATUS_BLOCKS: Array<{ status: ArtStatus; title: string; hint: string }> = [
  { status: 'generating', title: 'Em criação', hint: 'Artigos que ainda estão sendo escritos (ou ficaram parados).' },
  { status: 'draft', title: 'Na fila', hint: 'Rascunhos esperando para virar artigo finalizado.' },
  { status: 'ready', title: 'Finalizado', hint: 'Artigos prontos, esperando a publicação.' },
];
export const STATE_LABEL: Record<CurState, string> = {
  sem_curadoria: 'Sem curadoria', desatualizada: 'Desatualizada', aprovado: 'Aprovado', precisa_correcao: 'Precisa de correção', bloqueado: 'Bloqueado',
};
export const ITEM_LABEL: Record<string, string> = {
  perfil: 'Perfil do Projeto', funil: 'Funil de captação', taxonomia: 'Taxonomia', dominio: 'Estrutura do domínio', backlinks: 'Backlinks', mercado: 'Mercado', radar: 'Radar de mercado',
  indexacao: 'Indexação', estudio: 'Estúdio de Páginas', piloto: 'Piloto Automático', observatorio: 'Observatório de IA', imagens: 'Imagens', duvidas: 'Tira dúvidas',
};

export interface StatusCounts { total: number; sem_curadoria: number; desatualizada: number; aprovado: number; precisa_correcao: number; bloqueado: number }
export interface Resumo {
  project_id: string; name: string; total_artigos: number; por_status: Record<ArtStatus, StatusCounts>; totais: StatusCounts; bloqueados_por_imagem: number;
  publicados: { total: number; observacao: string }; versao_das_regras: number;
}
export interface ListaRow {
  article_id: string; title: string | null; keyword: string | null; status: ArtStatus; status_rotulo: string; updated_at: string | null; estado: CurState; estado_gravado: string | null;
  nota: number | null; image_state: string | null; image_uses: number | null; curated_at: string | null;
}
export interface Lista { project_id: string; total: number; page: number; pageSize: number; artigos: ListaRow[] }
export interface Item { modulo: string; estado: 'ok' | 'aviso' | 'pendencia' | 'sem_dados'; motivo_em_portugues: string; fonte: string; bloqueia?: boolean; detalhes?: string[] }
export interface Relatorio { estado: string; nota: number | null; itens: Item[]; bloqueios: string[]; faltando: string[]; avisos: number; evaluated_at: string }
export interface Detalhe {
  article: { id: string; title: string | null; keyword: string | null; status: string; featured_image_url: string; updated_at: string | null };
  estado_gravado: string | null; estado_atual: string; gravado: boolean; calculado_agora: boolean; curated_at: string | null; relatorio: Relatorio; publicado: boolean;
}
export interface RodarReply {
  project_id: string; processados: number; restantes: number; concluido: boolean; cortado_pelo_tempo: boolean; estados: Record<string, number>;
  artigos: Array<{ article_id: string; title: string | null; status: string; estado: string; bloqueios: string[]; faltando: string[] }>; decorrido_ms: number; custo_ia: number; observacao: string;
}
export interface PromptsAbertos {
  project_id: string; sem_dados: boolean; motivo?: string; total_prompts: number; resumo: { sem_artigo: number; so_em_producao: number; coberto: number }; heuristica: boolean; regra: string;
  prompts: Array<{ id: string; query: string; topic: string | null; intent: string | null; conjunto: string | null; estado: 'sem_artigo' | 'so_em_producao' | 'coberto'; cobertos_por: Array<{ article_id: string; title: string; status: string; palavras_casadas: string[] }> }>;
}
export interface ImagensDiag {
  project_id: string; total_artigos: number; imagens_distintas: number; artigos_sem_imagem: number; grupos_repetidos: number; regra: string; normalizacao: string;
  por_status: Record<string, { artigos: number; com_imagem: number; sem_imagem: number; em_imagem_repetida: number; imagens_distintas: number }>;
  mais_repetidas: Array<{ chave: string; exemplo_url: string; usos: number; por_status: Record<string, number>; usada_em_publicado: boolean }>;
  precisam_imagem_nova: { total: number; offset: number; limit: number; artigos: Array<{ prioridade: number; article_id: string; title: string | null; keyword: string | null; status: string; status_rotulo: string; motivo: 'ausente' | 'repetida'; usos: number }> };
}

export const curadoria = {
  resumo: (projectId: string) => callEngine<Resumo>('curadoria', 'resumo', { projectId }),
  listar: (projectId: string, f: { status?: string; estado?: string; q?: string; page?: number; pageSize?: number } = {}) => callEngine<Lista>('curadoria', 'listar', { projectId, ...f }),
  detalhe: (projectId: string, articleId: string, recalcular = false) => callEngine<Detalhe>('curadoria', 'detalhe', { projectId, articleId, recalcular }),
  rodar: (projectId: string, o: { limit?: number; desde: string; statuses?: string[]; refazer?: boolean }) => callEngine<RodarReply>('curadoria', 'rodar', { projectId, ...o }),
  promptsAbertos: (projectId: string, estado?: string) => callEngine<PromptsAbertos>('curadoria', 'prompts_abertos', { projectId, ...(estado ? { estado } : {}) }),
  imagens: (projectId: string, offset = 0, limit = 50) => callEngine<ImagensDiag>('curadoria', 'imagens', { projectId, offset, limit }),
};

const MESSAGES: Record<string, string> = { article_not_found: 'Artigo não encontrado neste projeto.', status_invalid: 'Status inválido.', estado_invalid: 'Estado inválido.', desde_required: 'Informe a hora de início da rodada.' };
export function curadoriaErrorMessage(e: unknown): string {
  if (e instanceof EngineError) return e.serverMessage || MESSAGES[e.code] || 'Não foi possível concluir agora. Tente de novo.';
  return 'Não foi possível concluir agora. Tente de novo.';
}
