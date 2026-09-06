import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { EditorialFrequency, EditorialPlanItem } from '@/lib/editorial-planning';

export interface RssSourceInput { label: string; url: string }

export interface CreateEditorialPlanInput {
  organizationId: string;
  projectId: string;
  name: string;
  portal: string;
  category: string;
  audience: string;
  city: string;
  frequency: EditorialFrequency;
  quantity: number;
  idempotencyKey: string;
  items: EditorialPlanItem[];
  rssSources: RssSourceInput[];
  sourceFileName?: string;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCredits: number;
  images: File[];
}

export interface CreateEditorialPlanResult {
  planId: string;
  status: string;
  ready: number;
  duplicates: number;
  idempotentReplay: boolean;
  uploadedImages: number;
  failedImages: string[];
}

function asRecord(value: Json): Record<string, Json | undefined> {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('Resposta inválida ao criar planejamento.');
  return value;
}

function safeFileName(name: string): string {
  const extension = name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const base = name.slice(0, Math.max(1, name.length - extension.length - 1))
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'imagem';
  return `${base}.${extension}`;
}

export async function createEditorialPlan(input: CreateEditorialPlanInput): Promise<CreateEditorialPlanResult> {
  const { data, error } = await supabase.rpc('create_editorial_plan', {
    p_project_id: input.projectId,
    p_name: input.name,
    p_portal: input.portal,
    p_category: input.category,
    p_audience: input.audience,
    p_city: input.city,
    p_frequency: input.frequency,
    p_requested_quantity: input.quantity,
    p_idempotency_key: input.idempotencyKey,
    p_items: input.items.slice(0, input.quantity).map((item) => ({
      keyword: item.keyword,
      category: item.category || null,
      intent: item.intent || null,
      volume: item.volume == null ? null : String(item.volume),
      difficulty: item.difficulty == null ? null : String(item.difficulty),
      priority: item.priority == null ? null : String(item.priority),
    })) as Json,
    p_rss_sources: input.rssSources as unknown as Json,
    p_source_file_name: input.sourceFileName || null,
    p_estimated_input_tokens: input.estimatedInputTokens,
    p_estimated_output_tokens: input.estimatedOutputTokens,
    p_estimated_credits: input.estimatedCredits,
  });
  if (error) throw error;

  const response = asRecord(data);
  const planId = String(response.plan_id || '');
  if (!planId) throw new Error('O banco não retornou o identificador do planejamento.');

  const failedImages: string[] = [];
  let uploadedImages = 0;
  for (const [index, image] of input.images.entries()) {
    const storagePath = `${input.organizationId}/${planId}/${index + 1}-${safeFileName(image.name)}`;
    const { error: uploadError } = await supabase.storage.from('editorial-plan-assets').upload(storagePath, image, {
      cacheControl: '3600',
      contentType: image.type,
      upsert: true,
    });
    if (uploadError) { failedImages.push(image.name); continue; }
    const { error: registerError } = await supabase.rpc('register_editorial_plan_asset', {
      p_plan_id: planId,
      p_storage_path: storagePath,
      p_original_name: image.name,
      p_mime_type: image.type,
      p_byte_size: image.size,
    });
    if (registerError) {
      failedImages.push(image.name);
      await supabase.storage.from('editorial-plan-assets').remove([storagePath]);
      continue;
    }
    uploadedImages += 1;
  }

  return {
    planId,
    status: String(response.status || 'review'),
    ready: Number(response.ready || 0),
    duplicates: Number(response.duplicates || 0),
    idempotentReplay: Boolean(response.idempotent_replay),
    uploadedImages,
    failedImages,
  };
}
