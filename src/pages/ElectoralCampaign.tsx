import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProjects } from '@/hooks/useProjects';
import { CitySelector } from '@/components/electoral/CitySelector';
import { AISuggestionsPanel } from '@/components/electoral/AISuggestionsPanel';
import {
  Vote, Megaphone, Flag, Scale, Globe, Instagram, Youtube, Twitter, Facebook,
  Smartphone, BookOpen, Flame, Send, Loader2, FileText, Share2, Users, MapPin,
  Shield, Sparkles, Target, AlertCircle, CheckCircle2,
} from 'lucide-react';

interface CandidateConfig {
  candidateName: string;
  politicalParty: string;
  candidateRole: string;
  campaignPhase: 'pre-campanha' | 'campanha' | 'pos-pleito';
  city: string;
  state: string;
  slogan: string;
  biography: string;
  flagsAndCauses: string;
  legislativeProjects: string;
  achievements: string;
  differentials: string;
  socialMedia: {
    instagram: string;
    youtube: string;
    twitter: string;
    facebook: string;
    tiktok: string;
    website: string;
    whatsapp: string;
  };
  videoUrls: {
    youtube: string[];
    instagram: string[];
  };
  brandStyle: 'madeira-neles' | 'madeira-sem-verniz' | 'both';
  contentTone: 'coloquial' | 'popular-direto' | 'combativo';
  articleType: 'pillar' | 'satellite' | 'territorial';
  notifyIndexNow: boolean;
}

const defaultConfig: CandidateConfig = {
  candidateName: '',
  politicalParty: '',
  candidateRole: 'deputado-federal',
  campaignPhase: 'campanha',
  city: '',
  state: 'SP',
  slogan: '',
  biography: '',
  flagsAndCauses: '',
  legislativeProjects: '',
  achievements: '',
  differentials: '',
  socialMedia: { instagram: '', youtube: '', twitter: '', facebook: '', tiktok: '', website: '', whatsapp: '' },
  videoUrls: { youtube: [], instagram: [] },
  brandStyle: 'both',
  contentTone: 'popular-direto',
  articleType: 'pillar',
  notifyIndexNow: true,
};

const contentTemplates = [
  { id: 'authority-article', title: 'Artigo de Autoridade', description: 'Artigo focado em projetos de lei, bandeiras e histórico', icon: BookOpen, color: 'hsl(var(--primary))' },
  { id: 'social-viral', title: 'Conteúdo Viral Social', description: 'Pacote para redes sociais com hooks, copy e roteiros', icon: Share2, color: 'hsl(var(--accent))' },
  { id: 'legislative-project', title: 'Projeto de Lei', description: 'Destaque de projeto legislativo com análise de impacto', icon: Scale, color: 'hsl(var(--primary))' },
  { id: 'community-agenda', title: 'Pauta Comunitária', description: 'Artigo sobre demandas locais e propostas concretas', icon: Users, color: 'hsl(var(--accent))' },
  { id: 'debate-position', title: 'Posicionamento & Debate', description: 'Artigo opinativo com posicionamento firme', icon: Megaphone, color: 'hsl(var(--primary))' },
  { id: 'track-record', title: 'Histórico & Realizações', description: 'Retrospectiva de atuação com dados e provas sociais', icon: Shield, color: 'hsl(var(--accent))' },
  { id: 'city-targeted', title: 'Artigo por Cidade', description: 'Conteúdo segmentado para cidades específicas de SP', icon: MapPin, color: 'hsl(var(--primary))' },
];

