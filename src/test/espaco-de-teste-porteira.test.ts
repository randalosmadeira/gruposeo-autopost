import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isPlatformAiAllowed, mergeProviderKeys, PLATFORM_AI_BLOCKED_MESSAGE } from '../../supabase/functions/_shared/platform-ai-gate';
import { AIOrchestrator } from '../../supabase/functions/_shared/ai-orchestrator';

// o orquestrador roda no Deno em produção; aqui só precisamos que o tsc do app conheça o global que ele lê
declare global {
  var Deno: { env: { get(name: string): string | undefined } };
}

const ENV = { gemini: 'env-gemini', openai: 'sk-env-openai', anthropic: 'env-anthropic', serper: 'env-serper' };
const VAULT = { openai: 'sk-vault-openai', anthropic: 'vault-anthropic' };
const none = { gemini: '', openai: '', anthropic: '', serper: '' };
const rpc = (impl: () => unknown) => ({ rpc: async () => impl() as { data: unknown; error: unknown } });

afterEach(() => vi.unstubAllGlobals());

describe('porteira: pergunta ao banco (falha fechada)', () => {
  it('só `true` autoriza', async () => {
    expect(await isPlatformAiAllowed(rpc(() => ({ data: true, error: null })), 'u')).toBe(true);
  });
  it.each([
    ['falso', { data: false, error: null }], ['nulo', { data: null, error: null }], ['texto "true"', { data: 'true', error: null }],
    ['número 1', { data: 1, error: null }], ['erro do banco', { data: true, error: { message: 'x' } }],
  ])('%s NÃO autoriza', async (_n, r) => {
    expect(await isPlatformAiAllowed(rpc(() => r), 'u')).toBe(false);
  });
  it('exceção (rede, timeout) NÃO autoriza e não propaga', async () => {
    expect(await isPlatformAiAllowed(rpc(() => { throw new Error('rede'); }), 'u')).toBe(false);
  });
  it('chama a função certa com o usuário certo', async () => {
    const calls: unknown[][] = [];
    await isPlatformAiAllowed({ rpc: async (...a) => { calls.push(a); return { data: true, error: null }; } }, 'user-1');
    expect(calls).toEqual([['platform_ai_allowed', { p_user: 'user-1' }]]);
  });
});

describe('porteira: junção das chaves', () => {
  it('autorizado sem chave própria: usa Vault e, depois, o ambiente (como era antes)', () => {
    const k = mergeProviderKeys({ user: {}, platformAllowed: true, vault: VAULT, env: ENV });
    expect(k).toEqual({ gemini: 'env-gemini', openai: 'sk-vault-openai', anthropic: 'vault-anthropic', serper: 'env-serper', platformAi: true });
    expect(mergeProviderKeys({ user: {}, platformAllowed: true, vault: { openai: '', anthropic: '' }, env: ENV }).openai).toBe('sk-env-openai');
  });
  it('NÃO autorizado sem chave própria: nenhuma chave da plataforma (nem Vault, nem ambiente)', () => {
    const k = mergeProviderKeys({ user: {}, platformAllowed: false, vault: VAULT, env: ENV });
    expect(k).toEqual({ ...none, platformAi: false });
    expect(JSON.stringify(k)).not.toMatch(/env-|vault-/);
  });
  it('NÃO autorizado COM chave própria: só as do usuário valem (BYOK continua funcionando)', () => {
    const k = mergeProviderKeys({ user: { openai: ' sk-meu ', serper: 'meu-serper' }, platformAllowed: false, vault: VAULT, env: ENV });
    expect(k).toMatchObject({ openai: 'sk-meu', serper: 'meu-serper', gemini: '', anthropic: '', platformAi: false });
  });
  it('autorizado com chave própria: a do usuário tem prioridade sobre Vault e ambiente', () => {
    const k = mergeProviderKeys({ user: { openai: 'sk-meu', gemini: 'meu-gemini' }, platformAllowed: true, vault: VAULT, env: ENV });
    expect(k).toMatchObject({ openai: 'sk-meu', gemini: 'meu-gemini', anthropic: 'vault-anthropic', serper: 'env-serper' });
  });
  it('valores que não são `true` estrito não autorizam (defesa contra truthy)', () => {
    for (const v of [1, 'true', {}, []]) {
      expect(mergeProviderKeys({ user: {}, platformAllowed: v as never, vault: VAULT, env: ENV }).openai).toBe('');
    }
  });
  it('a mensagem de bloqueio orienta o usuário', () => {
    expect(PLATFORM_AI_BLOCKED_MESSAGE).toMatch(/liberação/);
    expect(PLATFORM_AI_BLOCKED_MESSAGE).toMatch(/própria chave/);
  });
});

