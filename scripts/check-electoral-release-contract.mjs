import { readFileSync, existsSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const required = (value, needle, label) => {
  if (!value.includes(needle)) throw new Error(`electoral_release_contract:${label}`);
};

const publicApi = read('supabase/functions/supporter-avatar-public-v2/index.ts');
const generator = read('supabase/functions/generate-supporter-avatar/index.ts');
const pipeline = read('services/zica-orchestrator/src/supporter-avatar/pipeline.ts');
const render = read('services/zica-orchestrator/src/supporter-avatar/render.ts');
const admin = read('supabase/functions/supporter-avatar-admin/index.ts');
const smoke = read('.github/workflows/supporter-avatar-smoke.yml');

required(publicApi, 'PIPELINE_VERSION', 'public_pipeline_sha_drift');
required(read('supabase/functions/_shared/supporter-avatar-prompt.ts'), "PIPELINE_VERSION = 'supporter-avatar-vps-v8'", 'shared_pipeline_sha_drift');
required(read('services/zica-orchestrator/src/supporter-avatar/prompt.ts'), "PIPELINE_VERSION = 'supporter-avatar-vps-v8'", 'generator_pipeline_sha_drift');
required(pipeline, 'processSupporterAvatarJob', 'vps_pipeline_entry_missing');
required(generator, 'supporter-avatar-vps-v8', 'legacy_generator_not_retired');
required(generator, 'status: 410', 'legacy_generator_still_active');
required(render, "whatsapp: { width: 1080, height: 1080", 'render_whatsapp_missing');
required(render, "instagram: { width: 1080, height: 1350", 'render_instagram_missing');
required(render, "story: { width: 1080, height: 1920", 'render_story_missing');
required(publicApi, 'reserve_supporter_avatar_create', 'abuse_reservation_missing');
required(publicApi, 'uploaded_image_integrity_invalid', 'upload_integrity_missing');
required(admin, 'requireElectoralManager(req)', 'gestor_guard_missing');
required(admin, 'get_supporter_avatar_operational_metrics', 'observability_missing');
required(smoke, "assert p.get('pipeline') == 'supporter-avatar-vps-v8'", 'smoke_pipeline_drift');

for (const action of ['create', 'upload-url', 'register-upload', 'submit', 'status', 'regenerate', 'delete']) {
  required(publicApi, `action === "${action}"`, `public_action_${action}_missing`);
}

for (const migration of [
  '20260912033000_supporter_avatar_abuse_protection.sql',
  '20260912043000_supporter_avatar_observability.sql',
  '20260912053000_supporter_avatar_data_reconciliation.sql',
  '20260925150000_supporter_avatar_vps_fast_v8.sql',
]) {
  if (!existsSync(`supabase/migrations/${migration}`)) throw new Error(`electoral_release_contract:migration_missing:${migration}`);
}

console.log('Electoral release contract: OK');
