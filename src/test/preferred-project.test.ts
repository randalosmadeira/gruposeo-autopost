import { beforeEach, describe, expect, it } from 'vitest';
import { PREFERRED_PROJECT_KEY, pickDefaultProject, projectReadiness, readStoredProject, storeProject } from '@/lib/preferred-project';

const conquista = { id: 'p-conquista', wordpress_url: null, domain: '', nexus_profile_status: 'draft' };
const elas = { id: 'p-elas', wordpress_url: null, domain: 'elastracy.com.br', nexus_profile_status: 'complete' };
const blog = { id: 'p-blog', wordpress_url: 'https://rdmadvogados.com.br/blog', domain: 'rdmadvogados.com.br', nexus_profile_status: 'complete' };
const news = { id: 'p-news', wordpress_url: 'https://direitonews.rdmadvogados.com.br/blog', domain: 'direitonews.rdmadvogados.com.br', nexus_profile_status: 'pending' };

describe('projeto padrão do NEXUS', () => {
  beforeEach(() => { window.localStorage.clear(); });

  it('pesa perfil completo, site conectado e domínio', () => {
    expect(projectReadiness(blog)).toBe(7);
    expect(projectReadiness(elas)).toBe(5);
    expect(projectReadiness(news)).toBe(3);
    expect(projectReadiness(conquista)).toBe(0);
    expect(projectReadiness({ id: 'x', wordpress_url: '  ', domain: null })).toBe(0);
  });

  it('sem escolha anterior, o mais pronto vence mesmo não sendo o primeiro da lista (caso real: Conquista Prime primeiro)', () => {
    expect(pickDefaultProject([conquista, elas, news, blog])).toBe('p-blog');
  });

  it('empate fica com o primeiro da lista e lista vazia devolve texto vazio', () => {
    expect(pickDefaultProject([{ id: 'a' }, { id: 'b' }])).toBe('a');
    expect(pickDefaultProject([])).toBe('');
  });

  it('a escolha anterior vale quando o projeto ainda existe; se sumiu, volta ao mais pronto', () => {
    expect(pickDefaultProject([conquista, elas, blog], 'p-elas')).toBe('p-elas');
    expect(pickDefaultProject([conquista, elas, blog], 'p-apagado')).toBe('p-blog');
    expect(pickDefaultProject([conquista, blog], null)).toBe('p-blog');
  });

  it('lembra a escolha no navegador e não quebra se o armazenamento falhar', () => {
    expect(readStoredProject()).toBeNull();
    storeProject('p-blog');
    expect(window.localStorage.getItem(PREFERRED_PROJECT_KEY)).toBe('p-blog');
    expect(readStoredProject()).toBe('p-blog');
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error('bloqueado'); };
    try { expect(readStoredProject()).toBeNull(); } finally { Storage.prototype.getItem = original; }
  });
});
