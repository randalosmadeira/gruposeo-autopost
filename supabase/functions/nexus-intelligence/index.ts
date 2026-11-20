import { serperRequest, serperRegionalInputs } from "../_shared/serper-request.ts";
import { providerFetch } from '../_shared/nexus-provider-fetch.ts';
import { bindSpendIdentity } from '../_shared/spend-gate.ts';
import '../_shared/nexus-runtime-bootstrap.ts';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {allowWordPressBase,scopedServe} from '../_shared/nexus-spend-lock.ts';
import { PROVIDER_CATALOG, isProviderId, isCatalogId, validateCredentialFormat, secretFormatError, MAX_SECRET_LENGTH, runHealthChecks, buildProvidersOverview, executionGate, validateExecutionSettings, providersEnabledFrom } from '../_shared/nexus-providers.ts';
import { createClient } from "jsr:@supabase/supabase-js@2";
import { resolveRequestActor, RequestAuthError } from "../_shared/request-auth.ts";
import { parseSerp, parseAiObservation, SAMPLING_METHOD, AUTONOMOUS_REVIEW_PROMPT, validateAutonomousReview, isInformationalArticle, validateLinkDestination, topicGroups, insertDraftLink } from "../_shared/nexus-intelligence.ts";
import { isObservationEngine, isExecutableEngine, engineKind, ENGINE_PROVIDER, normalizeObservation, manualRequestKey, runRequestKey, normalizePromptSet, normalizePrompt, normalizeOrigins, buildHomepageSchemaFromProfile, generateSiteId, generateSiteSecret, buildSignalsSnippet, parseGeminiObservation, parseClaudeObservation, parsePerplexityObservation } from "../_shared/nexus-intelligence.ts";
import { isPluginModeProject, resolvePluginKey, resolvePluginNamespace, pluginRequest } from "../_shared/wordpress-plugin-client.ts";
import { runCollector } from "../_shared/nexus-collectors.ts";
import { syncSearchPerformance } from "../_shared/nexus-search-sync.ts";
import { syncGa4, isValidPropertyId } from '../_shared/nexus-ga4.ts';
import { canManagerOperateOnForeignProject, canOrgAdminOperateOnProject, isOrgAdminRole, checkActionPolicy, isCollectionPlanning, ga4ErrorStatus, integrationsRpcError, integrationsView, isManagerOnlyAction, isTechnicalAction, isUuid, loadViewer, makeManagementStore, parseIntegrationsInput, parseRequestCreate, parseRequestsFilter, parseRequestUpdate, redactOverviewForClient, requestRpcError, type ViewerContext } from '../_shared/nexus-management.ts';
import { editorialFingerprint, signEditorialReceipt } from "../_shared/nexus-approval.ts";
import { normalizeEditorialHtml } from "../_shared/editorial-html.ts";
const cors = { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods":"POST, OPTIONS", "Content-Type":"application/json" };
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors});
const text=(value:unknown,max=2000)=>typeof value==='string'?value.trim().slice(0,max):'';
const isDay=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v));
/** Período (UTC) de `ga4_summary`/`content_performance`: padrão = últimos 28 dias; no máximo 366 dias. */
const periodOf=(body:Record<string,unknown>):{from:string;to:string}|null=>{
 const to=isDay(body.to)?body.to:new Date().toISOString().slice(0,10);
 const from=isDay(body.from)?body.from:new Date(Date.parse(to)-27*86400000).toISOString().slice(0,10);
 return from>to||Date.parse(to)-Date.parse(from)>366*86400000?null:{from,to};
};
const PROJECT_COLS='id,name,description,nicho,compliance_rules,domain,wordpress_url,organization_id,user_id,editorial_identity,commercial_info,social_links,cta_leads,cta_conclusao,social_instagram,social_linkedin,social_youtube,social_twitter,social_tiktok,social_google_maps,nexus_strategy,nexus_strategy_version,nexus_profile_status,wordpress_connector_mode,wordpress_username,wordpress_credential_ref,wordpress_app_password,wordpress_plugin_namespace';
// Chamadas a provedores: fetch original (capturado antes do spend lock), URL montada pelo servidor, sem redirecionamento automático.
import { handleManagedOAuth } from "../_shared/nexus-managed-oauth-flow.ts";
const pf=((input:RequestInfo|URL,init?:RequestInit)=>providerFetch(input,{...init,redirect:'manual'})) as typeof fetch;
scopedServe(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 if(req.method!=='POST')return json({error:'method_not_allowed'},405);
 let operationId=''; let reserved=false;
 const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||Deno.env.get('SUPABASE_SECRET_KEY')||'';
 const admin=createClient(Deno.env.get('SUPABASE_URL')||'',key,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const body=await req.json(); const actor=await resolveRequestActor(req,body.userId);
  // chamada interna (modo serviço): o corpo já foi lido, então as pistas de identidade do gasto são informadas aqui (lote da curadoria)
  if(actor.mode==='service')bindSpendIdentity({userId:actor.userId,projectId:isUuid(body.projectId)?body.projectId:undefined});
  const action=typeof body.action==='string'?body.action:'';
  const mgmt=makeManagementStore(admin);
  let {data:project,error:projectError}=await admin.from('projects').select(PROJECT_COLS).eq('id',body.projectId).eq('user_id',actor.userId).maybeSingle();
  // O gestor (CEO) opera projetos de organizações clientes nas ações de Motores & APIs sem ser o dono do projeto; nenhuma outra ação ganha esse acesso.
  let foreignManager=false;
  if(!project&&!projectError&&actor.mode==='user'&&isUuid(body.projectId)&&canManagerOperateOnForeignProject(action)&&await mgmt.isManagerUser(actor.userId)){
   const foreign=await admin.from('projects').select(PROJECT_COLS).eq('id',body.projectId).maybeSingle();
   project=foreign.data;projectError=foreign.error;foreignManager=!!foreign.data;
  }
  // Co-dono/admin da organização do projeto (14/11/2026): ações do Observatório e da coleta em projeto de outro membro da MESMA organização.
  if(!project&&!projectError&&actor.mode==='user'&&isUuid(body.projectId)&&canOrgAdminOperateOnProject(action)){
   const shared=await admin.from('projects').select(PROJECT_COLS).eq('id',body.projectId).maybeSingle();
   if(shared.data?.organization_id&&isOrgAdminRole(await mgmt.activeMemberRole(String(shared.data.organization_id),actor.userId))){project=shared.data;projectError=null;}
  }
  if(projectError||!project?.organization_id)return json({error:'project_forbidden'},403);
  const org=project.organization_id;
  if(!foreignManager){
   const {data:membership,error:membershipError}=await admin.from('organization_members').select('organization_id').eq('organization_id',org).eq('user_id',actor.userId).eq('status','active').maybeSingle();
   if(membershipError||!membership)return json({error:'organization_membership_required'},403);
  }
  let host='';try{host=new URL(project.wordpress_url||(project.domain?`https://${project.domain}`:'')).hostname;}catch{host='';}
  // Capacidade do visualizador (plano de gerenciamento): gestor, ou dono/admin de organização INTERNA. Dono de organização cliente não passa.
  let viewerPromise:Promise<ViewerContext>|null=null;
  const getViewer=()=>(viewerPromise??=loadViewer(mgmt,org,actor.userId));
  if(isTechnicalAction(action)||isManagerOnlyAction(action)){
   if(actor.mode!=='user')return json({error:'interactive_owner_required'},403);
   const decision=checkActionPolicy(action,(await getViewer()).viewer);
   if(!decision.ok)return json({error:decision.error},403);
  }
  if(['oauth_start','oauth_finish','oauth_properties','oauth_bind','oauth_ga4_test','oauth_bing_audit'].includes(action)){
   const delegatedBing = body.provider === 'bing' && project.id === 'fab1032d-56a4-4e59-b3d4-4a68d3d4bf0a' && actor.userId === '6e947b31-0699-475e-b079-192e3650b0e0';
   if(actor.mode!=='user'||(foreignManager&&!delegatedBing)||(action==='oauth_bing_audit'&&!delegatedBing))return json({error:'oauth_project_forbidden'},403);
   try{return json(await handleManagedOAuth(admin,pf,body,project.id,org,actor.userId));}
   catch(e){if(action==='oauth_bing_audit'){console.warn('bing_audit_failure', e instanceof Error ? e.name : 'unknown');return json({error:'bing_audit_request_failed'});}return json({error:'oauth_operation_failed'},400);}
  }
  // Planejar coleta paga (prepare de serp/ai_observation/pilot, prepare_pilot, prepare_prompt_run): só a conta de gerenciamento. Não afeta editorial_review.
  if(actor.mode==='user'&&isCollectionPlanning(action,body.kind)){
   const planningPolicy=checkActionPolicy('execute_collection',(await getViewer()).viewer);
   if(!planningPolicy.ok)return json({error:planningPolicy.error,executed:false},403);
  }
  if(body.action==='status'){
   const [program,operations,credentials,jobs]=await Promise.all([
    admin.from('nexus_programs').select('*').eq('organization_id',org).maybeSingle(),
    admin.from('nexus_operations').select('*').eq('organization_id',org).eq('project_id',project.id).order('created_at',{ascending:false}).limit(40),
    admin.from('organization_provider_credentials').select('provider,status,updated_at').eq('organization_id',org),
    admin.from('zica_brain_jobs').select('job_type,status,attempts,updated_at').eq('user_id',actor.userId).in('status',['dead_letter','processing']).limit(1000),
   ]);
   return json({program:program.data||{budget_usd_micros:0,execution_enabled:false,review_mode:'autonomous'},operations:operations.data||[],credentials:credentials.data||[],jobs:jobs.data||[],method:SAMPLING_METHOD});
  }
  if(body.action==='initialize'){
   const {error}=await admin.from('nexus_programs').upsert({organization_id:org},{onConflict:'organization_id',ignoreDuplicates:true});
   if(error)throw error; return json({success:true,budget:0,execution_enabled:false,review_mode:'autonomous'});
  }
  if(body.action==='store_credential'){
   if(actor.mode!=='user')return json({error:'interactive_owner_required'},403);
   const provider=text(body.provider,20);
   if(!isProviderId(provider))return json({error:'unsupported_provider'},400);
   if(typeof body.secret==='string'&&body.secret.length>MAX_SECRET_LENGTH)return json({error:secretFormatError('tamanho_maximo_4096')},400);
   const checked=validateCredentialFormat(provider,body.secret);
   if(!checked.ok)return json({error:secretFormatError(checked.hint)},400);
   const {data,error}=await admin.rpc('nexus_provider_secret',{p_org:org,p_actor:actor.userId,p_provider:provider,p_secret:checked.secret});
   if(error)return json({error:'credential_not_stored_check_role_and_value'},403);
   // Teste gratuito logo após salvar; provedores com custo ficam "stored_unverified" até um teste confirmado.
   let health=null;
   if(PROVIDER_CATALOG[provider].health_cost==='free'){
    const [result]=await runHealthChecks(admin,{organizationId:org,triggeredBy:actor.userId,providers:[provider],confirmCost:false,fetchFn:pf,ga4Property:text(project.commercial_info?.ga4_property_id,20)||null});
    health=result||null;
   }
   const {data:stored}=await admin.from('organization_provider_credentials').select('status,secret_last_four').eq('organization_id',org).eq('provider',provider).maybeSingle();
   return json({success:true,status:stored?.status||data,last_four:stored?.secret_last_four||null,health});
  }
  // ---- Motores & APIs (12/11/2026): visão geral, remoção, saúde e liberação da execução paga ----
  if(body.action==='providers_overview'){
   if(actor.mode!=='user')return json({error:'interactive_owner_required'},403);
   const {data,error}=await admin.rpc('nexus_providers_overview',{p_org:org});
   if(error)throw error;
   const {viewer}=await getViewer();const overview=buildProvidersOverview(data,org);
   // Quem não gerencia recebe só o status simplificado: sem últimos 4 dígitos, detalhe de saúde, quota nem orçamento.
   return json(viewer.can_manage_technical?{...overview,viewer,viewer_is_admin:true}:{...redactOverviewForClient(overview),viewer,viewer_is_admin:false});
  }
  if(body.action==='provider_credential_remove'){
   if(actor.mode!=='user')return json({error:'interactive_owner_required'},403);
   const provider=text(body.provider,20);
   if(!isProviderId(provider))return json({error:'unsupported_provider'},400);
   const {error}=await admin.rpc('nexus_provider_secret_remove',{p_org:org,p_actor:actor.userId,p_provider:provider});
   if(error)return json({error:'credential_not_removed'},500);
   const {data:current}=await admin.from('nexus_programs').select('settings').eq('organization_id',org).maybeSingle();
   const enabled=providersEnabledFrom(current?.settings);
   if(current&&enabled.includes(provider)){
    const {error:settingsError}=await admin.from('nexus_programs').update({settings:{...current.settings,providers_enabled:enabled.filter(p=>p!==provider)},updated_at:new Date().toISOString()}).eq('organization_id',org);
    if(settingsError)throw settingsError;
   }
   return json({success:true});
  }
  if(body.action==='provider_health_check'){
   if(actor.mode!=='user')return json({error:'interactive_owner_required'},403);
   const requested=text(body.provider,20);
   if(requested&&!isCatalogId(requested))return json({error:'unsupported_provider'},400);
   const confirmCost=body.confirmCost===true; // o teste com custo (confirmCost) já exige gestor: a ação inteira é técnica
   const results=await runHealthChecks(admin,{organizationId:org,triggeredBy:actor.userId,providers:requested?[requested]:undefined,confirmCost,fetchFn:pf,ga4Property:text(project.commercial_info?.ga4_property_id,20)||null});
   return json({results});
  }
  if(body.action==='execution_settings_set'){
   if(actor.mode!=='user')return json({error:'interactive_owner_required'},403);
   const [{data:creds},{data:current}]=await Promise.all([
    admin.from('organization_provider_credentials').select('provider,status').eq('organization_id',org),
    admin.from('nexus_programs').select('budget_usd_micros,settings').eq('organization_id',org).maybeSingle(),
   ]);
   const connected=(creds||[]).filter((c:{status:string})=>['stored_unverified','active'].includes(c.status)).map((c:{provider:string})=>c.provider);
   // Desligar é sempre permitido: sem orçamento/lista na entrada, mantém os valores atuais.
   const input={...body};
   if(body.executionEnabled===false){
    if(typeof input.budgetUsd!=='number')input.budgetUsd=Number(current?.budget_usd_micros||0)/1_000_000;
    if(input.providersEnabled===undefined)input.providersEnabled=providersEnabledFrom(current?.settings);
   }
   const checked=validateExecutionSettings(input,connected);
   if(!checked.ok)return json({error:checked.error},400);
   const {data:saved,error}=await admin.from('nexus_programs').upsert({organization_id:org,execution_enabled:checked.value.executionEnabled,budget_usd_micros:checked.value.budgetUsdMicros,settings:{...(current?.settings||{}),providers_enabled:checked.value.providersEnabled,...(checked.value.executionEnabled?{cost_ceilings_usd_micros:{serp:20000,ai_observation:60000,editorial_review:100000,...(current?.settings?.cost_ceilings_usd_micros||{})},pricing_verified_at:new Date().toISOString()}:{})},updated_at:new Date().toISOString()},{onConflict:'organization_id'}).select('execution_enabled,budget_usd_micros,reserved_usd_micros,consumed_usd_micros,settings').single();
   if(error)throw error;
   return json({program:{execution_enabled:saved.execution_enabled,budget_usd_micros:Number(saved.budget_usd_micros),reserved_usd_micros:Number(saved.reserved_usd_micros),consumed_usd_micros:Number(saved.consumed_usd_micros),providers_enabled:providersEnabledFrom(saved.settings)}});
  }
  if(body.action==='search_performance_sync'){
   if(actor.mode!=='user')return json({error:'interactive_owner_required'},403);
   const source=['gsc','bing','all'].includes(body.source)?body.source:'all';
   const days=Math.min(90,Math.max(1,Math.trunc(Number(body.days))||28));
   const property=text(project.commercial_info?.gsc_property,200)||undefined;
   const resolveSecret=async(prov:string)=>{const {data}=await admin.rpc('nexus_provider_secret_read',{p_org:org,p_provider:prov});return data?String(data):null;};
   const out=await syncSearchPerformance(admin,{organizationId:org,projectId:project.id,source,days,fetchFn:pf,resolveSecret,domain:host||String(project.domain||''),property});
   const okOnes=out.results.filter(r=>r.ok);
   const total=out.results.reduce((n:number,r:{rows_upserted:number})=>n+r.rows_upserted,0);
   const view={property:property||(host?`sc-domain:${host.replace(/^www\./,'')}`:null),from:out.results[0]?.from,to:out.results[0]?.to,rows_upserted:total,truncated:out.results.some(r=>r.truncated===true),results:out.results};
   if(!okOnes.length&&out.results.length){const err=String(out.results[0].error||'sync_failed');return json({...view,error:err},err.endsWith('not_configured')?409:err.endsWith('forbidden')?403:502);}
   return json(view);
  }
  if(body.action==='search_performance'){
   const isDay=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v));
   const to=isDay(body.to)?body.to:new Date().toISOString().slice(0,10);
   const from=isDay(body.from)?body.from:new Date(Date.parse(to)-27*86400000).toISOString().slice(0,10);
   if(from>to||Date.parse(to)-Date.parse(from)>366*86400000)return json({error:'period_invalid'},400);
   const {data,error}=await admin.rpc('nexus_search_performance_summary',{p_project:project.id,p_from:from,p_to:to});
   if(error)throw error;return json(data);
  }
  // ---- GA4 e plano de gerenciamento (13/11/2026). Política por ação: ver _shared/nexus-management.ts ----
  if(body.action==='ga4_sync'){
   const days=Math.min(90,Math.max(1,Math.trunc(Number(body.days))||28));
   const property=text(project.commercial_info?.ga4_property_id,20);
   const resolveSecret=async(prov:string)=>{const {data}=await admin.rpc('nexus_provider_secret_read',{p_org:org,p_provider:prov});return data?String(data):null;};
   const result=await syncGa4(admin,{organizationId:org,projectId:project.id,days,fetchFn:pf,resolveSecret,property:isValidPropertyId(property)?property:null});
   const first=result.results[0];
   if(first?.ok){
    await admin.rpc('nexus_audit_mark_sync',{p_org:org,p_project:project.id,p_source:'ga4',p_full:false}).then(()=>null,()=>null);
    return json({result});
   }
   const code=String(first?.error||'ga4_sync_failed');
   return json({error:code,result},ga4ErrorStatus(code));
  }
  if(body.action==='ga4_summary'||body.action==='content_performance'){
   const period=periodOf(body);if(!period)return json({error:'period_invalid'},400);
   const summary=body.action==='ga4_summary';
   const {data,error}=await admin.rpc(summary?'nexus_analytics_summary':'nexus_content_performance',{p_project:project.id,p_from:period.from,p_to:period.to});
   if(error)throw error;
   return json(summary?{summary:data}:{performance:data});
  }
  if(body.action==='project_integrations_get'){
   const {viewer}=await getViewer();
   return json({integrations:integrationsView(project.commercial_info,viewer.can_manage_technical)});
  }
  if(body.action==='project_integrations_set'){
   const parsed=parseIntegrationsInput(body);if(!parsed.ok)return json({error:parsed.error},400);
   const v=parsed.value;
   const {data,error}=await admin.rpc('nexus_project_integrations_set',{p_org:org,p_project:project.id,p_ga4:v.ga4,p_set_ga4:v.setGa4,p_gsc:v.gsc,p_set_gsc:v.setGsc});
   if(error){const m=integrationsRpcError(error.message);return json({error:m.error},m.status);}
   return json({integrations:{ga4_property_id:data?.ga4_property_id??null,gsc_property:data?.gsc_property??null}});
  }
  if(body.action==='request_create'){
   if(actor.mode!=='user')return json({error:'interactive_owner_required'},403);
   const parsed=parseRequestCreate(body);if(!parsed.ok)return json({error:parsed.error},400);
   const {data,error}=await admin.rpc('nexus_client_request_create',{p_org:org,p_project:project.id,p_user:actor.userId,p_kind:parsed.value.kind,p_message:parsed.value.message});
   if(error){const m=requestRpcError(error.message);return json({error:m.error},m.status);}
   return json({request:data});
  }
  if(body.action==='requests_list'){
   if(actor.mode!=='user')return json({error:'interactive_owner_required'},403);
   const filter=parseRequestsFilter(body);if(!filter.ok)return json({error:filter.error},400);
   const {viewer}=await getViewer();
   let query=admin.from('nexus_client_requests').select('*').order('created_at',{ascending:false}).limit(200);
   if(viewer.role!=='manager')query=query.eq('organization_id',org); // o gestor vê as de todas as organizações; o membro, só as da própria
   if(filter.value.status)query=query.eq('status',filter.value.status);
   const {data,error}=await query;if(error)throw error;
   const rows=(data||[]) as Array<Record<string,unknown>>;
   if(viewer.role!=='manager')return json({requests:rows});
   const orgIds=[...new Set(rows.map(r=>String(r.organization_id)))];const projectIds=[...new Set(rows.map(r=>r.project_id).filter((id):id is string=>typeof id==='string'))];
   const [orgs,projs]=await Promise.all([
    orgIds.length?admin.from('organizations').select('id,name').in('id',orgIds):Promise.resolve({data:[] as Array<{id:string;name:string}>}),
    projectIds.length?admin.from('projects').select('id,name').in('id',projectIds):Promise.resolve({data:[] as Array<{id:string;name:string}>}),
   ]);
   const orgName=new Map((orgs.data||[]).map((o:{id:string;name:string})=>[o.id,o.name]));const projectName=new Map((projs.data||[]).map((p:{id:string;name:string})=>[p.id,p.name]));
   return json({requests:rows.map(r=>({...r,organization_name:orgName.get(String(r.organization_id))??null,project_name:typeof r.project_id==='string'?projectName.get(r.project_id)??null:null}))});
  }
  if(body.action==='request_update'){
   const parsed=parseRequestUpdate(body,new Date().toISOString());if(!parsed.ok)return json({error:parsed.error},400);
   const {data,error}=await admin.from('nexus_client_requests').update(parsed.value.patch).eq('id',parsed.value.id).select('*').maybeSingle();
   if(error)throw error;if(!data)return json({error:'request_not_found'},404);
   return json({request:data});
  }
  if(body.action==='prepare'){
   if(!['serp','ai_observation','editorial_review','pilot'].includes(body.kind))return json({error:'unsupported_operation'},400);
   const input:Record<string,unknown>&{query:string;variants:string[];branded:boolean}={query:text(body.query,body.kind==="serp"&&body.serperType==="resolve"?100001:500),country:text(body.country,2)||'br',language:text(body.language,10)||'pt-BR',city:text(body.city,100),
    variants:Array.isArray(body.variants)?body.variants.filter((v:unknown)=>typeof v==='string').slice(0,8).map((v:string)=>v.slice(0,120)):[],
    articleId:text(body.articleId,36),branded:body.branded===true,repetition:Math.min(5,Math.max(1,Number(body.repetition)||1)),method_version:SAMPLING_METHOD.version};
   if(isObservationEngine(body.engine))input.engine=body.engine;
   if(typeof body.branded!=='boolean')input.branded=input.variants.some((v:string)=>v.trim().length>=3&&input.query.toLocaleLowerCase().includes(v.trim().toLocaleLowerCase()));
   if(['serp','ai_observation'].includes(body.kind)&&!input.query)return json({error:'query_required'},400);
   if(body.kind==='serp'){
    input.serperType=body.serperType??'search';
    input.page=body.page??1;
   }
   const inputs=body.kind==='serp'?serperRegionalInputs(input,body.regions):[input];
   if(!inputs)return json({error:'invalid_serper_parameters'},400);
   if(body.kind==='editorial_review'){
    const {data:article}=await admin.from('articles').select('*').eq('id',input.articleId).eq('project_id',project.id).eq('user_id',actor.userId).maybeSingle();
    if(!article)return json({error:'article_forbidden'},403);
    const {data:id,error:prepareError}=await admin.rpc('nexus_prepare_article_review',{p_article:article.id});
    if(prepareError)throw prepareError;
    if(!id)return json({error:'article_content_required',executed:false},409);
    return json({success:true,operation:{id},executed:false});
   }
   const {data,error}=await admin.from('nexus_operations').insert(inputs.map(input=>({organization_id:org,project_id:project.id,user_id:actor.userId,kind:body.kind,request_key:crypto.randomUUID(),input}))).select('id');
   if(error)throw error;return json({success:true,operation:data?.[0],prepared:data?.length??0,executed:false});
  }
  if(body.action==='prepare_pilot'){
   const {data:articles,error}=await admin.from('articles').select('id,title,keyword,project_id').eq('user_id',actor.userId).eq('project_id',project.id).eq('status','published').order('id').limit(10);
   if(error)throw error;
   const {data,error:saveError}=await admin.from('nexus_operations').upsert((articles||[]).map(article=>({organization_id:org,project_id:project.id,user_id:actor.userId,kind:'pilot',request_key:`pilot-v1:${project.id}:${article.id}`,input:{baseline_article:article.id,title:article.title,keyword:article.keyword,review_mode:'autonomous',workflow:['research','strategy','writer','factual_review','conversion_review','delivery_gate'],state:'baseline_selected_not_evaluated'}})),{onConflict:'organization_id,request_key',ignoreDuplicates:true}).select('id');
   if(saveError)throw saveError;return json({success:true,prepared:data?.length||0,executed:false});
  }
  // ---- Observatory actions (2026-11-12). Paid execution is gated per organization (executionGate): program on + budget + provider enabled. ----
  if(body.action==='observatory'){
   const isDay=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v));
   const to=isDay(body.to)?body.to:new Date().toISOString().slice(0,10);
   const from=isDay(body.from)?body.from:new Date(Date.parse(to)-30*86400000).toISOString().slice(0,10);
   if(from>to||Date.parse(to)-Date.parse(from)>366*86400000)return json({error:'period_invalid'},400);
   const {data,error}=await admin.rpc('nexus_observatory_summary',{p_project:project.id,p_from:from,p_to:to});
   if(error)throw error;return json(data);
  }
  if(body.action==='prompt_sets'){
   const [sets,prompts]=await Promise.all([
    admin.from('nexus_prompt_sets').select('*').eq('project_id',project.id).eq('organization_id',org).order('created_at',{ascending:true}),
    admin.from('nexus_prompts').select('*').eq('project_id',project.id).eq('organization_id',org).order('position',{ascending:true}).order('created_at',{ascending:true}),
   ]);
   if(sets.error||prompts.error)throw sets.error||prompts.error;
   return json({sets:(sets.data||[]).map((s:{id:string})=>({...s,prompts:(prompts.data||[]).filter((p:{prompt_set_id:string})=>p.prompt_set_id===s.id)}))});
  }
  if(body.action==='prompt_set_upsert'){
   const parsed=normalizePromptSet(body.set);if(!parsed.ok)return json({error:parsed.error},400);
   const id=text(body.set?.id,36);
   if(id){
    const {data,error}=await admin.from('nexus_prompt_sets').update(parsed.value).eq('id',id).eq('project_id',project.id).eq('organization_id',org).select('*').maybeSingle();
    if(error)throw error;if(!data)return json({error:'prompt_set_not_found'},404);return json({set:data});
   }
   const {data,error}=await admin.from('nexus_prompt_sets').insert({...parsed.value,organization_id:org,project_id:project.id,user_id:actor.userId}).select('*').single();
   if(error)throw error;return json({set:data});
  }
  if(body.action==='prompt_upsert'){
   const parsed=normalizePrompt(body.prompt);if(!parsed.ok)return json({error:parsed.error},400);
   const {data:set}=await admin.from('nexus_prompt_sets').select('id').eq('id',text(body.prompt?.prompt_set_id,36)).eq('project_id',project.id).eq('organization_id',org).maybeSingle();
   if(!set)return json({error:'prompt_set_not_found'},404);
   const id=text(body.prompt?.id,36);
   const result=id
    ?await admin.from('nexus_prompts').update(parsed.value).eq('id',id).eq('prompt_set_id',set.id).eq('project_id',project.id).select('*').maybeSingle()
    :await admin.from('nexus_prompts').insert({...parsed.value,prompt_set_id:set.id,organization_id:org,project_id:project.id}).select('*').single();
   if(result.error?.code==='23505')return json({error:'prompt_duplicate'},409);
   if(result.error)throw result.error;if(!result.data)return json({error:'prompt_not_found'},404);return json({prompt:result.data});
  }
  if(body.action==='prompt_delete'){
   const {error}=await admin.from('nexus_prompts').delete().eq('id',text(body.promptId,36)).eq('project_id',project.id).eq('organization_id',org);
   if(error)throw error;return json({success:true});
  }
  if(body.action==='import_observation'){
   const parsed=normalizeObservation(body.observation);if(!parsed.ok)return json({error:parsed.error},400);
   const o=parsed.value;
   const requestKey=await manualRequestKey(o.engine,String(o.input.query),String(o.input.country),o.observedAt,String(o.input.city||''),String(o.input.language||''));
   const {data,error}=await admin.from('nexus_operations').upsert({organization_id:org,project_id:project.id,user_id:actor.userId,kind:o.kind,request_key:requestKey,status:'succeeded',reserved_usd_micros:0,input:o.input,output:o.output,updated_at:new Date().toISOString()},{onConflict:'organization_id,request_key'}).select('id').single();
   if(error)throw error;return json({operation:{id:data.id}});
  }
  if(body.action==='prepare_prompt_run'){
   const {data:set}=await admin.from('nexus_prompt_sets').select('*').eq('id',text(body.promptSetId,36)).eq('project_id',project.id).eq('organization_id',org).maybeSingle();
   if(!set)return json({error:'prompt_set_not_found'},404);
   if(set.status!=='active')return json({error:'prompt_set_paused'},409);
   const requested=Array.isArray(body.engines)?body.engines:set.engines;
   const engines=[...new Set((requested as unknown[]).filter(isExecutableEngine))];
   const markets=Array.isArray(set.markets)&&set.markets.length?set.markets:[{country:'br',language:'pt-BR'}];
   const {data:prompts,error:promptError}=await admin.from('nexus_prompts').select('*').eq('prompt_set_id',set.id).eq('active',true).order('position',{ascending:true});
   if(promptError)throw promptError;
   const variants=[...new Set([project.name,host,host.replace(/^www\./,'')].map(v=>String(v||'').trim()).filter(v=>v.length>=3))].slice(0,8).map(v=>v.slice(0,120));
   const day=new Date().toISOString().slice(0,10);const rows:Record<string,unknown>[]=[];
   for(const prompt of prompts||[])for(const engine of engines)for(const market of markets as Array<{country:string;language:string;city?:string}>){
    const query=String(prompt.query);
    rows.push({organization_id:org,project_id:project.id,user_id:actor.userId,kind:engineKind(engine),request_key:runRequestKey(set.id,prompt.id,engine,market.country,day,market.city,market.language),
     input:{engine,query,country:market.country,language:market.language,city:market.city||'',topic:prompt.topic,intent:prompt.intent,variants,
      branded:prompt.branded===true||prompt.intent==='branded'||variants.some(v=>query.toLocaleLowerCase().includes(v.toLocaleLowerCase())),repetition:1,method_version:SAMPLING_METHOD.version,prompt_set_id:set.id,prompt_id:prompt.id}});
   }
   if(rows.length>500)return json({error:'run_too_large',max:500,requested:rows.length},400);
   let prepared=0;
   for(let i=0;i<rows.length;i+=100){
    const {data,error}=await admin.from('nexus_operations').upsert(rows.slice(i,i+100),{onConflict:'organization_id,request_key',ignoreDuplicates:true}).select('id');
    if(error)throw error;prepared+=data?.length||0;
   }
   return json({prepared,skipped:rows.length-prepared,executed:false});
  }
  if(body.action==='signals_status'){
   const {data:key}=await admin.from('nexus_site_keys').select('site_id,allowed_origins,last_batch_at').eq('project_id',project.id).maybeSingle();
   const since=new Date(Date.now()-30*86400000).toISOString().slice(0,10);
   const {data:rows}=await admin.from('nexus_site_signals').select('kind,hits').eq('project_id',project.id).gte('day',since).limit(50000);
   const sum=(kind:string)=>(rows||[]).filter((r:{kind:string;hits:number|null})=>r.kind===kind).reduce((n:number,r:{hits:number|null})=>n+Number(r.hits||0),0);
   return json({endpoint:`${Deno.env.get('SUPABASE_URL')||''}/functions/v1/zica-signals`,site_id:key?.site_id||null,allowed_origins:key?.allowed_origins||[],last_batch_at:key?.last_batch_at||null,
    totals_30d:{ai_bot_hits:sum('ai_bot_hit'),ai_referrals:sum('ai_referral'),search_referrals:sum('search_referral'),human_pageviews:sum('human_pageview')}});
  }
  if(body.action==='signals_key_create'||body.action==='signals_key_rotate'){
   if(actor.mode!=='user')return json({error:'interactive_owner_required'},403);
   const origins=normalizeOrigins(body.allowedOrigins);if(!origins.ok)return json({error:origins.error},400);
   const {data:existing}=await admin.from('nexus_site_keys').select('site_id').eq('project_id',project.id).maybeSingle();
   if(body.action==='signals_key_create'&&existing)return json({error:'signals_key_exists_use_rotate'},409);
   if(body.action==='signals_key_rotate'&&!existing)return json({error:'signals_key_not_found'},404);
   const siteId=existing?.site_id||generateSiteId();const secret=generateSiteSecret();
   const {error:storeError}=await admin.rpc('nexus_site_key_store',{p_org:org,p_project:project.id,p_site_id:siteId,p_secret:secret,p_origins:body.allowedOrigins===undefined&&existing?null:origins.value});
   if(storeError)return json({error:'signals_key_not_stored'},500);
   const endpoint=`${Deno.env.get('SUPABASE_URL')||''}/functions/v1/zica-signals`;
   const scriptUrl=Deno.env.get('ZICA_SIGNALS_SCRIPT_URL')||`${req.headers.get('origin')||''}/zica-signals.js`;
   let pluginConfigured=false;
   if(isPluginModeProject(project)&&project.wordpress_url){
    try{ // the global spend lock may refuse this call; in that case the owner pastes site_id/secret/endpoint in the plugin
     const {apiKey}=await resolvePluginKey(admin,project);
     if(!allowWordPressBase(String(project.wordpress_url)))throw new Error('wordpress_base_not_https');
     await pluginRequest(String(project.wordpress_url),apiKey,'signals/configure',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({site_id:siteId,secret,endpoint})},resolvePluginNamespace(project));
     pluginConfigured=true;
    }catch{pluginConfigured=false;}
   }
   const {data:keyRow}=await admin.from('nexus_site_keys').select('allowed_origins').eq('project_id',project.id).maybeSingle();
   return json({site_id:siteId,secret,endpoint,snippet:buildSignalsSnippet(scriptUrl,siteId,endpoint),allowed_origins:keyRow?.allowed_origins||[],plugin_configured:pluginConfigured,secret_shown_once:true});
  }
  if(body.action==='homepage_schema_sync'){
   if(actor.mode!=='user')return json({error:'interactive_owner_required'},403);
   const profile=project.commercial_info?.schema_profile;
   if(!profile)return json({error:'schema_profile_missing'},409);
   const built=buildHomepageSchemaFromProfile(profile,host||undefined);if(!built.ok)return json({error:built.error},400);
   if(body.dryRun===true)return json({dry_run:true,applied:false,schemas:built.schemas,site:project.wordpress_url||null});
   if(!isPluginModeProject(project)||!project.wordpress_url)return json({error:'plugin_not_configured'},409);
   try{
    const {apiKey}=await resolvePluginKey(admin,project);
    if(!allowWordPressBase(String(project.wordpress_url)))throw new Error('wordpress_base_not_https');
    const {data:pluginData}=await pluginRequest(String(project.wordpress_url),apiKey,'homepage-schema/inject',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({schemas:built.schemas})},resolvePluginNamespace(project));
    const count=Number(pluginData?.count);
    return json({dry_run:false,applied:true,count:Number.isFinite(count)?count:built.schemas.length,schemas:built.schemas});
   }catch{return json({error:'plugin_unreachable',applied:false},502);}
  }
  if(['validate_destinations','suggest_links','apply_link'].includes(body.action)){
   const {data:allowed}=await admin.from('nexus_programs').select('settings').eq('organization_id',org).maybeSingle();
   if(!host||!Array.isArray(allowed?.settings?.destination_hosts)||!allowed.settings.destination_hosts.includes(host))return json({error:'destination_host_not_authorized'},409);
  }
  if(body.action==='prepare_clusters'){
   const {data:articles,error}=await admin.from('articles').select('id,title,keyword').eq('user_id',actor.userId).eq('project_id',project.id).eq('status','published').order('id').limit(200);if(error)throw error;
   const groups=topicGroups(articles||[]);const saved=[];
   for(const group of groups){
    const slug=`nexus-term-${group.term}`;
    const {data:existing}=await admin.from('topic_clusters').select('id').eq('project_id',project.id).eq('user_id',actor.userId).eq('slug',slug).maybeSingle();
    let id=existing?.id;
    if(!id){const {data:cluster,error}=await admin.from('topic_clusters').insert({project_id:project.id,user_id:actor.userId,name:`Tema: ${group.term}`,slug,description:'Agrupamento inicial por ocorrência de termos; não é avaliação semântica por IA.',primary_keywords:[group.term],article_count:group.articles.length,is_auto_generated:true}).select('id').single();if(error)throw error;id=cluster.id;}
    const {error}=await admin.from('nexus_cluster_members').upsert(group.articles.map(a=>({cluster_id:id,article_id:a.id,is_pillar:a.id===group.articles[0].id,organization_id:org,project_id:project.id})),{onConflict:'cluster_id,article_id',ignoreDuplicates:true});if(error)throw error;
    saved.push({id,term:group.term,articles:group.articles.length});
   }
   return json({clusters:saved,method:'deterministic_keyword_overlap',corpus_limit:200,semantic_review:'not_executed'});
  }
  if(body.action==='suggest_links'){
   const {data:targets,error}=await admin.from('articles').select('id,title,keyword,published_url').eq('user_id',actor.userId).eq('project_id',project.id).eq('status','published').not('published_url','is',null).order('id').limit(10);if(error)throw error;
   const {data:sources}=await admin.from('articles').select('id,content').eq('user_id',actor.userId).eq('project_id',project.id).in('status',['draft','ready']).not('content','is',null).order('id').limit(20);
   let count=0;
   for(const target of targets||[]){
    const anchor=String(target.keyword||'').split(',')[0].trim();if(anchor.length<4||anchor.length>160)continue;
    let validation;try{validation=await validateLinkDestination(target.published_url,host,async h=>await Deno.resolveDns(h,'A'));}catch{continue;}
    if(!validation.valid)continue;
    for(const source of sources||[]){if(source.id===target.id||!insertDraftLink(source.content,anchor,target.published_url).applied)continue;
     const {error}=await admin.from('nexus_link_suggestions').upsert({user_id:actor.userId,project_id:project.id,organization_id:org,source_article_id:source.id,target_article_id:target.id,target_url:validation.url,anchor_text:anchor,relevance_score:100,position_suggestion:'body',status:'pending',anchor_context:'Correspondência literal da expressão no corpo; índice lexical 100 = expressão completa encontrada, não nota de SEO.',destination_checked_at:validation.checked_at,destination_status:validation.status},{onConflict:'source_article_id,target_url',ignoreDuplicates:true});if(error)throw error;count++;
    }
   }
   return json({candidate_pairs:count,applied:false,method:'literal_phrase_in_body_with_verified_destination',source_limit:20,target_limit:10});
  }
  if(body.action==='apply_link'){
   const {data:suggestion}=await admin.from('nexus_link_suggestions').select('*').eq('id',body.suggestionId).eq('user_id',actor.userId).eq('project_id',project.id).eq('status','pending').maybeSingle();if(!suggestion)return json({error:'suggestion_not_found'},404);
   const {data:article}=await admin.from('articles').select('*').eq('id',suggestion.source_article_id).eq('user_id',actor.userId).eq('project_id',project.id).in('status',['draft','ready']).maybeSingle();if(!article)return json({error:'only_unpublished_articles_can_be_changed'},409);
   const checked=await validateLinkDestination(suggestion.target_url,host,async h=>await Deno.resolveDns(h,'A'));if(!checked.valid)return json({error:'destination_not_valid'},409);
   const linked=insertDraftLink(article.content||'',suggestion.anchor_text,suggestion.target_url);if(!linked.applied)return json({error:'anchor_no_longer_matches'},409);
   const {data:saved,error}=await admin.from('articles').update({content:linked.content,status:'draft',config:{...article.config,nexus_approval_required:true,nexus_approval:null},updated_at:new Date().toISOString()}).eq('id',article.id).eq('user_id',actor.userId).eq('updated_at',article.updated_at).select('id').maybeSingle();if(error||!saved)return json({error:'article_changed'},409);
   await admin.from('nexus_link_suggestions').update({status:'applied',applied_at:new Date().toISOString()}).eq('id',suggestion.id).eq('user_id',actor.userId);
   return json({success:true,published:false,new_editorial_review_required:true});
  }
  if(body.action==='validate_destinations'){
   const {data:articles,error}=await admin.from('articles').select('id,title,published_url,keyword').eq('user_id',actor.userId).eq('project_id',project.id).eq('status','published').not('published_url','is',null).order('id').limit(10);
   if(error)throw error;
   const results=[];
   for(const article of articles||[]){
    try{results.push({article_id:article.id,title:article.title,...await validateLinkDestination(article.published_url,host,async h=>await Deno.resolveDns(h,'A'))});}
    catch{results.push({article_id:article.id,valid:false,reason:'validation_unavailable'});}
   }
   return json({results,applied:false,method:'same_project_https_head_dns_and_redirect_checks',limit:10});
  }
  if(body.action==='record_conversion'){
   const stages=['cta_click','contact_started','lead_qualified','appointment','contract_signed'];
   if(!stages.includes(body.stage)||!text(body.evidenceRef)||!text(body.eventKey)||!Number.isFinite(Date.parse(body.occurredAt)))return json({error:'event_evidence_and_date_required'},400);
   if(body.articleId){const {data:a}=await admin.from('articles').select('id').eq('id',body.articleId).eq('project_id',project.id).eq('user_id',actor.userId).maybeSingle();if(!a)return json({error:'article_forbidden'},403);}
   const {error}=await admin.from('nexus_conversion_events').upsert({organization_id:org,project_id:project.id,article_id:body.articleId||null,event_key:text(body.eventKey,200),stage:body.stage,evidence_ref:text(body.evidenceRef),source:text(body.source,100)||'authorized_import',occurred_at:body.occurredAt},{onConflict:'organization_id,event_key',ignoreDuplicates:true});
   if(error)throw error;return json({success:true,attribution:'reported_event_not_proven_causal_gain'});
  }
  if(body.action!=='execute')return json({error:'unsupported_action'},400);
  const {data:operation}=await admin.from('nexus_operations').select('*').eq('id',body.operationId).eq('organization_id',org).eq('project_id',project.id).eq('user_id',actor.userId).maybeSingle();
  if(!operation)return json({error:'operation_forbidden'},404);
  operationId=operation.id;
  if(operation.kind==='pilot')return json({error:'pilot_is_a_batch_plan_prepare_individual_steps'},409);
  // Rodada paga de coleta (serp, ai_observation): só a conta de gerenciamento (decisão do dono, 13/11/2026). Não afeta `editorial_review`.
  if(['serp','ai_observation'].includes(operation.kind)&&actor.mode==='user'){
   const collectionPolicy=checkActionPolicy('execute_collection',(await getViewer()).viewer);
   if(!collectionPolicy.ok)return json({error:collectionPolicy.error,executed:false},403);
  }
  const engine=text(operation.input?.engine,40)||(operation.kind==='serp'?'google_serp':'chatgpt_api');
  if(['serp','ai_observation'].includes(operation.kind)){
   if(!isExecutableEngine(engine))return json({error:'engine_not_executable',engine,executed:false},409);
   if(engineKind(engine)!==operation.kind)return json({error:'engine_kind_mismatch',executed:false},409);
  }
  const {data:program}=await admin.from('nexus_programs').select('*').eq('organization_id',org).maybeSingle();
  const provider=operation.kind==='editorial_review'?'openai':ENGINE_PROVIDER[engine]||'openai';
  // Portão por organização (substitui o bloqueio global neste endpoint): programa ligado + orçamento + provedor habilitado.
  const gate=executionGate(program,provider);
  if(gate)return json({error:gate.error,executed:false},402);
  const {data:credential,error:credentialError}=await admin.rpc('nexus_provider_secret',{p_org:org,p_actor:actor.userId,p_provider:provider});
  if(credentialError||!credential)return json({error:'organization_credential_required',executed:false},409);
  const model=operation.kind==='editorial_review'&&text(program.settings?.editorial_review_model,100)?text(program.settings?.editorial_review_model,100):['gemini_api','claude_api'].includes(engine)?text(program.settings?.observation_models?.[engine],100):text(program.settings?.observation_model,100);
  if(['openai','gemini','anthropic'].includes(provider)&&!model)return json({error:'model_not_configured',executed:false},409);
  const serper=operation.kind==='serp'&&provider==='serper'?serperRequest(operation.input):null;
  if(operation.kind==='serp'&&provider==='serper'&&!serper)return json({error:'invalid_serper_parameters'},400);
  if(serper&&serper.type!=='search')return json({error:'serper_credit_execution_paused',executed:false},402);
  const {error:reserveError}=await admin.rpc('nexus_reserve_operation',{p_operation:operation.id});
  if(reserveError)return json({error:'budget_or_pricing_gate',executed:false},402);
  reserved=true;
  const input=operation.input;let output:Record<string,unknown>;const startedAt=Date.now();
  if(operation.kind==='serp'&&provider!=='serper'){
   const collected=await runCollector(engine,String(credential),{engine,query:String(input.query||''),country:String(input.country||'br'),language:String(input.language||'pt-BR'),city:String(input.city||''),domain:host,variants:Array.isArray(input.variants)?input.variants:[]},pf);
   output={...collected.output,raw:collected.raw};
  }else if(operation.kind==='serp'){
   const response=await pf(serper!.url,{method:'POST',headers:{'X-API-KEY':credential,'Content-Type':'application/json'},body:JSON.stringify(serper!.payload),signal:AbortSignal.timeout(30000)});
   if(!response.ok)throw new Error(`provider_request_failed_${response.status}`);
   const raw=await response.json();output={...parseSerp(raw,host),raw,collected_at:new Date().toISOString(),query:input.query,context:input,provider:'serper'};
  }else if(operation.kind==='ai_observation'&&['gemini_api','claude_api','perplexity_api'].includes(engine)){
   const variants:string[]=Array.isArray(input.variants)?input.variants:[];
   const country=String(input.country||'br').toUpperCase();
   let response:Response;
   if(engine==='gemini_api')response=await pf(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'x-goog-api-key':credential,'Content-Type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:input.query}]}],tools:[{google_search:{}}]}),signal:AbortSignal.timeout(90000)});
   else if(engine==='claude_api')response=await pf('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':credential,'anthropic-version':'2023-06-01','Content-Type':'application/json'},body:JSON.stringify({model,max_tokens:4000,messages:[{role:'user',content:input.query}],tools:[{type:'web_search_20250305',name:'web_search',max_uses:3,user_location:{type:'approximate',country,city:input.city||undefined}}]}),signal:AbortSignal.timeout(90000)});
   else response=await pf('https://api.perplexity.ai/search',{method:'POST',headers:{Authorization:`Bearer ${credential}`,'Content-Type':'application/json'},body:JSON.stringify({query:input.query,country,max_results:10}),signal:AbortSignal.timeout(30000)});
   if(!response.ok)throw new Error(`provider_request_failed_${response.status}`);
   const raw=await response.json();
   const parsed=engine==='gemini_api'?parseGeminiObservation(raw,host,variants):engine==='claude_api'?parseClaudeObservation(raw,host,variants):parsePerplexityObservation(raw,host,variants);
   output={...parsed,raw,collected_at:new Date().toISOString(),query:input.query,context:input,engine,provider:ENGINE_PROVIDER[engine],method:SAMPLING_METHOD};
  }else{
    let article:Record<string,any>|null=null;
   if(operation.kind==='editorial_review'){
    const {data}=await admin.from('articles').select('*').eq('id',input.articleId).eq('project_id',project.id).eq('user_id',actor.userId).maybeSingle();article=data;
    if(!article)throw new Error('article_forbidden');
   }
   const snapshot=article?await editorialFingerprint(article,project):null;
   const response=await pf('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${credential}`,'Content-Type':'application/json'},body:JSON.stringify({model,max_output_tokens:4000,store:false,
    ...(article?{instructions:AUTONOMOUS_REVIEW_PROMPT,text:{format:{type:'json_object'}},input:'DADOS PARA REVISÃO (JSON). REGRA DE CITAÇÃO: cada quote deve ser copiada caractere por caractere do campo "sources", nunca do campo "article"; para cada afirmação material do artigo procure no "sources" a frase que a sustenta, e se não houver, coloque a afirmação em unsupported_claims. O campo issues só pode conter PROBLEMAS reais do artigo; se não houver problema, devolva issues como lista vazia (não escreva elogios nem observações positivas ali; use notes para isso). '+JSON.stringify({article:{title:article.title,content:String(article.content||'').slice(0,50000)},sources:String(article.config?.sourcesContext||'').slice(0,8000),project:{strategy:project.nexus_strategy,strategy_version:project.nexus_strategy_version,identity:project.editorial_identity,sector:project.nicho,description:project.description,compliance:project.compliance_rules},offer:project.commercial_info,brief:article.config?.conversionBrief,segment:article.config?.segment,intent:article.config?.intentType,goal:article.config?.goal})}:{tools:[{type:'web_search',user_location:{type:'approximate',country:String(input.country).toUpperCase(),city:input.city||undefined}}],input:input.query})}),signal:AbortSignal.timeout(90000)});
   if(!response.ok){const detail=await response.clone().json().then((d:any)=>String(d?.error?.message||d?.error?.code||'').slice(0,200)).catch(()=>'');throw new Error(`provider_request_failed_${response.status}:${detail}`);}
   const raw=await response.json();
   if(!article)output={...parseAiObservation(raw,host,input.variants),raw,collected_at:new Date().toISOString(),query:input.query,context:input,provider:'openai',method:SAMPLING_METHOD};
   else{
    const resultText=(raw.output||[]).filter((o:any)=>o.type==='message').flatMap((o:any)=>o.content||[]).map((c:any)=>c.text||'').join('');
    const verdict=validateAutonomousReview(JSON.parse(resultText),String(article.config?.sourcesContext||''),{requireConversion:!isInformationalArticle(article,project)});
    const audit=normalizeEditorialHtml(String(article.content||''));
    output={...verdict,pass:verdict.pass&&audit.pass,method:'autonomous_model_review_plus_deterministic_gates',evaluated_at:new Date().toISOString(),raw};
    if(output.pass&&program.review_mode==='autonomous'){
     const receipt=await signEditorialReceipt(snapshot!,actor.userId,key,"autonomous");
     const {data:saved,error}=await admin.from('articles').update({config:{...article.config,nexus_approval_required:true,nexus_approval:receipt,nexus_review_mode:'autonomous',review_pass:true,needs_primary_source:false}}).eq('id',article.id).eq('user_id',actor.userId).eq('updated_at',article.updated_at).select('id').maybeSingle();
     if(error||!saved)throw new Error('article_changed_during_review');
    }
   }
  }
  output.latency_ms=Date.now()-startedAt;
  output.accounting='configured_ceiling_debit_not_provider_invoice';
  const {error:finishError}=await admin.rpc('nexus_finish_operation',{p_operation:operation.id,p_output:output});if(finishError)throw finishError;
  return json({success:true,output});
 }catch(error){
  if(reserved&&operationId)console.error('[nexus-intelligence] execute_failed',error instanceof Error?`${error.name}:${error.message}`.slice(0,240):'unknown');
  if(reserved&&operationId)await admin.from('nexus_operations').update({status:'uncertain',output:{error:'execution_or_recording_failed',reservation_retained:true}}).eq('id',operationId);
  if(error instanceof RequestAuthError)return json({error:error.code},error.status);
  return json({error:'operation_failed',reservation_retained:reserved},500);
 }
});
