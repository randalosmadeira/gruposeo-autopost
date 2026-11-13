import { useState } from "react";
import { useProjects } from "@/hooks/useProjects";
import { supabase } from "@/integrations/supabase/client";
import { SERPER_TYPES, serperRegionalInputs } from "../../../supabase/functions/_shared/serper-request";

// Planejamento de coletas do Serper (não gasta crédito: só deixa as operações preparadas). Mostrado apenas ao gestor.
// `projectId` (opcional) fixa o projeto da tela; sem ele, usa o primeiro da lista como antes.
export function SerperPlans({ projectId: fixedProjectId }: { projectId?: string }) {
  const { projects } = useProjects();
  const [project, setProject] = useState("");
  const [type, setType] = useState("search");
  const [query, setQuery] = useState("");
  const [regions, setRegions] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const projectId = project || fixedProjectId || projects[0]?.id;
  const input = { serperType: type, query, country: "br", language: "pt-BR" };
  const regionList = regions.trim() ? regions.trim().split(/\r?\n/) : undefined;
  const plans = serperRegionalInputs(input, regionList);

  async function prepare() {
    setSaving(true);
    setMessage("");
    try {
      const { data, error } = await supabase.functions.invoke("nexus-intelligence", {
        body: { action: "prepare", kind: "serp", projectId, ...input, regions: regionList },
      });
      if (error) throw error;
      setMessage(`${data.prepared} consultas preparadas. Nenhum crédito consumido.`);
    } catch {
      setMessage("Falha ao salvar a coleta. Verifique o acesso ao projeto.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="grid gap-3 rounded-lg border p-4">
    <h2 className="font-semibold">Planejar coletas no Serper</h2>
    <label>Projeto <select value={projectId ?? ""} onChange={event => setProject(event.target.value)}>
      {projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label>
    <label>Modalidade <select value={type} onChange={event => { setType(event.target.value); setQuery(""); setRegions(""); }}>
      {Object.entries(SERPER_TYPES).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
    </select></label>
    <label>{type === "reviews" ? "Identificador (placeId:, cid: ou fid:)" : type === "resolve" ? "Resposta JSON da busca" : ["lens", "webpage"].includes(type) ? "URL pública" : "Consulta"}
      <textarea className="block w-full rounded border bg-background p-2" value={query} onChange={event => setQuery(event.target.value)} maxLength={type === "resolve" ? 100000 : 500} />
    </label>
    {!["resolve", "webpage"].includes(type) && <label>Localidades (país | idioma | cidade ou região, uma por linha)
      <textarea className="block w-full rounded border bg-background p-2" value={regions} onChange={event => setRegions(event.target.value)} placeholder="br | pt-BR | São Paulo" />
    </label>}
    <button className="w-fit rounded border px-3 py-2 disabled:opacity-50" type="button" disabled={!plans || !projectId || saving} onClick={prepare}>Salvar plano de coleta</button>
    <p role="status">{message}</p>
  </section>;
}
