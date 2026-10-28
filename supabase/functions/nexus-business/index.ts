import '../_shared/nexus-runtime-bootstrap.ts';
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'jsr:@supabase/supabase-js@2';
import {resolveRequestActor,RequestAuthError} from '../_shared/request-auth.ts';
import {cleanStrategy,profileGaps,planTerms,legacyStrategy} from '../_shared/nexus-business.ts';
import {validateLinkDestination,safePublicUrl} from '../_shared/nexus-intelligence.ts';
const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};
const json=(v:unknown,s=200)=>new Response(JSON.stringify(v),{status:s,headers});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});if(req.method!=='POST')return json({error:'method_not_allowed'},405);
 try{
 const actor=await resolveRequestActor(req);if(actor.mode!=='user')return json({error:'user_session_required'},403);
 const body=await req.json();const admin=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||Deno.env.get('SUPABASE_SECRET_KEY')||'',{auth:{persistSession:false}});
 if(body.action==='bootstrap'){
  const [p,b]=await Promise.all([admin.from('projects').select('id,name,domain,organization_id,nexus_business_id,nexus_strategy,nexus_strategy_version,nexus_profile_status,wordpress_url,nicho,social_instagram,social_linkedin,social_tiktok,social_youtube,social_links,editorial_identity,commercial_info,compliance_rules').eq('user_id',actor.userId).order('name'),admin.from('nexus_businesses').select('id,name,organization_id,entity_type').eq('user_id',actor.userId)]);
  if(p.error||b.error)throw new Error('load_failed');return json({projects:p.data.map(p=>({id:p.id,name:p.name,domain:p.domain,organization_id:p.organization_id,nexus_business_id:p.nexus_business_id,nexus_strategy:p.nexus_strategy,nexus_strategy_version:p.nexus_strategy_version,nexus_profile_status:p.nexus_profile_status,legacy_strategy:legacyStrategy(p)})),businesses:b.data,paid_services_blocked:true,review_mode:'autonomous'});
 }
 const {data:project,error}=await admin.from('projects').select('*').eq('id',body.projectId).eq('user_id',actor.userId).maybeSingle();if(error)throw error;if(!project)return json({error:'project_not_found'},404);
 if(body.action==='save'){
  if(!project.organization_id)return json({error:'organization_required'},409);
  const strategy=cleanStrategy(body.strategy);let businessId=project.nexus_business_id;
  if(body.businessId&&body.businessId!==businessId){const {data:b}=await admin.from('nexus_businesses').select('id').eq('id',body.businessId).eq('user_id',actor.userId).eq('organization_id',project.organization_id).maybeSingle();if(!b)return json({error:'business_boundary'},403);businessId=b.id;}
  if(!businessId){const {data:b,error:e}=await admin.from('nexus_businesses').insert({user_id:actor.userId,organization_id:project.organization_id,name:strategy.businessName||project.name,entity_type:['company','brand','product','portal','site','campaign'].includes(strategy.entityType)?strategy.entityType:'company'}).select('id').single();if(e)throw e;businessId=b.id;}
  const {data:saved,error:e}=await admin.from('projects').update({nexus_business_id:businessId,nexus_strategy:strategy}).eq('id',project.id).eq('user_id',actor.userId).eq('nexus_strategy_version',body.expectedVersion).select('id,nexus_strategy_version,nexus_profile_status').maybeSingle();if(e)throw e;if(!saved)return json({error:'profile_changed_reload'},409);
  return json({success:true,project:saved,gaps:profileGaps(strategy),paid_services_blocked:true});
 }
 if(body.action==='plan'){
  const raw=typeof body.terms==='string'?body.terms.slice(0,20000):'';if(!raw.trim())return json({error:'terms_required'},422);
  const plan=planTerms(raw,project.nexus_strategy,project.nexus_strategy_version);const {data,error:e}=await admin.from('nexus_content_plans').insert({user_id:actor.userId,project_id:project.id,strategy_version:project.nexus_strategy_version,plan}).select('id').single();if(e)throw e;return json({id:data.id,plan});
 }
 if(body.action==='history'){
  const [h,p]=await Promise.all([admin.from('nexus_strategy_history').select('version,created_at,strategy').eq('project_id',project.id).eq('user_id',actor.userId).order('version',{ascending:false}).limit(10),admin.from('nexus_content_plans').select('id,strategy_version,created_at,plan').eq('project_id',project.id).eq('user_id',actor.userId).order('created_at',{ascending:false}).limit(10)]);if(h.error||p.error)throw new Error('history_failed');return json({history:h.data,plans:p.data});
 }
 if(body.action==='diagnose'){
  const s=project.nexus_strategy||{};const candidates=[...new Set([...(String(s.sites||project.domain||'').split(/\n/)),s.blog,s.sitemapUrl,s.instagram,s.facebook,s.linkedin,s.kwai,s.tiktok,s.youtube].map(v=>String(v||'').trim()).filter(Boolean))].slice(0,100);
  const offset=Math.max(0,Math.min(96,Math.floor(Number(body.offset)||0)));
  const results=[];for(const raw of candidates.slice(offset,offset+4)){
   const url=/^https?:\/\//i.test(String(raw))?String(raw).replace(/^http:\/\//i,'https://'):`https://${raw}`;if(!safePublicUrl(url)){results.push({url,state:'invalid_url'});continue;}
   let checked:Awaited<ReturnType<typeof validateLinkDestination>>;
   try{checked=await validateLinkDestination(url,new URL(url).hostname,host=>Deno.resolveDns(host,"A"));}catch{results.push({url,state:'unavailable'});continue;}
   if(!checked.valid){results.push({url,...checked,state:'not_verified'});continue;}
   try{
    const response=await fetch(checked.url!,{redirect:'manual',signal:AbortSignal.timeout(6000),headers:{Accept:'text/html,application/xml,text/xml'}});
    if(!response.ok||!response.body){results.push({url,status:response.status,state:'not_read'});continue;}
    const reader=response.body.getReader();let bytes=0;const chunks=[];while(true){const part=await reader.read();if(part.done)break;const remaining=512000-bytes;bytes+=part.value.length;chunks.push(part.value.subarray(0,Math.max(0,remaining)));if(bytes>512000){await reader.cancel();break;}}const all=new Uint8Array(Math.min(bytes,512000));let cursor=0;for(const chunk of chunks){all.set(chunk,cursor);cursor+=chunk.length;}const html=new TextDecoder().decode(all);
    results.push({url:checked.url,state:'sample_read',http_status:response.status,title:html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.slice(0,250)||null,h1_count:(html.match(/<h1\b/gi)||[]).length,article_tags:(html.match(/<article\b/gi)||[]).length,sitemap_entries_in_sample:(html.match(/<loc\b/gi)||[]).length,truncated:bytes>512000,checked_at:new Date().toISOString()});
   }catch{results.push({url,state:'read_failed'});}
  }
  const report={method:'bounded_public_http_sample_no_ai',declared_assets:candidates.length,offset,next_offset:offset+4<candidates.length?offset+4:null,checked_assets:results.length,results,google_rank:null,bing_rank:null,ai_mentions:null,private_social_metrics:'not_connected',paid_services_blocked:true};
  const {error:e}=await admin.from('nexus_content_plans').insert({user_id:actor.userId,project_id:project.id,strategy_version:project.nexus_strategy_version,plan:{kind:'diagnostic',...report}});if(e)throw e;return json(report);
 }
 return json({error:'unknown_action'},400);
 }catch(e){if(e instanceof RequestAuthError)return json({error:e.code},e.status);console.error('[nexus-business] operation_failed');return json({error:'business_operation_failed'},500);}
});
