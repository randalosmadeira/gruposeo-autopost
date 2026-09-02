import { Redis } from 'ioredis';
import { createClient } from '@supabase/supabase-js';
import type { CredentialRecord } from './types.js';

function required(name:string){const value=process.env[name];if(!value)throw new Error(`Missing required environment variable: ${name}`);return value;}

export const redis=new Redis(process.env.REDIS_URL||'redis://127.0.0.1:6379',{maxRetriesPerRequest:null,enableReadyCheck:true});
export const supabase=createClient(required('SUPABASE_URL'),required('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});

let envVault:Record<string,CredentialRecord> = {};
const rawVault=(process.env.ZICA_CREDENTIALS_JSON||'').trim();
if(rawVault && rawVault !== '{}'){
  try{
    const parsed=JSON.parse(rawVault) as unknown;
    if(parsed && typeof parsed === 'object' && !Array.isArray(parsed)){
      envVault=parsed as Record<string,CredentialRecord>;
    }else{
      console.warn('[zica-orchestrator] ZICA_CREDENTIALS_JSON must be a JSON object; Vault RPC fallback remains enabled.');
    }
  }catch{
    console.warn('[zica-orchestrator] ZICA_CREDENTIALS_JSON is malformed; Vault RPC fallback remains enabled.');
  }
}

type CachedCredential={value:CredentialRecord;expiresAt:number};
const credentialCache=new Map<string,CachedCredential>();
const CREDENTIAL_CACHE_MS=60_000;

function normalizeVaultSecret(raw:string):CredentialRecord{
  const trimmed=raw.trim();
  if(!trimmed)throw new Error('Vault credential is empty');
  if(trimmed.startsWith('{')){
    try{
      const parsed=JSON.parse(trimmed) as unknown;
      if(parsed && typeof parsed==='object' && !Array.isArray(parsed))return parsed as CredentialRecord;
    }catch{
      // Raw secrets are supported below.
    }
  }
  // WordPress API keys, HMAC secrets and IndexNow keys are stored as opaque raw values.
  // The target's credential reference determines which field is consumed by the caller.
  return{apiKey:trimmed,hmacSecret:trimmed,indexNowKey:trimmed};
}

export async function credential(ref:string):Promise<CredentialRecord>{
  const key=(ref||'').trim();
  if(!key)throw new Error('Credential reference is empty');
  const envValue=envVault[key];
  if(envValue)return envValue;
  const cached=credentialCache.get(key);
  if(cached&&cached.expiresAt>Date.now())return cached.value;
  const{data,error}=await supabase.rpc('get_zica_orchestrator_credential',{p_ref:key});
  if(error)throw new Error(`Vault credential lookup failed for ${key}: ${error.message}`);
  if(typeof data!=='string'||!data.trim())throw new Error(`Credential reference not found: ${key}`);
  const value=normalizeVaultSecret(data);
  credentialCache.set(key,{value,expiresAt:Date.now()+CREDENTIAL_CACHE_MS});
  return value;
}
