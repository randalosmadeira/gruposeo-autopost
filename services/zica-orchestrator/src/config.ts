import { Redis } from 'ioredis';

function need(name:string){const value=process.env[name];if(!value)throw new Error(`Missing required env ${name}`);return value;}

export const config={redisUrl:need('REDIS_URL'),supabaseUrl:need('SUPABASE_URL'),supabaseServiceRole:need('SUPABASE_SERVICE_ROLE_KEY'),indexNowKey:process.env.INDEXNOW_KEY||'',aiProvider:process.env.AI_PROVIDER||'passthrough',aiModel:process.env.AI_MODEL||'',cloudflareApiToken:process.env.CLOUDFLARE_API_TOKEN||'',cloudflareZoneId:process.env.CLOUDFLARE_ZONE_ID||''};
export const redis=new Redis(config.redisUrl,{maxRetriesPerRequest:null,enableReadyCheck:true});
export function credential(ref:string){const key=`ZICA_CRED_${ref.replace(/[^A-Za-z0-9]/g,'_').toUpperCase()}`;const raw=process.env[key];if(!raw)throw new Error(`Credential reference not resolved: ${ref}`);try{return JSON.parse(raw) as Record<string,any>;}catch{throw new Error(`Credential reference contains invalid JSON: ${ref}`);}}
