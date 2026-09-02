import path from 'node:path/posix';
import { createRequire } from 'node:module';
import { credential } from './config.js';
import type { ArticlePayload,TargetRecord } from './types.js';

type SftpRuntime={connect(config:Record<string,unknown>):Promise<unknown>;mkdir(path:string,recursive?:boolean):Promise<unknown>;put(input:Buffer|string,remotePath:string):Promise<unknown>;rename(oldPath:string,newPath:string):Promise<unknown>;end():Promise<unknown>;};
type SftpCtor=new()=>SftpRuntime;
const require=createRequire(import.meta.url);
const SftpClient=require('ssh2-sftp-client') as SftpCtor;

function safeSlug(input:string){if(!/^[a-z0-9][a-z0-9-]{0,190}$/i.test(input))throw new Error('Unsafe article slug');return input;}
function escapeHtml(input:string){return input.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]||c));}

export async function deployStatic(target:TargetRecord,article:ArticlePayload){
  const creds=await credential(target.credential_ref);
  if(!creds.host||!creds.username||(!creds.privateKey&&!creds.password))throw new Error(`Incomplete SFTP credential: ${target.credential_ref}`);
  const remoteBase=typeof target.config.remoteBasePath==='string'?target.config.remoteBasePath:'';
  if(!remoteBase||!remoteBase.startsWith('/'))throw new Error('remoteBasePath must be an absolute path');
  const dir=path.join(remoteBase,safeSlug(article.slug));
  const targetFile=path.join(dir,'index.html');
  const tempFile=`${targetFile}.zica-tmp`;
  const schema=article.schema_json?`<script type="application/ld+json">${JSON.stringify(article.schema_json).replace(/</g,'\\u003c')}</script>`:'';
  const html=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">${schema}<title>${escapeHtml(article.title)}</title></head><body>${article.content}</body></html>`;
  const sftp=new SftpClient();
  try{await sftp.connect({host:creds.host,port:creds.port||22,username:creds.username,...(creds.privateKey?{privateKey:creds.privateKey}:{password:creds.password}),readyTimeout:15000});await sftp.mkdir(dir,true);await sftp.put(Buffer.from(html,'utf8'),tempFile);await sftp.rename(tempFile,targetFile);}finally{await sftp.end().catch(()=>undefined);}
  return{path:targetFile};
}
