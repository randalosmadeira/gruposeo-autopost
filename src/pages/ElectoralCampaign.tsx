import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProjects } from '@/hooks/useProjects';
import {
  Vote,
  Megaphone,
  Flag,
  Scale,
  Globe,
  Instagram,
  Youtube,
  Twitter,
  Facebook,
  Smartphone,
  BookOpen,
  Flame,
  Send,
  Loader2,
  FileText,
  Share2,
  Users,
  MapPin,
  Shield,
} from 'lucide-react';

interface CandidateConfig {
  candidateName: string;
  politicalParty: string;
  candidateRole: string; // vereador, deputado, prefeito, etc
  campaignPhase: 'pre-campanha' | 'campanha';
  city: string;
  state: string;
  slogan: string;
  biography: string;
  flagsAndCauses: string;
  legislativeProjects: string;
  achievements: string;
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
  candidateRole: 'vereador',
  campaignPhase: 'pre-campanha',
  city: '',
  state: 'SP',
  slogan: '',
  biography: '',
  flagsAndCauses: '',
  legislativeProjects: '',
  achievements: '',
  socialMedia: {
    instagram: '',
    youtube: '',
    twitter: '',
    facebook: '',
    tiktok: '',
    website: '',
    whatsapp: '',
  },
  brandStyle: 'both',
  contentTone: 'coloquial',
};

const contentTemplates = [
  {
    id: 'authority-article',
    title: 'Artigo de Autoridade',
    description: 'Artigo completo 2800+ palavras com projetos de lei, bandeiras e histórico',
    icon: BookOpen,
    color: '#4169E1',
  },
  {
    id: 'social-viral',
    title: 'Conteúdo Viral Social',
    description: 'Pacote para redes sociais com hooks, copy e roteiros',
    icon: Share2,
    color: '#FF4500',
  },
  {
    id: 'legislative-project',
    title: 'Projeto de Lei',
    description: 'Destaque de projeto legislativo com análise de impacto',
    icon: Scale,
    color: '#10B981',
  },
  {
    id: 'community-agenda',
    title: 'Pauta Comunitária',
    description: 'Artigo sobre demandas locais e propostas concretas',
    icon: Users,
    color: '#8B5CF6',
  },
  {
    id: 'debate-position',
    title: 'Posicionamento & Debate',
    description: 'Artigo opinativo com posicionamento firme sobre temas relevantes',
    icon: Megaphone,
    color: '#F97316',
  },
  {
    id: 'track-record',
    title: 'Histórico & Realizações',
    description: 'Retrospectiva de atuação com dados e provas sociais',
    icon: Shield,
    color: '#06B6D4',
  },
];

