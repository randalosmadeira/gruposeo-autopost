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
  Video,
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
import { ElectoralVideoAnalyzer } from '@/components/electoral/ElectoralVideoAnalyzer';
import {
  MADEIRA_1470_PRESET,
  formatCampaignFooter,
} from '@/config/electoralCampaignPresets';
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
const ACTIVE_PRESET = MADEIRA_1470_PRESET;

const defaultContentConfig: CampaignContentConfig = {
  biography: '',
  flagsAndCauses: ACTIVE_PRESET.fixedIssues.map((issue, index) => `${index + 1}. ${issue}`).join('\n'),
  legislativeProjects: '',
  achievements: '',
  differentials: '',
  slogan: ACTIVE_PRESET.slogan,
  state: ACTIVE_PRESET.state,
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
  candidateName: ACTIVE_PRESET.candidateName,
  ballotName: ACTIVE_PRESET.ballotName,
  ballotNumber: ACTIVE_PRESET.ballotNumber,
  politicalParty: ACTIVE_PRESET.politicalParty,
  federationOrCoalition: ACTIVE_PRESET.federationOrCoalition,
  candidateRole: ACTIVE_PRESET.candidateRole,
  campaignCnpj: ACTIVE_PRESET.campaignCnpj,
  officialWebsite: '',
  websiteRegisteredWithElectoralJustice: false,
  websitePreexisting: true,
  websiteListedInInitialFiling: false,
  websiteCreatedAt: '',
  websiteRegistrationDate: '',
  providerEstablishedInBrazil: false,
  privacyPolicyUrl: '',
  responsibleName: '',
  dataSubjectRightsChannel: '',
  dataProtectionOfficerName: '',
  dataProcessingRecordMaintained: false,
  securityMeasuresConfirmed: false,
  processesSensitiveData: false,
  sensitiveDataExplicitConsentConfirmed: false,
  contentMode: 'editorial-factual',
  usesAi: true,
  usesSyntheticMedia: false,
  syntheticMediaDisclosure: true,
  sourceVerificationRequired: true,
  legalReviewRequired: true,
  legalReviewConfirmed: false,
  messagingConsentConfirmed: false,
  senderIdentificationConfirmed: false,
  unsubscribeMechanismConfirmed: false,
  unsubscribeWithin48HoursConfirmed: false,
  paidBoosting: false,
  paidBoostingProvider: '',
  paidBoostingContractedByAuthorizedActor: false,
  paidBoostingIdentificationConfirmed: false,
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
  { id: 'city-context', title: 'Contexto territorial', description: 'Contextualização factual por município/distrito, sem microdirecionamento persuasivo.', icon: MapPin },
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
        // Quadro SSE parcial; aguardar o próximo quadro completo.
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
  const [selectedDistricts, setSelectedDistricts] = useState<string[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [currentTab, setCurrentTab] = useState('candidate');
  const { toast } = useToast();
  const { user } = useAuth();
  const { projects } = useProjects();

  const now = new Date();
  const campaignPhase = deriveCampaignPhase(now);
  const dateLabel = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(now);
  const campaignFooter = formatCampaignFooter(ACTIVE_PRESET, complianceProfile.campaignCnpj);
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
      toast({ title: 'Complete a identificação básica e o CNPJ oficial antes de gerar.', variant: 'destructive' });
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
        campaignPresetId: ACTIVE_PRESET.id,
        fixedIssues: ACTIVE_PRESET.fixedIssues,
        campaignFooter,
        targetCities: selectedCities,
        targetDistricts: selectedDistricts,
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
          neverIndicatePoliticalPreference: true,
          neverImpersonateNewsOutlet: true,
          requirePrimarySources: true,
          requireHumanReviewBeforePublishing: true,
          prohibitSensitiveMicrotargeting: true,
          prohibitPersuasiveGeoPersonalization: true,
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
            campaignPresetId: ACTIVE_PRESET.id,
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
            targetDistricts: selectedDistricts,
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
              {ACTIVE_PRESET.ballotName} {ACTIVE_PRESET.ballotNumber}
              <Badge className="bg-orange-500 text-white">Preset eleitoral</Badge>
            </h1>
            <p className="text-muted-foreground">{ACTIVE_PRESET.label} · conteúdo factual com compliance, fontes e revisão humana.</p>
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
            <strong>Regra do módulo eleitoral:</strong> o sistema mantém os dados da campanha em um preset próprio, sem contaminar outros tenants. A IA pode resumir, classificar e estruturar conteúdo factual, mas não recomenda voto, não ranqueia candidaturas e não personaliza persuasão política por cidade, distrito ou bairro.
          </div>
        </CardContent>
      </Card>

      <Tabs value={currentTab} onValueChange={setCurrentTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8">
          <TabsTrigger value="candidate"><Users className="mr-1 h-4 w-4" /> Candidatura</TabsTrigger>
          <TabsTrigger value="compliance"><Shield className="mr-1 h-4 w-4" /> Compliance</TabsTrigger>
          <TabsTrigger value="cities"><MapPin className="mr-1 h-4 w-4" /> Território</TabsTrigger>
          <TabsTrigger value="videos"><Video className="mr-1 h-4 w-4" /> Vídeos</TabsTrigger>
          <TabsTrigger value="suggestions"><Sparkles className="mr-1 h-4 w-4" /> Pautas</TabsTrigger>
          <TabsTrigger value="content"><FileText className="mr-1 h-4 w-4" /> Produção</TabsTrigger>
          <TabsTrigger value="review"><Flame className="mr-1 h-4 w-4" /> Revisão</TabsTrigger>
          <TabsTrigger value="governance"><Globe className="mr-1 h-4 w-4" /> Portal</TabsTrigger>
        </TabsList>

        <TabsContent value="candidate" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Preset Madeira 1470</CardTitle>
                <CardDescription>Pré-preenchimento da campanha atual. O CNPJ permanece bloqueante até confirmação do identificador oficial.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div><Label>Nome completo</Label><Input readOnly value={complianceProfile.candidateName} /></div>
                <div><Label>Nome de urna</Label><Input readOnly value={complianceProfile.ballotName} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Número</Label><Input readOnly value={complianceProfile.ballotNumber} /></div>
                  <div><Label>Partido</Label><Input readOnly value={complianceProfile.politicalParty} /></div>
                </div>
                <div><Label>Cargo</Label><Input readOnly value="Deputado(a) Federal" /></div>
                <div><Label>Slogan</Label><Input readOnly value={contentConfig.slogan} /></div>
                <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-sm">
                  {campaignPhase === 'campanha' ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
                  <span>Fase calculada: <strong>{campaignPhase}</strong></span>
                  <Badge variant="outline" className="ml-auto">{dateLabel}</Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Bandeiras e pautas fixas</CardTitle>
                <CardDescription>Base temática cadastrada no preset da campanha.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {ACTIVE_PRESET.fixedIssues.map((issue, index) => (
                  <div key={issue} className="rounded-md border bg-muted/30 p-3 text-sm"><strong>{index + 1}.</strong> {issue}</div>
                ))}
                <div className="pt-2"><Label>Biografia factual</Label><Textarea rows={3} value={contentConfig.biography} onChange={(event) => updateContentConfig({ biography: event.target.value })} /></div>
                <div><Label>Projetos/atos legislativos documentados</Label><Textarea rows={2} value={contentConfig.legislativeProjects} onChange={(event) => updateContentConfig({ legislativeProjects: event.target.value })} /></div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Canais oficiais</CardTitle><CardDescription>Links controlados pela campanha; não habilitam mensageria em massa sem os gates de compliance.</CardDescription></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center gap-2"><Instagram className="h-5 w-5" /><Input placeholder="Instagram" value={contentConfig.socialMedia.instagram} onChange={(event) => updateSocial('instagram', event.target.value)} /></div>
              <div className="flex items-center gap-2"><Youtube className="h-5 w-5" /><Input placeholder="YouTube" value={contentConfig.socialMedia.youtube} onChange={(event) => updateSocial('youtube', event.target.value)} /></div>
              <div className="flex items-center gap-2"><Globe className="h-5 w-5" /><Input placeholder="X/Twitter" value={contentConfig.socialMedia.twitter} onChange={(event) => updateSocial('twitter', event.target.value)} /></div>
              <div className="flex items-center gap-2"><Globe className="h-5 w-5" /><Input placeholder="Facebook" value={contentConfig.socialMedia.facebook} onChange={(event) => updateSocial('facebook', event.target.value)} /></div>
              <div className="flex items-center gap-2"><Smartphone className="h-5 w-5" /><Input placeholder="TikTok" value={contentConfig.socialMedia.tiktok} onChange={(event) => updateSocial('tiktok', event.target.value)} /></div>
              <div className="flex items-center gap-2"><Smartphone className="h-5 w-5" /><Input placeholder="WhatsApp oficial" value={contentConfig.socialMedia.whatsapp} onChange={(event) => updateSocial('whatsapp', event.target.value)} /></div>
            </CardContent>
          </Card>
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
          <CitySelector
            selectedCities={selectedCities}
            onCitiesChange={setSelectedCities}
            selectedDistricts={selectedDistricts}
            onDistrictsChange={setSelectedDistricts}
          />
          <Card>
            <CardHeader><CardTitle className="text-base">Editorias da campanha</CardTitle><CardDescription>Temas públicos para organização editorial, sem perfilamento político individual.</CardDescription></CardHeader>
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

        <TabsContent value="videos">
          <ElectoralVideoAnalyzer
            candidateName={complianceProfile.candidateName}
            ballotName={complianceProfile.ballotName}
            ballotNumber={complianceProfile.ballotNumber}
            politicalParty={complianceProfile.politicalParty}
            campaignCnpj={complianceProfile.campaignCnpj}
            fixedIssues={ACTIVE_PRESET.fixedIssues}
            selectedCities={selectedCities}
            selectedDistricts={selectedDistricts}
          />
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
                        <SelectItem value="territorial">Territorial factual (~900 palavras)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Pauta/palavra-chave *</Label><Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Ex.: acesso a crédito para pequenas empresas" /></div>
                  <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                    Território selecionado: {[...selectedCities, ...selectedDistricts].join(', ') || 'Estado de São Paulo'}. Esse dado contextualiza o conteúdo; não altera a mensagem para persuadir perfis de eleitores específicos.
                  </div>
                  <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                    <input type="checkbox" checked={contentConfig.notifyIndexNow} onChange={(event) => updateContentConfig({ notifyIndexNow: event.target.checked })} className="mt-0.5 h-4 w-4" />
                    <span><strong>Notificar IndexNow após publicação</strong><span className="block text-xs text-muted-foreground">Aceite não significa indexação garantida.</span></span>
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
                  <strong>Geração ≠ publicação.</strong> A peça é salva como rascunho. O CNPJ oficial, fontes, rotulagem aplicável e revisão humana continuam independentes.
                </div>
                {!compliance.canGenerateDraft && <Button variant="outline" className="w-full" onClick={() => setCurrentTab('compliance')}>Completar campos obrigatórios</Button>}
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
                  <div className="rounded-md border bg-muted/40 p-3 text-xs"><strong>Rodapé configurado:</strong> {campaignFooter}</div>
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
              <CardHeader><CardTitle className="text-base">Portal eleitoral / branding</CardTitle><CardDescription>Recursos exclusivos do tenant Madeira 1470.</CardDescription></CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>• Identidade pré-carregada: {ACTIVE_PRESET.ballotName}, {ACTIVE_PRESET.ballotNumber}, {ACTIVE_PRESET.politicalParty}.</p>
                <p>• Seis bandeiras fixas armazenadas no preset da campanha.</p>
                <p>• Municípios carregados da API oficial do IBGE; distritos da capital carregados por endpoint oficial.</p>
                <p>• Bairros só serão marcados como “oficiais/completos” após importação de fonte municipal confiável.</p>
                <p>• Rodapé padrão do tenant: {campaignFooter}</p>
                <p>• Mídia sintética, impulsionamento e mensageria permanecem submetidos aos gates próprios.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Portais gerais, jurídicos e outros domínios</CardTitle><CardDescription>Somente capacidades reutilizáveis; nenhuma identidade eleitoral é herdada.</CardDescription></CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>• Multi-site/multi-tenant, categorias, tags, agendamento e workflow editorial.</p>
                <p>• Fontes, revisão, dados estruturados, RSS, sitemap e IndexNow quando tecnicamente aplicável.</p>
                <p>• AdSense apenas em slots próprios, rotulados e afastados de controles/interações.</p>
                <p>• Analytics/remarketing por IDs allowlisted e consentimento; sem injeção arbitrária de scripts pelo editor.</p>
                <p>• Nome, número, partido, CNPJ e pautas Madeira 1470 ficam fora desses módulos.</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
