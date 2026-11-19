import {describe,it,expect,vi} from 'vitest';
import {parseSerp,parseAiObservation,observationMetrics,validateAutonomousReview,validateLinkDestination,executeGoverned,topicGroups,insertDraftLink} from '../../supabase/functions/_shared/nexus-intelligence';
describe('NEXUS intelligence and autonomous preparation',()=>{
 it('records observed SERP positions and never turns absence into rank zero',()=>{
  expect(parseSerp({organic:[{position:3,link:'https://example.com/a',title:'Real result'}]},'example.com').observed_rank).toBe(3);
  expect(parseSerp({organic:[{position:1,link:'https://example.com.evil.test/a'}]},'example.com').observed_rank).toBeNull();
  expect(()=>parseSerp({error:'quota'},'example.com')).toThrow();
 });
 it('uses native citation annotations, not arbitrary links printed in the answer',()=>{
  const observed=parseAiObservation({output:[{type:'message',content:[{type:'output_text',text:'Brand Example. https://example.com',annotations:[{type:'url_citation',url:'https://other.example/a'}]}]}]},'example.com',['Brand Example']);
  expect(observed.mentioned).toBe(true);expect(observed.cited).toBe(false);expect(observed.recommended).toBeNull();
 });
 it('does not conflate failed observations with absence of a mention',()=>{
  expect(observationMetrics([{status:'failed'},{status:'succeeded',output:{mentioned:true,cited:false}}])).toMatchObject({valid:1,coverage:.5,mention_rate:1,citation_rate:0});
  expect(observationMetrics([]).mention_rate).toBeNull();
 });
 it('rejects approval with invented quotes, missing dimensions or absent evidence',()=>{
  const sources='Documented source evidence with sufficiently detailed context for an actual claim. '.repeat(3);
  const verdict={dimensions:{factuality:true,utility:true,semantic:true,conversion:true,sector_compliance:true},unsupported_claims:[],issues:[],material_claims:[{claim:'claim',quote:'Documented source evidence with sufficiently detailed context'}]};
  expect(validateAutonomousReview(verdict,sources).pass).toBe(true);
  expect(validateAutonomousReview(verdict,'').pass).toBe(false);
  expect(validateAutonomousReview({...verdict,material_claims:[{claim:'claim',quote:'fabricated source quote which was not supplied'}]},sources).pass).toBe(false);
  expect(validateAutonomousReview({...verdict,dimensions:{}},sources).pass).toBe(false);
 });
 it('performs no provider call when reservation fails',async()=>{
  const call=vi.fn();await expect(executeGoverned(async()=>{throw new Error('budget_paused');},call)).rejects.toThrow('budget_paused');expect(call).not.toHaveBeenCalled();
 });
 it('refuses private DNS answers and redirects outside the approved host',async()=>{
  const request=vi.fn();expect((await validateLinkDestination('https://example.com/a','example.com',async()=>['127.0.0.1'],request)).valid).toBe(false);expect(request).not.toHaveBeenCalled();
  request.mockResolvedValue(new Response(null,{status:302,headers:{location:'https://another.example/x'}}));
  expect((await validateLinkDestination('https://example.com/a','example.com',async()=>['93.184.216.34'],request,()=>new AbortController().signal)).valid).toBe(false);
 });
 it('only validates a successful same-host destination',async()=>{
  const request=vi.fn().mockResolvedValue(new Response(null,{status:200}));
  expect((await validateLinkDestination('https://example.com/a','example.com',async()=>['93.184.216.34'],request,()=>new AbortController().signal)).valid).toBe(true);
 });
 it('groups by actual shared terms with no invented semantic score',()=>{
  const result=topicGroups([{id:'a',keyword:'contratos comerciais',title:'A'},{id:'b',keyword:'contratos empresariais',title:'B'}]);
  expect(result[0].term).toBe('contratos');expect(result[0].articles).toHaveLength(2);
 });
 it('inserts a link into body text, not headings or existing anchors',()=>{
  const html='<h2>contratos comerciais</h2><p><a href="https://example.com/x">contratos comerciais</a></p><p>Saiba mais sobre contratos comerciais.</p>';
  const result=insertDraftLink(html,'contratos comerciais','https://example.com/guide');
  expect(result.applied).toBe(true);expect(result.content).toContain('<h2>contratos comerciais</h2>');expect(result.content).toContain('Saiba mais sobre <a');
 });
});
