import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const payloads = {"supabase/functions/generate-image/index.ts": "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[... ELLIPSIZATION ...]0bMjFesP3qI7p+UNfY7pWW1zn6Zx1t/judTntZ/SWsRljKmgHbaDvQU7m+Mq49DoPlizSdApEwL3n6aFlTg2jZUH6y/4hEjJf5OqcdYCnL33x4dAwA3nm8OuzdUlj1duOhX0lzZY0Ub0vfka6GL39kfSM/bfNfgY+lOkOWKM+tPGaZzq0cQPG/5N1G2Zgs8NItDNpyCGfbxuRa35xUlOiPK8oAMFqfsxn2HdN+OG4s9W7IPjlwaUTmFiKvg9O5zYT7j7/QLLqnUnu50DfRjDaa2G+vA1OsudSNMswjz2NFvRLXzGfwbP03gT3gY/6Hn/3IfeMD+z3sft/8AEYfY3kKFAAA=", "supabase/migrations/20260903183000_repost_pipeline_runtime_guards.sql": "H4sIADvCmWoC/+1Y32/bNhB+119xDwFsF/6RdGu3xe1ehj30ZcDavg2DQElnmQlNqiTlxP3rd0dKlvwjib20BTY0AeKYPN4dv/vuE6kMS6nnSSK1Q+tBam/AeWNFidOszm/ROxjKYgxarHAMVZ0pmY9hIRWmTn7GVMmV9GMQSpk7LNKVXGHqNxW6UbIWqkZangAMhPUyVziRK/LsBuMHxrytkT+vXv308ufXP17y/8JasflrEKxmNxWWgzE03yrd+3KHWTX4OxklRkNu9IIS9Zz7CAoDdVUIj4lDTx7jLuAt4H2u6gKLabMvmtvbWd9of9Oc28G2+wsOZwnp3CJlAsaCxUqJHGFR69xLyjpmMS2kq4TPl2kDUGqdS9do5ULmgg0Z0Wo7KwuoaypRGKypjO0IQWHR11Y7yCSV2SdK6LImrKBSVek+KcIjr630GyhwITVaBggcCkvRKYcl7aYt+VrUigqtkf5UZepxVSXCwcVFUmCuhEWKv07JIcUEj/d+HgYsfiISeM4pJjFPMuYcTTpUSCWi5XZTecIpLqYZiERcdyMLa1Yxhem+vaPpuyVaDByljAefCac0s0LqVNTerAJo6S1uBmQay3pFlaAoiy5l6UDXSnFhFOrSL4ft1AjewNVr8EvUITdy7JCrjFUo28PxUm18ylyUZW2xGDAkqAuKG8I3ABCk06X3VVoZ54chRG0VXNNOeNhdz2Z1JpY2K8W9vb25v1UbbzI1dXUlMuFwmptZyyE3W1/NAlc2kztji8qicxMiUGgvgCWKAq1j5zfO6CzNaqmK1GQ3lEmMTZ35m9EetZ98JM5yg4mqUg33ZryscUaW9xPe/KTb9oRhHvdLBzCK5pkpNk8EFmETHDLuoQvUsP1dQZN97m8NmPnNbNME/dieWtDUnlpRKaoe1aQIIPxwST9kMWoZ1/E1lCg20N44lXCeXFyQgcW1uUWWASAinN/IoXFDs44ixdtuE9po+lsz6TxbI4UsrdCeiEdNywry3IAs9WjXMic7o/A8baoIBKnLgwhu+F11vqvOf1V1KmtySr1ldxcx1I8sXl6eoiqvv4mqPNKCX1RMHovzbzRkJeztjkIpucB8Q9962uGtLEuShueIx65gtAJA7efL1FTcs+/++PD7+4+DrstoUuPd1Hnha3d9zYrCdsGjW1IzEZhFaFm5GLLldial7iEGDUahp42Pfb11DMEv7zb6Do1me1SbBzNUDh+35+ZuOiNT2C5r2ru/LpaKEhOeF3M6xwxiLVO0lkr2tJ3wDKkP+VxGu4bNZL6nNF8NTHJsVLHrmAyJsV4S1yL7e3EaRJmUvG4nzOHCg0zOruIJRTi9DKcXomMB0egkjPbL0wL1fKTOYe83ZmyPoX3qdvr7tIShJt2u8eFz1v9ZyCq0C2NXpx862X14h0Cfzdl8dKhbbS2aap6jIzGxszbULRlu1eEbSkpcPupg/WKgdpDuANqxu7BEmYaVDC3eU6rM0zK9ukwffjhDR/9m3s3bVmndPemEyEvbRGjeNxF68c0MmAVE7JuXTFugDqMm5AFQ5Euw5i5pTzDnnDIeR+GXy/Sp/j4VixNcJWLhOYWvDsjTmsWwmP271Y3JHrlG0SxNNqfcaNrem3Jr9JSGthcl+r9/V+L7wSTmFs/wjfzbo/elJo2jktT2TohYa5cTVDXVuV012tOTHfutdXD1RGbx2D94MXsFL+JvO9TgccbZec77HIXOhNCYTeH3ixvfWfaepW8hF80pkYDVcJrGn6Dvu0eZ7Xn06JM7IjpuMus/ueMDeXdm55H9iMH2WU2P6iSyprfx5rKcRNkdfpF9s+UOtsc2Ozoa8s2vBzF7nnj2mCs+X5jVim5iz36Dw73hYPAnt7UDQVfdWhdYAN/o+/yF9x8+wI583Um/pIsrqR7ZUrG5/NBdpyFeo6d0Pjsl18feBe2kyFGo+aQpZL7NlgLZDWTsCVjIONnw9sLGZDiLkIYk+fkHWspLm7AYAAA=", "src/test/repost-runtime-guards.test.ts": "H4sIADvCmWoC/51UwW7bOBC95ysGvVgBInu3vRRZeINs4BYBGrS1HaA3gaJGNhGKZGdIJ27Qf9+h5KZxi4W9OcgS4Hnz3rzHoemCpwiPQKiad8biYus0fIeWfAcj5xs8b3n014n5WcfebnC/JKi4fl7UIGsyNZ4BPgTU8QxMfEJsTESOUn6ivePYM8MUitzkHDiScatTmP69J6nY8RaBvEbmsb5vitMzyCB5jVJs345OpecP6mJEGHxun1w0HcIqKWp4dAZF3/zxBERUMaqt13cMrbKMUCd7B9p3wWI03sH9Gh0oB6ZTKwTD0CnXqOhpu9cHYJiEfSKNMktWXoyY9GTt/R1PEuM/0vo9OiSVO48jP2S5GTtYVAzg03H0V95FZVye4GsyhE3V81edYRZvDuJeDWp60HzXQkTl4aSkNauL8WpQgte5huHiAiIlfHVQ0SAkmIDWOPwPJc7H55j8YVwS5zwwdoOubsB+z5ENQYhHDLVPrhG1DUakzjjD0eid/YxWWHIs0gqC/K8cughI5Am0VeJOa3Tv71HxpKBqxThpk+v78uSHLWXPODGi5UGiOpzUQHBz+aW6vrl8P6sul8vZzaflQsjeHEbvTVu25gGbMnhvy83rYw5JpK2qLZ4Ph/gwQpHQ2N2QfFyIK4wfSa9lcSmf/3eebhnptxDvEAPDYvZRLCfaxZVtDCg/ElZ/BQx5rp62AeqtJN6qZOMLg1NO2e03LBl9qZqNchqbF8V3OV9eX32YLapPs3k1n32+nS2WQvznH4ebGBdSHKPjRDhsLEyn036xDoOt7aqNYVMba+K2YrHvCJSsk5Ll0pVKce3pF+SzXKzpTGSYLxawQXpaE4ge4poQATdG8tFY1qjyBQwqRuxC5BcG0rNsy3tPTZCrm0tiflEgIvl/bpMwVSHVdjdj9XxgPg6u8zVJHTbHle9dzNn1/PwLB2jdL1oHAAA="};

