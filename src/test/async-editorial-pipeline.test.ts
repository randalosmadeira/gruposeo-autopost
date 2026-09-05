import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('durable editorial pipeline', () => {
  it('enqueues bulk articles instead of spending tokens in the browser loop', () => {
    const hook = read('src/hooks/useBulkGeneration.tsx');
    expect(hook).toContain('enqueueOnly: true');
    expect(hook).toContain('Enfileirado no Zica Brain');
    expect(hook).not.toContain('await new Promise(resolve => setTimeout(resolve, delayMs))');
  });

  it('processes text and image as separate idempotent jobs', () => {
    const generator = read('supabase/functions/generate-article/index.ts');
    const brain = read('supabase/functions/zica-brain-tick/index.ts');
    expect(generator).toContain('job_type: "article_generate"');
    expect(generator).toContain('article-generate:${article.id}:v1');
    expect(brain).toContain('job.job_type === "article_generate"');
    expect(brain).toContain('job_type: "image_generate"');
  });

  it('queues news media with its dedicated policy', () => {
    const news = read('supabase/functions/rewrite-news/index.ts');
    expect(news).toContain('moduleKey: "news"');
    expect(news).toContain('image-generate:${article.id}:news-v1');
  });

  it('falls back from OpenAI to Gemini for synthetic images', () => {
    const image = read('supabase/functions/generate-image/index.ts');
    expect(image).toContain('syntheticWithFallback');
    expect(image).toContain('provider: "gemini"');
    expect(image).toContain('provider_fallback');
  });
});
