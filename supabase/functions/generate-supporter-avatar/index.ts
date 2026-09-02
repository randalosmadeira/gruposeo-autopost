import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY') || '';
const OPENAI_IMAGE_MODEL = Deno.env.get('OPENAI_IMAGE_MODEL') || 'gpt-image-2';
const ANTHROPIC_MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-6';
const FIXED_DRIVE_FOLDER = '1NB_yQBM_2bGA5UC6JyCEgC54sjCHSyO6';
const AGENT = 'NEXUS PHOTO 1470';
const PROMPT_VERSION = 'supporter-avatar-human-v1.3.0';
const OUTPUTS: Record<string,{label:string;exactWidth:number;exactHeight:number;modelSize:string;safeZone:string}> = {
  'instagram-profile': { label:'Foto de perfil · Instagram', exactWidth:320, exactHeight:320, modelSize:'1024x1024', safeZone:'rostos e 1470 nos 72% centrais para recorte circular' },
  'whatsapp-profile': { label:'Foto de perfil · WhatsApp', exactWidth:192, exactHeight:192, modelSize:'1024x1024', safeZone:'rostos e 1470 nos 72% centrais para recorte circular' },
  'feed-square': { label:'Feed · quadrado', exactWidth:1080, exactHeight:1080, modelSize:'1024x1024', safeZone:'margem interna de 8%' },
  'feed-portrait': { label:'Feed · retrato 4:5', exactWidth:1080, exactHeight:1350, modelSize:'1024x1536', safeZone:'rostos, slogan e 1470 nos 80% centrais' },
  'feed-landscape': { label:'Feed · horizontal', exactWidth:1080, exactHeight:566, modelSize:'1536x1024', safeZone:'10% de margem lateral e 8% vertical' },
  'stories-reels-status': { label:'Stories · Reels · Status', exactWidth:1080, exactHeight:1920, modelSize:'1024x1536', safeZone:'15% topo, 18% base e 8% laterais' },
};
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth:{ persistSession:false, autoRefreshToken:false } });
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});

