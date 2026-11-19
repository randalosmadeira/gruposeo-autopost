/** Rótulos e constantes dos backlinks, sem dependências (a tela importa daqui para não carregar o código do servidor). */
export type LinkStatus = 'unverified' | 'live' | 'lost' | 'dead' | 'blocked';
export type LinkAttr = 'follow' | 'nofollow' | 'sponsored' | 'ugc';
export type AnchorKind = 'marca' | 'url' | 'generico' | 'imagem' | 'palavra_chave';

export const MAX_LINKS_PER_PROJECT = 5000;
export const MAX_IMPORT_ROWS = 2000;
export const MAX_COMPETITOR_TARGETS = 5;
export const VERIFY_BATCH = 12;
export const ORIGINS: Record<string, string> = {
  google_search_console: 'Google Search Console', bing_webmaster: 'Bing Webmaster Tools', ahrefs: 'Ahrefs', semrush: 'Semrush', moz: 'Moz', majestic: 'Majestic', manual: 'Lista própria', outro: 'Outra fonte',
};
export const STATUS_LABEL: Record<LinkStatus, string> = { unverified: 'Não verificado', live: 'No ar', lost: 'Link não encontrado', dead: 'Página fora do ar', blocked: 'Bloqueou o robô' };
export const ANCHOR_LABEL: Record<AnchorKind | 'sem_dado', string> = { marca: 'Nome da marca', url: 'Endereço do site', generico: 'Texto genérico', imagem: 'Imagem (sem texto)', palavra_chave: 'Palavra-chave ou frase', sem_dado: 'Sem informação' };
export const ATTR_LABEL: Record<LinkAttr | 'sem_dado', string> = { follow: 'Normal (dofollow)', nofollow: 'nofollow', sponsored: 'Patrocinado', ugc: 'Gerado por usuário', sem_dado: 'Sem informação' };
