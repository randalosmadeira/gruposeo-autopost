import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HomepageSchemaSection } from '@/components/nexus-observatory/HomepageSchemaSection';
import {
  buildSchemaApplyConfirmText, formatSchemaPreview, nexusErrorMessage, schemaAppliedMessage,
} from '@/lib/nexus-observatory';
import { homepageSchemaSync } from '@/hooks/useNexusObservatory';
import { NexusBlockedError, type NexusHomepageSchemaResult } from '@/types/nexus-observatory';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));

// Fixture no formato da seção "Bloco A" item 4 do contrato (resposta de homepage_schema_sync).
const node = {
  '@context': 'https://schema.org',
  '@type': 'LegalService',
  '@id': 'https://rdmadvogados.com.br/blog/#organization',
  name: 'RDM Advogados Associados',
  url: 'https://rdmadvogados.com.br/blog',
  telephone: '+55-11-95173-0074',
  address: { '@type': 'PostalAddress', streetAddress: 'Av. Paulista, 1842', addressLocality: 'São Paulo', addressRegion: 'SP', postalCode: '01310-200', addressCountry: 'BR' },
  areaServed: [{ '@type': 'State', name: 'São Paulo' }],
};
const dry: NexusHomepageSchemaResult = { dry_run: true, applied: false, schemas: [node], site: 'https://rdmadvogados.com.br' };
const done: NexusHomepageSchemaResult = { dry_run: false, applied: true, count: 1, schemas: [node] };

afterEach(() => { cleanup(); invoke.mockReset(); });

describe('nexusErrorMessage', () => {
  it('traduz os códigos da chave de sinais', () => {
    expect(nexusErrorMessage(new Error('allowed_origins_invalid'))).toBe('Informe só o endereço do site, por exemplo https://exemplo.com.br');
    expect(nexusErrorMessage(new Error('operation_failed'))).toBe('Falha inesperada no servidor. Tente de novo; se persistir, avise o suporte.');
    expect(nexusErrorMessage(new Error('forbidden'))).toBe('Só proprietário ou administrador da organização pode criar a chave.');
    expect(nexusErrorMessage(new Error('signals_key_exists_use_rotate'))).toMatch(/Já existe uma chave para este projeto/);
  });
  it('traduz os códigos do schema da homepage', () => {
    expect(nexusErrorMessage(new Error('schema_profile_missing'))).toMatch(/ainda não tem perfil de schema/);
    expect(nexusErrorMessage(new Error('plugin_not_configured'))).toMatch(/plugin do WordPress ainda não está configurado/);
    expect(nexusErrorMessage(new Error('plugin_unreachable'))).toMatch(/Nada foi alterado/);
    expect(nexusErrorMessage(new Error('profile_invalid:sameAs'))).toMatch(/campo: sameAs/);
  });
  it('código desconhecido passa como veio; vazio vira mensagem genérica', () => {
    expect(nexusErrorMessage(new Error('algo_novo'))).toBe('algo_novo');
    expect(nexusErrorMessage(null)).toBe('Falha inesperada.');
    expect(nexusErrorMessage(new Error(''))).toBe('Falha inesperada.');
    expect(nexusErrorMessage('forbidden')).toMatch(/proprietário ou administrador/);
  });
});

describe('textos do schema da homepage', () => {
  it('confirmação cita o site', () => {
    expect(buildSchemaApplyConfirmText('https://rdmadvogados.com.br'))
      .toBe('Isto altera o schema público da homepage de https://rdmadvogados.com.br. Pode ser desfeito aplicando outro perfil.');
  });
  it('confirmação sem site não imprime null', () => {
    expect(buildSchemaApplyConfirmText(null)).toBe('Isto altera o schema público da homepage do projeto selecionado. Pode ser desfeito aplicando outro perfil.');
    expect(buildSchemaApplyConfirmText('  ')).toContain('do projeto selecionado');
  });
  it('mensagem de sucesso usa a contagem do plugin e cai para o enviado', () => {
    expect(schemaAppliedMessage({ count: 2, schemas: [{}] })).toBe('Aplicado: 2 schema(s)');
    expect(schemaAppliedMessage({ schemas: [{}] })).toBe('Aplicado: 1 schema(s)');
  });
  it('pré-visualização é JSON indentado e fiel', () => {
    const text = formatSchemaPreview([node]);
    expect(JSON.parse(text)).toEqual([node]);
    expect(text).toContain('\n  {');
  });
});

