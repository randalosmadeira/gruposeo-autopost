import { useState } from 'react';
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
import { CompetitorAnalysis } from '@/components/electoral/CompetitorAnalysis';
import {
  Vote, Megaphone, Flag, Scale, Globe, Instagram, Youtube, Twitter, Facebook,
  Smartphone, BookOpen, Flame, Send, Loader2, FileText, Share2, Users, MapPin,
  Shield, Sparkles, Target,
} from 'lucide-react';

interface CandidateConfig {
  candidateName: string;
  politicalParty: string;
  candidateRole: string;
  campaignPhase: 'pre-campanha' | 'campanha';
  city: string;
  state: string;
  slogan: string;
  biography: string;
  flagsAndCauses: string;
  legislativeProjects: string;
  achievements: string;
  competitors: string;
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
  brandStyle: 'madeira-neles' | 'madeira-sem-verniz' | 'both';
  contentTone: 'coloquial' | 'popular-direto' | 'combativo';
}

const defaultConfig: CandidateConfig = {
  candidateName: '',
  politicalParty: '',
  candidateRole: 'deputado-federal',
  campaignPhase: 'pre-campanha',
  city: '',
  state: 'SP',
  slogan: '',
  biography: '',
  flagsAndCauses: '',
  legislativeProjects: '',
  achievements: '',
  competitors: '',
  differentials: '',
  socialMedia: { instagram: '', youtube: '', twitter: '', facebook: '', tiktok: '', website: '', whatsapp: '' },
  brandStyle: 'both',
  contentTone: 'coloquial',
};

