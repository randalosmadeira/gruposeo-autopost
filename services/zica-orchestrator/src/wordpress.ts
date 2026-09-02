import crypto from 'node:crypto';
import { credential } from './config.js';
import { assertPublicHttpUrl,signBody } from './security.js';
import type { ArticlePayload,TargetRecord,WordPressEvent } from './types.js';

function normalizedBase(input:string){return assertPublicHttpUrl(input).toString().replace(/\/$/,'');}
function siteBase(target:TargetRecord){const configured=typeof target.config.deliverySiteUrl==='string'?target.config.deliverySiteUrl:target.site_url;return normalizedBase(configured);}

function pluginUrls(base:string,route:string){
  const clean=normalizedBase(base);
  const restRoute=`/zica-posts/v1${route}`;
  return[
    `${clean}/wp-json${restRoute}`,
    `${clean}/?rest_route=${restRoute}`,
  ];
}

async function pluginFetch(base:string,route:string,options:RequestInit,timeoutMs:number){
  let lastStatus=0;
  let lastBody='';
  for(const url of pluginUrls(base,route)){
    try{
      const response=await fetch(url,{...options,headers:{Accept:'application/json',...(options.headers||{})},signal:AbortSignal.timeout(timeoutMs)});
      lastStatus=response.status;
      const contentType=(response.headers.get('content-type')||'').toLowerCase();
      if(response.ok&&contentType.includes('application/json'))return response;
      lastBody=(await response.text()).slice(0,240);
      // Authentication failures from a real JSON REST endpoint are definitive.
      if([401,403].includes(response.status)&&contentType.includes('application/json'))break;
    }catch(error){lastBody=error instanceof Error?error.message:'network_error';}
  }
  throw new Error(`WordPress plugin route ${route} unavailable (HTTP ${lastStatus||'network'}): ${lastBody}`);
}

export async function fetchArticle(target:TargetRecord,event:WordPressEvent){
  const creds=await credential(target.credential_ref);
  if(!creds.apiKey)throw new Error(`apiKey missing for ${target.credential_ref}`);
  const source=typeof target.config.sourceSiteUrl==='string'?target.config.sourceSiteUrl:event.site;
  const response=await pluginFetch(source,`/articles/${event.post.id}`,{headers:{'X-ZICA-POSTS-Key':creds.apiKey}},20000);
  const json=await response.json() as {success?:boolean;data?:ArticlePayload};
  if(!json.success||!json.data)throw new Error('WordPress article payload invalid');
  return json.data;
}

export async function pushHubSync(target:TargetRecord,article:ArticlePayload,event:WordPressEvent){
  const hmacCreds=await credential(target.hmac_secret_ref);
  if(!hmacCreds.hmacSecret)throw new Error(`hmacSecret missing for ${target.hmac_secret_ref}`);
  const base=siteBase(target);
  const body=JSON.stringify({post_id:article.id,title:article.title,content:article.content,excerpt:article.excerpt,slug:article.slug,content_hash:article.content_hash,correlation_id:event.correlation_id,schema_json:article.schema_json});
  const timestamp=Math.floor(Date.now()/1000).toString();
  const nonce=crypto.randomUUID();
  const response=await pluginFetch(base,'/hub/sync',{method:'POST',headers:{'Content-Type':'application/json','X-Zica-Timestamp':timestamp,'X-Zica-Nonce':nonce,'X-Zica-Signature':signBody(body,hmacCreds.hmacSecret,timestamp,nonce),'X-Zica-Correlation-ID':event.correlation_id},body},30000);
  return response.json() as Promise<Record<string,unknown>>;
}

export async function triggerReconcile(target:TargetRecord){
  const creds=await credential(target.credential_ref);
  if(!creds.apiKey)throw new Error(`apiKey missing for ${target.credential_ref}`);
  const base=siteBase(target);
  const response=await pluginFetch(base,'/sync',{method:'POST',headers:{'X-ZICA-POSTS-Key':creds.apiKey,'Content-Type':'application/json'},body:'{}'},45000);
  return response.json() as Promise<Record<string,unknown>>;
}
