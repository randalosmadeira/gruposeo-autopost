import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, MapPin, Radar, RefreshCcw, Save, Sparkles, Trash2 } from "lucide-react";

type TemplateKind = "forum" | "delegacia" | "polo";
type PoiType = "forum" | "delegacia" | "polo" | "tribunal" | "cartorio" | "outro";
type PoiStatus = "draft" | "approved" | "archived";

interface Poi {
  id: string;
  poi_type: PoiType;
  name: string;
  full_address: string | null;
  neighborhood: string | null;
  city: string;
  state_uf: string;
  comarca: string | null;
  latitude: number | null;
  longitude: number | null;
  is_24_7: boolean;
  status: PoiStatus;
  discovery_source: string;
  official_url: string | null;
  opening_hours: string | null;
}

interface TemplateOverride {
  template_kind: TemplateKind;
  content: string;
  is_active: boolean;
  updated_by_ai: boolean;
  updated_at: string;
}

const TEMPLATE_KINDS: { key: TemplateKind; label: string; help: string }[] = [
  {
    key: "forum",
    label: "Fórum / Tribunal",
    help: "Guia prático de fóruns regionais — cível, empresarial e consumidor.",
  },
  {
    key: "delegacia",
    label: "Delegacia (Plantão Penal / Custódia)",
    help: "Urgência: audiência de custódia, flagrante, direitos fundamentais.",
  },
  {
    key: "polo",
    label: "Polo / Bairro (ISPs / Tributário / Empresas)",
    help: "Contexto econômico local, ANATEL, LGPD, ICMS.",
  },
];

const DEFAULT_TEMPLATES: Record<TemplateKind, string> = {
  forum: `## 📍 TEMPLATE HIPERLOCAL — FÓRUM

**POI de referência:** {{name}} — {{full_address}} — {{city}}/{{state_uf}}

### Estrutura obrigatória:
1. §1 Frontload (40-60 palavras): definir o que é o Juizado/Vara + base legal + jurisdição ({{city}}/{{state_uf}}).
2. H2 = pergunta natural: "Como funciona o Juizado Especial Cível no {{name}}?"
3. Bloco de utilidade pública:
   - Endereço: {{full_address}}
   - Horário: {{opening_hours}}
   - Bairros/comarcas atendidos: {{neighborhoods_served}}
4. Contexto econômico local (2-3 parágrafos).
5. Gancho RDM ao final (sem promessa de resultado).`,
  delegacia: `## 🚨 TEMPLATE HIPERLOCAL — DELEGACIA

**POI:** {{name}} — {{full_address}} — {{city}}/{{state_uf}}

### Estrutura:
1. §1 Frontload (40-60 palavras): intimação/flagrante + direito ao silêncio (art. 5º LXIII CF) + jurisdição.
2. H2: "Fui intimado a depor na {{name}}: o que fazer?"
3. Direitos fundamentais obrigatórios:
   - Direito ao silêncio (CF art. 5º LXIII)
   - Advogado desde o primeiro momento (Súmula Vinculante 14 STF)
   - Audiência de custódia em 24h (Resolução CNJ 213/2015)
4. Bloco de urgência: telefone plantão RDM + WhatsApp 24h + {{urgency_phone}}.
5. Compliance OAB: zero promessa de soltura.`,
  polo: `## 🏭 TEMPLATE HIPERLOCAL — POLO / BAIRRO

**POI:** {{name}} — {{neighborhood}}, {{city}}/{{state_uf}}

### Estrutura:
1. §1 Frontload (40-60 palavras): desafio jurídico + base legal + jurisdição.
2. H2: "Assessoria jurídica para provedores de internet e empresas de tecnologia no {{neighborhood}}?"
3. Contexto econômico local:
   - Perfil das empresas do polo.
   - Desafios fiscais (ICMS, LC 87/1996).
   - Desafios regulatórios (ANATEL SCM, LGPD, Marco Civil).
4. Base legal em blocos <cite> com fonte + data.
5. Gancho RDM sem promessa.`,
};

const POI_STATUS_LABEL: Record<PoiStatus, { label: string; variant: "default" | "secondary" | "outline" }> = {
  draft: { label: "Rascunho", variant: "secondary" },
  approved: { label: "Aprovado", variant: "default" },
  archived: { label: "Arquivado", variant: "outline" },
};

