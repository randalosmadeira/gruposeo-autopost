import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, upload, remove, from } = vi.hoisted(() => {
  const upload = vi.fn();
  const remove = vi.fn();
  return { rpc: vi.fn(), upload, remove, from: vi.fn(() => ({ upload, remove })) };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc, storage: { from } },
}));

import { createEditorialPlan, type CreateEditorialPlanInput } from '@/services/editorialPlanning';
import { prepareEditorialItems } from '@/lib/editorial-planning';

const ORG = '11111111-1111-4111-8111-111111111111';
const PLAN = '22222222-2222-4222-8222-222222222222';

function image(name: string, type = 'image/png', size = 1024): File {
  return new File([new Uint8Array(size)], name, { type });
}

function baseInput(overrides: Partial<CreateEditorialPlanInput> = {}): CreateEditorialPlanInput {
  return {
    organizationId: ORG,
    projectId: 'project-1',
    name: 'Plano de teste',
    portal: 'Blog',
    category: 'Direito',
    audience: 'Público geral',
    city: 'São Paulo',
    frequency: 'once',
    quantity: 2,
    idempotencyKey: 'editorial-plan:project-1:preview-00000000:nonce',
    items: prepareEditorialItems([{ keyword: 'Advogado criminal' }, { keyword: 'Fraude PIX' }, { keyword: 'Terceira' }]),
    rssSources: [],
    estimatedInputTokens: 1700,
    estimatedOutputTokens: 6400,
    estimatedCredits: 6,
    images: [],
    ...overrides,
  };
}

function planCreated(extra: Record<string, unknown> = {}) {
  return { data: { plan_id: PLAN, status: 'review', items: 2, ready: 2, duplicates: 0, idempotent_replay: false, ...extra }, error: null };
}

beforeEach(() => {
  rpc.mockReset(); upload.mockReset(); remove.mockReset(); from.mockClear();
  upload.mockResolvedValue({ error: null });
  remove.mockResolvedValue({ error: null });
});

describe('createEditorialPlan service', () => {
  it('sends only the requested quantity of items and never a publication flag', async () => {
    rpc.mockResolvedValueOnce(planCreated());
    const result = await createEditorialPlan(baseInput());
    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe('create_editorial_plan');
    expect(args.p_project_id).toBe('project-1');
    expect(args.p_idempotency_key).toBe('editorial-plan:project-1:preview-00000000:nonce');
    expect(args.p_items).toHaveLength(2);
    expect(JSON.stringify(args)).not.toMatch(/publish|wordpress/i);
    expect(result).toEqual({ planId: PLAN, status: 'review', ready: 2, duplicates: 0, idempotentReplay: false, uploadedImages: 0, failedImages: [], compensationFailures: [] });
  });

  it('propagates RPC failures and never touches Storage when the plan was not created', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new Error('forbidden') });
    await expect(createEditorialPlan(baseInput({ images: [image('a.png')] }))).rejects.toThrow('forbidden');
    expect(upload).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('rejects a response without plan identifier before uploading anything', async () => {
    rpc.mockResolvedValueOnce({ data: { status: 'review' }, error: null });
    await expect(createEditorialPlan(baseInput({ images: [image('a.png')] }))).rejects.toThrow(/identificador/);
    expect(upload).not.toHaveBeenCalled();
  });

  it('uploads under the organization/plan prefix and registers each image', async () => {
    rpc.mockResolvedValueOnce(planCreated()).mockResolvedValue({ data: 'asset-id', error: null });
    const result = await createEditorialPlan(baseInput({ images: [image('Foto Ação.png'), image('b.webp', 'image/webp')] }));
    expect(from).toHaveBeenCalledWith('editorial-plan-assets');
    expect(upload).toHaveBeenCalledTimes(2);
    const firstPath = upload.mock.calls[0][0] as string;
    expect(firstPath).toBe(`${ORG}/${PLAN}/1-Foto-Acao.png`);
    expect(upload.mock.calls[0][2]).toMatchObject({ upsert: true, contentType: 'image/png' });
    expect(rpc).toHaveBeenNthCalledWith(2, 'register_editorial_plan_asset', expect.objectContaining({ p_plan_id: PLAN, p_storage_path: firstPath, p_mime_type: 'image/png', p_byte_size: 1024 }));
    expect(result.uploadedImages).toBe(2);
    expect(result.failedImages).toEqual([]);
    expect(remove).not.toHaveBeenCalled();
  });

  it('reports upload failures without attempting registration or removal', async () => {
    rpc.mockResolvedValueOnce(planCreated()).mockResolvedValue({ data: 'asset-id', error: null });
    upload.mockResolvedValueOnce({ error: new Error('payload too large') }).mockResolvedValueOnce({ error: null });
    const result = await createEditorialPlan(baseInput({ images: [image('big.png'), image('ok.png')] }));
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(result.uploadedImages).toBe(1);
    expect(result.failedImages).toEqual(['big.png']);
    expect(remove).not.toHaveBeenCalled();
    expect(result.compensationFailures).toEqual([]);
  });

  it('compensates a failed registration by removing the uploaded object', async () => {
    rpc.mockResolvedValueOnce(planCreated()).mockResolvedValueOnce({ data: null, error: new Error('invalid_storage_path') });
    const result = await createEditorialPlan(baseInput({ images: [image('x.png')] }));
    expect(remove).toHaveBeenCalledWith([`${ORG}/${PLAN}/1-x.png`]);
    expect(result.uploadedImages).toBe(0);
    expect(result.failedImages).toEqual(['x.png']);
    expect(result.compensationFailures).toEqual([]);
  });

  it('records the orphaned object when the compensation itself is denied', async () => {
    rpc.mockResolvedValueOnce(planCreated()).mockResolvedValueOnce({ data: null, error: new Error('forbidden') });
    remove.mockResolvedValueOnce({ error: new Error('new row violates row-level security policy') });
    const result = await createEditorialPlan(baseInput({ images: [image('x.png')] }));
    expect(result.failedImages).toEqual(['x.png']);
    expect(result.compensationFailures).toEqual([`${ORG}/${PLAN}/1-x.png`]);
  });

  it('surfaces idempotent replays with the counters returned by the database', async () => {
    rpc.mockResolvedValueOnce(planCreated({ status: 'queued', ready: 7, duplicates: 1, idempotent_replay: true }));
    const result = await createEditorialPlan(baseInput());
    expect(result.idempotentReplay).toBe(true);
    expect(result.status).toBe('queued');
    expect(result.ready).toBe(7);
    expect(result.duplicates).toBe(1);
  });
});
