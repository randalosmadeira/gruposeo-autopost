import { createClient } from "jsr:@supabase/supabase-js@2";
import { resolveRequestActor, RequestAuthError } from "../_shared/request-auth.ts";
import { installSpendLock } from "../_shared/nexus-spend-lock.ts";

const providerFetch = globalThis.fetch.bind(globalThis);
installSpendLock();

const organization = "04f16755-dedb-4f1b-a0a3-1a83054b36a0";
const topics = [
  "Lei 15.397/2026",
  "Roubo majorado e qualificado",
  "Roubo com simulacro",
  "Roubo de celular",
  "Furto qualificado",
  "Estelionato e conta laranja",
  "Receptação de celular",
  "Receptação de animal",
  "Cabos, fios e interrupção de serviços",
  "Auxílio-reclusão acabou?",
  "Canetas vindas do Paraguai",
  "iPhone trazido do Paraguai",
  "Contrabando, descaminho e medicamentos",
];
const cors = {
  "Access-Control-Allow-Origin": "https://app.zica.posts.zicajuris.com.br",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const actor = await resolveRequestActor(req);
    if (actor.mode !== "user") return json({ error: "interactive_user_required" }, 403);
    const body = await req.json().catch(() => null);
    const topic = body?.topic;
    const stage = body?.stage;
    if (!Number.isInteger(topic) || topic < 1 || topic > topics.length ||
        (!["draft", "review", "repair"].includes(stage)) || body?.manual !== true ||
        typeof body?.brief !== "string" || !body.brief.trim()) {
      return json({ error: "invalid_manual_request" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { count: delivered, error: deliveryError } = await admin.from("articles")
      .select("id", { count: "exact", head: true })
      .eq("project_id", "fab1032d-56a4-4e59-b3d4-4a68d3d4bf0a")
      .eq("config->>rdm_manual_batch", "20261110-criminal-13")
      .eq("status", "published");
    if (deliveryError) return json({ error: "batch_state_unavailable" }, 503);
    if (delivered === 13) return json({ error: "batch_completed", executed: false }, 409);
    const drafting = stage !== "review";
    const repairing = stage === "repair";
    let draft = "";
    if (!drafting) {
      const { data, error } = await admin.from("rdm_manual_editorial_runs")
        .select("result").eq("topic", topic).eq("stage", "draft").eq("state", "completed").maybeSingle();
      if (error || !data?.result) return json({ error: "draft_required" }, 409);
      draft = data.result;
    }
    const instructions = drafting
      ? "Escreva rascunho jurídico original em português brasileiro. Entregue HTML de artigo pronto para edição, sem metacomentários. Use entre 1.250 e 1.450 palavras úteis antes das fontes. Inclua resposta direta, exemplos hipotéticos, perguntas frequentes, links contextuais pertinentes e fontes oficiais fornecidas. Diferencie vigência, fatos anteriores, pena abstrata e dosimetria. Registre lacunas. Use linguagem informativa e abrangência geográfica verdadeira. Não invente fontes, fatos ou resultados. Não publique."
      : "Revise o rascunho em relação ao dossiê. Liste somente erros específicos e correções necessárias em até 600 palavras. Use o dossiê fornecido como evidência, indicando o que exceder seu alcance. Nunca sugira trocar fonte oficial atual pelo conhecimento do treinamento. Avalie clareza, resposta direta, SEO, AEO, AIO e abrangência geográfica. Não assine aprovação nem declare revisão humana.";
    const editorialContext = "Data de referência: 10 de novembro de 2026. Use as fontes oficiais do dossiê como evidência prioritária sobre mudanças posteriores ao seu treinamento. A Lei 15.397/2026 foi publicada em 4 de maio de 2026. Confirme o alcance por dispositivo; jamais infira que a lei alterou o tratamento do simulacro. O art. 44 do Código Penal trata da substituição de pena. Marque como pendente o que depender de consulta externa; não alegue que abriu links.";
    const prompt = [instructions, editorialContext, "Pauta: " + topics[topic - 1], "Dossiê: " + body.brief.trim(), draft].join("\n\n");
    // Byte ceiling plus margin for provider message framing. No tools or retries.
    if (new TextEncoder().encode(prompt).length > (repairing ? 15000 : drafting ? 10500 : 18000)) return json({ error: "prompt_too_long" }, 400);
    const provider = drafting ? "openai" : "anthropic";
    const { data: secret, error: vaultError } = await admin.rpc("nexus_provider_secret", {
      p_org: organization, p_actor: actor.userId, p_provider: provider,
    });
    if (vaultError || !secret) return json({ error: "organization_credential_unavailable" }, 403);
    const { data: reserved, error: reservationError } = await admin.rpc("reserve_rdm_manual_editorial", {
      p_topic: topic, p_stage: stage, p_actor: actor.userId,
    });
    if (reservationError || !reserved) return json({ error: "reservation_denied" }, 409);

    try {
      const endpoint = drafting ? "https://api.openai.com/v1/chat/completions" : "https://api.anthropic.com/v1/messages";
      const headers: Record<string, string> = drafting
        ? { "Content-Type": "application/json", Authorization: "Bearer " + secret }
        : { "Content-Type": "application/json", "x-api-key": secret, "anthropic-version": "2023-06-01" };
      const messages = [{ role: "system", content: "Você redige artigos para leitores leigos com fontes verificadas. Os fatos legislativos no dossiê foram conferidos em fontes oficiais em novembro de 2026 e prevalecem sobre seu treinamento. Não acrescente fatos jurídicos ausentes do dossiê. Se uma regra não estiver confirmada, delimite a questão sem inventar lacuna legislativa. Produza entre 1250 e 1450 palavras no corpo com 5 perguntas práticas específicas, orientações documentais próprias da pauta e uma resposta curta inicial. Sem introdução genérica, metalinguagem, sem etapas de SEO ou assinaturas falsas." }, { role: "user", content: prompt }];
      const providerMessages = drafting ? messages : messages.filter(message => message.role === "user");
      const payload = drafting
        ? (repairing ? { model: "gpt-5-mini-2025-08-07", reasoning_effort: "low", max_completion_tokens: 6144, messages: providerMessages } : { model: "gpt-4.1-mini-2025-04-14", max_completion_tokens: 4000, messages: providerMessages })
        : { model: "claude-haiku-4-5-20251001", max_tokens: 800, messages: providerMessages };
      const response = await providerFetch(endpoint, {
        method: "POST", headers, body: JSON.stringify(payload), redirect: "error",
        signal: AbortSignal.timeout(90000),
      });
      if (!response.ok) throw new Error("provider_request_failed");
      const data = await response.json();
      const result = drafting
        ? data.choices?.[0]?.message?.content
        : data.content?.filter((block: { type: string }) => block.type === "text")
          .map((block: { text: string }) => block.text).join("\n");
      if (typeof result !== "string" || !result.trim()) throw new Error("provider_output_missing");
      const usage = data.usage || {};
      const inputTokens = drafting ? usage.prompt_tokens : usage.input_tokens;
      const outputTokens = drafting ? usage.completion_tokens : usage.output_tokens;
      const actualMicros = Number.isInteger(inputTokens) && Number.isInteger(outputTokens)
        ? Math.ceil(inputTokens * (repairing ? 0.25 : drafting ? 0.4 : 1) + outputTokens * (repairing ? 2 : drafting ? 1.6 : 5))
        : null;
      const truncated = drafting
        ? data.choices?.[0]?.finish_reason === "length"
        : data.stop_reason === "max_tokens";
      const { error } = await admin.from("rdm_manual_editorial_runs")
        .update({ state: "completed", result, input_tokens: inputTokens ?? null,
          output_tokens: outputTokens ?? null, actual_usd_micros: actualMicros,
          truncated }).eq("topic", topic).eq("stage", stage).eq("state", "reserved");
      if (error) throw error;
      return json({ topic, stage, result, editorial_approval: "pending" });
    } catch {
      await admin.from("rdm_manual_editorial_runs").update({ state: "uncertain" })
        .eq("topic", topic).eq("stage", stage).eq("state", "reserved");
      return json({ error: "execution_uncertain_reservation_retained" }, 502);
    }
  } catch (error) {
    if (error instanceof RequestAuthError) return json({ error: error.code }, error.status);
    return json({ error: "manual_editorial_failed" }, 500);
  }
});
