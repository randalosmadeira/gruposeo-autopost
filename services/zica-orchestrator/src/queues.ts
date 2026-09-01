import { Queue } from 'bullmq';
import { redis } from './config.js';
import type { ContentJob,WordPressEvent } from './types.js';

export const CONTENT_QUEUE_NAME='zica-content';
export const INDEX_QUEUE_NAME='zica-index-flush';

export const contentQueue=new Queue<ContentJob>(CONTENT_QUEUE_NAME,{connection:redis});
export const indexQueue=new Queue<{targetKey:string}>(INDEX_QUEUE_NAME,{connection:redis});

export async function enqueueEvent(targetKey:string,event:WordPressEvent){return contentQueue.add('content-event',{kind:'event',targetKey,event},{jobId:event.event_id,attempts:5,backoff:{type:'exponential',delay:2000},removeOnComplete:1000,removeOnFail:5000});}
export async function enqueueReconcile(targetKey:string,date:string){return contentQueue.add('daily-reconcile',{kind:'reconcile',targetKey,date},{jobId:`reconcile:${targetKey}:${date}`,attempts:4,backoff:{type:'exponential',delay:5000},removeOnComplete:1000,removeOnFail:5000});}
export async function enqueueIndexFlush(targetKey:string){const bucket=Math.floor(Date.now()/300000);return indexQueue.add('flush',{targetKey},{jobId:`index:${targetKey}:${bucket}`,attempts:5,backoff:{type:'exponential',delay:5000},removeOnComplete:500,removeOnFail:1000});}