export default function Hiperlocal() {
  const { toast } = useToast();

  // ============ POIs ============
  const [pois, setPois] = useState<Poi[]>([]);
  const [loadingPois, setLoadingPois] = useState(true);
  const [statusFilter, setStatusFilter] = useState<PoiStatus | "all">("all");

  // Discover dialog
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoverForm, setDiscoverForm] = useState({
    city: "São Paulo",
    state_uf: "SP",
    poi_type: "forum" as PoiType,
    keyword: "",
    query: "",
    limit: 15,
  });

  // ============ Templates ============
  const [templates, setTemplates] = useState<Record<TemplateKind, TemplateOverride | null>>({
    forum: null,
    delegacia: null,
    polo: null,
  });
  const [drafts, setDrafts] = useState<Record<TemplateKind, string>>({
    forum: "",
    delegacia: "",
    polo: "",
  });
  const [savingKind, setSavingKind] = useState<TemplateKind | null>(null);

  const loadPois = async () => {
    setLoadingPois(true);
    const q = supabase
      .from("poi_hyperlocal")
      .select("id, poi_type, name, full_address, neighborhood, city, state_uf, comarca, latitude, longitude, is_24_7, status, discovery_source, official_url, opening_hours")
      .order("created_at", { ascending: false })
      .limit(200);
    const { data, error } = await q;
    if (error) {
      toast({ title: "Erro ao carregar POIs", description: error.message, variant: "destructive" });
    } else {
      setPois((data ?? []) as Poi[]);
    }
    setLoadingPois(false);
  };

  const loadTemplates = async () => {
    const { data, error } = await supabase
      .from("hyperlocal_template_overrides")
      .select("template_kind, content, is_active, updated_by_ai, updated_at");
    if (error) {
      toast({ title: "Erro ao carregar templates", description: error.message, variant: "destructive" });
      return;
    }
    const map: Record<TemplateKind, TemplateOverride | null> = { forum: null, delegacia: null, polo: null };
    const nextDrafts: Record<TemplateKind, string> = { ...DEFAULT_TEMPLATES };
    for (const row of data ?? []) {
      const k = row.template_kind as TemplateKind;
      map[k] = row as TemplateOverride;
      nextDrafts[k] = (row.content as string) || DEFAULT_TEMPLATES[k];
    }
    setTemplates(map);
    setDrafts(nextDrafts);
  };

  useEffect(() => {
    loadPois();
    loadTemplates();
  }, []);

  // ============ Discover ============
  const runDiscover = async () => {
    if (!discoverForm.city || !discoverForm.state_uf) {
      toast({ title: "Preencha cidade e UF", variant: "destructive" });
      return;
    }
    setDiscovering(true);
    try {
      const { data, error } = await supabase.functions.invoke("hyperlocal-poi-discover", {
        body: discoverForm,
      });
      if (error) throw error;
      toast({
        title: "Descoberta concluída",
        description: `${data?.inserted ?? 0} POI(s) gravados como rascunho.`,
      });
      setDiscoverOpen(false);
      loadPois();
    } catch (e: any) {
      toast({
        title: "Falha na descoberta",
        description: e?.message || String(e),
        variant: "destructive",
      });
    } finally {
      setDiscovering(false);
    }
  };

  // ============ POI actions ============
  const setPoiStatus = async (id: string, status: PoiStatus) => {
    const { error } = await supabase.from("poi_hyperlocal").update({ status }).eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setPois((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
  };

  const deletePoi = async (id: string) => {
    const { error } = await supabase.from("poi_hyperlocal").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    setPois((prev) => prev.filter((p) => p.id !== id));
  };

  const filteredPois = useMemo(
    () => (statusFilter === "all" ? pois : pois.filter((p) => p.status === statusFilter)),
    [pois, statusFilter],
  );

  // ============ Template save ============
  const saveTemplate = async (kind: TemplateKind) => {
    setSavingKind(kind);
    const content = drafts[kind];
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      toast({ title: "Não autenticado", variant: "destructive" });
      setSavingKind(null);
      return;
    }
    const { error } = await supabase
      .from("hyperlocal_template_overrides")
      .upsert(
        {
          user_id: userData.user.id,
          template_kind: kind,
          content,
          is_active: true,
          updated_by_ai: false,
        },
        { onConflict: "user_id,template_kind" },
      );
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Template salvo", description: `Variação de ${kind} atualizada.` });
      loadTemplates();
    }
    setSavingKind(null);
  };

  const resetTemplate = async (kind: TemplateKind) => {
    setDrafts((prev) => ({ ...prev, [kind]: DEFAULT_TEMPLATES[kind] }));
    const { error } = await supabase
      .from("hyperlocal_template_overrides")
      .delete()
      .eq("template_kind", kind);
    if (!error) {
      toast({ title: "Template restaurado", description: `Variação de ${kind} voltou ao padrão.` });
      loadTemplates();
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <MapPin className="h-8 w-8" /> Hiperlocal (RDM)
          </h1>
          <p className="text-muted-foreground mt-1">
            POIs (fóruns, delegacias, polos) e templates que a IA usa para artigos hiperlocais.
          </p>
        </div>
      </div>

      <Tabs defaultValue="pois" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pois">POIs</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>

        {/* ============ POIs ============ */}
        <TabsContent value="pois" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>Pontos de Interesse ({pois.length})</CardTitle>
              <div className="flex items-center gap-2">
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="draft">Rascunhos</SelectItem>
                    <SelectItem value="approved">Aprovados</SelectItem>
                    <SelectItem value="archived">Arquivados</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={loadPois} disabled={loadingPois}>
                  <RefreshCcw className="h-4 w-4 mr-2" />
                  Recarregar
                </Button>
                <Dialog open={discoverOpen} onOpenChange={setDiscoverOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Radar className="h-4 w-4 mr-2" />
                      Descobrir POIs
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5" />
                        Descoberta automatizada
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Cidade</Label>
                          <Input
                            value={discoverForm.city}
                            onChange={(e) => setDiscoverForm({ ...discoverForm, city: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>UF</Label>
                          <Input
                            maxLength={2}
                            value={discoverForm.state_uf}
                            onChange={(e) =>
                              setDiscoverForm({ ...discoverForm, state_uf: e.target.value.toUpperCase() })
                            }
                          />
                        </div>
                      </div>
                      <div>
                        <Label>Tipo de POI</Label>
                        <Select
                          value={discoverForm.poi_type}
                          onValueChange={(v) => setDiscoverForm({ ...discoverForm, poi_type: v as PoiType })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="forum">Fórum</SelectItem>
                            <SelectItem value="delegacia">Delegacia</SelectItem>
                            <SelectItem value="polo">Polo / Bairro</SelectItem>
                            <SelectItem value="tribunal">Tribunal</SelectItem>
                            <SelectItem value="cartorio">Cartório</SelectItem>
                            <SelectItem value="outro">Outro</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="flex items-center gap-2">
                          Keyword (opcional — IA expande em consultas)
                          <Sparkles className="h-3 w-3 text-primary" />
                        </Label>
                        <Input
                          placeholder='ex: "audiência de custódia" ou "provedor de internet"'
                          value={discoverForm.keyword}
                          onChange={(e) => setDiscoverForm({ ...discoverForm, keyword: e.target.value })}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Se preencher, a IA (Gemini BYOK) gera 3-5 queries otimizadas.
                        </p>
                      </div>
                      <div>
                        <Label>Query manual (opcional — sobrescreve keyword)</Label>
                        <Input
                          placeholder="ex: fórum barra funda"
                          value={discoverForm.query}
                          onChange={(e) => setDiscoverForm({ ...discoverForm, query: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Limite ({discoverForm.limit})</Label>
                        <Input
                          type="number"
                          min={1}
                          max={30}
                          value={discoverForm.limit}
                          onChange={(e) =>
                            setDiscoverForm({ ...discoverForm, limit: Number(e.target.value) || 15 })
                          }
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="ghost" onClick={() => setDiscoverOpen(false)} disabled={discovering}>
                        Cancelar
                      </Button>
                      <Button onClick={runDiscover} disabled={discovering}>
                        {discovering ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Buscando…
                          </>
                        ) : (
                          <>
                            <Radar className="h-4 w-4 mr-2" />
                            Descobrir
                          </>
                        )}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {loadingPois ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : filteredPois.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Nenhum POI. Use “Descobrir POIs” para popular via Serper + IA.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome / Endereço</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Cidade/UF</TableHead>
                        <TableHead>24/7</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPois.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell>
                            <div className="font-medium">{p.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {p.full_address || "—"}
                              {p.neighborhood ? ` · ${p.neighborhood}` : ""}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{p.poi_type}</Badge>
                          </TableCell>
                          <TableCell>{p.city}/{p.state_uf}</TableCell>
                          <TableCell>{p.is_24_7 ? "Sim" : "—"}</TableCell>
                          <TableCell>
                            <Badge variant={POI_STATUS_LABEL[p.status].variant}>
                              {POI_STATUS_LABEL[p.status].label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right space-x-1">
                            {p.status !== "approved" && (
                              <Button size="sm" variant="default" onClick={() => setPoiStatus(p.id, "approved")}>
                                Aprovar
                              </Button>
                            )}
                            {p.status !== "archived" && (
                              <Button size="sm" variant="outline" onClick={() => setPoiStatus(p.id, "archived")}>
                                Arquivar
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => deletePoi(p.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ Templates ============ */}
        <TabsContent value="templates" className="space-y-4">
          {TEMPLATE_KINDS.map(({ key, label, help }) => (
            <Card key={key}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{label}</span>
                  <div className="flex items-center gap-2 text-sm font-normal">
                    {templates[key] ? (
                      <Badge variant="default">Custom</Badge>
                    ) : (
                      <Badge variant="outline">Padrão</Badge>
                    )}
                    {templates[key]?.updated_by_ai && <Badge variant="secondary">IA</Badge>}
                  </div>
                </CardTitle>
                <p className="text-sm text-muted-foreground">{help}</p>
                <p className="text-xs text-muted-foreground">
                  Placeholders disponíveis:{" "}
                  <code>{"{{name}} {{full_address}} {{neighborhood}} {{city}} {{state_uf}} {{comarca}} {{opening_hours}} {{neighborhoods_served}} {{urgency_phone}} {{official_url}}"}</code>
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  className="min-h-[280px] font-mono text-sm"
                  value={drafts[key]}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => resetTemplate(key)}>
                    Restaurar padrão
                  </Button>
                  <Button onClick={() => saveTemplate(key)} disabled={savingKind === key}>
                    {savingKind === key ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Salvando…
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Salvar
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
