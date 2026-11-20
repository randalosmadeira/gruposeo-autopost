import {createGuardedFetch,spendScoped,type RuntimeScopeEnv} from './spend-gate.ts';
/**
 * Global administrative lock. No request, credential or organization budget can override it.
 * Interruptor mestre do Teto Diário de Gasto (20/11/2026): true = bloqueio total (comportamento original, nada do teto roda);
 * false = o teto diário (spend-gate.ts) passa a decidir cada chamada paga. Só se vira com a migração 20261120400000 aplicada e as
 * funções reimplantadas (ver 14-teto-diario-gasto-ia-2026-11-20.md).
 */
export const PAID_SERVICES_BLOCKED = false;
type EdgeRuntime={env:{get:(name:string)=>string|undefined};serve:(handler:(req:Request)=>Response|Promise<Response>)=>unknown};
const runtime=()=>(globalThis as unknown as {Deno:EdgeRuntime}).Deno;
/** `fetch` original do runtime (antes do patch), usado pelo gate para falar com o Supabase sem passar pela própria trava. */
let originalFetch:typeof fetch|null=null;
const SPEND_MARK='__zicaSpendFetch';
const runtimeEnv=():RuntimeScopeEnv=>{
 const env=(n:string)=>{try{return String(runtime().env.get(n)||'').trim();}catch{return '';}};
 return {url:env('SUPABASE_URL'),serviceKeys:[env('SUPABASE_SERVICE_ROLE_KEY'),env('SUPABASE_SECRET_KEY')].filter(Boolean),rawFetch:((...a:Parameters<typeof fetch>)=>(originalFetch||globalThis.fetch)(...a)) as typeof fetch};
};
export interface LockOptions{blocked?:boolean;module?:string;orgId?:string}
export function paidLockedServe(handler:unknown,opts:LockOptions={}){
 if(!(opts.blocked??PAID_SERVICES_BLOCKED)){
  // Teto ligado: a função roda de verdade, dentro de um contexto de gasto por requisição; o gate decide cada chamada paga.
  return runtime().serve(spendScoped(handler as (req:Request)=>Response|Promise<Response>,runtimeEnv(),{module:opts.module,orgId:opts.orgId}));
 }
 return runtime().serve(req=>req.method==='OPTIONS'?new Response(null,{headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,GET,OPTIONS'}}):paidLockResponse(req)!);
}
/** Para funções que já têm seu próprio handler e usam `providerFetch`: igual a Deno.serve com a constante true; com false, dentro do contexto de gasto. */
export function scopedServe(handler:(req:Request)=>Response|Promise<Response>,opts:LockOptions={}){
 if(opts.blocked??PAID_SERVICES_BLOCKED)return runtime().serve(handler);
 return runtime().serve(spendScoped(handler,runtimeEnv(),{module:opts.module,orgId:opts.orgId}));
}
/** Com a constante true devolve o fetch original (idêntico a hoje). Com false, o fetch guardado pelo teto diário. */
export function makeProviderFetch(original:typeof fetch,opts:{blocked?:boolean}={}):typeof fetch{
 return (opts.blocked??PAID_SERVICES_BLOCKED)?original:createGuardedFetch({original});
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
export function installSpendLock(approvedWordPressBase='',opts:{blocked?:boolean}={}){
 const original=globalThis.fetch.bind(globalThis);
 if(!(globalThis.fetch as unknown as Record<string,unknown>)[SPEND_MARK])originalFetch=original;
 if(!(opts.blocked??PAID_SERVICES_BLOCKED)){
  // Teto ligado: o que não é serviço pago passa como antes da trava; serviço pago só sai com reserva (spend-gate.ts).
  const guarded=createGuardedFetch({original});(guarded as unknown as Record<string,unknown>)[SPEND_MARK]=true;globalThis.fetch=guarded;return;
 }
 let host='';try{host=new URL(runtime().env.get('SUPABASE_URL')||'').hostname;}catch{/* fail closed */}
 globalThis.fetch=((input:RequestInfo|URL,init?:RequestInit)=>{
  const req=input instanceof Request?input:null;const url=req?.url||String(input);
  const method=init?.method||req?.method||'GET';const headers=new Headers(init?.headers||req?.headers);
  if(!outboundAllowed(url,method,headers,host)&&!wordpressConnectorAllowed(url,method,headers,approvedWordPressBase)&&![...approvedBases].some(base=>wordpressConnectorAllowed(url,method,headers,base)))throw new Error('global_paid_services_blocked');
  // No implicit external redirects: prevents a public URL redirecting to a billable API.
  return original(input,{...init,redirect:'manual'});
 }) as typeof fetch;
 (globalThis.fetch as unknown as Record<string,unknown>)[SPEND_MARK]=true;
}
