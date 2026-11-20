import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseQueue } from '../../supabase/functions/_shared/plugin-live-check';

/**
 * Plugin 3.19.0: aviso de versão em segundo plano + resumo da fila no /status.
 * ATENÇÃO: não há PHP nesta máquina. Estes testes LEEM O TEXTO dos arquivos PHP (contrato e regras estáticas); o PHP nunca foi executado.
 */
const read = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf8');
const PLUGIN = 'public/wordpress-plugin/zica-posts';
const main = read(`${PLUGIN}/zica-posts.php`);
const rest = read(`${PLUGIN}/includes/class-zica-posts-rest.php`);
const outbox = read(`${PLUGIN}/includes/class-zica-posts-outbox.php`);
const method = (src: string, name: string) => {
  const i = src.indexOf(`function ${name}(`);
  expect(i, name).toBeGreaterThan(-1);
  const rest = src.slice(i);
  const next = rest.slice(10).search(/\n\s*(?:public|private|protected)\s+(?:static\s+)?function /);
  return next < 0 ? rest : rest.slice(0, next + 10);
};

describe('plugin 3.19.0: aviso de versão ao Zica em segundo plano (PHP NÃO executado: checagem estática)', () => {
  it('a requisição do visitante só AGENDA; o POST ao Zica fica no evento do wp-cron e não em init', () => {
    const ensure = method(main, 'ensure_runtime');
    expect(ensure).toContain('$this->maybe_schedule_announce();');
    expect(ensure).not.toContain('wp_remote_post');
    expect(ensure).not.toContain('register_pairing');
    const sched = method(main, 'maybe_schedule_announce');
    expect(sched).toContain('wp_schedule_single_event(time() + 3, ZICA_POSTS_CRON_ANNOUNCE)');
    expect(sched).toContain("get_option('zica_posts_version_seen') === ZICA_POSTS_VERSION");
    expect(sched).toContain('wp_next_scheduled(ZICA_POSTS_CRON_ANNOUNCE)');
    expect(sched).toContain('spawn_cron');
    expect(sched).not.toContain('wp_remote_post');
    expect(main).toContain("add_action(ZICA_POSTS_CRON_ANNOUNCE, array($this, 'announce_version'));");
    expect(main).toContain("define('ZICA_POSTS_CRON_ANNOUNCE', 'zica_posts_announce_version');");
  });

  it('o aviso usa o pareamento que o servidor já aceita (ação register + chave de API), manda a versão, e só marca como avisado quando o Zica respondeu 2xx', () => {
    const ann = method(main, 'announce_version');
    expect(ann).toContain('ZICA_POSTS_PAIRING_URL');
    expect(ann).toContain("'action'=>'register'");
    expect(ann).toContain("'plugin_version'=>ZICA_POSTS_VERSION");
    expect(ann).toContain("'previous_version'=>$previous");
    expect(ann).toMatch(/wp_remote_retrieve_response_code\(\$response\) >= 200 && wp_remote_retrieve_response_code\(\$response\) < 300/);
    expect(ann).toContain("update_option('zica_posts_version_seen', ZICA_POSTS_VERSION, false)");
    expect(ann).toContain("update_option('zica_posts_pairing_registered_version', ZICA_POSTS_VERSION, false)");
    // trava de 10 minutos: falha não vira tempestade de requisições
    expect(ann).toContain("set_transient('zica_posts_pairing_registration_lock'");
    // a chave nunca vai para log nem para opção nova
    expect(ann).not.toMatch(/error_log|update_option\('zica_posts_api_key'/);
  });

  it('atualização feita pelo próprio WordPress também agenda o aviso (só quando o Zica Posts está na lista) e a desativação limpa o evento', () => {
    expect(main).toContain("add_action('upgrader_process_complete', array($this, 'on_upgrader_complete'), 10, 2);");
    const up = method(main, 'on_upgrader_complete');
    expect(up).toContain("'plugin' !== $options['type']");
    expect(up).toContain('plugin_basename(ZICA_POSTS_FILE)');
    expect(up).toContain('wp_schedule_single_event');
    expect(main).toContain('wp_clear_scheduled_hook(ZICA_POSTS_CRON_ANNOUNCE);');
  });
});

describe('plugin 3.19.0: /status traz o resumo da fila de saída (somente leitura)', () => {
  it('REST /status acrescenta outbox_summary sem tirar o campo "outbox" que o Zica antigo lê', () => {
    expect(method(rest, 'status')).toContain("'outbox'=>$this->outbox->counts(),'outbox_summary'=>$this->outbox->summary()");
  });

  it('summary() só faz SELECT, pega o erro MAIS RECENTE de falha/retentativa e passa pelo saneamento; a fila não é alterada', () => {
    const sum = method(outbox, 'summary');
    expect(sum).toContain('SELECT status,last_error,created_at');
    expect(sum).toContain("status IN ('failed','retry')");
    expect(sum).toContain('ORDER BY id DESC LIMIT 1');
    expect(sum).toContain('$this->sanitize_error(');
    expect(sum).not.toMatch(/->(update|insert|delete|query)\(|UPDATE |DELETE |INSERT /);
    for (const k of ["'counts'", "'last_error'", "'last_error_event_at'"]) expect(sum, k).toContain(k);
  });

  it('o saneamento tira endereços (token vai na URL), pares chave=valor e sequências longas, e corta em 200 caracteres', () => {
    const san = method(outbox, 'sanitize_error');
    expect(san).toContain("'[endereco]'");
    expect(san).toMatch(/api\[_-\]\?key\|token\|secret/);
    expect(san).toContain("'[oculto]'");
    expect(san).toContain('mb_substr($text,0,200)');
  });

  it('o comportamento da fila não mudou: process() continua marcando failed após 5 tentativas e nada novo apaga linhas', () => {
    expect(outbox).toContain("$attempts>=5?'failed':'retry'");
    expect(outbox).not.toMatch(/DELETE FROM|TRUNCATE|DROP TABLE/);
  });

  it('contrato com o servidor: o que o PHP devolve é exatamente o que parseQueue lê (e o plugin antigo cai em "sem motivo")', () => {
    const novo = parseQueue({ success: true, outbox: { failed: 206 }, outbox_summary: { counts: { failed: 206 }, total: 206, last_error: 'hub_http_500', last_error_event_at: '2026-11-20 14:00:00', last_error_status: 'failed' } });
    expect(novo).toMatchObject({ failed: 206, detail: true, last_error: 'hub_http_500', last_error_at: '2026-11-20 14:00:00' });
    expect(parseQueue({ success: true, outbox: { failed: 206 } })).toMatchObject({ failed: 206, detail: false, last_error: null });
  });
});

describe('plugin 3.19.0: versão em todos os lugares e fiação do servidor', () => {
  it('3.19.0 no cabeçalho, constante, manifesto, leia-me, empacotamento, fluxo e nas duas cópias de plugin-version; mínimo aceito continua 3.12.0', () => {
    expect(main).toContain('Version: 3.19.0');
    expect(main).toContain("define('ZICA_POSTS_VERSION', '3.19.0');");
    const vj = JSON.parse(read(`${PLUGIN}/version.json`));
    expect(vj.version).toBe('3.19.0');
    expect(vj.features).toEqual(expect.arrayContaining(['version_announce_push', 'outbox_summary', 'studio_pages']));
    const readme = read(`${PLUGIN}/readme.txt`);
    expect(readme).toContain('Stable tag: 3.19.0');
    expect(readme).toMatch(/== 3\.19\.0 ==[\s\S]*NAO foi executada[\s\S]*== 3\.18\.0 ==/);
    expect(read('src/lib/plugin-version.ts')).toContain("PLUGIN_VERSION='3.19.0'");
    expect(read('supabase/functions/_shared/plugin-version.ts')).toContain('PLUGIN_VERSION="3.19.0"');
    expect(read('supabase/functions/_shared/plugin-version.ts')).toContain('"outbox_summary"');
    expect(read('supabase/functions/_shared/plugin-version.ts')).toMatch(/PLUGIN_MINIMUM_VERSION="3\.12\.0"/);
    expect(read('scripts/build-wordpress-downloads.mjs')).toContain("outputName: 'zica-posts-3.19.0.zip'");
    const wf = read('.github/workflows/zica-posts-package.yml');
    expect(wf).toContain("grep -q 'Version: 3.19.0'");
    expect(wf).toContain('zica-posts-3.19.0.zip');
  });

  it('o servidor recebe o aviso: pair-wordpress-site atualiza os projetos com aquela chave; project-lifecycle liga a conferência ao vivo; ambas estão no config.toml', () => {
    const pair = read('supabase/functions/pair-wordpress-site/index.ts');
    expect(pair).toContain('applyPluginVersionPush(admin, { keyHash,');
    expect(pair).toContain('conexao.plugin_atualizado');
    const life = read('supabase/functions/project-lifecycle/index.ts');
    expect(life).toContain("live: { fetchFn: fetch, lookupA: (host: string) => Deno.resolveDns(host, 'A')");
    expect(life).toContain("admin.rpc('get_zica_wordpress_credential'");
    const toml = read('supabase/config.toml');
    expect(toml).toContain('[functions.project-lifecycle]');
    // o plugin chama o pareamento SEM login: no manifesto de runtime a função está publicada com verify_jwt=false (não está no config.toml)
    const manifest = JSON.parse(read('scripts/nexus-runtime-manifest.json')) as { functions?: Array<{ name: string; verify_jwt: boolean }> } | Array<{ name: string; verify_jwt: boolean }>;
    const list = Array.isArray(manifest) ? manifest : manifest.functions || [];
    expect(list.find((f) => f.name === 'pair-wordpress-site')?.verify_jwt).toBe(false);
  });
});