async function keys(){
  const read=async(provider:'openai'|'anthropic')=>{const {data,error}=await admin.rpc('get_zica_ai_provider_secret',{p_provider:provider}); return error?'':String(data||'').trim();};
  const [openai,anthropic]=await Promise.all([read('openai'),read('anthropic')]);
  return {openai,anthropic};
}
async function fetchTimeout(url:string,init:RequestInit,ms:number){const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);try{return await fetch(url,{...init,signal:c.signal});}finally{clearTimeout(t);}}
async function retry(url:string,init:RequestInit,ms:number,attempts=3){let last:unknown;for(let i=1;i<=attempts;i++){try{const r=await fetchTimeout(url,init,ms);if(r.ok||(r.status<500&&r.status!==429))return r;last=new Error(`provider_http_${r.status}`);}catch(e){last=e;}if(i<attempts)await new Promise(r=>setTimeout(r,700*2**(i-1)));}throw last instanceof Error?last:new Error('provider_request_failed');}
function b64(bytes:Uint8Array){const chunks:string[]=[];for(let i=0;i<bytes.length;i+=0x8000)chunks.push(String.fromCharCode(...bytes.subarray(i,Math.min(i+0x8000,bytes.length))));return btoa(chunks.join(''));}
function unb64(v:string){const s=atob(v),out=new Uint8Array(s.length);for(let i=0;i<s.length;i++)out[i]=s.charCodeAt(i);return out;}
function parse(text:string){const c=text.trim().replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/```$/i,'').trim();try{return JSON.parse(c);}catch{}const a=c.indexOf('{'),z=c.lastIndexOf('}');if(a>=0&&z>a)try{return JSON.parse(c.slice(a,z+1));}catch{}return null;}
function mime(name:string){const x=name.toLowerCase();return x.endsWith('.png')?'image/png':x.endsWith('.webp')?'image/webp':'image/jpeg';}
function ext(m:string){return m==='image/png'?'png':m==='image/webp'?'webp':'jpg';}

async function sources(id:string){
  const {data,error}=await admin.from('supporter_avatar_sources').select('id,storage_path,mime_type,file_size_bytes,created_at').eq('request_id',id).order('created_at',{ascending:true}).limit(4);
  if(error)throw error; const out:any[]=[];
  for(const s of data||[]){const {data:d,error:e}=await admin.storage.from('supporter-avatar-uploads').download(s.storage_path);if(e||!d)continue;const bytes=new Uint8Array(await d.arrayBuffer());out.push({...s,bytes,base64:b64(bytes)});}
  return out;
}
async function best(items:Array<{mime_type:string;base64:string}>,key:string){
  if(!key||items.length<=1)return {index:0,qa:null};
  const content:any[]=[{type:'text',text:'Escolha a melhor foto técnica do apoiador para composição. Não identifique a pessoa nem infira atributos sensíveis. Retorne JSON {"reference_index":0,"technical_source_score":0,"reason":"..."}.'}];
  items.forEach((x,i)=>{content.push({type:'text',text:`FOTO APOIADOR ${i}`},{type:'image',source:{type:'base64',media_type:x.mime_type,data:x.base64}});});
  const r=await retry('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:ANTHROPIC_MODEL,max_tokens:500,messages:[{role:'user',content}]})},45000,2);
  if(!r.ok)return {index:0,qa:{provider_error:r.status}}; const p=await r.json(); const o=parse(Array.isArray(p.content)?p.content.map((x:any)=>x.text||'').join('\n'):''); const n=Number(o?.reference_index); return {index:Number.isInteger(n)&&n>=0&&n<items.length?n:0,qa:o};
}
async function preset(slug:string){
  const {data,error}=await admin.from('supporter_avatar_candidate_presets').select('slug,label,wardrobe,prop,drive_folder_id,drive_file_name,drive_download_url,prompt_hint,is_active').eq('slug',slug).eq('is_active',true).maybeSingle();
  if(error||!data||data.drive_folder_id!==FIXED_DRIVE_FOLDER)throw new Error('candidate_preset_not_found');
  const r=await retry(data.drive_download_url,{redirect:'follow',headers:{'User-Agent':`${AGENT}/1.0`}},30000,2); if(!r.ok)throw new Error(`candidate_asset_http_${r.status}`); const bytes=new Uint8Array(await r.arrayBuffer()); if(!bytes.length||bytes.length>15*1024*1024)throw new Error('candidate_asset_size_invalid'); return {...data,mime_type:mime(data.drive_file_name),bytes,base64:b64(bytes)};
}
function promptFor(r:any,cp:any,format:any){return `AGENTE ${AGENT}. Crie UMA composição fotográfica final com duas pessoas reais. REFERÊNCIA 1=APOIADOR e REFERÊNCIA 2=DR. MADEIRA, preset ${cp.label}. Não misture, funda ou troque rostos/corpos. Preserve formato do rosto, olhos, nariz, boca, mandíbula, cabelo/barba, idade aparente, tom e textura de pele, assimetrias, roupas e acessórios. ${cp.prompt_hint||''}. Se houver chroma key/fundo verde na referência oficial, remova completamente o verde e substitua por fundo editorial coerente, preservando integralmente pessoa, roupa, cabelo, mãos e taco. Não gere um novo candidato. Estilo ${r.style}. Branding exato “${r.support_text}”, destaque 1470 sem cobrir rostos. ${format.safeZone}. Master ${format.modelSize}; final ${format.exactWidth}x${format.exactHeight}. Fotorealismo natural, sem watermark, sem CGI, sem membros extras.`;}
async function generate(s:any,c:any,prompt:string,size:string,key:string){
  const f=new FormData();f.set('model',OPENAI_IMAGE_MODEL);f.set('prompt',prompt);f.set('size',size);f.set('quality','high');f.append('image[]',new File([s.bytes],`01-supporter.${ext(s.mime_type)}`,{type:s.mime_type}));f.append('image[]',new File([c.bytes],`02-candidate.${ext(c.mime_type)}`,{type:c.mime_type}));
  const r=await retry('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:`Bearer ${key}`},body:f},150000,3);const p=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`openai_image_error:${r.status}:${p?.error?.message||'unknown'}`);const first=p?.data?.[0];if(first?.b64_json)return {bytes:unb64(first.b64_json),mimeType:'image/png',usage:p?.usage||null};if(first?.url){const ir=await retry(first.url,{},60000,2);if(!ir.ok)throw new Error(`openai_image_download_error:${ir.status}`);return {bytes:new Uint8Array(await ir.arrayBuffer()),mimeType:ir.headers.get('content-type')||'image/png',usage:p?.usage||null};}throw new Error('openai_image_missing_output');
}
async function qa(s:any,c:any,g:any,key:string){
  if(!key)return null; const content=[{type:'text',text:'REFERÊNCIA APOIADOR'},{type:'image',source:{type:'base64',media_type:s.mime_type,data:s.base64}},{type:'text',text:'REFERÊNCIA CANDIDATO'},{type:'image',source:{type:'base64',media_type:c.mime_type,data:c.base64}},{type:'text',text:'FINAL'},{type:'image',source:{type:'base64',media_type:g.mimeType,data:b64(g.bytes)}},{type:'text',text:'Avalie fidelidade visual, naturalidade, anatomia, recorte e branding. Retorne JSON com supporter_fidelity_score,candidate_reference_fidelity_score,human_texture_score,anatomy_score,crop_safe_score,branding_legibility_score,artifacts,pass. pass=true se supporter>=92,candidate>=90,texture>=92,anatomy>=90,crop>=90.'}];
  const r=await retry('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:ANTHROPIC_MODEL,max_tokens:1000,messages:[{role:'user',content}]})},60000,2);if(!r.ok)return {provider_error:r.status};const p=await r.json();return parse(Array.isArray(p.content)?p.content.map((x:any)=>x.text||'').join('\n'):'');
}

serve(async(req)=>{
  if(req.method!=='POST')return json({error:'method_not_allowed'},405);if(!SUPABASE_URL||!SERVICE_ROLE)return json({error:'service_not_configured'},503);if((req.headers.get('x-zica-internal')||'')!==SERVICE_ROLE)return json({error:'unauthorized'},401);
  let requestId='',jobId='';
  try{
    const body=await req.json();requestId=String(body.requestId||'').trim();if(!requestId)return json({error:'request_id_required'},422);
    const {data:r,error:e}=await admin.from('supporter_avatar_requests').select('*').eq('id',requestId).single();if(e||!r)return json({error:'request_not_found'},404);if(!r.consent_image_use||!r.consent_terms)return json({error:'required_consent_missing'},422);if(!r.candidate_preset_slug)return json({error:'candidate_preset_required'},422);
    const format=OUTPUTS[String(r.output_format||'feed-square')]||OUTPUTS['feed-square'];
    const {data:j}=await admin.from('supporter_avatar_jobs').select('id').eq('request_id',requestId).in('status',['queued','running']).order('created_at',{ascending:false}).limit(1).maybeSingle();jobId=j?.id||'';
    const k=await keys();if(!k.openai){await admin.from('supporter_avatar_requests').update({status:'provider_not_configured',updated_at:new Date().toISOString()}).eq('id',requestId);if(jobId)await admin.from('supporter_avatar_jobs').update({status:'provider_not_configured',error_message:'OpenAI não configurada',completed_at:new Date().toISOString()}).eq('id',jobId);return json({error:'openai_not_configured'},503);}
    await admin.from('supporter_avatar_requests').update({status:'processing',supporter_approved_at:null,updated_at:new Date().toISOString()}).eq('id',requestId);if(jobId)await admin.from('supporter_avatar_jobs').update({status:'running',attempts:1,started_at:new Date().toISOString()}).eq('id',jobId);
    const [ss,cp]=await Promise.all([sources(requestId),preset(String(r.candidate_preset_slug))]);if(!ss.length)throw new Error('no_source_images');const sel=await best(ss,k.anthropic),sp=ss[sel.index]||ss[0];
    const g=await generate(sp,cp,promptFor(r,cp,format),format.modelSize,k.openai);const path=`${requestId}/master-${r.output_format||'feed-square'}-${crypto.randomUUID()}.png`;const {error:up}=await admin.storage.from('supporter-avatar-generated').upload(path,g.bytes,{contentType:g.mimeType,upsert:false,cacheControl:'31536000'});if(up)throw up;
    const review=await qa(sp,cp,g,k.anthropic);const score=Number(review?.supporter_fidelity_score);const pass=review?review.pass===true:true;const [mw,mh]=format.modelSize.split('x').map(Number);
    await admin.from('supporter_avatar_outputs').insert({request_id:requestId,platform:'master',width:mw,height:mh,storage_path:path,mime_type:g.mimeType,model:OPENAI_IMAGE_MODEL,prompt_version:PROMPT_VERSION,qa_score:Number.isFinite(score)?score:null,qa_payload:{...(review||{}),agent:AGENT,source_selection:sel.qa,supporter_source_index:sel.index,candidate_preset_slug:cp.slug,candidate_reference_file:cp.drive_file_name,output_format:r.output_format,exact_output:`${format.exactWidth}x${format.exactHeight}`,openai_usage:g.usage,manual_supporter_approval_required:true}});
    const finalStatus=review&&!pass?'qa':'completed';await admin.from('supporter_avatar_requests').update({status:finalStatus,updated_at:new Date().toISOString(),completed_at:finalStatus==='completed'?new Date().toISOString():null}).eq('id',requestId);if(jobId)await admin.from('supporter_avatar_jobs').update({status:'completed',model:OPENAI_IMAGE_MODEL,output_payload:{output_path:path,qa_pass:pass,qa_score:Number.isFinite(score)?score:null,candidate_preset_slug:cp.slug,output_format:r.output_format,exact_output:`${format.exactWidth}x${format.exactHeight}`},completed_at:new Date().toISOString()}).eq('id',jobId);
    return json({ok:true,requestId,status:finalStatus,model:OPENAI_IMAGE_MODEL,agent:AGENT,candidatePreset:cp.slug,outputFormat:r.output_format,qa:review});
  }catch(error){const m=error instanceof Error?error.message:'unknown_error';console.error('generate-supporter-avatar:',requestId,m);if(requestId)await admin.from('supporter_avatar_requests').update({status:'failed',updated_at:new Date().toISOString()}).eq('id',requestId);if(jobId)await admin.from('supporter_avatar_jobs').update({status:'failed',error_message:m.slice(0,500),completed_at:new Date().toISOString()}).eq('id',jobId);return json({error:'generation_failed',detail:m.slice(0,240)},500);}
});