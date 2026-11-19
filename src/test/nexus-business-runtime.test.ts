import {describe,it,expect,vi} from 'vitest';
import {cleanStrategy,profileGaps,planTerms,legacyStrategy} from '../../supabase/functions/_shared/nexus-business';
import {outboundAllowed,installSpendLock,paidLockResponse} from '../../supabase/functions/_shared/nexus-spend-lock';
import {editorialFingerprint,signEditorialReceipt,verifyEditorialReceipt} from '../../supabase/functions/_shared/nexus-approval';
describe('global administrative spend lock',()=>{
 it('blocks billable hosts, credentials, writes and lookalike internal domains',()=>{
  for(const url of ['https://api.openai.com/v1/responses','https://google.serper.dev/search','https://generativelanguage.googleapis.com/test','https://other.test/?api_key=x'])expect(outboundAllowed(url,'GET',new Headers(),'own.supabase.co')).toBe(false);
  expect(outboundAllowed('https://site.test','POST',new Headers(),'own.supabase.co')).toBe(false);
  expect(outboundAllowed('https://own.supabase.co.evil.test','GET',new Headers({authorization:'Bearer key'}),'own.supabase.co')).toBe(false);
  expect(outboundAllowed('https://own.supabase.co/rest/v1/projects','POST',new Headers({authorization:'Bearer key'}),'own.supabase.co')).toBe(true);
  expect(outboundAllowed('https://site.test/blog','GET',new Headers(),'own.supabase.co')).toBe(true);
 });
 it('never calls the underlying network for a denied provider',()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);vi.stubGlobal('Deno',{env:{get:()=> 'https://own.supabase.co'}});
  try{installSpendLock();expect(()=>fetch('https://api.openai.com/v1/responses',{method:'POST'})).toThrow('global_paid_services_blocked');expect(fetcher).not.toHaveBeenCalled();}finally{vi.unstubAllGlobals();}
 });
 it('returns a nonretryable pending state without claiming evaluation',async()=>{
  const result=paidLockResponse(new Request('https://own.test',{method:'POST'}))!;expect(result.status).toBe(423);expect(await result.json()).toMatchObject({executed:false,retryable:false});
 });
});
describe('business profile and waves',()=>{
 it('imports declared data only from the selected project, without universal defaults',()=>{expect(legacyStrategy({name:'A',social_instagram:'https://instagram.com/a',editorial_identity:{target_audience:'Audience A'}})).toMatchObject({instagram:'https://instagram.com/a',audience:'Audience A'});expect(legacyStrategy({name:'B'})).toMatchObject({instagram:'',audience:'',regions:''});});
 it('retains only profile fields and treats unknown goals as gaps',()=>{
  const clean=cleanStrategy({sector:' Beauty ',apiKey:'secret',offer:7,primaryGoal:'unknown'});expect(clean.sector).toBe('Beauty');expect(clean).not.toHaveProperty('apiKey');expect(profileGaps(clean)).toContain('primaryGoal');expect(clean.offer).toBe('');
 });
 it('deduplicates terms and separates intent from measured results',()=>{
  const p=planTerms('Cabelo; cabelo\ncontratar avaliação; melhor opção',{audience:'Público declarado',regions:'Município',offer:'Serviço',sector:'Beleza',primaryGoal:'leads'},3);
  expect(p.items).toHaveLength(3);expect(p.items.map(i=>i.stage)).toEqual(['discovery','decision','consideration']);expect(p.items[1]).toMatchObject({audience:'Público declarado',region:'Município',ranking:null,conversion:null,sources_status:'pending'});expect(p.strategy_version).toBe(3);
 });
 it('does not infer an audience or price for another business',()=>{const p=planTerms('serviço',{},0);expect(p.items[0].audience).toBeNull();expect(p.gaps).toContain('offer');});
 it('invalidates approval when strategy changes and signs review mode',async()=>{
  const a={id:'a',content:'<p>Conteúdo</p>'};const p={id:'p',nexus_strategy_version:1,nexus_strategy:{sector:'beleza'}};
  const first=await editorialFingerprint(a,p);const next=await editorialFingerprint(a,{...p,nexus_strategy_version:2});expect(first).not.toBe(next);
  const receipt=await signEditorialReceipt(first,'u','test-only-secret','autonomous');expect(await verifyEditorialReceipt(receipt,first,'test-only-secret')).toBe(true);expect(await verifyEditorialReceipt({...receipt,review_mode:'human'},first,'test-only-secret')).toBe(false);
 });
});
