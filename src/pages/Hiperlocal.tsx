import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { Copy, FileText, History, Loader2, MapPin, Pencil, Plus, Radar, RefreshCcw, Save, Sparkles, Trash2, Wand2 } from "lucide-react";

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

// ============ Pautas (títulos GEO 2026) ============
type TitleCategory = "criminal_24h" | "colarinho_branco" | "isp" | "fraude_bancaria" | "aeroporto" | "foruns";

interface TitleRow {
  id: string;
  user_id: string | null;
  category: TitleCategory;
  title: string;
  poi_type: string | null;
  ymyl_subarea: string | null;
  neighborhood_hint: string | null;
  city_hint: string | null;
  is_urgency: boolean;
  status: "approved" | "draft" | "archived";
  source: string;
}

const TITLE_CATEGORIES: { key: TitleCategory; label: string; emoji: string }[] = [
  { key: "criminal_24h", label: "Criminal 24h / Custódia", emoji: "🚨" },
  { key: "colarinho_branco", label: "Colarinho Branco", emoji: "💼" },
  { key: "isp", label: "Provedores (ISP)", emoji: "🌐" },
  { key: "fraude_bancaria", label: "Fraude Bancária / Consumo", emoji: "🏦" },
  { key: "aeroporto", label: "Aeroporto / DEAIN", emoji: "✈️" },
  { key: "foruns", label: "Fóruns / Tribunais", emoji: "🏢" },
];

