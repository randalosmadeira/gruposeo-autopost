import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const sharedPrompt = read('supabase/functions/_shared/supporter-avatar-prompt.ts');
const vpsPrompt = read('services/zica-orchestrator/src/supporter-avatar/prompt.ts');
const pipeline = read('services/zica-orchestrator/src/supporter-avatar/pipeline.ts');
const render = read('services/zica-orchestrator/src/supporter-avatar/render.ts');
const brand = read('services/zica-orchestrator/src/supporter-avatar/brand-1470.ts');
const server = read('services/zica-orchestrator/src/server.ts');
const worker = read('services/zica-orchestrator/src/worker.ts');
const queues = read('services/zica-orchestrator/src/queues.ts');
const orchestratorPackage = JSON.parse(read('services/zica-orchestrator/package.json')) as { version: string; dependencies: Record<string, string> };
const publicApi = read('supabase/functions/supporter-avatar-public-v2/index.ts');
const approval = read('supabase/functions/approve-supporter-avatar-final/index.ts');
const legacyGenerator = read('supabase/functions/generate-supporter-avatar/index.ts');
const ui = read('src/pages/SupporterAvatar1470V2.tsx');
const migration = read('supabase/migrations/20260925150000_supporter_avatar_vps_fast_v8.sql');
const deploy = read('.github/workflows/zica-ai-vps-deploy.yml');

function directive(source: string, name: string) {
  const match = source.match(new RegExp(`export const ${name} = \`([\\s\\S]*?)\`\\.trim\\(\\);`));
  if (!match) throw new Error(`directive_missing:${name}`);
  return match[1].trim();
}

