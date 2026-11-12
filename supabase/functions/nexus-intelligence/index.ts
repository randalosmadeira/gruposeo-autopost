import '../_shared/nexus-runtime-bootstrap.ts';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {PAID_SERVICES_BLOCKED, allowWordPressBase} from '../_shared/nexus-spend-lock.ts';
import { createClient } from "jsr:@supabase/supabase-js@2";
import { resolveRequestActor, RequestAuthError } from "../_shared/request-auth.ts";
import { parseSerp, parseAiObservation, SAMPLING_METHOD, AUTONOMOUS_REVIEW_PROMPT, validateAutonomousReview, validateLinkDestination, topicGroups, insertDraftLink } from "../_shared/nexus-intelligence.ts";
import { isObservationEngine, isExecutableEngine, engineKind, ENGINE_PROVIDER, normalizeObservation, manualRequestKey, runRequestKey, normalizePromptSet, normalizePrompt, normalizeOrigins, generateSiteId, generateSiteSecret, buildSignalsSnippet, parseGeminiObservation, parseClaudeObservation, parsePerplexityObservation } from "../_shared/nexus-intelligence.ts";
import { isPluginModeProject, resolvePluginKey, resolvePluginNamespace, pluginRequest } from "../_shared/wordpress-plugin-client.ts";
import { editorialFingerprint, signEditorialReceipt } from "../_shared/nexus-approval.ts";
import { normalizeEditorialHtml } from "../_shared/editorial-html.ts";
const cors = { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods":"POST, OPTIONS", "Content-Type":"application/json" };
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors});
const text=(value:unknown,max=2000)=>typeof value==='string'?value.trim().slice(0,max):'';
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 if(req.method!=='POST')return json({error:'method_not_allowed'},405);
 let operationId=''; let reserved=false;
 const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||Deno.env.get('SUPABASE_SECRET_KEY')||'';
 const admin=createClient(Deno.env.get('SUPABASE_URL')||'',key,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const body=await req.json(); const actor=await resolveRequestActor(req,body.userId);
  const {data:project,error:projectError}=await admin.from('projects').select('id,name,description,nicho,compliance_rules,domain,wordpress_url,organization_id,user_id,editorial_identity,commercial_info,social_links,cta_leads,cta_conclusao,social_instagram,social_linkedin,social_youtube,social_twitter,social_tiktok,social_google_maps,nexus_strategy,nexus_strategy_version,nexus_profile_status,wordpress_connector_mode,wordpress_username,wordpress_credential_ref,wordpress_app_password,wordpress_plugin_namespace').eq('id',body.projectId).eq('user_id',actor.userId).maybeSingle();
  if(projectError||!project?.organization_id)return json({error:'project_forbidden'},403);
  const org=project.organization_id;
  const {data:membership,error:membershipError}=await admin.from('organization_members').select('organization_id').eq('organization_id',org).eq('user_id',actor.userId).eq('status','active').maybeSingle();
  if(membershipError||!membership)return json({error:'organization_membership_required'},403);
  const host=new URL(project.wordpress_url||`https://${project.domain}`).hostname;
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
   const {data,error}=await admin.rpc('nexus_provider_secret',{p_org:org,p_actor:actor.userId,p_provider:text(body.provider,20),p_secret:text(body.secret,4096)});
   if(error)return json({error:'credential_not_stored_check_role_and_value'},403);
   return json({success:true,status:data});
  }
  if(body.action==='prepare'){
   if(!['serp','ai_observation','editorial_review','pilot'].includes(body.kind))return json({error:'unsupported_operation'},400);
   const input:Record<string,unknown>&{query:string;variants:string[];branded:boolean}={query:text(body.query,500),country:text(body.country,2)||'br',language:text(body.language,10)||'pt-BR',city:text(body.city,100),
    variants:Array.isArray(body.variants)?body.variants.filter((v:unknown)=>typeof v==='string').slice(0,8).map((v:string)=>v.slice(0,120)):[],
    articleId:text(body.articleId,36),branded:body.branded===true,repetition:Math.min(5,Math.max(1,Number(body.repetition)||1)),method_version:SAMPLING_METHOD.version};
   if(isObservationEngine(body.engine))input.engine=body.engine;
   if(typeof body.branded!=='boolean')input.branded=input.variants.some((v:string)=>v.trim().length>=3&&input.query.toLocaleLowerCase().includes(v.trim().toLocaleLowerCase()));
   if(['serp','ai_observation'].includes(body.kind)&&!input.query)return json({error:'query_required'},400);
   const requestKey:string=crypto.randomUUID();
   if(body.kind==='editorial_review'){
    const {data:article}=await admin.from('articles').select('*').eq('id',input.articleId).eq('project_id',project.id).eq('user_id',actor.userId).maybeSingle();
    if(!article)return json({error:'article_forbidden'},403);
    const {data:id,error:prepareError}=await admin.rpc('nexus_prepare_article_review',{p_article:article.id});
    if(prepareError)throw prepareError;
    if(!id)return json({error:'article_content_required',executed:false},409);
    return json({success:true,operation:{id},executed:false});
   }
   const {data,error}=await admin.from('nexus_operations').insert({organization_id:org,project_id:project.id,user_id:actor.userId,kind:body.kind,request_key:requestKey,input}).select('id').single();
   if(error)throw error;return json({success:true,operation:data,executed:false});
  }
  if(body.action==='prepare_pilot'){
   const {data:articles,error}=await admin.from('articles').select('id,title,keyword,project_id').eq('user_id',actor.userId).eq('project_id',project.id).eq('status','published').order('id').limit(10);
   if(error)throw error;
   const {data,error:saveError}=await admin.from('nexus_operations').upsert((articles||[]).map(article=>({organization_id:org,project_id:project.id,user_id:actor.userId,kind:'pilot',request_key:`pilot-v1:${project.id}:${article.id}`,input:{baseline_article:article.id,title:article.title,keyword:article.keyword,review_mode:'autonomous',workflow:['research','strategy','writer','factual_review','conversion_review','delivery_gate'],state:'baseline_selected_not_evaluated'}})),{onConflict:'organization_id,request_key',ignoreDuplicates:true}).select('id');
   if(saveError)throw saveError;return json({success:true,prepared:data?.length||0,executed:false});
  }
  // ---- Observatory actions (2026-11-12). Execution of paid collectors stays behind PAID_SERVICES_BLOCKED + budget. ----
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
   const requestKey=await manualRequestKey(o.engine,String(o.input.query),String(o.input.country),o.observedAt);
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
    rows.push({organization_id:org,project_id:project.id,user_id:actor.userId,kind:engineKind(engine),request_key:runRequestKey(set.id,prompt.id,engine,market.country,day),
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
   const {data:adminMember}=await admin.from('organization_members').select('role').eq('organization_id',org).eq('user_id',actor.userId).eq('status','active').in('role',['owner','admin']).maybeSingle();
   const {data:ownerOrg}=adminMember?{data:true}:await admin.from('organizations').select('id').eq('id',org).eq('owner_user_id',actor.userId).maybeSingle();
   if(!adminMember&&!ownerOrg)return json({error:'forbidden'},403);
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
  if(['validate_destinations','suggest_links','apply_link'].includes(body.action)){
   const {data:allowed}=await admin.from('nexus_programs').select('settings').eq('organization_id',org).maybeSingle();
   if(!Array.isArray(allowed?.settings?.destination_hosts)||!allowed.settings.destination_hosts.includes(host))return json({error:'destination_host_not_authorized'},409);
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
  const engine=text(operation.input?.engine,40)||(operation.kind==='serp'?'google_serp':'chatgpt_api');
  if(['serp','ai_observation'].includes(operation.kind)){
   if(!isExecutableEngine(engine))return json({error:'engine_not_executable',engine,executed:false},409);
   if(engineKind(engine)!==operation.kind)return json({error:'engine_kind_mismatch',executed:false},409);
  }
  const {data:program}=await admin.from('nexus_programs').select('*').eq('organization_id',org).maybeSingle();
  if(PAID_SERVICES_BLOCKED||!program?.execution_enabled||program.budget_usd_micros===0)return json({error:'budget_paused',executed:false},402);
  const provider=operation.kind==='editorial_review'?'openai':ENGINE_PROVIDER[engine]||'openai';
  const {data:credential,error:credentialError}=await admin.rpc('nexus_provider_secret',{p_org:org,p_actor:actor.userId,p_provider:provider});
  if(credentialError||!credential)return json({error:'organization_credential_required',executed:false},409);
  const model=['gemini_api','claude_api'].includes(engine)?text(program.settings?.observation_models?.[engine],100):text(program.settings?.observation_model,100);
  if(['openai','gemini','anthropic'].includes(provider)&&!model)return json({error:'model_not_configured',executed:false},409);
  const {error:reserveError}=await admin.rpc('nexus_reserve_operation',{p_operation:operation.id});
  if(reserveError)return json({error:'budget_or_pricing_gate',executed:false},402);
  reserved=true;
  const input=operation.input;let output:Record<string,unknown>;
  if(operation.kind==='serp'){
   const response=await fetch('https://google.serper.dev/search',{method:'POST',headers:{'X-API-KEY':credential,'Content-Type':'application/json'},body:JSON.stringify({q:input.query,gl:input.country,hl:input.language.split('-')[0],location:input.city||undefined,num:10}),signal:AbortSignal.timeout(30000)});
   if(!response.ok)throw new Error('provider_request_failed');
   const raw=await response.json();output={...parseSerp(raw,host),raw,collected_at:new Date().toISOString(),query:input.query,context:input,provider:'serper'};
  }else if(operation.kind==='ai_observation'&&['gemini_api','claude_api','perplexity_api'].includes(engine)){
   const variants:string[]=Array.isArray(input.variants)?input.variants:[];
   const country=String(input.country||'br').toUpperCase();
   let response:Response;
   if(engine==='gemini_api')response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'x-goog-api-key':credential,'Content-Type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:input.query}]}],tools:[{google_search:{}}]}),signal:AbortSignal.timeout(90000)});
   else if(engine==='claude_api')response=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':credential,'anthropic-version':'2023-06-01','Content-Type':'application/json'},body:JSON.stringify({model,max_tokens:4000,messages:[{role:'user',content:input.query}],tools:[{type:'web_search_20250305',name:'web_search',max_uses:3,user_location:{type:'approximate',country,city:input.city||undefined}}]}),signal:AbortSignal.timeout(90000)});
   else response=await fetch('https://api.perplexity.ai/search',{method:'POST',headers:{Authorization:`Bearer ${credential}`,'Content-Type':'application/json'},body:JSON.stringify({query:input.query,country,max_results:10}),signal:AbortSignal.timeout(30000)});
   if(!response.ok)throw new Error('provider_request_failed');
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
   const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${credential}`,'Content-Type':'application/json'},body:JSON.stringify({model,max_output_tokens:4000,store:false,
    ...(article?{instructions:AUTONOMOUS_REVIEW_PROMPT,text:{format:{type:'json_object'}},input:JSON.stringify({article:{title:article.title,content:String(article.content||'').slice(0,50000)},sources:String(article.config?.sourcesContext||'').slice(0,8000),project:{strategy:project.nexus_strategy,strategy_version:project.nexus_strategy_version,identity:project.editorial_identity,sector:project.nicho,description:project.description,compliance:project.compliance_rules},offer:project.commercial_info,brief:article.config?.conversionBrief,segment:article.config?.segment,intent:article.config?.intentType,goal:article.config?.goal})}:{tools:[{type:'web_search',user_location:{type:'approximate',country:String(input.country).toUpperCase(),city:input.city||undefined}}],input:input.query})}),signal:AbortSignal.timeout(90000)});
   if(!response.ok)throw new Error('provider_request_failed');
   const raw=await response.json();
   if(!article)output={...parseAiObservation(raw,host,input.variants),raw,collected_at:new Date().toISOString(),query:input.query,context:input,provider:'openai',method:SAMPLING_METHOD};
   else{
    const resultText=(raw.output||[]).filter((o:any)=>o.type==='message').flatMap((o:any)=>o.content||[]).map((c:any)=>c.text||'').join('');
    const verdict=validateAutonomousReview(JSON.parse(resultText),String(article.config?.sourcesContext||''));
    const audit=normalizeEditorialHtml(String(article.content||''));
    output={...verdict,pass:verdict.pass&&audit.pass,method:'autonomous_model_review_plus_deterministic_gates',evaluated_at:new Date().toISOString(),raw};
    if(output.pass&&program.review_mode==='autonomous'){
     const receipt=await signEditorialReceipt(snapshot!,actor.userId,key,"autonomous");
     const {data:saved,error}=await admin.from('articles').update({config:{...article.config,nexus_approval_required:true,nexus_approval:receipt,nexus_review_mode:'autonomous',review_pass:true,needs_primary_source:false}}).eq('id',article.id).eq('user_id',actor.userId).eq('updated_at',article.updated_at).select('id').maybeSingle();
     if(error||!saved)throw new Error('article_changed_during_review');
    }
   }
  }
  output.accounting='configured_ceiling_debit_not_provider_invoice';
  const {error:finishError}=await admin.rpc('nexus_finish_operation',{p_operation:operation.id,p_output:output});if(finishError)throw finishError;
  return json({success:true,output});
 }catch(error){
  if(reserved&&operationId)await admin.from('nexus_operations').update({status:'uncertain',output:{error:'execution_or_recording_failed',reservation_retained:true}}).eq('id',operationId);
  if(error instanceof RequestAuthError)return json({error:error.code},error.status);
  return json({error:'operation_failed',reservation_retained:reserved},500);
 }
});
