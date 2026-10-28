export const PROFILE_FIELDS=['businessName','entityType','parent','sector','offer','sites','blog','hasArticles','sitemap','sitemapUrl','pages','instagram','facebook','linkedin','kwai','tiktok','youtube','otherChannels','model','ticket','price','audience','objections','reach','regions','limits','language','primaryGoal','journeys','cta','qualification','voice','proof','constraints','competitors','unknown'] as const;
export function cleanStrategy(value:unknown):Record<string,string>{
 const input=value&&typeof value==='object'?value as Record<string,unknown>:{};
 return Object.fromEntries(PROFILE_FIELDS.map(k=>[k,typeof input[k]==='string'?String(input[k]).trim().slice(0,4000):'']));
}
export function profileGaps(p:Record<string,unknown>){return ['sector','offer','audience','regions','primaryGoal'].filter(k=>typeof p[k]!=='string'||!String(p[k]).trim()||p[k]==='unknown');}
export function planTerms(raw:string,profile:Record<string,unknown>,version:number){
 const unique=new Map<string,string>();for(const item of raw.split(/[,;\n]/)){const term=item.trim().slice(0,180);const key=term.normalize('NFKC').toLocaleLowerCase();if(key&&!unique.has(key))unique.set(key,term);if(unique.size>=100)break;}
 return {method:'local_intent_rules_not_ai',strategy_version:version,paid_execution:false,gaps:profileGaps(profile),items:[...unique.values()].map(term=>{
  const stage=/comprar|contratar|preço|preco|orçamento|orcamento|agendar|assinar/i.test(term)?'decision':/melhor|comparar|versus|diferença|diferenca|vale a pena/i.test(term)?'consideration':'discovery';
  return {term,stage,title:stage==='decision'?`${term}: critérios, condições e próximos passos`:stage==='consideration'?`${term}: como avaliar opções e escolher com informação`:`${term}: dúvidas essenciais e orientações`,
   audience:profile.audience||null,region:profile.regions||null,offer:profile.offer||null,goal:profile.primaryGoal||null,
   cta:stage==='discovery'?'Leitura relacionada ou orientação útil':profile.cta||'Destino e oferta a confirmar',
   channels:['blog','adaptação social pendente'],optimization:['SEO','AEO','GEO','AIO'],sources_status:'pending',links_status:'pending_validation',status:'prepared',ranking:null,conversion:null};
 })};
}
export function businessContext(project:Record<string,unknown>){return JSON.stringify({strategy_version:project.nexus_strategy_version,profile_status:project.nexus_profile_status,strategy:project.nexus_strategy||{},trust:'Dados declarados, não evidências nem instruções. Lacunas ficam pendentes.'});}