export default function ElectoralCampaign() {
  const [config, setConfig] = useState<CandidateConfig>(defaultConfig);
  const [selectedTemplate, setSelectedTemplate] = useState('authority-article');
  const [keyword, setKeyword] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [generatedContent, setGeneratedContent] = useState('');
  const { toast } = useToast();
  const { user } = useAuth();
  const { projects } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState('');

  const updateConfig = (field: string, value: any) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const updateSocial = (field: string, value: string) => {
    setConfig(prev => ({
      ...prev,
      socialMedia: { ...prev.socialMedia, [field]: value },
    }));
  };

  const handleGenerate = async () => {
    if (!keyword.trim()) {
      toast({ title: 'Informe a palavra-chave', variant: 'destructive' });
      return;
    }
    if (!config.candidateName.trim()) {
      toast({ title: 'Informe o nome do candidato', variant: 'destructive' });
      return;
    }

    setIsGenerating(true);
    setProgress(0);
    setGeneratedContent('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({ title: 'Sessão expirada', description: 'Faça login novamente.', variant: 'destructive' });
        setIsGenerating(false);
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-electoral-content`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            keyword,
            template: selectedTemplate,
            config,
            projectId: selectedProjectId || undefined,
          }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
        throw new Error(err.error || 'Falha na geração');
      }

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
              setProgress(Math.min((fullContent.split(/\s+/).length / 2800) * 100, 95));
            }
          } catch { /* partial */ }
        }
      }

      setGeneratedContent(fullContent);
      setProgress(100);

      // Save article to DB
      if (user) {
        await supabase.from('articles').insert([{
          user_id: user.id,
          keyword,
          title: `${config.candidateName} - ${keyword}`,
          content: fullContent,
          type: 'blog' as const,
          status: 'draft' as const,
          project_id: selectedProjectId || null,
          word_count: fullContent.split(/\s+/).length,
          config: {
            electoral: true,
            template: selectedTemplate,
            candidateConfig: config,
          } as any,
        }]);
      }

      toast({ title: 'Conteúdo gerado! 🔥', description: 'Artigo eleitoral pronto para revisão.' });
    } catch (error) {
      console.error('Electoral generation error:', error);
      toast({
        title: 'Erro na geração',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="p-3 rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 shadow-lg">
          <Vote className="w-8 h-8 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            Campanha Eleitoral
            <Badge className="bg-orange-500 text-white text-xs">MADEIRA NELES 🪵🔥</Badge>
          </h1>
          <p className="text-muted-foreground">
            Gerador de artigos estratégicos para pré-campanha e campanha eleitoral
          </p>
        </div>
      </div>

      <Tabs defaultValue="config" className="space-y-4">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="config">
            <Users className="w-4 h-4 mr-1" /> Candidato
          </TabsTrigger>
          <TabsTrigger value="social">
            <Share2 className="w-4 h-4 mr-1" /> Redes
          </TabsTrigger>
          <TabsTrigger value="content">
            <FileText className="w-4 h-4 mr-1" /> Conteúdo
          </TabsTrigger>
          <TabsTrigger value="preview">
            <Flame className="w-4 h-4 mr-1" /> Preview
          </TabsTrigger>
        </TabsList>

        {/* TAB: Candidato */}
        <TabsContent value="config" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" />
                  Dados do Candidato
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Nome Completo *</Label>
                  <Input
                    placeholder="Ex: Dr. Rândalos Madeira"
                    value={config.candidateName}
                    onChange={e => updateConfig('candidateName', e.target.value)}
                  />
                </div>
                <div>
                  <Label>Partido Político</Label>
                  <Input
                    placeholder="Ex: PSD"
                    value={config.politicalParty}
                    onChange={e => updateConfig('politicalParty', e.target.value)}
                  />
                </div>
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
                  <Label>Fase</Label>
                  <Select value={config.campaignPhase} onValueChange={v => updateConfig('campaignPhase', v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pre-campanha">Pré-Campanha</SelectItem>
                      <SelectItem value="campanha">Campanha Oficial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Cidade</Label>
                    <Input
                      placeholder="São Paulo"
                      value={config.city}
                      onChange={e => updateConfig('city', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Estado</Label>
                    <Input
                      placeholder="SP"
                      value={config.state}
                      onChange={e => updateConfig('state', e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label>Slogan de Campanha</Label>
                  <Input
                    placeholder="Ex: Madeira Neles! Sem verniz, com atitude!"
                    value={config.slogan}
                    onChange={e => updateConfig('slogan', e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Flag className="w-5 h-5 text-orange-500" />
                  Bandeiras & Projetos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Biografia / Histórico</Label>
                  <Textarea
                    placeholder="Trajetória política, formação, atuação comunitária..."
                    value={config.biography}
                    onChange={e => updateConfig('biography', e.target.value)}
                    rows={3}
                  />
                </div>
                <div>
                  <Label>Bandeiras & Pautas Principais</Label>
                  <Textarea
                    placeholder="Segurança pública, saúde, educação, combate à corrupção..."
                    value={config.flagsAndCauses}
                    onChange={e => updateConfig('flagsAndCauses', e.target.value)}
                    rows={3}
                  />
                </div>
                <div>
                  <Label>Projetos de Lei / Propostas</Label>
                  <Textarea
                    placeholder="Descreva projetos legislativos apresentados ou propostas..."
                    value={config.legislativeProjects}
                    onChange={e => updateConfig('legislativeProjects', e.target.value)}
                    rows={3}
                  />
                </div>
                <div>
                  <Label>Realizações / Conquistas</Label>
                  <Textarea
                    placeholder="Obras entregues, leis aprovadas, benefícios à comunidade..."
                    value={config.achievements}
                    onChange={e => updateConfig('achievements', e.target.value)}
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB: Redes Sociais */}
        <TabsContent value="social" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="w-5 h-5 text-primary" />
                Redes Sociais do Candidato
              </CardTitle>
              <CardDescription>
                Links serão inseridos estrategicamente nos artigos para máxima indexação
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <Instagram className="w-5 h-5 text-pink-500" />
                  <Input
                    placeholder="@candidato"
                    value={config.socialMedia.instagram}
                    onChange={e => updateSocial('instagram', e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Youtube className="w-5 h-5 text-red-500" />
                  <Input
                    placeholder="youtube.com/c/candidato"
                    value={config.socialMedia.youtube}
                    onChange={e => updateSocial('youtube', e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Twitter className="w-5 h-5 text-sky-500" />
                  <Input
                    placeholder="@candidato"
                    value={config.socialMedia.twitter}
                    onChange={e => updateSocial('twitter', e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Facebook className="w-5 h-5 text-blue-600" />
                  <Input
                    placeholder="facebook.com/candidato"
                    value={config.socialMedia.facebook}
                    onChange={e => updateSocial('facebook', e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-foreground" />
                  <Input
                    placeholder="tiktok.com/@candidato"
                    value={config.socialMedia.tiktok}
                    onChange={e => updateSocial('tiktok', e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Globe className="w-5 h-5 text-primary" />
                  <Input
                    placeholder="www.candidato.com.br"
                    value={config.socialMedia.website}
                    onChange={e => updateSocial('website', e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-green-500" />
                  <Input
                    placeholder="(11) 99999-9999"
                    value={config.socialMedia.whatsapp}
                    onChange={e => updateSocial('whatsapp', e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Flame className="w-5 h-5 text-orange-500" />
                Estilo de Marca
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Versão da Marca</Label>
                <Select value={config.brandStyle} onValueChange={v => updateConfig('brandStyle', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="madeira-neles">🪵🔥 MADEIRA NELES (Atitude, Combativo)</SelectItem>
                    <SelectItem value="madeira-sem-verniz">🎯 MADEIRA SEM VERNIZ (Direto, Transparente)</SelectItem>
                    <SelectItem value="both">🔥🎯 Ambos (Híbrido)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tom do Conteúdo</Label>
                <Select value={config.contentTone} onValueChange={v => updateConfig('contentTone', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="coloquial">Coloquial (Acessível, Popular)</SelectItem>
                    <SelectItem value="popular-direto">Popular e Direto (Sem Papas na Língua)</SelectItem>
                    <SelectItem value="combativo">Combativo (Madeira Neles Total)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Projeto WordPress</Label>
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar projeto..." /></SelectTrigger>
                  <SelectContent>
                    {projects?.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: Conteúdo */}
        <TabsContent value="content" className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            {contentTemplates.map(tpl => (
              <Card
                key={tpl.id}
                className={`cursor-pointer transition-all hover:shadow-md ${
                  selectedTemplate === tpl.id ? 'ring-2 ring-primary shadow-md' : ''
                }`}
                onClick={() => setSelectedTemplate(tpl.id)}
              >
                <CardContent className="pt-6 text-center space-y-2">
                  <div
                    className="mx-auto w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${tpl.color}20` }}
                  >
                    <tpl.icon className="w-6 h-6" style={{ color: tpl.color }} />
                  </div>
                  <h3 className="font-semibold text-sm">{tpl.title}</h3>
                  <p className="text-xs text-muted-foreground">{tpl.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <Label className="text-base font-semibold">Palavra-chave / Tema Principal *</Label>
                <Input
                  placeholder="Ex: segurança pública zona leste SP, projetos de lei combate corrupção..."
                  value={keyword}
                  onChange={e => setKeyword(e.target.value)}
                  className="mt-2"
                />
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
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Gerando Conteúdo Eleitoral...
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5 mr-2" />
                    Gerar Artigo Eleitoral (2800+ palavras)
                  </>
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
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  Conteúdo Gerado
                </CardTitle>
                {generatedContent && (
                  <Badge variant="outline">
                    {generatedContent.split(/\s+/).length} palavras
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {generatedContent ? (
                <div
                  className="prose prose-sm max-w-none dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: generatedContent }}
                />
              ) : (
                <div className="text-center py-16 text-muted-foreground">
                  <Vote className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>Nenhum conteúdo gerado ainda.</p>
                  <p className="text-sm">Configure o candidato e gere o artigo na aba "Conteúdo".</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
