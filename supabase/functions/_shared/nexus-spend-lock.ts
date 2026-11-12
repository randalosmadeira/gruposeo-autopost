/** Global administrative lock. No request, credential or organization budget can override it. */
export const PAID_SERVICES_BLOCKED = true;
type EdgeRuntime={env:{get:(name:string)=>string|undefined};serve:(handler:(req:Request)=>Response|Promise<Response>)=>unknown};
const runtime=()=>(globalThis as unknown as {Deno:EdgeRuntime}).Deno;
export function paidLockedServe(_handler:unknown){
 return runtime().serve(req=>req.method==='OPTIONS'?new Response(null,{headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,GET,OPTIONS'}}):paidLockResponse(req)!);
}
export function paidLockResponse(req:Request):Response|null {
 if(req.method==='OPTIONS')return null;
 return new Response(JSON.stringify({success:false,error:'Serviços pagos bloqueados globalmente. O plano pode ser salvo; geração e revisão por IA ficam pendentes.',code:'global_paid_services_blocked',executed:false,retryable:false}),{status:423,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info'}});
}
export function outboundAllowed(url:string,method:string,headers:Headers,ownHost:string):boolean {
 let parsed:URL;try{parsed=new URL(url);}catch{return false;}
 if(parsed.protocol!=='https:'&&parsed.protocol!=='http:')return false;
 if(parsed.hostname===ownHost&&ownHost)return true;
 // Public reading may continue; all external writes, authenticated API calls and known billable hosts stop.
 if(!['GET','HEAD'].includes(method.toUpperCase()))return false;
 if([...headers.keys()].some(k=>/authorization|api.?key|token|secret/i.test(k)))return false;
 if([...parsed.searchParams.keys()].some(k=>/key|token|secret|signature|credential/i.test(k)))return false;
 if(/(^api\.|openai|anthropic|generativelanguage|googleapis|serper|serpapi|dataforseo|replicate|fal\.ai|openrouter|perplexity|tavily|exa\.ai|firecrawl|rapidapi|apify|scrapingbee|scraperapi)/i.test(parsed.hostname))return false;
 return true;
}
/** Narrow non-billable CMS exception; never permits provider APIs or redirects. */
export function wordpressConnectorAllowed(url:string,method:string,headers:Headers,baseUrl:string):boolean {
 try {
  const u=new URL(url),base=new URL(baseUrl);
  if(base.protocol!=='https:'||u.origin!==base.origin||u.username||u.password||method.toUpperCase()!=='POST'||!headers.has('X-ZICA-POSTS-Key'))return false;
  const prefix=base.pathname.replace(/\/$/,'');
  if(CONNECTOR_PATHS.some(p=>u.pathname===prefix+'/wp-json'+p))return !u.search;
  return (u.pathname===prefix+'/'||u.pathname===prefix)&&[...u.searchParams.keys()].length===1&&CONNECTOR_PATHS.includes(u.searchParams.get('rest_route')||'');
 }catch{return false;}
}
/** Non-billable plugin routes: publishing, media and the signals key hand-off (12/11/2026). */
const CONNECTOR_PATHS=['/zica-posts/v1/articles','/zica-posts/v1/media','/zica-posts/v1/signals/configure','/zica-posts/v1/homepage-schema/inject'];
/** Bases approved at request time by a function that already verified project ownership. https only. */
const approvedBases=new Set<string>();
export function allowWordPressBase(baseUrl:string):boolean {
 try{const u=new URL(baseUrl);if(u.protocol!=='https:'||u.username||u.password)return false;approvedBases.add(u.href);return true;}catch{return false;}
}
export function installSpendLock(approvedWordPressBase=''){
 const original=globalThis.fetch.bind(globalThis);
 let host='';try{host=new URL(runtime().env.get('SUPABASE_URL')||'').hostname;}catch{/* fail closed */}
 globalThis.fetch=((input:RequestInfo|URL,init?:RequestInit)=>{
  const req=input instanceof Request?input:null;const url=req?.url||String(input);
  const method=init?.method||req?.method||'GET';const headers=new Headers(init?.headers||req?.headers);
  if(!outboundAllowed(url,method,headers,host)&&!wordpressConnectorAllowed(url,method,headers,approvedWordPressBase)&&![...approvedBases].some(base=>wordpressConnectorAllowed(url,method,headers,base)))throw new Error('global_paid_services_blocked');
  // No implicit external redirects: prevents a public URL redirecting to a billable API.
  return original(input,{...init,redirect:'manual'});
 }) as typeof fetch;
}
