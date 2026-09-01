import { useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  FileText,
  Flame,
  Globe,
  Instagram,
  MapPin,
  Megaphone,
  Scale,
  Send,
  Share2,
  Shield,
  Smartphone,
  Sparkles,
  Users,
  Vote,
  Youtube,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { AISuggestionsPanel } from '@/components/electoral/AISuggestionsPanel';
import { CitySelector } from '@/components/electoral/CitySelector';
import { ElectoralCompliancePanel } from '@/components/electoral/ElectoralCompliancePanel';
import { useAuth } from '@/hooks/useAuth';
import { useProjects } from '@/hooks/useProjects';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  ELECTORAL_EDITORIAL_SECTIONS,
  evaluateElectoralCompliance,
  type ElectoralComplianceProfile,
} from '@/lib/electoralCompliance';

interface CampaignContentConfig {
  biography: string;
  flagsAndCauses: string;
  legislativeProjects: string;
  achievements: string;
  differentials: string;
  slogan: string;
  state: string;
  city: string;
  articleType: 'pillar' | 'satellite' | 'territorial';
  notifyIndexNow: boolean;
  socialMedia: {
    instagram: string;
    youtube: string;
    twitter: string;
    facebook: string;
    tiktok: string;
    website: string;
    whatsapp: string;
  };
}

const ELECTION_DATE_2026 = '2026-10-04';
const CAMPAIGN_START_2026 = '2026-08-16T00:00:00-03:00';

const defaultContentConfig: CampaignContentConfig = {
  biography: '',
  flagsAndCauses: '',
  legislativeProjects: '',
  achievements: '',
  differentials: '',
  slogan: '',
  state: 'SP',
  city: '',
  articleType: 'pillar',
  notifyIndexNow: true,
  socialMedia: {
    instagram: '',
    youtube: '',
    twitter: '',
    facebook: '',
    tiktok: '',
    website: '',
    whatsapp: '',
  },
};

const defaultComplianceProfile: ElectoralComplianceProfile = {
  electionYear: 2026,
  candidateName: '',
  ballotName: '',
  ballotNumber: '',
  politicalParty: '',
  federationOrCoalition: '',
  candidateRole: 'deputado-federal',
  campaignCnpj: '',
  officialWebsite: '',
  websiteRegisteredWithElectoralJustice: false,
  websiteRegistrationDate: '',
  providerEstablishedInBrazil: false,
  privacyPolicyUrl: '',
  responsibleName: '',
  contentMode: 'editorial-factual',
  usesAi: true,
  usesSyntheticMedia: false,
  syntheticMediaDisclosure: true,
  sourceVerificationRequired: true,
  legalReviewRequired: true,
  legalReviewConfirmed: false,
  messagingConsentConfirmed: false,
  unsubscribeMechanismConfirmed: false,
  paidBoosting: false,
  paidBoostingProvider: '',
  monetizationMode: 'off',
  monetizationLegalReviewConfirmed: false,
};

const contentTemplates = [
  { id: 'authority-article', title: 'Artigo de pauta', description: 'Explica proposta, contexto, limites do cargo e fontes primárias.', icon: BookOpen },
  { id: 'social-factual', title: 'Pacote social factual', description: 'Adaptação editorial para redes, sem recomendação automatizada de voto.', icon: Share2 },
  { id: 'legislative-project', title: 'Projeto legislativo', description: 'Análise factual de proposta ou projeto, com número e fonte verificados.', icon: Scale },
  { id: 'community-agenda', title: 'Pauta comunitária', description: 'Problema local, dados públicos, proposta e competência do cargo.', icon: Users },
  { id: 'debate-position', title: 'Posicionamento documentado', description: 'Posição declarada pela candidatura com contexto e fontes.', icon: Megaphone },
  { id: 'track-record', title: 'Histórico documentado', description: 'Trajetória e atos comprováveis, sem prova social fabricada.', icon: Shield },
  { id: 'city-targeted', title: 'Informação territorial', description: 'Pauta por cidade sem microsegmentação por dado sensível.', icon: MapPin },
];

