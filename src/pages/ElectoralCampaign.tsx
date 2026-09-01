import { useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import {
  AlertTriangle, BookOpen, CheckCircle2, FileText, Flame, Globe, Image, Instagram,
  MapPin, Scale, Send, Share2, Shield, Smartphone, Sparkles, Users, Video, Vote, Youtube,
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
import { ElectoralVisualIdentity } from '@/components/electoral/ElectoralVisualIdentity';
import { MADEIRA_1470_PRESET, formatCampaignFooter } from '@/config/electoralCampaignPresets';
import { useAuth } from '@/hooks/useAuth';
import { useProjects } from '@/hooks/useProjects';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ELECTORAL_EDITORIAL_SECTIONS, evaluateElectoralCompliance, type ElectoralComplianceProfile } from '@/lib/electoralCompliance';
import { ELECTORAL_LONGFORM_TARGET, evaluateLongformDepth } from '@/lib/electoralEditorialStandards';

const ACTIVE_PRESET = MADEIRA_1470_PRESET;
const ELECTION_DATE_2026 = '2026-10-04';
const CAMPAIGN_START_2026 = '2026-08-16T00:00:00-03:00';

type CampaignPhase = 'pre-campanha' | 'campanha' | 'pos-pleito';
type ArticleMode = 'longform' | 'satellite' | 'territorial';

interface CampaignContentConfig {
  biography: string;
  legislativeProjects: string;
  documentedActs: string;
  factualDifferentials: string;
  articleMode: ArticleMode;
  notifyIndexNow: boolean;
  socialMedia: Record<'instagram' | 'youtube' | 'twitter' | 'facebook' | 'tiktok' | 'website' | 'whatsapp', string>;
}

const defaultContentConfig: CampaignContentConfig = {
  biography: '',
  legislativeProjects: '',
  documentedActs: '',
  factualDifferentials: '',
  articleMode: 'longform',
  notifyIndexNow: true,
  socialMedia: { instagram: '', youtube: '', twitter: '', facebook: '', tiktok: '', website: ACTIVE_PRESET.officialWebsite, whatsapp: '' },
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
  officialWebsite: ACTIVE_PRESET.officialWebsite,
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
  { id: 'deep-factual', title: 'Deep-SEO factual', description: 'Alvo editorial de 4.000+ palavras, fontes, FAQ e competências.', icon: BookOpen },
  { id: 'legislative-project', title: 'Projeto legislativo', description: 'Proposta, fundamento normativo e competência do cargo.', icon: Scale },
  { id: 'community-context', title: 'Contexto territorial', description: 'Dados públicos por município/distrito sem persuasão hiperlocal.', icon: MapPin },
  { id: 'video-expansion', title: 'Expansão de vídeo', description: 'Transforma contexto já revisado de vídeo em pauta factual.', icon: Video },
];

function deriveCampaignPhase(now: Date): CampaignPhase {
  const start = new Date(CAMPAIGN_START_2026);
  const election = new Date(`${ELECTION_DATE_2026}T23:59:59-03:00`);
  if (now < start) return 'pre-campanha';
  if (now <= election) return 'campanha';
  return 'pos-pleito';
}

function targetWords(mode: ArticleMode) {
  if (mode === 'longform') return ELECTORAL_LONGFORM_TARGET.targetWords;
  if (mode === 'satellite') return 1400;
  return 900;
}

export default function ElectoralCampaign() {
  const { user } = useAuth();
  const { projects } = useProjects();
  const { toast } = useToast();
  const [contentConfig, setContentConfig] = useState(defaultContentConfig);
  const [complianceProfile, setComplianceProfile] = useState<ElectoralComplianceProfile>(defaultComplianceProfile);
  const [electionDate, setElectionDate] = useState(ELECTION_DATE_2026);
  const [selectedTemplate, setSelectedTemplate] = useState('deep-factual');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedDistricts, setSelectedDistricts] = useState<string[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [keyword, setKeyword] = useState('');
  const [generatedContent, setGeneratedContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTab, setCurrentTab] = useState('candidate');

  const campaignPhase = deriveCampaignPhase(new Date());
  const compliance = useMemo(() => evaluateElectoralCompliance(complianceProfile, { electionDate, now: new Date() }), [complianceProfile, electionDate]);
  const depth = useMemo(() => evaluateLongformDepth(generatedContent), [generatedContent]);
  const sanitizedContent = useMemo(() => DOMPurify.sanitize(generatedContent, { USE_PROFILES: { html: true } }), [generatedContent]);
  const campaignFooter = formatCampaignFooter(ACTIVE_PRESET, complianceProfile.campaignCnpj);

  const updateCompliance = (patch: Partial<ElectoralComplianceProfile>) => setComplianceProfile((previous) => ({ ...previous, ...patch }));
  const updateContent = (patch: Partial<CampaignContentConfig>) => setContentConfig((previous) => ({ ...previous, ...patch }));
  const updateSocial = (key: keyof CampaignContentConfig['socialMedia'], value: string) => setContentConfig((previous) => ({ ...previous, socialMedia: { ...previous.socialMedia, [key]: value } }));

  const handleGenerate = async () => {
    if (!keyword.trim()) {
      toast({ title: 'Informe a pauta.', variant: 'destructive' });
      return;
    }
    if (!compliance.canGenerateDraft) {
      toast({ title: 'Complete a identificação mínima antes de gerar.', variant: 'destructive' });
      setCurrentTab('compliance');
      return;
    }
    setIsGenerating(true);
    setProgress(10);
    setGeneratedContent('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sessão expirada.');
      const requestedTargetWords = targetWords(contentConfig.articleMode);
      const config = {
        campaignPresetId: ACTIVE_PRESET.id,
        campaignCnpj: complianceProfile.campaignCnpj,
        campaignPhase,
        electionDate,
        articleType: contentConfig.articleMode === 'longform' ? 'pillar' : contentConfig.articleMode,
        requestedTargetWords,
        biography: contentConfig.biography,
        legislativeProjects: contentConfig.legislativeProjects,
        documentedActs: contentConfig.documentedActs,
        factualDifferentials: contentConfig.factualDifferentials,
        fixedIssues: ACTIVE_PRESET.fixedIssues,
        campaignTopics: selectedTopics,
        targetCities: selectedCities,
        targetDistricts: selectedDistricts,
        usesSyntheticMedia: complianceProfile.usesSyntheticMedia,
        syntheticMediaDisclosure: complianceProfile.syntheticMediaDisclosure,
        sourceVerificationRequired: true,
        legalReviewRequired: true,
        legalReviewConfirmed: complianceProfile.legalReviewConfirmed,
        paidBoosting: complianceProfile.paidBoosting,
        paidBoostingProvider: complianceProfile.paidBoostingProvider,
        compliance: { score: compliance.score, blockers: compliance.blockers, warnings: compliance.warnings, canPublish: compliance.canPublish },
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
        },
      };
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-electoral-content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ keyword, template: selectedTemplate, config, projectId: selectedProjectId || undefined, notifyIndexNow: contentConfig.notifyIndexNow }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
      const content = String(payload.content || '');
      if (!content.trim()) throw new Error('A função não retornou conteúdo.');
      setGeneratedContent(content);
      setProgress(100);
      setCurrentTab('review');
      if (user) {
        const { error } = await supabase.from('articles').insert([{
          user_id: user.id,
          project_id: selectedProjectId || null,
          keyword,
          title: `${ACTIVE_PRESET.ballotName} — ${keyword}`,
          content,
          type: 'blog' as const,
          status: 'draft' as const,
          word_count: content.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length,
          config: {
            electoral: true,
            campaignPresetId: ACTIVE_PRESET.id,
            requestedTargetWords,
            template: selectedTemplate,
            targetCities: selectedCities,
            targetDistricts: selectedDistricts,
            campaignTopics: selectedTopics,
            complianceSnapshot: { evaluatedAt: new Date().toISOString(), ...compliance },
          } as any,
        }]);
        if (error) throw error;
      }
      toast({ title: 'Rascunho gerado e salvo', description: 'A publicação continua dependente dos gates de compliance e revisão.' });
    } catch (error) {
      toast({ title: 'Falha na geração', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 p-3 shadow-lg"><Vote className="h-8 w-8 text-white" /></div>
          <div>
            <h1 className="text-2xl font-bold">Campanha Eleitoral 2026 — {ACTIVE_PRESET.ballotName} {ACTIVE_PRESET.ballotNumber}</h1>
            <p className="text-muted-foreground">Identidade fixa, compliance, mídia, GEO factual, Deep-SEO e revisão em uma única esteira.</p>
          </div>
        </div>
        <div className="flex gap-2"><Badge variant="outline">{campaignPhase}</Badge><Badge variant={compliance.canPublish ? 'default' : 'destructive'}>{compliance.score}% compliance</Badge></div>
      </div>

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="flex gap-3 p-4 text-sm"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Regra estrutural:</strong> território serve para contextualização com dados públicos e metadados, não para inferir preferência política ou personalizar persuasão. Imagem gerada e conteúdo eleitoral permanecem sujeitos a revisão humana.</div></CardContent>
      </Card>

      <Tabs value={currentTab} onValueChange={setCurrentTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-5 xl:grid-cols-10">
          <TabsTrigger value="candidate"><Users className="mr-1 h-4 w-4" /> Candidatura</TabsTrigger>
          <TabsTrigger value="compliance"><Shield className="mr-1 h-4 w-4" /> Compliance</TabsTrigger>
          <TabsTrigger value="territory"><MapPin className="mr-1 h-4 w-4" /> GEO</TabsTrigger>
          <TabsTrigger value="channels"><Share2 className="mr-1 h-4 w-4" /> Canais</TabsTrigger>
          <TabsTrigger value="topics"><Sparkles className="mr-1 h-4 w-4" /> Pautas</TabsTrigger>
          <TabsTrigger value="videos"><Video className="mr-1 h-4 w-4" /> Vídeos</TabsTrigger>
          <TabsTrigger value="visual"><Image className="mr-1 h-4 w-4" /> Visual</TabsTrigger>
          <TabsTrigger value="production"><FileText className="mr-1 h-4 w-4" /> Produção</TabsTrigger>
          <TabsTrigger value="review"><Flame className="mr-1 h-4 w-4" /> Revisão</TabsTrigger>
          <TabsTrigger value="portal"><Globe className="mr-1 h-4 w-4" /> Portal</TabsTrigger>
        </TabsList>

        <TabsContent value="candidate" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardHeader><CardTitle className="text-base">Identidade fixa do preset</CardTitle><CardDescription>Valores reforçados também no backend.</CardDescription></CardHeader><CardContent className="space-y-2 text-sm">
              <div><strong>Nome legal:</strong> {ACTIVE_PRESET.legalName}</div><div><strong>Nome de urna:</strong> {ACTIVE_PRESET.ballotName}</div><div><strong>Número:</strong> {ACTIVE_PRESET.ballotNumber}</div><div><strong>Cargo:</strong> Deputado Federal — SP</div><div><strong>Partido:</strong> {ACTIVE_PRESET.politicalParty}</div><div><strong>Sequencial TSE:</strong> {ACTIVE_PRESET.tseSequence}</div><div><strong>Situação cadastrada:</strong> {ACTIVE_PRESET.registrationStatus}</div><div><strong>CNPJ:</strong> {ACTIVE_PRESET.campaignCnpj} <Badge variant="outline">declarado pela campanha</Badge></div>
            </CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">Biografia e atos verificáveis</CardTitle></CardHeader><CardContent className="space-y-3">
              <div><Label>Biografia factual</Label><Textarea rows={4} value={contentConfig.biography} onChange={(e) => updateContent({ biography: e.target.value })} /></div>
              <div><Label>Projetos/propostas documentados</Label><Textarea rows={3} value={contentConfig.legislativeProjects} onChange={(e) => updateContent({ legislativeProjects: e.target.value })} /></div>
              <div><Label>Atos e experiências verificáveis</Label><Textarea rows={3} value={contentConfig.documentedActs} onChange={(e) => updateContent({ documentedActs: e.target.value })} /></div>
            </CardContent></Card>
          </div>
          <Card><CardHeader><CardTitle className="text-base">Bandeiras cadastradas</CardTitle></CardHeader><CardContent className="grid gap-2 md:grid-cols-2">{ACTIVE_PRESET.fixedIssues.map((issue) => <div key={issue} className="rounded-md border p-3 text-sm">{issue}</div>)}</CardContent></Card>
        </TabsContent>

        <TabsContent value="compliance"><ElectoralCompliancePanel profile={complianceProfile} result={compliance} electionDate={electionDate} onChange={updateCompliance} onElectionDateChange={setElectionDate} /></TabsContent>

        <TabsContent value="territory" className="space-y-4">
          <CitySelector selectedCities={selectedCities} onCitiesChange={setSelectedCities} selectedDistricts={selectedDistricts} onDistrictsChange={setSelectedDistricts} />
          <Card><CardHeader><CardTitle className="text-base">Editorias</CardTitle><CardDescription>Seleção temática, sem perfilamento individual.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2">{ELECTORAL_EDITORIAL_SECTIONS.map((topic) => <Button key={topic} size="sm" variant={selectedTopics.includes(topic) ? 'default' : 'outline'} onClick={() => setSelectedTopics((previous) => previous.includes(topic) ? previous.filter((item) => item !== topic) : [...previous, topic])}>{topic}</Button>)}</CardContent></Card>
        </TabsContent>

        <TabsContent value="channels"><Card><CardHeader><CardTitle className="text-base">Canais oficiais</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">
          <div className="flex items-center gap-2"><Instagram className="h-4 w-4" /><Input placeholder="Instagram" value={contentConfig.socialMedia.instagram} onChange={(e) => updateSocial('instagram', e.target.value)} /></div>
          <div className="flex items-center gap-2"><Youtube className="h-4 w-4" /><Input placeholder="YouTube" value={contentConfig.socialMedia.youtube} onChange={(e) => updateSocial('youtube', e.target.value)} /></div>
          <div className="flex items-center gap-2"><Globe className="h-4 w-4" /><Input placeholder="Site" value={contentConfig.socialMedia.website} onChange={(e) => updateSocial('website', e.target.value)} /></div>
          <div className="flex items-center gap-2"><Smartphone className="h-4 w-4" /><Input placeholder="WhatsApp" value={contentConfig.socialMedia.whatsapp} onChange={(e) => updateSocial('whatsapp', e.target.value)} /></div>
        </CardContent></Card></TabsContent>

        <TabsContent value="topics"><AISuggestionsPanel candidateRole={ACTIVE_PRESET.candidateRole} candidateName={ACTIVE_PRESET.candidateName} city={selectedCities[0] || 'São Paulo'} onSelectKeyword={setKeyword} onSelectTopics={setSelectedTopics} selectedTopics={selectedTopics} /></TabsContent>

        <TabsContent value="videos"><ElectoralVideoAnalyzer campaignPresetId={ACTIVE_PRESET.id} candidateName={ACTIVE_PRESET.candidateName} ballotName={ACTIVE_PRESET.ballotName} ballotNumber={ACTIVE_PRESET.ballotNumber} politicalParty={ACTIVE_PRESET.politicalParty} campaignCnpj={ACTIVE_PRESET.campaignCnpj} fixedIssues={ACTIVE_PRESET.fixedIssues} selectedCities={selectedCities} selectedDistricts={selectedDistricts} /></TabsContent>

        <TabsContent value="visual"><ElectoralVisualIdentity campaignPresetId={ACTIVE_PRESET.id} projectId={selectedProjectId || null} ballotName={ACTIVE_PRESET.ballotName} ballotNumber={ACTIVE_PRESET.ballotNumber} politicalParty={ACTIVE_PRESET.politicalParty} /></TabsContent>

        <TabsContent value="production" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3"><div className="space-y-4 lg:col-span-2">
            <Card><CardHeader><CardTitle className="text-base">Produção editorial</CardTitle><CardDescription>O alvo de 4.000 palavras é uma configuração de profundidade, não garantia de indexação.</CardDescription></CardHeader><CardContent className="space-y-4">
              {projects.length > 0 && <div><Label>Projeto/domínio de destino</Label><Select value={selectedProjectId} onValueChange={setSelectedProjectId}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select></div>}
              <div><Label>Modo</Label><Select value={contentConfig.articleMode} onValueChange={(value) => updateContent({ articleMode: value as ArticleMode })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="longform">Deep-SEO factual — alvo 4.000 palavras</SelectItem><SelectItem value="satellite">Satélite — ~1.400 palavras</SelectItem><SelectItem value="territorial">Territorial factual — ~900 palavras</SelectItem></SelectContent></Select></div>
              <div><Label>Pauta *</Label><Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Ex.: acesso a crédito para pequenas empresas" /></div>
              <div><Label>Contexto/diferenciais factuais</Label><Textarea rows={3} value={contentConfig.factualDifferentials} onChange={(e) => updateContent({ factualDifferentials: e.target.value })} /></div>
            </CardContent></Card>
            <div className="grid gap-3 md:grid-cols-2">{contentTemplates.map((template) => <Card key={template.id} onClick={() => setSelectedTemplate(template.id)} className={`cursor-pointer border-2 ${selectedTemplate === template.id ? 'border-primary bg-primary/5' : 'hover:border-primary/40'}`}><CardContent className="flex gap-3 p-4"><template.icon className="h-5 w-5 text-primary" /><div><strong className="text-sm">{template.title}</strong><div className="text-xs text-muted-foreground">{template.description}</div></div></CardContent></Card>)}</div>
          </div><Card className="h-fit"><CardHeader><CardTitle className="text-base">Geração controlada</CardTitle></CardHeader><CardContent className="space-y-4">{isGenerating ? <><Progress value={progress} /><div className="text-xs text-muted-foreground">Preparando rascunho...</div></> : <Button className="h-12 w-full" onClick={() => void handleGenerate()} disabled={!keyword || !compliance.canGenerateDraft}>GERAR RASCUNHO <Send className="ml-2 h-4 w-4" /></Button>}<div className="rounded-md border bg-muted/40 p-3 text-xs">Alvo atual: <strong>{targetWords(contentConfig.articleMode)} palavras</strong>. Geração ≠ publicação.</div></CardContent></Card></div>
        </TabsContent>

        <TabsContent value="review" className="space-y-4">
          <Card><CardHeader><CardTitle className="text-base">Profundidade e revisão</CardTitle></CardHeader><CardContent className="grid gap-2 md:grid-cols-4"><div className="rounded-md border p-3"><strong>{depth.wordCount}</strong><div className="text-xs text-muted-foreground">palavras</div></div><div className="rounded-md border p-3">{depth.reachesConfiguredLongformTarget ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <AlertTriangle className="h-5 w-5 text-amber-500" />}<div className="text-xs text-muted-foreground">alvo 4.000</div></div><div className="rounded-md border p-3"><strong>{depth.hasSources ? 'SIM' : 'NÃO'}</strong><div className="text-xs text-muted-foreground">fontes detectadas</div></div><div className="rounded-md border p-3"><strong>{depth.hasFaq ? 'SIM' : 'NÃO'}</strong><div className="text-xs text-muted-foreground">FAQ detectado</div></div></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Rascunho</CardTitle></CardHeader><CardContent>{generatedContent ? <div className="space-y-4">{(!compliance.canPublish || depth.warnings.length > 0) && <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm"><strong>Não publicar automaticamente.</strong>{depth.warnings.map((warning) => <div key={warning} className="text-xs">• {warning}</div>)}</div>}<div className="prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: sanitizedContent }} /></div> : <div className="py-12 text-center text-muted-foreground">Nenhum rascunho gerado.</div>}</CardContent></Card>
        </TabsContent>

        <TabsContent value="portal" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle className="text-base">Identificação e arrecadação</CardTitle><CardDescription>Dados de arrecadação ficam informativos e dependem de revisão financeira antes de exposição automática.</CardDescription></CardHeader><CardContent className="space-y-2 text-sm"><div>{campaignFooter}</div>{ACTIVE_PRESET.donationChannels.map((channel) => <div key={`${channel.type}-${channel.label}`} className="rounded-md border p-2"><strong>{channel.label}:</strong> {channel.value}<Badge variant="outline" className="ml-2">{channel.verificationStatus}</Badge></div>)}<div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">CTA de doação automática: <strong>DESATIVADA</strong> até revisão financeira/eleitoral. A regra geral de pessoa física é tratada no compliance, não como promessa ou pressão para contribuição.</div></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Governança do portal</CardTitle></CardHeader><CardContent className="space-y-2 text-sm text-muted-foreground"><p>• Conteúdo eleitoral identificado e separado de notícia independente.</p><p>• Mídia sintética passa pelo gate específico de rotulagem e janela temporal.</p><p>• GEO serve a dados públicos, schema e contexto editorial.</p><p>• Imagens aprovadas podem ser vinculadas ao artigo somente após revisão visual.</p><p>• IndexNow é notificação técnica; não significa indexação garantida.</p></CardContent></Card></div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
