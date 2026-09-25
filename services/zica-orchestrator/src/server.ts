import Fastify from 'fastify';
import { credential,redis,supabase } from './config.js';
import crypto from 'node:crypto';
import { verifyBody } from './security.js';
import { enqueueEvent,enqueueSupporterAvatar } from './queues.js';
import { PIPELINE_VERSION as SUPPORTER_PIPELINE } from './supporter-avatar/prompt.js';
import { recordInbound,targetByOrigin } from './registry.js';
import type { InboundBatch } from './types.js';

const app=Fastify({logger:true,bodyLimit:2*1024*1024});
app.addContentTypeParser('application/json',{parseAs:'buffer'},(_request,body,done)=>{try{const raw=body.toString('utf8');done(null,{__raw:raw,__json:JSON.parse(raw)});}catch(error){done(error as Error,undefined);}});
app.get('/health',async()=>({ok:true,service:'zica-ia-posts-orchestrator',version:'3.11.0'}));

app.post('/webhooks/wordpress',async(request,reply)=>{
  const wrapped=request.body as {__raw?:string;__json?:InboundBatch};
  const raw=wrapped?.__raw||'';
  const body=wrapped?.__json;
  if(!body?.site||!Array.isArray(body.events))return reply.code(400).send({ok:false,error:'invalid_payload'});
  let origin:string;
  try{origin=new URL(body.site).origin;}catch{return reply.code(400).send({ok:false,error:'invalid_site'});}
  const target=await targetByOrigin(origin);
  if(!target)return reply.code(404).send({ok:false,error:'site_not_registered'});
  const timestamp=String(request.headers['x-zica-timestamp']||'');
  const nonce=String(request.headers['x-zica-nonce']||'');
  const signature=String(request.headers['x-zica-signature']||'');
  const hmac=(await credential(target.hmac_secret_ref)).hmacSecret;
  if(!hmac||!verifyBody(raw,hmac,timestamp,nonce,signature))return reply.code(401).send({ok:false,error:'invalid_signature'});
  const accepted=await redis.set(`zica:nonce:${target.target_key}:${nonce}`,'1','EX',600,'NX');
  if(!accepted)return reply.code(409).send({ok:false,error:'replay_detected'});
  let queued=0;
  for(const event of body.events.slice(0,100)){
    if(!event?.event_id||!event?.post?.id||event.event_type==='hub_applied')continue;
    await recordInbound(target.target_key,event);
    await enqueueEvent(target.target_key,event);
    queued++;
  }
  return reply.code(202).send({ok:true,queued,target:target.target_key});
});


const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * Despacho do gerador de apoiadores 1470 (chamado pela Edge Function pública).
 * Autorização = token de despacho por job (hash guardado em supporter_avatar_jobs.input_payload);
 * nenhum segredo compartilhado adicional. Um job Supabase vira exatamente um job BullMQ.
 */
app.post('/supporter-avatar/dispatch',async(request,reply)=>{
  const body=(request.body as {__json?:{requestId?:unknown;jobId?:unknown;dispatchToken?:unknown}})?.__json||{};
  const requestId=String(body.requestId||'').trim();const jobId=String(body.jobId||'').trim();const dispatchToken=String(body.dispatchToken||'').trim();
  if(!UUID.test(requestId)||!UUID.test(jobId)||dispatchToken.length<32||dispatchToken.length>256)return reply.code(422).send({ok:false,error:'dispatch_credentials_required'});
  const{data:job,error}=await supabase.from('supporter_avatar_jobs').select('id,status,input_payload').eq('id',jobId).eq('request_id',requestId).maybeSingle();
  if(error)return reply.code(503).send({ok:false,error:'job_lookup_failed'});
  if(!job)return reply.code(404).send({ok:false,error:'job_not_found'});
  const expected=String((job.input_payload as Record<string,unknown>|null)?.dispatch_token_hash||'');
  const given=crypto.createHash('sha256').update(dispatchToken).digest('hex');
  if(!expected||expected.length!==given.length||!crypto.timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(given,'hex')))return reply.code(401).send({ok:false,error:'invalid_dispatch_token'});
  if(job.status==='completed')return reply.code(200).send({ok:true,status:'completed',pipeline:SUPPORTER_PIPELINE});
  if(!['queued','running','retry','regenerate'].includes(String(job.status)))return reply.code(409).send({ok:false,error:'job_not_dispatchable',status:job.status});
  await enqueueSupporterAvatar({requestId,jobId,dispatchToken});
  return reply.code(202).send({ok:true,queued:true,pipeline:SUPPORTER_PIPELINE,runtime:'vps'});
});

const port=Number(process.env.PORT||8787);
app.listen({port,host:'0.0.0.0'}).catch(error=>{app.log.error(error);process.exit(1);});