function writePayload(relativePath, encoded) {
  const target = path.resolve(relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, zlib.gunzipSync(Buffer.from(encoded, 'base64')));
  console.log(`[write] ${relativePath}`);
}

function replaceOnce(source, pattern, replacement, label) {
  const matches = source.match(pattern);
  if (!matches) throw new Error(`[patch:${label}] padrão não encontrado`);
  const next = source.replace(pattern, replacement);
  if (next === source) throw new Error(`[patch:${label}] nenhuma alteração aplicada`);
  return next;
}

for (const [relativePath, encoded] of Object.entries(payloads)) {
  writePayload(relativePath, encoded);
}

{
  const file = 'src/hooks/useBulkGeneration.tsx';
  let source = fs.readFileSync(file, 'utf8');

  const imageHelper = `// Generate a featured image with bounded retries and server-side idempotency
async function generateImageWithRetry(
  title: string,
  keyword: string,
  segment: string,
  accessToken: string,
  options: {
    articleId?: string;
    projectId?: string;
    moduleKey: string;
    idempotencyKey: string;
  },
  maxRetries = 3
): Promise<string | null> {
  const boundedAttempts = Math.max(1, Math.min(3, maxRetries));

  for (let attempt = 1; attempt <= boundedAttempts; attempt++) {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-image`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            title,
            keywords: keyword,
            segment: segment || 'general',
            style: 'photorealistic',
            aspectRatio: '16:9',
            quality: 'high',
            articleId: options.articleId,
            projectId: options.projectId,
            moduleKey: options.moduleKey,
            attemptNumber: attempt,
            idempotencyKey: options.idempotencyKey,
            allowAiGeneration: false,
            returnImage: true,
          }),
        }
      );

      const data = await response.json().catch(() => ({}));
      const image = data?.image_url || data?.image;
      if (response.ok && data?.success !== false && image) return String(image);

      const retryable = response.status === 429 || response.status >= 500 || data?.retryable === true;
      if (!retryable || attempt >= boundedAttempts) {
        console.error('[generate-image] falha permanente ou limite atingido', {
          status: response.status,
          code: data?.code,
          error: data?.error,
          requestId: data?.request_id,
        });
        return null;
      }

      const waitMs = Math.min(300_000, Math.max(2_000, Number(data?.retryAfterSeconds || 0) * 1_000 || RETRY_DELAY_MS * attempt));
      await new Promise(resolve => setTimeout(resolve, waitMs));
    } catch (error) {
      console.error(`Image generation attempt ${attempt} failed:`, error);
      if (attempt >= boundedAttempts) return null;
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
    }
  }

  return null;
}