describe('HomepageSchemaSection', () => {
  it('começa com "Aplicar" desabilitado e sem chamar o servidor', () => {
    const sync = vi.fn();
    render(<HomepageSchemaSection sync={sync} />);
    expect(screen.getByRole('heading', { name: 'Schema da homepage' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Aplicar no site/ })).toHaveProperty('disabled', true);
    expect(sync).not.toHaveBeenCalled();
  });

  it('pré-visualiza, habilita aplicar, confirma e chama com dryRun false', async () => {
    const sync = vi.fn(async ({ dryRun }: { dryRun: boolean }) => (dryRun ? dry : done));
    render(<HomepageSchemaSection sync={sync} />);

    fireEvent.click(screen.getByRole('button', { name: /Pré-visualizar/ }));
    const pre = await screen.findByLabelText('Pré-visualização do JSON-LD da homepage');
    expect(pre.textContent).toContain('"@id": "https://rdmadvogados.com.br/blog/#organization"');
    expect(sync).toHaveBeenLastCalledWith({ dryRun: true });

    const apply = screen.getByRole('button', { name: /Aplicar no site/ });
    expect(apply).toHaveProperty('disabled', false);
    fireEvent.click(apply);

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('Isto altera o schema público da homepage de https://rdmadvogados.com.br. Pode ser desfeito aplicando outro perfil.');
    expect(sync).toHaveBeenCalledTimes(1); // abrir o diálogo não aplica nada

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    await waitFor(() => expect(sync).toHaveBeenCalledTimes(2));
    expect(sync).toHaveBeenLastCalledWith({ dryRun: false });
    expect(await screen.findByText('Aplicado: 1 schema(s)')).toBeTruthy();
  });

  it('cancelar o diálogo não aplica', async () => {
    const sync = vi.fn(async () => dry);
    render(<HomepageSchemaSection sync={sync} />);
    fireEvent.click(screen.getByRole('button', { name: /Pré-visualizar/ }));
    await screen.findByTestId('schema-preview');
    fireEvent.click(screen.getByRole('button', { name: /Aplicar no site/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('usa o site do projeto na confirmação quando a prévia não informa', async () => {
    const sync = vi.fn(async () => ({ ...dry, site: null }));
    render(<HomepageSchemaSection sync={sync} siteFallback="https://direitonews.rdmadvogados.com.br" />);
    fireEvent.click(screen.getByRole('button', { name: /Pré-visualizar/ }));
    await screen.findByTestId('schema-preview');
    fireEvent.click(screen.getByRole('button', { name: /Aplicar no site/ }));
    expect((await screen.findByRole('alertdialog')).textContent).toContain('homepage de https://direitonews.rdmadvogados.com.br.');
  });

  it('schema_profile_missing vira mensagem em pt-BR e mantém aplicar desabilitado', async () => {
    const sync = vi.fn(async () => { throw new Error('schema_profile_missing'); });
    render(<HomepageSchemaSection sync={sync} />);
    fireEvent.click(screen.getByRole('button', { name: /Pré-visualizar/ }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/ainda não tem perfil de schema/);
    expect(screen.queryByTestId('schema-preview')).toBeNull();
    expect(screen.getByRole('button', { name: /Aplicar no site/ })).toHaveProperty('disabled', true);
  });

  it('falha do plugin ao aplicar mostra erro e não mostra sucesso', async () => {
    const sync = vi.fn(async ({ dryRun }: { dryRun: boolean }) => { if (dryRun) return dry; throw new Error('plugin_unreachable'); });
    render(<HomepageSchemaSection sync={sync} />);
    fireEvent.click(screen.getByRole('button', { name: /Pré-visualizar/ }));
    await screen.findByTestId('schema-preview');
    fireEvent.click(screen.getByRole('button', { name: /Aplicar no site/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Aplicar' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Nada foi alterado/);
    expect(screen.queryByText(/Aplicado:/)).toBeNull();
  });

  it('bloqueio 402/423 vai para o aviso global, não para o erro da seção', async () => {
    const blocked = new NexusBlockedError(423, 'Execução pausada', 'paid_services_blocked');
    const sync = vi.fn(async () => { throw blocked; });
    const onBlocked = vi.fn();
    render(<HomepageSchemaSection sync={sync} onBlocked={onBlocked} />);
    fireEvent.click(screen.getByRole('button', { name: /Pré-visualizar/ }));
    await waitFor(() => expect(onBlocked).toHaveBeenCalledWith(blocked));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('mostra estado carregando durante a pré-visualização', async () => {
    let resolve: (v: NexusHomepageSchemaResult) => void = () => undefined;
    const sync = vi.fn(() => new Promise<NexusHomepageSchemaResult>((r) => { resolve = r; }));
    render(<HomepageSchemaSection sync={sync} />);
    fireEvent.click(screen.getByRole('button', { name: /Pré-visualizar/ }));
    expect(await screen.findByText('Gerando pré-visualização…')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Pré-visualizar/ })).toHaveProperty('disabled', true);
    resolve(dry);
    await screen.findByTestId('schema-preview');
  });
});

describe('homepageSchemaSync (hook)', () => {
  it('envia action, projectId e dryRun para nexus-intelligence', async () => {
    invoke.mockResolvedValue({ data: dry, error: null });
    await expect(homepageSchemaSync('p1', { dryRun: true })).resolves.toEqual(dry);
    expect(invoke).toHaveBeenCalledWith('nexus-intelligence', { body: { projectId: 'p1', action: 'homepage_schema_sync', dryRun: true } });
    invoke.mockResolvedValue({ data: done, error: null });
    await homepageSchemaSync('p1', { dryRun: false });
    expect(invoke).toHaveBeenLastCalledWith('nexus-intelligence', { body: { projectId: 'p1', action: 'homepage_schema_sync', dryRun: false } });
  });

  it('402/423 viram NexusBlockedError e o código do corpo vira Error com o código', async () => {
    const mk = (status: number, error: string) => ({ data: null, error: { message: 'non-2xx', context: new Response(JSON.stringify({ error }), { status }) } });
    invoke.mockResolvedValueOnce(mk(423, 'paid_services_blocked'));
    await expect(homepageSchemaSync('p1', { dryRun: true })).rejects.toBeInstanceOf(NexusBlockedError);
    invoke.mockResolvedValueOnce(mk(409, 'schema_profile_missing'));
    const err = await homepageSchemaSync('p1', { dryRun: true }).catch((e) => e);
    expect(nexusErrorMessage(err)).toMatch(/ainda não tem perfil de schema/);
    invoke.mockResolvedValueOnce(mk(400, 'profile_invalid:locations'));
    expect(nexusErrorMessage(await homepageSchemaSync('p1', { dryRun: true }).catch((e) => e))).toMatch(/campo: locations/);
  });
});
