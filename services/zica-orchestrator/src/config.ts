import { Redis } from 'ioredis';
import { createClient } from '@supabase/supabase-js';
import type { CredentialRecord } from './types.js';

function required(name:string){const value=process.env[name];if(!value)throw new Error(`Missing required environment variable: ${name}`);return value;}

export const redis=new Redis(process.env.REDIS_URL||'redis://127.0.0.1:6379',{maxRetriesPerRequest:null,enableReadyCheck:true});
export const supabase=createClient(required('SUPABASE_URL'),required('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});

let vault:Record<string,CredentialRecord>;
try{
  vault=JSON.parse(process.env.ZICA_CREDENTIALS_JSON||'{}') as Record<string,CredentialRecord>;
}catch{
  throw new Error('ZICA_CREDENTIALS_JSON is not valid JSON');
}

export function credential(ref:string){const value=vault[ref];if(!value)throw new Error(`Credential reference not found: ${ref}`);return value;}