describe('porteira: orquestrador não cai nas chaves do ambiente', () => {
  const stubEnv = () => vi.stubGlobal('Deno', { env: { get: (k: string) => ({ OPENAI_API_KEY: 'sk-ambiente', ANTHROPIC_API_KEY: 'ant-ambiente', GEMINI_API_KEY: 'gem-ambiente' } as Record<string, string>)[k] } });

  it('sem a porteira, o orquestrador nasce com as chaves do ambiente (é o comportamento que a porteira corta)', () => {
    stubEnv();
    expect(new AIOrchestrator().getAvailableProviders().sort()).toEqual(['anthropic', 'gemini', 'openai']);
  });
  it('disablePlatformKeys deixa SEM provedor nenhum', () => {
    stubEnv();
    const o = new AIOrchestrator();
    o.disablePlatformKeys();
    expect(o.getAvailableProviders()).toEqual([]);
  });
  it('depois de desabilitar, só a chave do usuário entra (BYOK)', () => {
    stubEnv();
    const o = new AIOrchestrator();
    o.disablePlatformKeys();
    o.setKeys({ openai: 'sk-do-usuario' });
    expect(o.getAvailableProviders()).toEqual(['openai']);
    // a chave que sobra é a do usuário, não a do ambiente
    expect((o as unknown as { getKeysForProvider(n: string): string[] }).getKeysForProvider('openai')).toEqual(['sk-do-usuario']);
    expect((o as unknown as { getKeysForProvider(n: string): string[] }).getKeysForProvider('anthropic')).toEqual([]);
  });
});

describe('porteira: ligação no resolvedor de chaves (código-fonte)', () => {
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');
  const src = read('supabase/functions/_shared/byok-resolver.ts');

  it('consulta a porteira ANTES de buscar a chave no Vault e só busca no Vault se autorizado', () => {
    expect(src).toContain('isPlatformAiAllowed(admin, userId)');
    expect(src.indexOf('isPlatformAiAllowed(admin, userId)')).toBeLessThan(src.indexOf('vaultProviderKey(admin, "openai")'));
    expect(src).toMatch(/userOpenAI \|\| !platformAllowed \? Promise\.resolve\(""\)/);
    expect(src).toMatch(/userAnthropic \|\| !platformAllowed \? Promise\.resolve\(""\)/);
  });
  it('não lê mais as chaves da plataforma diretamente no retorno: tudo passa por mergeProviderKeys', () => {
    expect(src).toContain('return mergeProviderKeys({');
    expect(src).not.toMatch(/openai: userOpenAI \|\| vaultOpenAI \|\| env\(/);
  });
  it('o orquestrador descarta as chaves do ambiente ANTES de receber as do usuário', () => {
    expect(src.indexOf('orchestrator.disablePlatformKeys()')).toBeGreaterThan(0);
    expect(src.indexOf('orchestrator.disablePlatformKeys()')).toBeLessThan(src.indexOf('orchestrator.setKeys(keys)'));
    expect(src).toMatch(/if \(userKeys\.platformAi === false\) orchestrator\.disablePlatformKeys\(\)/);
  });
  it('a ponte antiga recusa quem não é autorizado e não tem chave própria', () => {
    expect(src).toMatch(/keys\.platformAi === false && !keys\.gemini && !keys\.openai && !keys\.anthropic\) throw new Error\(PLATFORM_AI_BLOCKED_MESSAGE\)/);
  });
  it('a mensagem de "nenhum provedor" muda para o aviso do espaço de teste quando for o caso', () => {
    expect(src).toMatch(/userKeys\.platformAi === false\s*\n?\s*\? PLATFORM_AI_BLOCKED_MESSAGE/);
  });
  it('gbp-audit não lê mais o Serper do ambiente por conta própria', () => {
    const gbp = read('supabase/functions/gbp-audit/index.ts');
    expect(gbp).toContain('settings?.serper_api_key || aiKeys.serper');
    expect(gbp).not.toMatch(/const serperKey = [^\n]*Deno\.env\.get\("SERPER_API_KEY"\)/);
  });
});

describe('migração do espaço de teste: contratos que o código assume', () => {
  const mig = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261116060000_espaco_de_teste_e_ia_da_plataforma.sql'), 'utf8');
  it('as quatro funções existem e só a chave de serviço executa', () => {
    for (const fn of ['platform_ai_allowed(uuid)', 'provision_trial_space(uuid, text)', 'release_trial_space(uuid, text, uuid)', 'lead_trial_info(uuid[])']) {
      expect(mig).toContain(`revoke all on function public.${fn} from public, anon, authenticated;`);
      expect(mig).toContain(`grant execute on function public.${fn} to service_role;`);
    }
  });
  it('o nome dos parâmetros bate com o que o tratador e a porteira enviam', () => {
    expect(mig).toContain('platform_ai_allowed(p_user uuid)');
    expect(mig).toContain('provision_trial_space(p_user uuid, p_display_name text)');
    expect(mig).toContain('release_trial_space(p_org uuid, p_plan text, p_actor uuid)');
    expect(mig).toContain('lead_trial_info(p_users uuid[])');
  });
});
