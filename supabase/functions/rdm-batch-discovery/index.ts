import { createClient } from "jsr:@supabase/supabase-js@2";
import { resolveRequestActor, RequestAuthError } from "../_shared/request-auth.ts";
import { resolvePluginKey, pluginRequest } from "../_shared/wordpress-plugin-client.ts";

// Non-billable, interactive CMS maintenance for this fixed published batch only.
// No model, image, SERP, scheduling or arbitrary outbound destination is exposed.
const projectId="fab1032d-56a4-4e59-b3d4-4a68d3d4bf0a";
const org="04f16755-dedb-4f1b-a0a3-1a83054b36a0";
const base="https://rdmadvogados.com.br/blog";
const cors={"Access-Control-Allow-Origin":"https://app.zica.posts.zicajuris.com.br","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:cors});
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:cors});
 if(req.method!=="POST")return json({error:"method_not_allowed"},405);
 try{
  const actor=await resolveRequestActor(req);
  if(actor.mode!=="user")return json({error:"interactive_user_required"},403);
  const body=await req.json();
  if(body.manual!==true)return json({error:"manual_required"},400);
  const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:project,error}=await admin.from("projects").select("*").eq("id",projectId).single();
  if(error||project.user_id!==actor.userId||project.organization_id!==org||String(project.wordpress_url).replace(/\/$/,"")!==base)return json({error:"project_access_denied"},403);
  const {data:articles,error:articleError}=await admin.from("articles").select("id,status,published_url,config").eq("project_id",projectId).eq("config->>rdm_manual_batch","20261110-criminal-13");
  if(articleError||articles?.length!==13||articles.some(a=>a.status!=="published"||!a.published_url?.startsWith(base+"/")||a.config?.review_pass!==true))return json({error:"published_reviewed_batch_required"},409);
  const topics=new Set(articles.map(a=>Number(a.config.rdm_manual_topic)));
  if(topics.size!==13||[...topics].some(n=>n<1||n>13))return json({error:"invalid_batch"},409);
  const {apiKey}=await resolvePluginKey(admin,project);
  const files=await pluginRequest(base,apiKey,"discovery/refresh",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}",redirect:"error",signal:AbortSignal.timeout(30000)});
  const urls=articles.map(a=>a.published_url);
  const indexnow=await pluginRequest(base,apiKey,"indexnow/batch",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({urls}),redirect:"error",signal:AbortSignal.timeout(45000)});
  return json({success:true,files:files.data,indexnow:indexnow.data,urls,note:"submission_received_not_indexing_confirmation"});
 }catch(error){return json({error:error instanceof RequestAuthError?error.code:error instanceof Error?error.message:"discovery_failed"},error instanceof RequestAuthError?error.status:502);}
});
