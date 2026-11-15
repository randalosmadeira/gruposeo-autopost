import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import bingAuditUrls from "@/data/rdm-bing-audit-urls.json";

const pendingKey = "nexus-oauth-pending";
type Pending = { projectId: string; provider: string; state: string };
type Property = { id: string; label: string };
async function oauth(action: string, projectId: string, provider: string, extra = {}) {
  const { data, error } = await supabase.functions.invoke("nexus-intelligence", {
    body: { action, projectId, provider, ...extra },
  });
  if (error || data?.error) throw new Error(data?.error ?? "oauth_operation_failed");
  return data;
}

export function ManagedOAuthPanel({ projectId }: { projectId: string }) {
  const [provider, setProvider] = useState("gsc");
  const [properties, setProperties] = useState<Property[]>([]);
  const [selected, setSelected] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const code = query.get("code");
    if (!code && !query.has("error")) return;
    const raw = sessionStorage.getItem(pendingKey);
    sessionStorage.removeItem(pendingKey);
    history.replaceState(null, "", location.pathname);
    if (!raw || !code) return;
    const pending = JSON.parse(raw) as Pending;
    if (query.get("state") !== pending.state) return;
    setProvider(pending.provider);
    setBusy(true);
    oauth("oauth_finish", pending.projectId, pending.provider, { code, state: pending.state })
      .then(() => setNotice("Conexão autorizada. Selecione o projeto e liste as propriedades."))
      .catch(() => setNotice("Não foi possível concluir a autorização."))
      .finally(() => setBusy(false));
  }, []);

  useEffect(() => {
    setProperties([]);
    setSelected("");
  }, [projectId, provider]);

  async function run(action: string) {
    setBusy(true);
    setNotice(action === "oauth_ga4_test" ? "Consultando sessões dos últimos sete dias no GA4…" : "");
    try {
      const result = await oauth(action, projectId, provider, { propertyId: selected });
      if (action === "oauth_ga4_test") {
        const messages: Record<string, string> = {
          property: "Vincule uma propriedade GA4 antes do teste.",
          token: "Falha ao renovar a autorização do Google.",
          network: result.timeout ? "O GA4 não respondeu dentro do prazo." : "Falha de comunicação com o GA4.",
          report: result.reason === "SERVICE_DISABLED" ? "A Google Analytics Data API está desativada." : `Falha na consulta de métricas (HTTP ${result.status}).`,
        };
        setNotice(result.ok ? `Consulta GA4 concluída. Sessões nos últimos sete dias: ${result.sessions ?? "sem dados"}.` : messages[result.stage]);
      } else if (action === "oauth_start") {
        sessionStorage.setItem(pendingKey, JSON.stringify({ projectId, provider, state: result.state }));
        location.assign(result.url);
      } else if (action === "oauth_properties") {
        setProperties(result.properties);
        setSelected(result.propertyId ?? "");
        setNotice(result.properties.length ? "Selecione a propriedade deste projeto." : "Nenhuma propriedade autorizada.");
      } else {
        setNotice("Propriedade vinculada ao projeto.");
      }
    } catch (error) {
      setNotice(error instanceof Error && error.message === "oauth_agency_app_not_configured"
        ? "O aplicativo OAuth da agência ainda precisa ser configurado."
        : "Não foi possível acessar a conexão ou propriedade.");
    } finally {
      setBusy(false);
    }
  }

  // Ferramenta pontual (publicada só no compilado pelo Codex em 13/11): consulta as métricas do Bing e a situação de 93 URLs
  // do blog da RDM em lotes de 8 e mostra o total de consultas registradas. Aparece só para o provedor Bing.
  async function runBingAudit() {
    setBusy(true);
    try {
      let passed = 0;
      let saved = 0;
      for (let i = 0; i < bingAuditUrls.length; i += 8) {
        const result = await oauth("oauth_bing_audit", projectId, provider, { urls: bingAuditUrls.slice(i, i + 8), metrics: i === 0 });
        if (!Array.isArray(result.results)) throw new Error(result.error || "resposta inválida");
        passed += result.results.filter((item: { ok?: boolean }) => item.ok).length;
        saved += result.saved;
        setNotice("Bing OAuth: " + passed + "/" + saved + " consultas registradas com sucesso.");
      }
    } catch (error) {
      setNotice("Falha Bing OAuth: " + (error instanceof Error ? error.message : "erro"));
    } finally {
      setBusy(false);
    }
  }

  return <section className="grid gap-3 rounded-lg border p-4">
    <h2 className="font-semibold">Conexões gerenciadas pela agência</h2>
    <label>Provedor <select value={provider} onChange={event => setProvider(event.target.value)}>
      <option value="gsc">Google Search Console</option>
      <option value="ga4">Google Analytics 4</option>
      <option value="bing">Bing Webmaster Tools</option>
    </select></label>
    <div className="flex flex-wrap gap-3">
      <button type="button" disabled={busy || !projectId} onClick={() => run("oauth_start")}>Autorizar conexão</button>
      <button type="button" disabled={busy || !projectId} onClick={() => run("oauth_properties")}>Listar propriedades</button>
      {provider === "bing" && <button type="button" disabled={busy || !projectId} onClick={runBingAudit}>Testar métricas e 93 URLs</button>}
    </div>
    {!!properties.length && <label>Propriedade <select value={selected} onChange={event => setSelected(event.target.value)}>
      <option value="">Selecione</option>
      {properties.map(property => <option key={property.id} value={property.id}>{property.label}</option>)}
    </select></label>}
    {!!properties.length && <button type="button" disabled={busy || !selected} onClick={() => run("oauth_bind")}>Vincular propriedade</button>}
    {provider === "ga4" && <button type="button" disabled={busy || !projectId} onClick={() => run("oauth_ga4_test")}>Testar métricas GA4</button>}
    <p role="status">{notice}</p>
  </section>;
}