function deriveCampaignPhase(now: Date): 'pre-campanha' | 'campanha' | 'pos-pleito' {
  const start = new Date(CAMPAIGN_START_2026);
  const election = new Date(`${ELECTION_DATE_2026}T23:59:59-03:00`);
  if (now < start) return 'pre-campanha';
  if (now <= election) return 'campanha';
  return 'pos-pleito';
}

async function readElectoralResponse(response: Response, onDelta: (content: string) => void): Promise<string> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const payload = await response.json();
    if (payload.error) throw new Error(payload.error);
    const content = String(payload.content || payload.message || '');
    onDelta(content);
    return content;
  }

  if (!response.body) throw new Error('Resposta sem conteúdo.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index: number;
    while ((index = buffer.indexOf('\n')) !== -1) {
      let line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === '[DONE]') continue;
      try {
        const parsed = JSON.parse(raw);
        const delta = parsed.choices?.[0]?.delta?.content ?? parsed.content ?? '';
        if (delta) {
          fullContent += String(delta);
          onDelta(fullContent);
        }
      } catch {
        // Partial SSE frame; next complete frame will be processed.
      }
    }
  }

  return fullContent;
}

export default function ElectoralCampaign() {
  const [contentConfig, setContentConfig] = useState<CampaignContentConfig>(defaultContentConfig);
  const [complianceProfile, setComplianceProfile] = useState<ElectoralComplianceProfile>(defaultComplianceProfile);
  const [electionDate, setElectionDate] = useState(ELECTION_DATE_2026);
  const [selectedTemplate, setSelectedTemplate] = useState('authority-article');
  const [keyword, setKeyword] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [generatedContent, setGeneratedContent] = useState('');
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [currentTab, setCurrentTab] = useState('candidate');
  const { toast } = useToast();
  const { user } = useAuth();
  const { projects } = useProjects();

  const now = new Date();
  const campaignPhase = deriveCampaignPhase(now);
  const dateLabel = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(now);
  const compliance = useMemo(
    () => evaluateElectoralCompliance(complianceProfile, { electionDate, now: new Date() }),
    [complianceProfile, electionDate],
  );

  const updateContentConfig = (patch: Partial<CampaignContentConfig>) => {
    setContentConfig((previous) => ({ ...previous, ...patch }));
  };

  const updateSocial = (field: keyof CampaignContentConfig['socialMedia'], value: string) => {
    setContentConfig((previous) => ({
      ...previous,
      socialMedia: { ...previous.socialMedia, [field]: value },
    }));
  };

  const updateCompliance = (patch: Partial<ElectoralComplianceProfile>) => {
    setComplianceProfile((previous) => ({ ...previous, ...patch }));
  };

  const toggleEditorialSection = (section: string) => {
    setSelectedTopics((previous) =>
      previous.includes(section) ? previous.filter((item) => item !== section) : [...previous, section],
    );
  };

  const handleGenerate = async () => {
    if (!keyword.trim()) {
      toast({ title: 'Informe a pauta ou palavra-chave.', variant: 'destructive' });
      return;
    }
    if (!compliance.canGenerateDraft) {
      toast({ title: 'Complete a identificação básica da candidatura antes de gerar.', variant: 'destructive' });
      setCurrentTab('compliance');
      return;
    }

    setIsGenerating(true);
    setProgress(5);
    setGeneratedContent('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sessão expirada. Entre novamente.');

      const payloadConfig = {
        ...contentConfig,
        ...complianceProfile,
        campaignPhase,
        electionDate,
        targetCities: selectedCities,
        campaignTopics: selectedTopics,
        city: selectedCities.length === 1 ? selectedCities[0] : contentConfig.city,
        compliance: {
          score: compliance.score,
          blockers: compliance.blockers,
          warnings: compliance.warnings,
          canPublish: compliance.canPublish,
        },
        electoralDirectives: {
          editorialMode: 'factual-assistance',
          neverRecommendVote: true,
          neverRankCandidates: true,
          neverImpersonateNewsOutlet: true,
          requirePrimarySources: true,
          requireHumanReviewBeforePublishing: true,
          prohibitSensitiveMicrotargeting: true,
          syntheticMediaDisclosureRequired: complianceProfile.usesSyntheticMedia,
        },
      };

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-electoral-content`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          keyword,
          template: selectedTemplate,
          config: payloadConfig,
          projectId: selectedProjectId || undefined,
          notifyIndexNow: contentConfig.notifyIndexNow,
        }),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(errorPayload.error || `Falha HTTP ${response.status}`);
      }

      const targetWords = contentConfig.articleType === 'pillar' ? 2200 : contentConfig.articleType === 'satellite' ? 1400 : 900;
      const content = await readElectoralResponse(response, (nextContent) => {
        setGeneratedContent(nextContent);
        const words = nextContent.trim() ? nextContent.trim().split(/\s+/).length : 0;
        setProgress(Math.min(95, Math.max(10, (words / targetWords) * 100)));
      });

      if (!content.trim()) throw new Error('A função não retornou conteúdo utilizável.');

      setGeneratedContent(content);
      setProgress(100);
      setCurrentTab('review');

      if (user) {
        const { error: insertError } = await supabase.from('articles').insert([{
          user_id: user.id,
          keyword,
          title: `${complianceProfile.ballotName || complianceProfile.candidateName} — ${keyword}`,
          content,
          type: 'blog' as const,
          status: 'draft' as const,
          project_id: selectedProjectId || null,
          word_count: content.trim().split(/\s+/).length,
          config: {
            electoral: true,
            electionYear: complianceProfile.electionYear,
            template: selectedTemplate,
            candidateConfig: payloadConfig,
            complianceSnapshot: {
              evaluatedAt: new Date().toISOString(),
              score: compliance.score,
              blockers: compliance.blockers,
              warnings: compliance.warnings,
              canPublish: compliance.canPublish,
            },
            targetCities: selectedCities,
            campaignTopics: selectedTopics,
            articleType: contentConfig.articleType,
          } as any,
        }]);
        if (insertError) throw insertError;
      }

      toast({
        title: 'Rascunho eleitoral gerado.',
        description: compliance.canPublish
          ? 'Gate configurado sem bloqueios; mantenha revisão humana antes de publicar.'
          : 'Salvo como rascunho. Há bloqueios de compliance que impedem publicação automática.',
      });
    } catch (error) {
      console.error('Electoral generation error:', error);
      toast({
        title: 'Erro na geração eleitoral',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const sanitizedContent = useMemo(
    () => DOMPurify.sanitize(generatedContent, { USE_PROFILES: { html: true } }),
    [generatedContent],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 p-3 shadow-lg">
            <Vote className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold text-foreground">
              Campanha Eleitoral 2026
              <Badge className="bg-orange-500 text-white">Compliance-first</Badge>
            </h1>
            <p className="text-muted-foreground">Assistência editorial eleitoral com fontes, auditoria e gates de publicação.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{campaignPhase}</Badge>
          <Badge variant={compliance.canPublish ? 'default' : 'destructive'}>{compliance.score}% compliance</Badge>
        </div>
      </div>

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="flex gap-3 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <strong>Regra do módulo eleitoral:</strong> a IA atua como assistente editorial factual. Não ranqueia candidaturas, não recomenda voto, não cria prova, não inventa fatos e não libera publicação sem gates humanos. O perfil de campanha é isolado dos módulos de portais gerais e jurídicos.
          </div>
        </CardContent>
      </Card>

      <Tabs value={currentTab} onValueChange={setCurrentTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8">
          <TabsTrigger value="candidate"><Users className="mr-1 h-4 w-4" /> Candidatura</TabsTrigger>
          <TabsTrigger value="compliance"><Shield className="mr-1 h-4 w-4" /> Compliance</TabsTrigger>
          <TabsTrigger value="cities"><MapPin className="mr-1 h-4 w-4" /> Território</TabsTrigger>
          <TabsTrigger value="social"><Share2 className="mr-1 h-4 w-4" /> Canais</TabsTrigger>
          <TabsTrigger value="suggestions"><Sparkles className="mr-1 h-4 w-4" /> Pautas</TabsTrigger>
          <TabsTrigger value="content"><FileText className="mr-1 h-4 w-4" /> Produção</TabsTrigger>
          <TabsTrigger value="review"><Flame className="mr-1 h-4 w-4" /> Revisão</TabsTrigger>
          <TabsTrigger value="governance"><Globe className="mr-1 h-4 w-4" /> Portal</TabsTrigger>
        </TabsList>

        <TabsContent value="candidate" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Identidade e cargo</CardTitle>
                <CardDescription>Os campos jurídicos completos ficam no gate de Compliance.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div><Label>Nome completo</Label><Input value={complianceProfile.candidateName} onChange={(e) => updateCompliance({ candidateName: e.target.value })} /></div>
                <div><Label>Nome de urna</Label><Input value={complianceProfile.ballotName} onChange={(e) => updateCompliance({ ballotName: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Número</Label><Input value={complianceProfile.ballotNumber} onChange={(e) => updateCompliance({ ballotNumber: e.target.value })} /></div>
                  <div><Label>Partido</Label><Input value={complianceProfile.politicalParty} onChange={(e) => updateCompliance({ politicalParty: e.target.value })} /></div>
                </div>
                <div>
                  <Label>Cargo</Label>
                  <Select value={complianceProfile.candidateRole} onValueChange={(value) => updateCompliance({ candidateRole: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="deputado-federal">Deputado(a) Federal</SelectItem>
                      <SelectItem value="deputado-estadual">Deputado(a) Estadual/Distrital</SelectItem>
                      <SelectItem value="senador">Senador(a)</SelectItem>
                      <SelectItem value="governador">Governador(a)</SelectItem>
                      <SelectItem value="presidente">Presidente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-sm">
                  {campaignPhase === 'campanha' ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
                  <span>Fase calculada: <strong>{campaignPhase}</strong></span>
                  <Badge variant="outline" className="ml-auto">{dateLabel}</Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Biografia, propostas e registros</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div><Label>Biografia factual</Label><Textarea rows={3} value={contentConfig.biography} onChange={(e) => updateContentConfig({ biography: e.target.value })} /></div>
                <div><Label>Bandeiras e pautas</Label><Textarea rows={3} value={contentConfig.flagsAndCauses} onChange={(e) => updateContentConfig({ flagsAndCauses: e.target.value })} /></div>
                <div><Label>Projetos/atos legislativos documentados</Label><Textarea rows={2} value={contentConfig.legislativeProjects} onChange={(e) => updateContentConfig({ legislativeProjects: e.target.value })} /></div>
                <div><Label>Diferenciais declarados pela candidatura</Label><Textarea rows={2} placeholder="Descrição factual; sem recomendação automatizada de voto." value={contentConfig.differentials} onChange={(e) => updateContentConfig({ differentials: e.target.value })} /></div>
                <div><Label>Slogan oficial</Label><Input value={contentConfig.slogan} onChange={(e) => updateContentConfig({ slogan: e.target.value })} /></div>
              </CardContent>
            </Card>
          </div>
          <div className="flex justify-end"><Button onClick={() => setCurrentTab('compliance')}>Configurar compliance</Button></div>
        </TabsContent>

        <TabsContent value="compliance">
          <ElectoralCompliancePanel
            profile={complianceProfile}
            result={compliance}
            electionDate={electionDate}
            onChange={updateCompliance}
            onElectionDateChange={setElectionDate}
          />
        </TabsContent>

        <TabsContent value="cities" className="space-y-4">
          <CitySelector selectedCities={selectedCities} onCitiesChange={setSelectedCities} />
          <Card>
            <CardHeader><CardTitle className="text-base">Editorias da campanha</CardTitle><CardDescription>Temas definidos pela candidatura; sem perfilamento político individual.</CardDescription></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {ELECTORAL_EDITORIAL_SECTIONS.map((section) => (
                <Button
                  key={section}
                  type="button"
                  variant={selectedTopics.includes(section) ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => toggleEditorialSection(section)}
                >
                  {section}
                </Button>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="social" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Canais oficiais</CardTitle>
              <CardDescription>Links de propriedade/controlados pela campanha. Mensageria em massa permanece condicionada ao gate de consentimento.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center gap-2"><Instagram className="h-5 w-5" /><Input placeholder="Instagram" value={contentConfig.socialMedia.instagram} onChange={(e) => updateSocial('instagram', e.target.value)} /></div>
              <div className="flex items-center gap-2"><Youtube className="h-5 w-5" /><Input placeholder="YouTube" value={contentConfig.socialMedia.youtube} onChange={(e) => updateSocial('youtube', e.target.value)} /></div>
              <div className="flex items-center gap-2"><Globe className="h-5 w-5" /><Input placeholder="X/Twitter" value={contentConfig.socialMedia.twitter} onChange={(e) => updateSocial('twitter', e.target.value)} /></div>
              <div className="flex items-center gap-2"><Globe className="h-5 w-5" /><Input placeholder="Facebook" value={contentConfig.socialMedia.facebook} onChange={(e) => updateSocial('facebook', e.target.value)} /></div>
              <div className="flex items-center gap-2"><Smartphone className="h-5 w-5" /><Input placeholder="TikTok" value={contentConfig.socialMedia.tiktok} onChange={(e) => updateSocial('tiktok', e.target.value)} /></div>
              <div className="flex items-center gap-2"><Smartphone className="h-5 w-5" /><Input placeholder="WhatsApp oficial" value={contentConfig.socialMedia.whatsapp} onChange={(e) => updateSocial('whatsapp', e.target.value)} /></div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suggestions">
          <AISuggestionsPanel
            candidateRole={complianceProfile.candidateRole}
            candidateName={complianceProfile.candidateName}
            city={contentConfig.city || selectedCities[0] || 'São Paulo'}
            onSelectKeyword={setKeyword}
            onSelectTopics={setSelectedTopics}
            selectedTopics={selectedTopics}
          />
        </TabsContent>

        <TabsContent value="content" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <Card>
                <CardHeader><CardTitle className="text-base">Configuração do rascunho</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {projects.length > 0 && (
                    <div>
                      <Label>Projeto/domínio de destino</Label>
                      <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                        <SelectTrigger><SelectValue placeholder="Selecione um projeto" /></SelectTrigger>
                        <SelectContent>
                          {projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div>
                    <Label>Tipo e extensão</Label>
                    <Select value={contentConfig.articleType} onValueChange={(value) => updateContentConfig({ articleType: value as CampaignContentConfig['articleType'] })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pillar">Pilar factual (1.500–2.200 palavras)</SelectItem>
                        <SelectItem value="satellite">Satélite de pauta (900–1.400 palavras)</SelectItem>
                        <SelectItem value="territorial">Territorial (~900 palavras)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Pauta/palavra-chave *</Label><Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Ex.: acesso a crédito para pequenas empresas" /></div>
                  <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                    <input type="checkbox" checked={contentConfig.notifyIndexNow} onChange={(e) => updateContentConfig({ notifyIndexNow: e.target.checked })} className="mt-0.5 h-4 w-4" />
                    <span><strong>Notificar IndexNow após publicação</strong><span className="block text-xs text-muted-foreground">Bing e mecanismos compatíveis. Aceite não significa indexação garantida.</span></span>
                  </label>
                </CardContent>
              </Card>

              <div className="grid gap-3 md:grid-cols-2">
                {contentTemplates.map((template) => (
                  <Card
                    key={template.id}
                    className={`cursor-pointer border-2 transition-all ${selectedTemplate === template.id ? 'border-primary bg-primary/5' : 'hover:border-primary/40'}`}
                    onClick={() => setSelectedTemplate(template.id)}
                  >
                    <CardContent className="flex items-start gap-3 p-4">
                      <div className="rounded-lg border bg-background p-2"><template.icon className="h-5 w-5 text-primary" /></div>
                      <div><div className="text-sm font-bold">{template.title}</div><div className="text-xs text-muted-foreground">{template.description}</div></div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <Card className="h-fit">
              <CardHeader><CardTitle className="text-base">Geração controlada</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {isGenerating ? (
                  <div className="space-y-2"><Progress value={progress} /><p className="text-center text-xs text-muted-foreground">Gerando e registrando o rascunho...</p></div>
                ) : (
                  <Button className="h-12 w-full font-bold" onClick={handleGenerate} disabled={!keyword || !compliance.canGenerateDraft}>
                    GERAR RASCUNHO <Send className="ml-2 h-4 w-4" />
                  </Button>
                )}
                <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                  <strong>Geração ≠ publicação.</strong> A peça é salva como rascunho. Bloqueios eleitorais, fontes, mídia sintética e revisão humana permanecem independentes.
                </div>
                {!compliance.canGenerateDraft && <Button variant="outline" className="w-full" onClick={() => setCurrentTab('compliance')}>Completar identificação obrigatória</Button>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="review" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base"><Flame className="h-5 w-5 text-orange-500" /> Revisão final</CardTitle>
                <div className="flex gap-2">
                  {generatedContent && <Badge variant="outline">{generatedContent.trim().split(/\s+/).length} palavras</Badge>}
                  <Badge variant={compliance.canPublish ? 'default' : 'destructive'}>{compliance.canPublish ? 'gate verde' : 'publicação bloqueada'}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {generatedContent ? (
                <div className="space-y-4">
                  {!compliance.canPublish && (
                    <div className="rounded-md border-l-4 border-red-500 bg-red-500/5 p-4 text-sm">
                      <strong>Não publicar ainda.</strong> Abra a aba Compliance e resolva os bloqueios. O conteúdo continua como rascunho.
                    </div>
                  )}
                  <div className="prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: sanitizedContent }} />
                </div>
              ) : (
                <div className="py-16 text-center text-muted-foreground"><Vote className="mx-auto mb-4 h-12 w-12 opacity-30" /><p>Nenhum rascunho gerado.</p></div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="governance" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Portal eleitoral / branding</CardTitle><CardDescription>Recursos exclusivos quando o domínio for oficialmente eleitoral.</CardDescription></CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>• Header configurável: nome de urna, número, partido/federação e identificação de campanha conforme revisão jurídica.</p>
                <p>• Propostas em destaque, vídeos oficiais e compartilhamento por WhatsApp.</p>
                <p>• Rodapé com responsável, política de privacidade e trilha legal configurada.</p>
                <p>• Bloqueio automático de publicação de mídia sintética na janela eleitoral aplicável.</p>
                <p>• Separação total entre conteúdo oficial, conteúdo editorial e qualquer área de publicidade.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Portais gerais, jurídicos e outros domínios</CardTitle><CardDescription>Somente capacidades genéricas; nenhuma regra/cadastro de candidatura é herdado.</CardDescription></CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>• Multi-site/multi-tenant, categorias, tags, agendamento e workflow editorial.</p>
                <p>• Fontes, revisão, dados estruturados, RSS, sitemap e IndexNow quando tecnicamente aplicável.</p>
                <p>• AdSense apenas em slots próprios, rotulados e afastados de controles/interações para reduzir clique acidental.</p>
                <p>• Analytics/remarketing por IDs allowlisted e consentimento; sem injeção arbitrária de scripts pelo editor.</p>
                <p>• Campos eleitorais ficam completamente fora desses módulos.</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