export default function Hiperlocal() {
  const { toast } = useToast();
  const navigate = useNavigate();

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

  // ============ Pautas (Títulos) ============
  const [titles, setTitles] = useState<TitleRow[]>([]);
  const [loadingTitles, setLoadingTitles] = useState(false);
  const [titleCategory, setTitleCategory] = useState<TitleCategory | "all">("all");
  const [titleQuery, setTitleQuery] = useState("");
  const [selectedTitles, setSelectedTitles] = useState<Set<string>>(new Set());
  const [newTitleOpen, setNewTitleOpen] = useState(false);
  const [creatingTitle, setCreatingTitle] = useState(false);
  const [newTitleForm, setNewTitleForm] = useState<{
    category: TitleCategory;
    title: string;
    poi_type: string;
    ymyl_subarea: string;
    neighborhood_hint: string;
    city_hint: string;
    is_urgency: boolean;
  }>({
    category: "foruns",
    title: "",
    poi_type: "",
    ymyl_subarea: "",
    neighborhood_hint: "",
    city_hint: "",
    is_urgency: false,
  });

  // Edit / versions dialogs
  const [editTitleOpen, setEditTitleOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState<TitleRow | null>(null);
  const [editTitleForm, setEditTitleForm] = useState<{ title: string; category: TitleCategory; neighborhood_hint: string; city_hint: string; is_urgency: boolean }>({
    title: "", category: "foruns", neighborhood_hint: "", city_hint: "", is_urgency: false,
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versionsFor, setVersionsFor] = useState<TitleRow | null>(null);
  const [versionsList, setVersionsList] = useState<Array<{ id: string; version_number: number; title: string; category: string; created_at: string; change_reason: string | null; }>>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  // ============ Histórico de gerações ============
  interface HistoryRow {
    id: string;
    article_id: string | null;
    title: string;
    category: string | null;
    fewshot_count: number;
    fewshot_examples: string[];
    template_kind: string | null;
    regen_attempts: number;
    frontload_passes: boolean | null;
    frontload_word_count: number | null;
    first_sentence_words: number | null;
    first_sentence_ok: boolean | null;
    source: string;
    created_at: string;
  }
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const loadHistory = async () => {
    setLoadingHistory(true);
    const { data, error } = await supabase
      .from("hyperlocal_generation_history")
      .select("id, article_id, title, category, fewshot_count, fewshot_examples, template_kind, regen_attempts, frontload_passes, frontload_word_count, first_sentence_words, first_sentence_ok, source, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    setLoadingHistory(false);
    if (error) {
      toast({ title: "Erro ao carregar histórico", description: error.message, variant: "destructive" });
      return;
    }
    setHistory((data ?? []) as any);
  };

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

  // ============ Titles / Pautas ============
  const loadTitles = async () => {
    setLoadingTitles(true);
    const { data, error } = await supabase
      .from("hyperlocal_title_templates")
      .select("id, user_id, category, title, poi_type, ymyl_subarea, neighborhood_hint, city_hint, is_urgency, status, source")
      .eq("status", "approved")
      .order("category")
      .order("title");
    if (error) {
      toast({ title: "Erro ao carregar títulos", description: error.message, variant: "destructive" });
    } else {
      setTitles((data ?? []) as TitleRow[]);
    }
    setLoadingTitles(false);
  };

  useEffect(() => {
    loadPois();
    loadTemplates();
    loadTitles();
    loadHistory();
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

  // ============ Pautas actions ============
  const filteredTitles = useMemo(() => {
    const q = titleQuery.trim().toLowerCase();
    return titles.filter((t) => {
      if (titleCategory !== "all" && t.category !== titleCategory) return false;
      if (q && !t.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [titles, titleCategory, titleQuery]);

  const toggleSelect = (id: string) => {
    setSelectedTitles((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const usarTitulo = (title: string) => {
    navigate(`/article-generator?title=${encodeURIComponent(title)}`);
  };

  const copiarTitulo = async (title: string) => {
    try {
      await navigator.clipboard.writeText(title);
      toast({ title: "Título copiado", description: title.slice(0, 80) + (title.length > 80 ? "…" : "") });
    } catch {
      toast({ title: "Falha ao copiar", variant: "destructive" });
    }
  };

  const enviarParaBulk = () => {
    const selected = titles.filter((t) => selectedTitles.has(t.id)).map((t) => t.title);
    if (selected.length === 0) {
      toast({ title: "Selecione ao menos 1 título", variant: "destructive" });
      return;
    }
    const payload = encodeURIComponent(JSON.stringify(selected));
    navigate(`/bulk-articles?titles=${payload}`);
  };

  const criarTitulo = async () => {
    if (!newTitleForm.title.trim()) {
      toast({ title: "Título obrigatório", variant: "destructive" });
      return;
    }
    setCreatingTitle(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      toast({ title: "Não autenticado", variant: "destructive" });
      setCreatingTitle(false);
      return;
    }
    const { error } = await supabase.from("hyperlocal_title_templates").insert({
      user_id: userData.user.id,
      category: newTitleForm.category,
      title: newTitleForm.title.trim(),
      poi_type: newTitleForm.poi_type || null,
      ymyl_subarea: newTitleForm.ymyl_subarea || null,
      neighborhood_hint: newTitleForm.neighborhood_hint || null,
      city_hint: newTitleForm.city_hint || null,
      is_urgency: newTitleForm.is_urgency,
      status: "approved",
      source: "user_custom",
    });
    setCreatingTitle(false);
    if (error) {
      toast({ title: "Erro ao criar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Título criado" });
    setNewTitleOpen(false);
    setNewTitleForm({
      category: newTitleForm.category,
      title: "",
      poi_type: "",
      ymyl_subarea: "",
      neighborhood_hint: "",
      city_hint: "",
      is_urgency: false,
    });
    loadTitles();
  };

  const excluirTitulo = async (id: string) => {
    const { error } = await supabase.from("hyperlocal_title_templates").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    setTitles((prev) => prev.filter((t) => t.id !== id));
    setSelectedTitles((prev) => {
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
  };

  // ============ Edit + Versions ============
  const openEditDialog = async (t: TitleRow) => {
    // If seed (no user_id), clone into user_id before editing
    let target = t;
    if (!t.user_id) {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        toast({ title: "Não autenticado", variant: "destructive" });
        return;
      }
      const { data: cloned, error } = await supabase.from("hyperlocal_title_templates").insert({
        user_id: userData.user.id,
        category: t.category,
        title: t.title,
        poi_type: t.poi_type,
        ymyl_subarea: t.ymyl_subarea,
        neighborhood_hint: t.neighborhood_hint,
        city_hint: t.city_hint,
        is_urgency: t.is_urgency,
        status: "approved",
        source: "user_clone_of_seed",
      }).select("id, user_id, category, title, poi_type, ymyl_subarea, neighborhood_hint, city_hint, is_urgency, status, source").single();
      if (error || !cloned) {
        toast({ title: "Erro ao clonar seed", description: error?.message, variant: "destructive" });
        return;
      }
      target = cloned as TitleRow;
      setTitles((prev) => [target, ...prev]);
      toast({ title: "Cópia criada", description: "Você editará sua própria versão. O seed original é preservado." });
    }
    setEditingTitle(target);
    setEditTitleForm({
      title: target.title,
      category: target.category,
      neighborhood_hint: target.neighborhood_hint ?? "",
      city_hint: target.city_hint ?? "",
      is_urgency: target.is_urgency,
    });
    setEditTitleOpen(true);
  };

  const saveEdit = async () => {
    if (!editingTitle) return;
    if (!editTitleForm.title.trim()) {
      toast({ title: "Título obrigatório", variant: "destructive" });
      return;
    }
    setSavingEdit(true);
    const { error } = await supabase.from("hyperlocal_title_templates").update({
      title: editTitleForm.title.trim(),
      category: editTitleForm.category,
      neighborhood_hint: editTitleForm.neighborhood_hint || null,
      city_hint: editTitleForm.city_hint || null,
      is_urgency: editTitleForm.is_urgency,
    }).eq("id", editingTitle.id);
    setSavingEdit(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Título atualizado", description: "Versão anterior salva no histórico." });
    setEditTitleOpen(false);
    setEditingTitle(null);
    loadTitles();
  };

  const openVersions = async (t: TitleRow) => {
    setVersionsFor(t);
    setVersionsOpen(true);
    setLoadingVersions(true);
    const { data, error } = await supabase
      .from("hyperlocal_title_template_versions")
      .select("id, version_number, title, category, created_at, change_reason")
      .eq("template_id", t.id)
      .order("version_number", { ascending: false });
    setLoadingVersions(false);
    if (error) {
      toast({ title: "Erro ao carregar versões", description: error.message, variant: "destructive" });
      return;
    }
    setVersionsList((data ?? []) as any);
  };

  const restoreVersion = async (versionId: string) => {
    if (!versionsFor) return;
    const v = versionsList.find((x) => x.id === versionId);
    if (!v) return;
    const { error } = await supabase.from("hyperlocal_title_templates").update({
      title: v.title,
      category: v.category as TitleCategory,
    }).eq("id", versionsFor.id);
    if (error) {
      toast({ title: "Erro ao restaurar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `Versão v${v.version_number} restaurada` });
    setVersionsOpen(false);
    loadTitles();
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <MapPin className="h-8 w-8" /> Hiperlocal (RDM)
          </h1>
          <p className="text-muted-foreground mt-1">
            POIs, templates e biblioteca de pautas GEO 2026 usados nos artigos hiperlocais.
          </p>
        </div>
      </div>

      <Tabs defaultValue="pois" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pois">POIs</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="pautas">Pautas ({titles.length})</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
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

        {/* ============ Pautas (Títulos GEO 2026) ============ */}
        <TabsContent value="pautas" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" /> Biblioteca de Pautas GEO 2026
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  60 títulos-modelo hiperlocais (Criminal 24h, Colarinho Branco, ISPs, Fraude Bancária, Aeroporto, Fóruns) —
                  a IA usa esta biblioteca como few-shot ao gerar artigos RDM.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={loadTitles} disabled={loadingTitles}>
                  <RefreshCcw className="h-4 w-4 mr-2" /> Recarregar
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={selectedTitles.size === 0}
                  onClick={enviarParaBulk}
                >
                  <Wand2 className="h-4 w-4 mr-2" /> Gerar em lote ({selectedTitles.size})
                </Button>
                <Dialog open={newTitleOpen} onOpenChange={setNewTitleOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-2" /> Novo título
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Novo título hiperlocal</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label>Categoria</Label>
                        <Select
                          value={newTitleForm.category}
                          onValueChange={(v) => setNewTitleForm({ ...newTitleForm, category: v as TitleCategory })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {TITLE_CATEGORIES.map((c) => (
                              <SelectItem key={c.key} value={c.key}>{c.emoji} {c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Título</Label>
                        <Textarea
                          rows={3}
                          value={newTitleForm.title}
                          onChange={(e) => setNewTitleForm({ ...newTitleForm, title: e.target.value })}
                          placeholder="Ex.: Preso em flagrante no Fórum de Itaquera: Como funciona a audiência de custódia?"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Bairro (hint)</Label>
                          <Input
                            value={newTitleForm.neighborhood_hint}
                            onChange={(e) => setNewTitleForm({ ...newTitleForm, neighborhood_hint: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Cidade (hint)</Label>
                          <Input
                            value={newTitleForm.city_hint}
                            onChange={(e) => setNewTitleForm({ ...newTitleForm, city_hint: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="ghost" onClick={() => setNewTitleOpen(false)}>Cancelar</Button>
                      <Button onClick={criarTitulo} disabled={creatingTitle}>
                        {creatingTitle ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                        Salvar
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Select value={titleCategory} onValueChange={(v) => setTitleCategory(v as TitleCategory | "all")}>
                  <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as categorias</SelectItem>
                    {TITLE_CATEGORIES.map((c) => (
                      <SelectItem key={c.key} value={c.key}>{c.emoji} {c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Buscar por termo (bairro, fórum, delegacia…)"
                  value={titleQuery}
                  onChange={(e) => setTitleQuery(e.target.value)}
                />
              </div>

              {loadingTitles ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : filteredTitles.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Nenhum título encontrado.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Título</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead>Bairro / Cidade</TableHead>
                        <TableHead>Origem</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTitles.map((t) => {
                        const cat = TITLE_CATEGORIES.find((c) => c.key === t.category);
                        return (
                          <TableRow key={t.id}>
                            <TableCell>
                              <input
                                type="checkbox"
                                checked={selectedTitles.has(t.id)}
                                onChange={() => toggleSelect(t.id)}
                              />
                            </TableCell>
                            <TableCell className="max-w-xl">
                              <div className="text-sm font-medium">{t.title}</div>
                              {t.is_urgency && <Badge variant="destructive" className="mt-1 text-xs">urgência</Badge>}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{cat?.emoji} {cat?.label ?? t.category}</Badge>
                            </TableCell>
                            <TableCell className="text-xs">
                              {t.neighborhood_hint ? <div>{t.neighborhood_hint}</div> : null}
                              <div className="text-muted-foreground">{t.city_hint || "—"}</div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={t.user_id ? "default" : "secondary"} className="text-xs">
                                {t.user_id ? "custom" : "seed"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right space-x-1">
                              <Button size="sm" variant="default" onClick={() => usarTitulo(t.title)}>
                                <Sparkles className="h-3 w-3 mr-1" /> Usar
                              </Button>
                              <Button size="sm" variant="ghost" title="Editar (clona seed se necessário)" onClick={() => openEditDialog(t)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              {t.user_id && (
                                <Button size="sm" variant="ghost" title="Ver versões" onClick={() => openVersions(t)}>
                                  <History className="h-4 w-4" />
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" onClick={() => copiarTitulo(t.title)}>
                                <Copy className="h-4 w-4" />
                              </Button>
                              {t.user_id && (
                                <Button size="sm" variant="ghost" onClick={() => excluirTitulo(t.id)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ Histórico de gerações ============ */}
        <TabsContent value="historico" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" /> Histórico de artigos hiperlocais gerados
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Registro por artigo: categoria detectada, few-shot injetado, tentativas de regeneração e regra ≤30 palavras.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={loadHistory} disabled={loadingHistory}>
                <RefreshCcw className="h-4 w-4 mr-2" /> Recarregar
              </Button>
            </CardHeader>
            <CardContent>
              {loadingHistory ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : history.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Nenhuma geração hiperlocal registrada ainda.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Título</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead>Few-shot</TableHead>
                        <TableHead>Regen</TableHead>
                        <TableHead>§1 · 1ª frase</TableHead>
                        <TableHead>Origem</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((h) => {
                        const cat = TITLE_CATEGORIES.find((c) => c.key === h.category);
                        return (
                          <TableRow key={h.id}>
                            <TableCell className="text-xs whitespace-nowrap">
                              {new Date(h.created_at).toLocaleString("pt-BR")}
                            </TableCell>
                            <TableCell className="max-w-md">
                              <div className="text-sm font-medium line-clamp-2">{h.title}</div>
                              {h.template_kind && (
                                <div className="text-xs text-muted-foreground">template: {h.template_kind}</div>
                              )}
                            </TableCell>
                            <TableCell>
                              {h.category ? (
                                <Badge variant="outline">{cat?.emoji} {cat?.label ?? h.category}</Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs">
                              <Badge variant="secondary">{h.fewshot_count} ex.</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={h.regen_attempts === 0 ? "default" : h.regen_attempts >= 2 ? "destructive" : "secondary"}>
                                {h.regen_attempts}×
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">
                              <div className="flex items-center gap-1">
                                <Badge variant={h.first_sentence_ok ? "default" : "destructive"} className="text-[10px]">
                                  {h.first_sentence_words ?? "—"}w / 30
                                </Badge>
                                <Badge variant={h.frontload_passes ? "default" : "destructive"} className="text-[10px]">
                                  §1 {h.frontload_passes ? "OK" : "FAIL"}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">{h.source}</Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ============ Edit title dialog ============ */}
      <Dialog open={editTitleOpen} onOpenChange={setEditTitleOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar título hiperlocal</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Categoria</Label>
              <Select
                value={editTitleForm.category}
                onValueChange={(v) => setEditTitleForm({ ...editTitleForm, category: v as TitleCategory })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TITLE_CATEGORIES.map((c) => (
                    <SelectItem key={c.key} value={c.key}>{c.emoji} {c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Título</Label>
              <Textarea
                rows={3}
                value={editTitleForm.title}
                onChange={(e) => setEditTitleForm({ ...editTitleForm, title: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Bairro (hint)</Label>
                <Input
                  value={editTitleForm.neighborhood_hint}
                  onChange={(e) => setEditTitleForm({ ...editTitleForm, neighborhood_hint: e.target.value })}
                />
              </div>
              <div>
                <Label>Cidade (hint)</Label>
                <Input
                  value={editTitleForm.city_hint}
                  onChange={(e) => setEditTitleForm({ ...editTitleForm, city_hint: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="edit-is-urgency"
                type="checkbox"
                checked={editTitleForm.is_urgency}
                onChange={(e) => setEditTitleForm({ ...editTitleForm, is_urgency: e.target.checked })}
              />
              <Label htmlFor="edit-is-urgency">Urgência (24h / plantão)</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Cada edição salva uma nova versão automaticamente. Use o ícone <History className="h-3 w-3 inline" /> para consultar/restaurar.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditTitleOpen(false)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={savingEdit}>
              {savingEdit ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ Versions dialog ============ */}
      <Dialog open={versionsOpen} onOpenChange={setVersionsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" /> Histórico de versões
            </DialogTitle>
            {versionsFor && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {versionsFor.title}
              </p>
            )}
          </DialogHeader>
          {loadingVersions ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : versionsList.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nenhuma versão anterior. Este é o estado inicial do título.
            </p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {versionsList.map((v) => (
                <div key={v.id} className="border rounded p-3 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline">v{v.version_number}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(v.created_at).toLocaleString("pt-BR")}
                      </span>
                      {v.change_reason && (
                        <Badge variant="secondary" className="text-[10px]">{v.change_reason}</Badge>
                      )}
                    </div>
                    <div className="text-sm">{v.title}</div>
                    <div className="text-xs text-muted-foreground mt-1">categoria: {v.category}</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => restoreVersion(v.id)}>
                    <RefreshCcw className="h-3 w-3 mr-1" /> Restaurar
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
