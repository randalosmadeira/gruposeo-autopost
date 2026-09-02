import Fastify from 'fastify';
import { credential,redis } from './config.js';
import { verifyBody } from './security.js';
import { enqueueEvent } from './queues.js';
import { recordInbound,targetByOrigin } from './registry.js';
import type { InboundBatch } from './types.js';

const app=Fastify({logger:true,bodyLimit:2*1024*1024});
app.addContentTypeParser('application/json',{parseAs:'buffer'},(_request,body,done)=>{try{const raw=body.toString('utf8');done(null,{__raw:raw,__json:JSON.parse(raw)});}catch(error){done(error as Error,undefined);}});
app.get('/health',async()=>({ok:true,service:'zica-orchestrator',version:'3.10.2'}));

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

const port=Number(process.env.PORT||8787);
app.listen({port,host:'0.0.0.0'}).catch(error=>{app.log.error(error);process.exit(1);});
