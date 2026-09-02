import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getOrchestratorForUser } from "../_shared/byok-resolver.ts";
import { getRuntimeKeys, resolveUserCaller } from "../_shared/supabase-runtime.ts";

const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Expose-Headers":"X-AI-Provider, X-AI-Model, X-AI-Reviewer, X-AI-Reviewer-Model"};

interface ArticleConfig {
  keyword:string;title?:string;secondaryKeywords?:string;wordCount?:"short"|"medium"|"long"|"very-long";tone?:string;pointOfView?:string;language?:string;type?:"blog"|"sales"|"review"|"comparison";contentType?:string;segment?:string;goal?:string;intentType?:string;companyName?:string;companyPhone?:string;companyAddress?:string;targetAudience?:string;painPoints?:string;differentials?:string;ctaObjective?:string;additionalInfo?:string;includeFaq?:boolean;faqCount?:number;includeTable?:boolean;includeList?:boolean;includeConclusion?:boolean;includeMetaDescription?:boolean;seoOptimization?:boolean;humanizeContent?:boolean;realtimeData?:boolean;customInstructions?:string;internalLinks?:Array<{anchor:string;url:string}>;sourcesContext?:string;promptTemplateId?:string;targetFunction?:string;projectId?:string;geographicReach?:string;audienceType?:string;aiAutoOptimization?:boolean;projectConfig?:Record<string,string|undefined>;
}

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json","Cache-Control":"no-store"}});}
function targetWords(value?:ArticleConfig["wordCount"]){switch(value){case"short":return"700 a 1000 palavras";case"long":return"2200 a 2800 palavras";case"very-long":return"3500 a 4500 palavras";default:return"1200 a 1800 palavras";}}
function clean(value:string){return value.replace(/```html/gi,"").replace(/```markdown/gi,"").replace(/```/g,"").trim();}
function chunks(value:string,size=1800){const out:string[]=[];for(let i=0;i<value.length;i+=size)out.push(value.slice(i,i+size));return out;}
function sse(content:string,meta:{provider:string;model:string;reviewer:string;reviewerModel:string}){const encoder=new TextEncoder();const parts=chunks(content);const stream=new ReadableStream({start(controller){for(const part of parts)controller.enqueue(encoder.encode(`data: ${JSON.stringify({choices:[{delta:{content:part}}]})}\n\n`));controller.enqueue(encoder.encode("data: [DONE]\n\n"));controller.close();}});return new Response(stream,{headers:{...corsHeaders,"Content-Type":"text/event-stream","Cache-Control":"no-cache, no-transform","X-AI-Provider":meta.provider,"X-AI-Model":meta.model,"X-AI-Reviewer":meta.reviewer,"X-AI-Reviewer-Model":meta.reviewerModel}});}

function buildPrompt(config:ArticleConfig){
  const links=(config.internalLinks||[]).slice(0,15).map(item=>`- ${item.anchor}: ${item.url}`).join("\n");
  const projectContext=Object.entries(config.projectConfig||{}).filter(([,v])=>Boolean(v)).map(([k,v])=>`${k}: ${v}`).join("\n");
  return `TAREFA\nProduza um artigo final publicável, original, útil e semanticamente profundo. Não explique o processo interno.\n\nASSUNTO PRINCIPAL: ${config.keyword}\nTÍTULO SUGERIDO: ${config.title||"crie um título específico, natural e fiel à intenção de busca"}\nIDIOMA: ${config.language||"pt-BR"}\nTOM: ${config.tone||"profissional e acessível"}\nPONTO DE VISTA: ${config.pointOfView||"adequado ao assunto"}\nTIPO: ${config.type||"blog"}\nFORMATO EDITORIAL: ${config.contentType||"how-to"}\nEXTENSÃO: ${targetWords(config.wordCount)}\nOBJETIVO: ${config.goal||"informar com precisão"}\nINTENÇÃO DE BUSCA: ${config.intentType||"informational"}\nSEGMENTO: ${config.segment||"general"}\nALCANCE GEOGRÁFICO INFORMADO: ${config.geographicReach||"não informado"}\nAUDIÊNCIA INFORMADA: ${config.audienceType||config.targetAudience||"não informada"}\nPALAVRAS-CHAVE SECUNDÁRIAS: ${config.secondaryKeywords||""}\n\nREGRAS DE CONTEÚDO\n- Não invente fatos, fontes, leis, decisões, números, pessoas, estatísticas ou URLs.\n- Se uma afirmação atual depender de fonte não fornecida, omita-a ou marque [VERIFICAR]; realtimeData não autoriza invenção nem significa acesso automático à web.\n- Responda diretamente ao problema do leitor no início.\n- Construa cobertura semântica por entidades, atributos, relações, dúvidas, objeções e subtópicos pertinentes, sem keyword stuffing.\n- Evite páginas doorway, texto fino e repetição feita apenas para SEO.\n- Use H1 único, H2/H3 descritivos, parágrafos curtos e estrutura mobile-first.\n- Faça o conteúdo ser compreensível também em trechos isolados por mecanismos de busca e sistemas generativos.\n- ${config.includeFaq===false?"Não inclua FAQ.":`Inclua até ${config.faqCount||5} perguntas frequentes somente se agregarem informação.`}\n- ${config.includeTable?"Use tabela quando melhorar comparação ou compreensão.":"Tabela é opcional e não deve ser forçada."}\n- ${config.includeList===false?"Listas são opcionais.":"Use listas quando facilitarem a leitura."}\n- ${config.includeConclusion===false?"Não force seção de conclusão.":"Finalize com síntese objetiva e CTA compatível com o contexto."}\n- ${config.includeMetaDescription===false?"Não inclua metadados em comentários HTML.":"Comece com comentários HTML <!-- TITLE_SEO: ... --> e <!-- META_DESCRIPTION: ... -->; título SEO natural e meta description informativa."}\n- Links internos só podem usar as URLs fornecidas abaixo.\n\nCONTEXTO DO PROJETO\n${projectContext||"Não informado."}\n\nLINKS INTERNOS AUTORIZADOS\n${links||"Nenhum informado."}\n\nFONTES / CONTEXTO VERIFICÁVEL\n${config.sourcesContext||"Nenhuma fonte adicional fornecida."}\n\nDORES / DIFERENCIAIS / CTA\nDores: ${config.painPoints||"não informadas"}\nDiferenciais: ${config.differentials||"não informados"}\nCTA: ${config.ctaObjective||"informativo e proporcional"}\n\nINSTRUÇÕES ADICIONAIS\n${config.customInstructions||config.additionalInfo||"Nenhuma."}`;
}

function reviewPrompt(content:string,config:ArticleConfig){return `Revise o artigo abaixo como revisor final editorial, jurídico quando pertinente, SEO/GEO/AEO e semântico. Preserve fatos e intenção. Corrija somente o necessário.\n\nCHECKLIST\n- remover qualquer afirmação factual inventada ou sem apoio;\n- preservar [VERIFICAR] quando a verificação ainda for necessária;\n- melhorar resposta direta, headings, entidades, relações semânticas e information gain;\n- eliminar keyword stuffing, repetição, doorway patterns e CTAs inadequados;\n- manter apenas links que estavam autorizados no contexto;\n- manter TITLE_SEO/META_DESCRIPTION quando solicitados;\n- não adicionar fontes ou URLs que não existam no material fornecido.\n\nRetorne SOMENTE o artigo final, sem parecer, nota ou explicação.\n\nPALAVRA-CHAVE: ${config.keyword}\nARTIGO:\n${content.slice(0,110000)}`;}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{headers:corsHeaders});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const requestId=crypto.randomUUID();
  try{
    const body=await req.json().catch(()=>({}));const config=(body?.config||body) as ArticleConfig;
    if(!config?.keyword?.trim())return json({error:"keyword é obrigatório",request_id:requestId},400);
    const runtime=getRuntimeKeys();if(!runtime.url||!runtime.publicKey||!runtime.secretKey)return json({error:"Backend incompleto",request_id:requestId},500);
    const caller=await resolveUserCaller(req,runtime,null);if(caller.internal)return json({error:"user_session_required",request_id:requestId},401);
    const orchestrator=await getOrchestratorForUser(caller.userId);
    const generated=await orchestrator.callWithMeta("article_generation",[
      {role:"system",content:"Produza apenas o conteúdo final solicitado. Aplique precisão factual, utilidade, semântica e descoberta sem técnicas manipulativas."},
      {role:"user",content:buildPrompt(config)},
    ],{preferredProvider:"openai",maxTokens:24000,temperature:0.45,prioritizeQuality:true});
    let finalContent=clean(generated.content);
    if(finalContent.length<300)throw new Error("IA retornou conteúdo insuficiente");

    const preferredReviewer=generated.provider==="openai"?"anthropic":"openai";
    let reviewer={provider:generated.provider,model:generated.model,content:finalContent};
    try{
      const reviewed=await orchestrator.callWithMeta("content_review",[
        {role:"system",content:"Faça revisão final rigorosa e devolva somente o texto corrigido."},
        {role:"user",content:reviewPrompt(finalContent,config)},
      ],{preferredProvider:preferredReviewer,maxTokens:24000,temperature:0.12,prioritizeQuality:true});
      const candidate=clean(reviewed.content);if(candidate.length>=300)reviewer={provider:reviewed.provider,model:reviewed.model,content:candidate};
    }catch(reviewError){console.warn(JSON.stringify({level:"warn",message:"article_review_fallback",request_id:requestId,error:reviewError instanceof Error?reviewError.message:"review_failed"}));}
    finalContent=reviewer.content;
    return sse(finalContent,{provider:generated.provider,model:generated.model,reviewer:reviewer.provider,reviewerModel:reviewer.model});
  }catch(error){return json({error:error instanceof Error?error.message:"Erro interno",request_id:requestId},500);}
});
