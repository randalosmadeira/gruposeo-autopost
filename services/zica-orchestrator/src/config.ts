import { Redis } from 'ioredis';
import { createClient } from '@supabase/supabase-js';
import type { CredentialRecord } from './types.js';

function required(name:string){const value=process.env[name];if(!value)throw new Error(`Missing required environment variable: ${name}`);return value;}

export const redis=new Redis(process.env.REDIS_URL||'redis://127.0.0.1:6379',{maxRetriesPerRequest:null,enableReadyCheck:true});
export const supabase=createClient(required('SUPABASE_URL'),required('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});

let vault:Record<string,CredentialRecord> = {};
const rawVault=(process.env.ZICA_CREDENTIALS_JSON||'').trim();
if(rawVault && rawVault !== '{}'){
  try{
    const parsed=JSON.parse(rawVault) as unknown;
    if(parsed && typeof parsed === 'object' && !Array.isArray(parsed)){
      vault=parsed as Record<string,CredentialRecord>;
    }else{
      console.warn('[zica-orchestrator] ZICA_CREDENTIALS_JSON must be a JSON object; starting with an empty credential vault.');
    }
  }catch{
    console.warn('[zica-orchestrator] ZICA_CREDENTIALS_JSON is malformed; starting with an empty credential vault.');
  }
}

export function credential(ref:string){const value=vault[ref];if(!value)throw new Error(`Credential reference not found: ${ref}`);return value;}