export default function ElectoralCampaign() {
  const [config, setConfig] = useState<CandidateConfig>(defaultConfig);
  const [selectedTemplate, setSelectedTemplate] = useState('authority-article');
  const [keyword, setKeyword] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [generatedContent, setGeneratedContent] = useState('');
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const { toast } = useToast();
  const { user } = useAuth();
  const { projects } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [currentTab, setCurrentTab] = useState('config');

  // Automatic phase detection based on 2026 calendar
  const derivedPhase = useMemo(() => {
    const today = new Date('2026-08-22'); // Simulating the current date from context
    const startCampaign = new Date('2026-08-16');
    const endCampaign = new Date('2026-10-04');

    if (today < startCampaign) return 'pre-campanha';
    if (today <= endCampaign) return 'campanha';
    return 'pos-pleito';
  }, []);

  const updateConfig = (field: string, value: any) => setConfig(prev => ({ ...prev, [field]: value }));
  const updateSocial = (field: string, value: string) => setConfig(prev => ({ ...prev, socialMedia: { ...prev.socialMedia, [field]: value } }));

  const handleGenerate = async () => {
    if (!keyword.trim()) { toast({ title: 'Informe a palavra-chave', variant: 'destructive' }); return; }
    if (!config.candidateName.trim()) { toast({ title: 'Informe o nome do candidato', variant: 'destructive' }); return; }

    setIsGenerating(true);
    setProgress(0);
    setGeneratedContent('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { toast({ title: 'Sessão expirada', variant: 'destructive' }); setIsGenerating(false); return; }

      const enhancedConfig = {
        ...config,
        campaignPhase: derivedPhase, // Always use derived phase
        targetCities: selectedCities,
        campaignTopics: selectedTopics,
        city: selectedCities.length === 1 ? selectedCities[0] : config.city,
      };

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-electoral-content`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ 
            keyword, 
            template: selectedTemplate, 
            config: enhancedConfig, 
            projectId: selectedProjectId || undefined,
            notifyIndexNow: config.notifyIndexNow
          }),
        }
      );

      if (!response.ok) { const err = await response.json().catch(() => ({ error: 'Erro' })); throw new Error(err.error); }
      if (!response.body) throw new Error('Stream indisponível');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6).trim();
          if (json === '[DONE]') break;
          try {
            const parsed = JSON.parse(json);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) { 
              fullContent += delta; 
              setGeneratedContent(fullContent);
              // Progress based on type target words
              const targetWords = config.articleType === 'pillar' ? 2200 : (config.articleType === 'satellite' ? 1400 : 900);
              setProgress(Math.min((fullContent.split(/\s+/).length / targetWords) * 100, 95)); 
            }
          } catch { /* partial */ }
        }
      }

      setGeneratedContent(fullContent);
      setProgress(100);
      setCurrentTab('preview');

      if (user) {
        await supabase.from('articles').insert([{
          user_id: user.id, keyword,
          title: `${config.candidateName} - ${keyword}`,
          content: fullContent, type: 'blog' as const, status: 'draft' as const,
          project_id: selectedProjectId || null,
          word_count: fullContent.split(/\s+/).length,
          config: { 
            electoral: true, 
            template: selectedTemplate, 
            candidateConfig: enhancedConfig, 
            targetCities: selectedCities, 
            campaignTopics: selectedTopics,
            articleType: config.articleType 
          } as any,
        }]);
      }
      toast({ title: 'Conteúdo gerado! 🔥', description: 'Artigo eleitoral pronto para revisão.' });
    } catch (error) {
      console.error('Electoral generation error:', error);
      toast({ title: 'Erro na geração', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="p-3 rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 shadow-lg">
          <Vote className="w-8 h-8 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            Campanha Eleitoral 2026
            <Badge className="bg-orange-500 text-white text-xs">MADEIRA NELES 🪵🔥</Badge>
          </h1>
          <p className="text-muted-foreground">Redator eleitoral com motor de conformidade — Persona Wanderson</p>
        </div>
      </div>

      <Tabs value={currentTab} onValueChange={setCurrentTab} className="space-y-4">
        <TabsList className="grid grid-cols-6 w-full max-w-4xl">
          <TabsTrigger value="config"><Users className="w-4 h-4 mr-1" /> Candidato</TabsTrigger>
          <TabsTrigger value="cities"><MapPin className="w-4 h-4 mr-1" /> Cidades</TabsTrigger>
          <TabsTrigger value="social"><Share2 className="w-4 h-4 mr-1" /> Redes</TabsTrigger>
          <TabsTrigger value="suggestions"><Sparkles className="w-4 h-4 mr-1" /> Sugestões</TabsTrigger>
          <TabsTrigger value="content"><FileText className="w-4 h-4 mr-1" /> Conteúdo</TabsTrigger>
          <TabsTrigger value="preview"><Flame className="w-4 h-4 mr-1" /> Review</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Users className="w-5 h-5 text-primary" /> Dados do Candidato</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div><Label>Nome Completo *</Label><Input placeholder="Ex: Dr. Rândalos Madeira" value={config.candidateName} onChange={e => updateConfig('candidateName', e.target.value)} /></div>
                <div><Label>Partido Político</Label><Input placeholder="Ex: PSD" value={config.politicalParty} onChange={e => updateConfig('politicalParty', e.target.value)} /></div>
                <div>
                  <Label>Cargo Pretendido</Label>
                  <Select value={config.candidateRole} onValueChange={v => updateConfig('candidateRole', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="deputado-federal">Deputado(a) Federal</SelectItem>
                      <SelectItem value="deputado-estadual">Deputado(a) Estadual</SelectItem>
                      <SelectItem value="senador">Senador(a)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Fase da Campanha (Automático)</Label>
                  <div className="flex items-center gap-2 p-2 bg-muted rounded-md text-sm border">
                    {derivedPhase === 'campanha' ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-orange-500" />
                    )}
                    <span className="font-medium">
                      {derivedPhase === 'campanha' ? 'Campanha Oficial (Liberada)' : 
                       derivedPhase === 'pre-campanha' ? 'Pré-Campanha (Não pedir votos)' : 'Pós-Pleito'}
                    </span>
                    <Badge variant="outline" className="ml-auto text-[10px]">22/08/2026</Badge>
                  </div>
                </div>
                <div><Label>Slogan</Label><Input placeholder="Madeira Neles! Sem verniz, com atitude!" value={config.slogan} onChange={e => updateConfig('slogan', e.target.value)} /></div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Flag className="w-5 h-5 text-orange-500" /> Bandeiras & Projetos</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div><Label>Biografia</Label><Textarea placeholder="Trajetória política, foco no trabalhador..." value={config.biography} onChange={e => updateConfig('biography', e.target.value)} rows={3} /></div>
                  <div><Label>Bandeiras & Pautas (Muralha ADV vs MAD)</Label><Textarea placeholder="Fim do score secreto, CNH aos 16, Apps..." value={config.flagsAndCauses} onChange={e => updateConfig('flagsAndCauses', e.target.value)} rows={3} /></div>
                  <div><Label>Diferenciais (Não citar nomes de concorrentes)</Label><Textarea placeholder="Por que votar no Dr. Madeira?" value={config.differentials} onChange={e => updateConfig('differentials', e.target.value)} rows={2} /></div>
                </CardContent>
              </Card>
              <Button onClick={() => setCurrentTab('cities')} className="w-full">Próximo Passo: Cidades <MapPin className="ml-2 w-4 h-4" /></Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="cities">
          <CitySelector selectedCities={selectedCities} onCitiesChange={setSelectedCities} />
          <div className="mt-4 flex justify-between">
             <Button variant="outline" onClick={() => setCurrentTab('config')}>Voltar</Button>
             <Button onClick={() => setCurrentTab('social')}>Próximo Passo: Redes <Share2 className="ml-2 w-4 h-4" /></Button>
          </div>
        </TabsContent>

        <TabsContent value="social" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Globe className="w-5 h-5 text-primary" /> Redes Sociais</CardTitle>
              <CardDescription>Links inseridos como CTAs nos artigos</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="flex items-center gap-2"><Instagram className="w-5 h-5 text-pink-500" /><Input placeholder="@candidato" value={config.socialMedia.instagram} onChange={e => updateSocial('instagram', e.target.value)} /></div>
                <div className="flex items-center gap-2"><Youtube className="w-5 h-5 text-red-500" /><Input placeholder="youtube.com/c/candidato" value={config.socialMedia.youtube} onChange={e => updateSocial('youtube', e.target.value)} /></div>
                <div className="flex items-center gap-2"><Twitter className="w-5 h-5 text-sky-500" /><Input placeholder="@candidato" value={config.socialMedia.twitter} onChange={e => updateSocial('twitter', e.target.value)} /></div>
                <div className="flex items-center gap-2"><Smartphone className="w-5 h-5 text-foreground" /><Input placeholder="tiktok.com/@candidato" value={config.socialMedia.tiktok} onChange={e => updateSocial('tiktok', e.target.value)} /></div>
                <div className="flex items-center gap-2"><Globe className="w-5 h-5 text-primary" /><Input placeholder="www.candidato.com.br" value={config.socialMedia.website} onChange={e => updateSocial('website', e.target.value)} /></div>
                <div className="flex items-center gap-2"><Smartphone className="w-5 h-5 text-green-500" /><Input placeholder="(11) 99999-9999" value={config.socialMedia.whatsapp} onChange={e => updateSocial('whatsapp', e.target.value)} /></div>
              </div>
            </CardContent>
          </Card>
          <div className="flex justify-between">
             <Button variant="outline" onClick={() => setCurrentTab('cities')}>Voltar</Button>
             <Button onClick={() => setCurrentTab('suggestions')}>Próximo Passo: Sugestões <Sparkles className="ml-2 w-4 h-4" /></Button>
          </div>
        </TabsContent>

        <TabsContent value="suggestions">
          <AISuggestionsPanel 
            candidateRole={config.candidateRole}
            candidateName={config.candidateName}
            city={config.city || selectedCities[0] || 'São Paulo'}
            onSelectKeyword={(kw) => setKeyword(kw)}
            onSelectTopics={setSelectedTopics}
            selectedTopics={selectedTopics} 
          />
          <div className="mt-4 flex justify-between">
             <Button variant="outline" onClick={() => setCurrentTab('social')}>Voltar</Button>
             <Button onClick={() => setCurrentTab('content')}>Próximo Passo: Conteúdo <FileText className="ml-2 w-4 h-4" /></Button>
          </div>
        </TabsContent>

        <TabsContent value="content" className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
             <div className="md:col-span-2 space-y-4">
                <Card>
                  <CardHeader><CardTitle className="text-base">Configuração de Artigo</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label>Tipo de Artigo & Extensão</Label>
                      <Select value={config.articleType} onValueChange={v => updateConfig('articleType', v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pillar">Pilar de Autoridade (1500-2200 palavras)</SelectItem>
                          <SelectItem value="satellite">Satélite de Pauta (900-1400 palavras)</SelectItem>
                          <SelectItem value="territorial">Segmentado Territorial (~900 palavras)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Palavra-chave Principal *</Label>
                      <Input 
                        placeholder="Ex: CNH aos 16 anos em São Paulo" 
                        value={keyword} 
                        onChange={e => setKeyword(e.target.value)} 
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                       <input 
                         type="checkbox" 
                         id="indexnow" 
                         checked={config.notifyIndexNow} 
                         onChange={e => updateConfig('notifyIndexNow', e.target.checked)}
                         className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                       />
                       <Label htmlFor="indexnow" className="text-sm">Notificar IndexNow após publicação (Bing/ChatGPT)</Label>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-2 gap-3">
                  {contentTemplates.map(t => (
                    <Card 
                      key={t.id} 
                      className={`cursor-pointer border-2 transition-all ${selectedTemplate === t.id ? 'border-primary bg-primary/5' : 'hover:border-primary/50'}`}
                      onClick={() => setSelectedTemplate(t.id)}
                    >
                      <CardContent className="p-4 flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-background border"><t.icon className="w-5 h-5" style={{ color: t.color }} /></div>
                        <div>
                          <div className="text-sm font-bold">{t.title}</div>
                          <div className="text-[10px] text-muted-foreground leading-tight">{t.description}</div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
             </div>

             <Card className="h-fit">
                <CardHeader><CardTitle className="text-base">Geração</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {isGenerating ? (
                    <div className="space-y-2">
                       <Progress value={progress} />
                       <p className="text-xs text-center text-muted-foreground">O motor de conformidade está validando o conteúdo...</p>
                    </div>
                  ) : (
                    <Button 
                      className="w-full h-12 bg-primary text-white font-bold"
                      onClick={handleGenerate}
                      disabled={!keyword || !config.candidateName}
                    >
                      GERAR AGORA <Send className="ml-2 w-4 h-4" />
                    </Button>
                  )}
                  <div className="text-[10px] text-muted-foreground p-2 border rounded bg-muted/50">
                    <strong>Regras de Conformidade:</strong> Muralha ADV/MAD ativa. Proibido citar concorrentes. Regra Ouro AEO ativa (30 palavras no frontloading).
                  </div>
                </CardContent>
             </Card>
          </div>
        </TabsContent>

        <TabsContent value="preview">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2"><Flame className="w-5 h-5 text-orange-500" /> Conteúdo Final para Revisão</CardTitle>
                {generatedContent && <Badge variant="default">{generatedContent.split(/\s+/).length} palavras</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              {generatedContent ? (
                <div className="space-y-4">
                  <div className="p-4 bg-muted rounded-md text-xs border-l-4 border-orange-500">
                    <strong>Aviso:</strong> Este conteúdo foi gerado com auxílio de IA e segue as diretrizes eleitorais de 2026. Revise antes de publicar no WordPress.
                  </div>
                  <div className="prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: generatedContent }} />
                </div>
              ) : (
                <div className="text-center py-16 text-muted-foreground">
                  <Vote className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>Nenhum conteúdo gerado ainda.</p>
                  <Button variant="link" onClick={() => setCurrentTab('content')}>Ir para aba de geração</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}