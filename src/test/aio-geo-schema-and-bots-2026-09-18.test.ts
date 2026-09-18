import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('AI crawler bot list — single source of truth', () => {
  const botsFile = read('supabase/functions/_shared/ai-crawler-bots.ts');

  it('exports AI_CRAWLER_BOTS including the previously-missing DuckAssistBot and Claude-SearchBot', () => {
    expect(botsFile).toContain('export const AI_CRAWLER_BOTS: string[]');
    expect(botsFile).toContain('DuckAssistBot');
    expect(botsFile).toContain('Claude-SearchBot');
  });

  it('documents that it must stay identical to the PHP plugin ai_bots() list', () => {
    expect(botsFile).toMatch(/class-zica-posts-discovery\.php/);
  });
});

describe('seo-agent — no more duplicated hardcoded bot arrays', () => {
  const seoAgent = read('supabase/functions/seo-agent/index.ts');

  it('imports the canonical bot list instead of hardcoding its own', () => {
    expect(seoAgent).toContain('import { AI_CRAWLER_BOTS } from "../_shared/ai-crawler-bots.ts";');
  });

  it('no longer hardcodes the old 12-bot and 4-bot inline arrays', () => {
    expect(seoAgent).not.toMatch(/\[\s*"GPTBot",\s*"OAI-SearchBot"/);
    expect(seoAgent).not.toMatch(/\["GPTBot",\s*"ClaudeBot",\s*"PerplexityBot",\s*"Google-Extended"\]/);
  });
});

describe('schema-builder — real schema.org JSON-LD, never fabricated', () => {
  const schemaBuilder = read('supabase/functions/_shared/schema-builder.ts');

  it('exports buildArticleJsonLd, buildHomepageJsonLd and extractFaqPairs', () => {
    expect(schemaBuilder).toContain('export function buildArticleJsonLd(');
    expect(schemaBuilder).toContain('export function buildHomepageJsonLd(');
    expect(schemaBuilder).toContain('export function extractFaqPairs(');
  });

  it('only emits FAQPage when 2+ real pairs are found (never fabricates Q&A)', () => {
    expect(schemaBuilder).toMatch(/pairs\.length >= 2/);
  });

  it('reuses sector-config instead of recreating LEGAL_HIGH_COMPLEXITY_SUBAREAS', () => {
    expect(schemaBuilder).toContain('from "./sector-config.ts"');
    expect(schemaBuilder).toContain('resolveLegalHighComplexitySubArea');
  });
});

describe('publish-to-wordpress — wires real json_ld_schemas into the plugin payload', () => {
  const publishToWordpress = read('supabase/functions/publish-to-wordpress/index.ts');

  it('imports the schema builder and sector mapper', () => {
    expect(publishToWordpress).toContain('buildArticleJsonLd');
    expect(publishToWordpress).toContain('mapSegmentToSector');
  });

  it('populates payload.json_ld_schemas before sending the article to the plugin', () => {
    expect(publishToWordpress).toContain('payload.json_ld_schemas = buildArticleJsonLd(');
  });
});
