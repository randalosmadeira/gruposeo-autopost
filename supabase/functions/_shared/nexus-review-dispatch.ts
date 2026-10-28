/** Preparation is durable. Executing the prepared operation still checks the organization's budget. */
export async function dispatchAutonomousReview(userId:string,projectId:string,articleId:string) {
 const url=Deno.env.get('SUPABASE_URL')||'';const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||Deno.env.get('SUPABASE_SECRET_KEY')||'';
 const response=await fetch(`${url}/functions/v1/nexus-intelligence`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({action:'prepare',kind:'editorial_review',projectId,articleId,userId}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('autonomous_review_preparation_failed');
 // The existing worker processes this record only if execution is explicitly enabled.
 return await response.json();
}