const contentTemplates = [
  { id: 'authority-article', title: 'Artigo de Autoridade', description: 'Artigo 2800+ palavras com projetos de lei, bandeiras e histórico', icon: BookOpen, color: 'hsl(var(--primary))' },
  { id: 'social-viral', title: 'Conteúdo Viral Social', description: 'Pacote para redes sociais com hooks, copy e roteiros', icon: Share2, color: 'hsl(var(--accent))' },
  { id: 'legislative-project', title: 'Projeto de Lei', description: 'Destaque de projeto legislativo com análise de impacto', icon: Scale, color: 'hsl(var(--primary))' },
  { id: 'community-agenda', title: 'Pauta Comunitária', description: 'Artigo sobre demandas locais e propostas concretas', icon: Users, color: 'hsl(var(--accent))' },
  { id: 'debate-position', title: 'Posicionamento & Debate', description: 'Artigo opinativo com posicionamento firme', icon: Megaphone, color: 'hsl(var(--primary))' },
  { id: 'track-record', title: 'Histórico & Realizações', description: 'Retrospectiva de atuação com dados e provas sociais', icon: Shield, color: 'hsl(var(--accent))' },
  { id: 'city-targeted', title: 'Artigo por Cidade', description: 'Conteúdo segmentado para cidades específicas de SP', icon: MapPin, color: 'hsl(var(--primary))' },
  { id: 'competitor-comparison', title: 'Comparativo Eleitoral', description: 'Quem são os candidatos, em quem votar em 2026', icon: Target, color: 'hsl(var(--accent))' },
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

      // Build enhanced config with cities, topics, competitors
      const enhancedConfig = {
        ...config,
        targetCities: selectedCities,
        campaignTopics: selectedTopics,
        city: selectedCities.length === 1 ? selectedCities[0] : config.city,
      };

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-electoral-content`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ keyword, template: selectedTemplate, config: enhancedConfig, projectId: selectedProjectId || undefined }),
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
            if (delta) { fullContent += delta; setGeneratedContent(fullContent); setProgress(Math.min((fullContent.split(/\s+/).length / 2800) * 100, 95)); }
          } catch { /* partial */ }
        }
      }

      setGeneratedContent(fullContent);
      setProgress(100);

      if (user) {
        await supabase.from('articles').insert([{
          user_id: user.id, keyword,
          title: `${config.candidateName} - ${keyword}`,
          content: fullContent, type: 'blog' as const, status: 'draft' as const,
          project_id: selectedProjectId || null,
          word_count: fullContent.split(/\s+/).length,
          config: { electoral: true, template: selectedTemplate, candidateConfig: enhancedConfig, targetCities: selectedCities, campaignTopics: selectedTopics } as any,
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
          <p className="text-muted-foreground">Gerador de artigos estratégicos segmentados por cidade — Estado de São Paulo</p>
        </div>
      </div>

      <Tabs defaultValue="config" className="space-y-4">
        <TabsList className="grid grid-cols-6 w-full max-w-4xl">
          <TabsTrigger value="config"><Users className="w-4 h-4 mr-1" /> Candidato</TabsTrigger>
          <TabsTrigger value="cities"><MapPin className="w-4 h-4 mr-1" /> Cidades</TabsTrigger>
          <TabsTrigger value="social"><Share2 className="w-4 h-4 mr-1" /> Redes</TabsTrigger>
          <TabsTrigger value="suggestions"><Sparkles className="w-4 h-4 mr-1" /> Sugestões IA</TabsTrigger>
          <TabsTrigger value="content"><FileText className="w-4 h-4 mr-1" /> Conteúdo</TabsTrigger>
          <TabsTrigger value="preview"><Flame className="w-4 h-4 mr-1" /> Preview</TabsTrigger>
        </TabsList>

        {/* TAB: Candidato */}
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
                      <SelectItem value="vereador">Vereador(a)</SelectItem>
                      <SelectItem value="prefeito">Prefeito(a)</SelectItem>
                      <SelectItem value="deputado-estadual">Deputado(a) Estadual</SelectItem>
                      <SelectItem value="deputado-federal">Deputado(a) Federal</SelectItem>
                      <SelectItem value="senador">Senador(a)</SelectItem>
                      <SelectItem value="governador">Governador(a)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Fase da Campanha</Label>
                  <Select value={config.campaignPhase} onValueChange={v => updateConfig('campaignPhase', v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pre-campanha">Pré-Campanha (NÃO pedir votos)</SelectItem>
                      <SelectItem value="campanha">Campanha Oficial (pode pedir votos)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Cidade Base</Label><Input placeholder="São Paulo" value={config.city} onChange={e => updateConfig('city', e.target.value)} /></div>
                  <div><Label>Estado</Label><Input value={config.state} onChange={e => updateConfig('state', e.target.value)} /></div>
                </div>
                <div><Label>Slogan</Label><Input placeholder="Madeira Neles! Sem verniz, com atitude!" value={config.slogan} onChange={e => updateConfig('slogan', e.target.value)} /></div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Flag className="w-5 h-5 text-orange-500" /> Bandeiras & Projetos</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div><Label>Biografia</Label><Textarea placeholder="Trajetória política, formação..." value={config.biography} onChange={e => updateConfig('biography', e.target.value)} rows={3} /></div>
                  <div><Label>Bandeiras & Pautas</Label><Textarea placeholder="Segurança, saúde, educação..." value={config.flagsAndCauses} onChange={e => updateConfig('flagsAndCauses', e.target.value)} rows={3} /></div>
                  <div><Label>Projetos de Lei</Label><Textarea placeholder="Projetos legislativos..." value={config.legislativeProjects} onChange={e => updateConfig('legislativeProjects', e.target.value)} rows={2} /></div>
                  <div><Label>Realizações</Label><Textarea placeholder="Obras, leis aprovadas..." value={config.achievements} onChange={e => updateConfig('achievements', e.target.value)} rows={2} /></div>
                </CardContent>
              </Card>

              <CompetitorAnalysis
                competitors={config.competitors}
                differentials={config.differentials}
                onCompetitorsChange={v => updateConfig('competitors', v)}
                onDifferentialsChange={v => updateConfig('differentials', v)}
              />
            </div>
          </div>
        </TabsContent>

        {/* TAB: Cidades SP */}
        <TabsContent value="cities">
          <CitySelector selectedCities={selectedCities} onCitiesChange={setSelectedCities} />
          {selectedCities.length > 0 && (
            <Card className="mt-4">
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">
                  <strong>{selectedCities.length}</strong> cidade(s) selecionada(s). Os artigos serão gerados com segmentação geográfica para cada cidade, usando termos como
                  <Badge variant="outline" className="ml-1 text-xs">"candidato deputado federal {selectedCities[0]} 2026"</Badge>
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* TAB: Redes Sociais */}
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
                <div className="flex items-center gap-2"><Facebook className="w-5 h-5 text-blue-600" /><Input placeholder="facebook.com/candidato" value={config.socialMedia.facebook} onChange={e => updateSocial('facebook', e.target.value)} /></div>
                <div className="flex items-center gap-2"><Smartphone className="w-5 h-5 text-foreground" /><Input placeholder="tiktok.com/@candidato" value={config.socialMedia.tiktok} onChange={e => updateSocial('tiktok', e.target.value)} /></div>
                <div className="flex items-center gap-2"><Globe className="w-5 h-5 text-primary" /><Input placeholder="www.candidato.com.br" value={config.socialMedia.website} onChange={e => updateSocial('website', e.target.value)} /></div>
                <div className="flex items-center gap-2"><Smartphone className="w-5 h-5 text-green-500" /><Input placeholder="(11) 99999-9999" value={config.socialMedia.whatsapp} onChange={e => updateSocial('whatsapp', e.target.value)} /></div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Flame className="w-5 h-5 text-orange-500" /> Estilo de Marca</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Versão da Marca</Label>
                <Select value={config.brandStyle} onValueChange={v => updateConfig('brandStyle', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="madeira-neles">🪵🔥 MADEIRA NELES</SelectItem>
                    <SelectItem value="madeira-sem-verniz">🎯 MADEIRA SEM VERNIZ</SelectItem>
                    <SelectItem value="both">🔥🎯 Ambos (Híbrido)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tom do Conteúdo</Label>
                <Select value={config.contentTone} onValueChange={v => updateConfig('contentTone', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="coloquial">Coloquial</SelectItem>
                    <SelectItem value="popular-direto">Popular e Direto</SelectItem>
                    <SelectItem value="combativo">Combativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Projeto WordPress</Label>
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar projeto..." /></SelectTrigger>
                  <SelectContent>{projects?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: Sugestões IA */}
        <TabsContent value="suggestions">
          <AISuggestionsPanel
            candidateRole={config.candidateRole}
            candidateName={config.candidateName}
            city={config.city || (selectedCities.length > 0 ? selectedCities[0] : '')}
            onSelectKeyword={setKeyword}
            onSelectTopics={setSelectedTopics}
            selectedTopics={selectedTopics}
          />
        </TabsContent>

        {/* TAB: Conteúdo */}
        <TabsContent value="content" className="space-y-4">
          <div className="grid md:grid-cols-4 gap-3">
            {contentTemplates.map(tpl => (
              <Card
                key={tpl.id}
                className={`cursor-pointer transition-all hover:shadow-md ${selectedTemplate === tpl.id ? 'ring-2 ring-primary shadow-md' : ''}`}
                onClick={() => setSelectedTemplate(tpl.id)}
              >
                <CardContent className="pt-5 text-center space-y-2">
                  <div className="mx-auto w-10 h-10 rounded-lg flex items-center justify-center bg-primary/10">
                    <tpl.icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-xs">{tpl.title}</h3>
                  <p className="text-[10px] text-muted-foreground">{tpl.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <Label className="text-base font-semibold">Palavra-chave / Tema *</Label>
                <Input
                  placeholder="Ex: candidato deputado federal São Paulo 2026, em quem votar eleições 2026..."
                  value={keyword}
                  onChange={e => setKeyword(e.target.value)}
                  className="mt-2"
                />
                {selectedTopics.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    <span className="text-xs text-muted-foreground">Pautas:</span>
                    {selectedTopics.map(t => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}
                  </div>
                )}
                {selectedCities.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">📍 Segmentação: {selectedCities.length} cidade(s) de SP</p>
                )}
              </div>

              {isGenerating && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Gerando artigo eleitoral...</span>
                    <span className="text-primary font-medium">{Math.round(progress)}%</span>
                  </div>
                  <Progress value={progress} />
                </div>
              )}

              <Button
                onClick={handleGenerate}
                disabled={isGenerating || !keyword.trim() || !config.candidateName.trim()}
                className="w-full bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white"
                size="lg"
              >
                {isGenerating ? (
                  <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Gerando Conteúdo Eleitoral...</>
                ) : (
                  <><Send className="w-5 h-5 mr-2" /> Gerar Artigo Eleitoral (2800+ palavras)</>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: Preview */}
        <TabsContent value="preview">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2"><FileText className="w-5 h-5 text-primary" /> Conteúdo Gerado</CardTitle>
                {generatedContent && <Badge variant="outline">{generatedContent.split(/\s+/).length} palavras</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              {generatedContent ? (
                <div className="prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: generatedContent }} />
              ) : (
                <div className="text-center py-16 text-muted-foreground">
                  <Vote className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>Nenhum conteúdo gerado ainda.</p>
                  <p className="text-sm">Configure o candidato e gere na aba "Conteúdo".</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