describe('Apoiadores 1470 - pipeline VPS v8 (rápido, sem selo na imagem)', () => {
  it('mantém o prompt canônico do Supabase idêntico ao do orquestrador nos blocos de diretriz', () => {
    for (const name of ['IDENTITY_GUARDIAN_DIRECTIVE', 'COMPOSITION_DIRECTOR_DIRECTIVE', 'LIGHTING_HARMONIZER_DIRECTIVE', 'FRAMING_DIRECTIVE', 'NO_TEXT_DIRECTIVE', 'NEGATIVE_PROMPT', 'SELECTOR_PROMPT', 'QA_PROMPT']) {
      expect(directive(vpsPrompt, name), name).toBe(directive(sharedPrompt, name));
    }
    expect(sharedPrompt).toContain("PIPELINE_VERSION = 'supporter-avatar-vps-v8'");
    expect(vpsPrompt).toContain("PIPELINE_VERSION = 'supporter-avatar-vps-v8'");
  });

  it('nunca pede texto, número, logotipo ou selo de IA ao modelo de imagem', () => {
    for (const source of [sharedPrompt, vpsPrompt]) {
      expect(source).not.toContain('Imagem gerada por IA');
      expect(source).not.toContain('TRANSPARÊNCIA: inserir');
      expect(source).not.toMatch(/BRANDING: inserir/);
      expect(source).toContain('PROIBIDO ABSOLUTO: qualquer texto, letra, número, logotipo, selo');
      expect(source).toContain('any text, any letters, any numbers, logo');
    }
    expect(render).not.toContain('Imagem gerada por IA - Campanha Oficial');
    expect(brand).not.toContain('gerada por IA');
  });

  it('entrega exatamente foto de perfil, feed 4:5 e story 9:16 a partir de um master 2:3', () => {
    expect(render).toContain("whatsapp: { width: 1080, height: 1080");
    expect(render).toContain("instagram: { width: 1080, height: 1350");
    expect(render).toContain("story: { width: 1080, height: 1920");
    expect(render).not.toMatch(/1200,\s*height:\s*630|landscape|portrait|square/);
    expect(render).toContain("MASTER_SIZE = { width: 1024, height: 1536, openai: '1024x1536' }");
    expect(sharedPrompt).toContain("SUPPORT_SOCIAL_OUTPUTS = ['1080x1080', '1080x1350', '1080x1920']");
    expect(approval).toContain("const PLATFORMS = ['whatsapp', 'instagram', 'story'];");
    expect(approval).toContain("story: [1080, 1920]");
    expect(approval).not.toContain('landscape');
    expect(migration).toContain("'story'::text");
    expect(migration).toContain('uq_supporter_avatar_v8_job_platform');
    expect(migration).toContain("jsonb_build_array('1080x1080', '1080x1350', '1080x1920')");
    expect(migration).toContain("o.platform in ('whatsapp', 'instagram', 'story')");
  });

  it('usa a identidade visual oficial vetorizada (logo, onça, taco, 1470, garras) e texto em caminhos', () => {
    for (const group of ['dr:', 'madeira:', 'bat:', 'jaguar:', 'num1470:', 'claws:', 'deputado:']) expect(brand).toContain(group);
    expect(brand).toContain('BRAND_COLORS = { gold: "#D7AD02", light: "#F7F4EE"');
    expect(brand).toContain('eu_apoio: { d:');
    expect(render).toContain("import sharp from 'sharp'");
    expect(render).toContain('whatsappOverlay');
    expect(render).toContain('instagramOverlay');
    expect(render).toContain('storyOverlay');
    expect(render).toContain('number1470(');
    expect(orchestratorPackage.dependencies.sharp).toBeTruthy();
  });

  it('faz uma única geração de imagem e uma única seleção de visão por pedido', () => {
    expect((pipeline.match(/api\.openai\.com\/v1\/images\/edits/g) || []).length).toBe(1);
    expect(pipeline).toContain('await generateMaster(');
    expect((pipeline.match(/await generateMaster\(/g) || []).length).toBe(1);
    expect(pipeline).toContain("form.set('size', MASTER_SIZE.openai)");
    expect(pipeline).toContain("form.set('quality', IMAGE_QUALITY)");
    expect(pipeline).toContain('await renderSupporterPack(master.bytes)');
    expect(pipeline).toContain('timings_ms');
    expect(pipeline).not.toContain('SUPPORT_SOCIAL_PACK');
  });

  it('roda na VPS: rota de despacho, fila BullMQ e worker com lock longo', () => {
    expect(server).toContain("app.post('/supporter-avatar/dispatch'");
    expect(server).toContain('crypto.timingSafeEqual');
    expect(server).toContain('dispatch_token_hash');
    expect(server).toContain("reply.code(202).send({ok:true,queued:true,pipeline:SUPPORTER_PIPELINE,runtime:'vps'})");
    expect(queues).toContain("SUPPORTER_AVATAR_QUEUE_NAME='zica-supporter-avatar'");
    expect(queues).toContain('jobId:`supporter:${data.jobId}`');
    expect(worker).toContain('processSupporterAvatarJob(job.data,job.attemptsMade+1)');
    expect(worker).toContain('lockDuration:420000');
    expect(publicApi).toContain('const WORKER_DISPATCH_URL = Deno.env.get("SUPPORTER_AVATAR_WORKER_URL") || "https://app.zica.posts.zicajuris.com.br/supporter-avatar/dispatch"');
    expect(publicApi).toContain('await fetch(WORKER_DISPATCH_URL');
    expect(publicApi).not.toContain('functions/v1/generate-supporter-avatar');
    expect(deploy).toContain('location = /supporter-avatar/dispatch {');
    expect(deploy).toContain('"version":"3.11.0"');
    expect(orchestratorPackage.version).toBe('3.11.0');
    expect(server).toContain("version:'3.11.0'");
  });

  it('aposenta o gerador Edge antigo com 410 e sem modelos inexistentes', () => {
    expect(legacyGenerator).toContain('status: 410');
    expect(legacyGenerator).toContain('supporter-avatar-vps-v8');
    expect(legacyGenerator).not.toContain('gpt-5.6-sol');
    expect(legacyGenerator).not.toContain('images/edits');
    expect(existsSync(resolve(root, 'services/zica-orchestrator/src/supporter-avatar/pipeline.ts'))).toBe(true);
  });

  it('página pública: três saídas, avatar circular e aviso de IA na página (não na imagem)', () => {
    expect(ui).toContain("const PLATFORM_ORDER = ['whatsapp', 'instagram', 'story'];");
    expect(ui).toContain('rounded-full');
    expect(ui).toContain('AI_PAGE_NOTICE');
    expect(ui).not.toContain('Imagem gerada por IA - Campanha Oficial');
    expect(ui).not.toContain('1200 × 630');
    expect(ui).not.toContain('Social Crop');
  });
});
