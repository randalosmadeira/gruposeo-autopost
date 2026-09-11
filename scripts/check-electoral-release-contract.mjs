import { readFileSync, existsSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const required = (value, needle, label) => {
  if (!value.includes(needle)) throw new Error(`electoral_release_contract:${label}`);
};

const publicApi = read('supabase/functions/supporter-avatar-public-v2/index.ts');
const generator = read('supabase/functions/generate-supporter-avatar/index.ts');
const admin = read('supabase/functions/supporter-avatar-admin/index.ts');
const smoke = read('.github/workflows/supporter-avatar-smoke.yml');

required(publicApi, 'supporter-avatar-resumable-v7', 'public_pipeline_sha_drift');
required(generator, "supporter-avatar-resumable-v7", 'generator_pipeline_sha_drift');
required(publicApi, 'reserve_supporter_avatar_create', 'abuse_reservation_missing');
required(publicApi, 'uploaded_image_integrity_invalid', 'upload_integrity_missing');
required(admin, 'requireElectoralManager(req)', 'gestor_guard_missing');
required(admin, 'get_supporter_avatar_operational_metrics', 'observability_missing');
required(smoke, "assert p.get('pipeline') == 'supporter-avatar-resumable-v7'", 'smoke_pipeline_drift');

for (const action of ['create', 'upload-url', 'register-upload', 'submit', 'status', 'regenerate', 'delete']) {
  required(publicApi, `action === "${action}"`, `public_action_${action}_missing`);
}

for (const migration of [
  '20260912033000_supporter_avatar_abuse_protection.sql',
  '20260912043000_supporter_avatar_observability.sql',
  '20260912053000_supporter_avatar_data_reconciliation.sql',
]) {
  if (!existsSync(`supabase/migrations/${migration}`)) throw new Error(`electoral_release_contract:migration_missing:${migration}`);
}

console.log('Electoral release contract: OK');