export function useBulkGeneration`;

  source = replaceOnce(
    source,
    /\/\/ Generate image with retry logic\nasync function generateImageWithRetry\([\s\S]*?\n}\n\nexport function useBulkGeneration/,
    imageHelper,
    'bulk-image-helper'
  );

  const imageBlock = `    // Generate the mandatory image only when the project policy requires it.
    const imageRequired = bulkConfig?.generateImages ?? true;
    let imageUrl: string | null = null;

    if (imageRequired) {
      onProgress(content, 88, 'Selecionando imagem autorizada...');
      const titleMatch = content.match(/^#\s*(.+)$/m) || content.match(/TITLE_SEO:\s*(.+?)-->/);
      const extractedTitle = titleMatch?.[1]?.trim() || job.keyword.keyword;
      const imageIdempotencyKey = `bulk:${job.id}:featured:v2`;

      imageUrl = await generateImageWithRetry(
        extractedTitle,
        job.keyword.keyword,
        bulkConfig?.segment || 'general',
        session.access_token,
        {
          articleId: job.articleId,
          projectId: projectId && projectId !== 'none' ? projectId : undefined,
          moduleKey: 'article',
          idempotencyKey: imageIdempotencyKey,
        },
        MAX_RETRIES
      );

      if (!imageUrl) {
        throw new Error('required_image_missing: a imagem obrigatória não foi confirmada após as tentativas permitidas');
      }
      onProgress(content, 95, 'Imagem confirmada e vinculada!');
    } else {
      onProgress(content, 95, 'Imagem dispensada pela configuração do projeto.');
    }

    // Return content and image. Mandatory image failure is terminal and cannot become completed.
    onProgress(content, 100, imageUrl ? 'Concluído com imagem!' : 'Concluído sem imagem por configuração!');

    return { content, articleId: job.articleId || null, imageUrl };
  };`;

  source = replaceOnce(
    source,
    /    \/\/ Generate image with retry logic \(always generate images\)[\s\S]*?    return \{ content, articleId: job\.articleId \|\| null, imageUrl \};\n  \};/,
    imageBlock,
    'bulk-image-required'
  );

  source = source.replace(
    "currentStep: imageUrl ? 'Completo com imagem!' : 'Completo!',",
    "currentStep: imageUrl ? 'Completo com imagem confirmada!' : 'Completo sem imagem por configuração do projeto!',"
  );

  if (source.includes('Continuando sem imagem')) throw new Error('[patch:bulk] fallback silencioso ainda presente');
  if (!source.includes('required_image_missing')) throw new Error('[patch:bulk] guarda de imagem obrigatória ausente');
  fs.writeFileSync(file, source);
  console.log(`[patch] ${file}`);
}

{
  const file = 'src/hooks/useImageGeneration.tsx';
  let source = fs.readFileSync(file, 'utf8');
  source = replaceOnce(
    source,
    /  model\?: string;\n}/,
    `  model?: string;
  articleId?: string;
  projectId?: string;
  moduleKey?: string;
  allowAiGeneration?: boolean;
  idempotencyKey?: string;
}`,
    'image-request-fields'
  );

  const helper = `  // Generate a single image with a bounded client retry. The server selects up to three fixed assets.
  const generateSingleImage = useCallback(async (
    request: ImageRequest,
    accessToken: string,
    imageIndex?: number,
    attempt: number = 0
  ): Promise<GeneratedImage | null> => {
    const maxClientAttempts = 2;
    try {
      const modifiedRequest = imageIndex && imageIndex > 0
        ? {
            ...request,
            title: `${request.title} - perspectiva ${imageIndex + 1}`,
            context: `${request.context || ''} Gere uma composição diferente dentro do conjunto de ativos autorizado.`.trim(),
          }
        : request;
      const idempotencyKey = request.idempotencyKey || `ui-image:${request.articleId || request.title}:${imageIndex || 0}:v2`;

      const response = await fetch(GENERATE_IMAGE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          ...modifiedRequest,
          moduleKey: request.moduleKey || 'article',
          allowAiGeneration: request.allowAiGeneration === true,
          attemptNumber: attempt + 1,
          idempotencyKey,
          returnImage: true,
        }),
      });

      const data = await response.json().catch(() => ({ error: 'Resposta inválida' }));
      const image = data?.image_url || data?.image;
      if (response.ok && data?.success !== false && image) {
        return {
          image: String(image),
          alt: String(data.alt || request.title),
          title: String(data.title || request.title),
          prompt: String(data.prompt || ''),
          model: String(data.model || data.source || 'deterministic-fixed-pool-v2'),
        };
      }

      const retryable = response.status === 429 || response.status >= 500 || data?.retryable === true;
      if (retryable && attempt + 1 < maxClientAttempts) {
        const waitMs = Math.min(300_000, Math.max(2_000, Number(data?.retryAfterSeconds || 0) * 1_000 || 3_000));
        await new Promise(resolve => setTimeout(resolve, waitMs));
        return generateSingleImage(request, accessToken, imageIndex, attempt + 1);
      }

      console.error(`Image ${(imageIndex || 0) + 1} generation error:`, data);
      return null;
    } catch (error) {
      console.error(`Image ${(imageIndex || 0) + 1} generation error:`, error);
      if (attempt + 1 < maxClientAttempts) {
        await new Promise(resolve => setTimeout(resolve, 3_000));
        return generateSingleImage(request, accessToken, imageIndex, attempt + 1);
      }
      return null;
    }
  }, []);`;

  source = replaceOnce(
    source,
    /  \/\/ Generate a single image\n  const generateSingleImage = useCallback\(async \([\s\S]*?\n  }, \[\]\);/,
    helper,
    'single-image-helper'
  );

  fs.writeFileSync(file, source);
  console.log(`[patch] ${file}`);
}

{
  const file = 'src/pages/ArticlesList.tsx';
  let source = fs.readFileSync(file, 'utf8');

  source = source.replace(
    "description: 'Gerando conteúdo, links, CTAs, FAQ e imagens. Isso pode levar alguns minutos.',",
    "description: 'Corrigindo conteúdo, HTML, links, CTAs, FAQ, SEO, GEO e AEO. Imagens não são disparadas por esta ação.',"
  );
  source = source.replace(
    "body: { article_ids: batch, mode: 'optimize' },",
    "body: { article_ids: batch, mode: 'optimize', ensure_image: false },"
  );
  source = source.replace(
    "title: `🖼️ Gerando imagens para ${ids.length} artigos...`,\n      description: 'Criando imagens cinematográficas com IA.',",
    "title: `🖼️ Processando imagens para ${ids.length} artigos...`,\n      description: 'Selecionando ativos autorizados, com limite de tentativas e sem geração sintética automática.',"
  );

  const oldImageRequest = /          const response = await fetch\(`\$\{import\.meta\.env\.VITE_SUPABASE_URL\}\/functions\/v1\/generate-image`, \{[\s\S]*?          } else failedCount\+\+;/;
  const newImageRequest = `          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-image`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              title: article.title,
              keywords: article.keyword,
              context: article.excerpt || '',
              segment: project?.nicho || 'general',
              aspectRatio: '16:9',
              quality: 'high',
              articleId: article.id,
              projectId: article.project_id,
              moduleKey: 'article',
              allowAiGeneration: false,
              attemptNumber: 1,
              idempotencyKey: `articles-list:${article.id}:featured:v2`,
              returnImage: false,
            }),
          });

          const data = await response.json().catch(() => ({ success: false, error: `HTTP ${response.status}` }));
          if (response.ok && data.success !== false && data.image_url) {
            successCount++;
          } else {
            failedCount++;
            console.error('[bulk-image] falha', {
              articleId,
              status: response.status,
              code: data?.code,
              error: data?.error,
              retryable: data?.retryable,
              requestId: data?.request_id,
            });
          }`;
  source = replaceOnce(source, oldImageRequest, newImageRequest, 'articles-list-image-request');

  if (!source.includes("ensure_image: false")) throw new Error('[patch:articles-list] SEO ainda pode disparar imagem');
  if (!source.includes("allowAiGeneration: false")) throw new Error('[patch:articles-list] geração sintética ainda não foi bloqueada');
  if (source.includes("image_source: 'ai-bulk-generated'")) throw new Error('[patch:articles-list] origem de imagem falsa ainda presente');
  fs.writeFileSync(file, source);
  console.log(`[patch] ${file}`);
}

console.log('Repost runtime patch applied successfully.');
