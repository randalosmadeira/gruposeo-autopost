import { Worker } from 'bullmq';
import { redis } from './config.js';
import { optimizeArticle } from './ai.js';
import { purgeCdn } from './cdn.js';
import { flushIndexNow,queueUrl } from './indexnow.js';
import { activeTargets,targetByKey,updateEvent } from './registry.js';
import { deployStatic } from './sftp.js';
import type { ContentJob } from './types.js';
import { fetchArticle,pushHubSync,triggerReconcile } from './wordpress.js';
import { CONTENT_QUEUE_NAME,INDEX_QUEUE_NAME,enqueueIndexFlush,enqueueReconcile } from './queues.js';

const contentWorker=new Worker<ContentJob>(CONTENT_QUEUE_NAME,async job=>{const data=job.data;const target=await targetByKey(data.targetKey);if(data.kind==='reconcile'){if(target.delivery_mode!=='wordpress_rest')return{skipped:true,reason:'not_wordpress'};return triggerReconcile(target);}const event=data.event;await updateEvent(event.event_id,{status:'processing',attempts:job.attemptsMade+1});try{const sourceArticle=await fetchArticle(target,event);const article=await optimizeArticle(sourceArticle);if(target.delivery_mode==='wordpress_rest'){if((process.env.AI_PROVIDER||'none').toLowerCase()!=='none')await pushHubSync(target,article,event);}else if(target.delivery_mode==='static_sftp')await deployStatic(target,article);else throw new Error(`Unsupported delivery_mode: ${target.delivery_mode}`);await queueUrl(target.target_key,event.post.url);await enqueueIndexFlush(target.target_key);await purgeCdn(target,[event.post.url]).catch(()=>({skipped:true}));await updateEvent(event.event_id,{status:'completed',completed_at:new Date().toISOString(),last_error:null});return{ok:true,url:event.post.url};}catch(error){const attempts=job.attemptsMade+1;await updateEvent(event.event_id,{status:attempts>=5?'dead_letter':'retry',attempts,last_error:error instanceof Error?error.message.slice(0,2000):'unknown_error'});throw error;}},{connection:redis,concurrency:5,limiter:{max:20,duration:10000}});

const indexWorker=new Worker<{targetKey:string}>(INDEX_QUEUE_NAME,async job=>flushIndexNow(await targetByKey(job.data.targetKey),500),{connection:redis,concurrency:2,limiter:{max:10,duration:10000}});

async function scheduleDaily(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date());const get=(type:string)=>parts.find(p=>p.type===type)?.value||'';if(get('hour')!=='15'||Number(get('minute'))>4)return;const date=`${get('year')}-${get('month')}-${get('day')}`;const lock=await redis.set(`zica:daily:${date}`,'1','EX',26*3600,'NX');if(!lock)return;for(const target of await activeTargets())await enqueueReconcile(target.target_key,date);}setInterval(()=>{scheduleDaily().catch(error=>console.error('daily scheduler error',error));},60000);scheduleDaily().catch(error=>console.error('daily scheduler startup error',error));

for(const signal of ['SIGTERM','SIGINT'] as const)process.on(signal,async()=>{await Promise.allSettled([contentWorker.close(),indexWorker.close()]);await redis.quit();process.exit(0);});
