import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { 
  Sparkles, 
  ArrowRight, 
  Loader2, 
  CheckCircle2, 
  FileText, 
  Image as ImageIcon,
  X,
  Edit3,
  Upload
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProjects } from '@/hooks/useProjects';
import { useAuthorityPlanGeneration } from '@/hooks/useAuthorityPlanGeneration';
import { useWordPressPublish } from '@/hooks/useWordPressPublish';
import { 
  ThemeCard, 
  WordPressCard, 
  PublicationModeCard, 
  LocaleCard,
  GenerationHistory,
  SchedulingCard,
  ClusterVisualization
} from '@/components/authority-planner';
import { InternalLinkingCard } from '@/components/internal-linking';
import { ArticleEditor } from '@/components/articles/ArticleEditor';

const formSchema = z.object({
  centralTheme: z.string().min(3, 'O tema central deve ter pelo menos 3 caracteres'),
  satelliteCount: z.number().min(1).max(10),
  projectId: z.string().min(1, 'Selecione um site WordPress'),
  category: z.string().optional(),
  author: z.string().optional(),
  publicationMode: z.enum(['draft', 'pending', 'publish', 'scheduled']),
  language: z.string(),
  country: z.string(),
  scheduledTimes: z.array(z.string()).optional(),
});

type FormData = z.infer<typeof formSchema>;

interface Article {
  id: string;
  title: string | null;
  keyword: string;
  content: string | null;
  excerpt: string | null;
  slug: string | null;
  featured_image_url: string | null;
  status: string;
  word_count: number | null;
  project_id: string | null;
  config?: {
    type?: 'pillar' | 'satellite';
    pillarId?: string;
    theme?: string;
  } | null;
}

export default function AuthorityPlanner() {
  const navigate = useNavigate();
  const { projects, isLoading: projectsLoading } = useProjects();
  const { 
    generatePlan, 
    cancel,
    reset,
    isGenerating, 
    progress, 
    pillarPlan,
    satellitePlans,
    generatedArticles,
    generatedPlan,
    logs 
  } = useAuthorityPlanGeneration();
  const { publishArticle, isPublishing } = useWordPressPublish();
  
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [activeTab, setActiveTab] = useState('new');

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      centralTheme: '',
      satelliteCount: 5,
      projectId: '',
      category: '',
      author: '',
      publicationMode: 'draft',
      language: 'pt-BR',
      country: 'BR',
      scheduledTimes: [],
    },
  });

  const satelliteCount = form.watch('satelliteCount');
  const publicationMode = form.watch('publicationMode');

  const onSubmit = async (data: FormData) => {
    setSelectedProjectId(data.projectId);
    await generatePlan({
      centralTheme: data.centralTheme,
      satelliteCount: data.satelliteCount,
      projectId: data.projectId,
      language: data.language,
      country: data.country,
      publicationMode: data.publicationMode,
    });
  };

  const handlePublish = async (article: Article) => {
    if (selectedProjectId) {
      await publishArticle({ ...article, project_id: selectedProjectId });
    }
  };

  // Show editor if editing an article
  if (editingArticle) {
    return (
      <div className="container max-w-4xl py-8 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Editando Artigo</h1>
          <Button variant="outline" onClick={() => setEditingArticle(null)}>
            <X className="w-4 h-4 mr-2" />
            Fechar Editor
          </Button>
        </div>
        <ArticleEditor 
          article={editingArticle}
          onSave={(updated) => setEditingArticle(updated as Article)}
          onPublish={handlePublish}
          isPublishing={isPublishing}
        />
      </div>
    );
  }

  // Show results if plan was generated
  if (generatedPlan?.success) {
    const pillarArticle: Article = {
      id: generatedPlan.pillar.id,
      title: generatedPlan.pillar.title,
      keyword: generatedPlan.pillar.keyword,
      slug: null,
      status: generatedPlan.pillar.status || 'draft',
      featured_image_url: generatedPlan.pillar.featured_image_url,
      word_count: null,
      content: null,
      excerpt: null,
      project_id: selectedProjectId,
      config: { type: 'pillar' as const },
    };

    const satelliteArticles: Article[] = generatedPlan.satellites.map((s) => ({
      id: s.id,
      title: s.title,
      keyword: s.keyword,
      slug: null,
      status: s.status || 'draft',
      featured_image_url: s.featured_image_url,
      word_count: null,
      content: null,
      excerpt: null,
      project_id: selectedProjectId,
      config: { type: 'satellite' as const, pillarId: generatedPlan.pillar.id },
    }));

    return (
      <div className="container max-w-5xl py-8 space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <CheckCircle2 className="w-6 h-6 text-primary" />
            Plano de Autoridade Gerado!
          </h1>
          <p className="text-muted-foreground">
            {generatedPlan.totalArticles} artigos foram criados com sucesso
          </p>
        </div>

        {/* Cluster Visualization */}
        <ClusterVisualization
          pillar={pillarArticle}
          satellites={satelliteArticles}
          onArticleClick={(article) => setEditingArticle(article as Article)}
        />

        {/* Quick Actions for Each Article */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="w-5 h-5" />
              Ações Rápidas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* Pillar */}
              <div className="flex items-center gap-4 p-3 rounded-lg border bg-primary/5 border-primary/30">
                <Badge className="bg-primary text-primary-foreground">PILAR</Badge>
                <span className="flex-1 font-medium truncate">{generatedPlan.pillar.title}</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditingArticle(pillarArticle)}>
                    <Edit3 className="w-4 h-4 mr-1" />
                    Editar
                  </Button>
                  <Button size="sm" onClick={() => handlePublish(pillarArticle)} disabled={isPublishing}>
                    <Upload className="w-4 h-4 mr-1" />
                    Publicar
                  </Button>
                </div>
              </div>

              {/* Satellites */}
              {generatedPlan.satellites.map((article, index) => (
                <div key={article.id} className="flex items-center gap-4 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                  <Badge variant="secondary">S{index + 1}</Badge>
                  <span className="flex-1 text-sm truncate">{article.title}</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditingArticle(satelliteArticles[index])}>
                      <Edit3 className="w-4 h-4" />
                    </Button>
                    <Button size="sm" onClick={() => handlePublish(satelliteArticles[index])} disabled={isPublishing}>
                      <Upload className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={() => navigate('/articles')}>
            Ver Todos os Artigos
          </Button>
          <Button onClick={reset}>
            Criar Novo Plano
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-5xl py-8 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">Planejador de Autoridade</h1>
        <p className="text-muted-foreground">
          Crie clusters de conteúdo para fortalecer sua autoridade temática
        </p>
      </div>

      {/* Tabs for New Plan / History */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="new">Novo Plano</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="space-y-4">
          <GenerationHistory />
        </TabsContent>

        <TabsContent value="new" className="space-y-6">
          {/* Generation Progress Panel */}
          {isGenerating && (
            <Card className="border-primary/50">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    Gerando Plano de Autoridade
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={cancel}>
                    <X className="w-4 h-4 mr-1" />
                    Cancelar
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Progress Bar */}
                {progress && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{progress.step}</span>
                      <span className="font-medium">{progress.percentage}%</span>
                    </div>
                    <Progress value={progress.percentage} className="h-2" />
                    <p className="text-xs text-muted-foreground">
                      Etapa {progress.current} de {progress.total}
                    </p>
                  </div>
                )}

                {/* Plans Preview */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Pillar Plan */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">Pilar</Badge>
                      Artigo Principal
                    </h4>
                    {pillarPlan ? (
                      <div className="p-3 rounded-lg bg-muted/50 text-sm">
                        <p className="font-medium truncate">{pillarPlan.title}</p>
                        <p className="text-xs text-muted-foreground">{pillarPlan.outline.length} seções</p>
                      </div>
                    ) : (
                      <div className="p-3 rounded-lg bg-muted/30 text-sm text-muted-foreground">
                        Aguardando...
                      </div>
                    )}
                    {generatedArticles.pillar && (
                      <div className="flex items-center gap-2 text-xs text-primary">
                        <CheckCircle2 className="w-3 h-3" />
                        Criado com sucesso
                      </div>
                    )}
                  </div>

                  {/* Satellite Plans */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">Satélites</Badge>
                      Artigos de Suporte
                    </h4>
                    <div className="space-y-1">
                      {satellitePlans.length > 0 ? (
                        satellitePlans.slice(0, 3).map((plan, i) => (
                          <div key={i} className="p-2 rounded bg-muted/50 text-xs flex items-center gap-2">
                            {generatedArticles.satellites.find(s => s.title === plan.title) ? (
                              <CheckCircle2 className="w-3 h-3 text-primary flex-shrink-0" />
                            ) : (
                              <div className="w-3 h-3 rounded-full border border-muted-foreground flex-shrink-0" />
                            )}
                            <span className="truncate">{plan.title}</span>
                          </div>
                        ))
                      ) : (
                        <div className="p-2 rounded bg-muted/30 text-xs text-muted-foreground">
                          Aguardando...
                        </div>
                      )}
                      {satellitePlans.length > 3 && (
                        <p className="text-xs text-muted-foreground pl-2">
                          +{satellitePlans.length - 3} mais...
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Live Logs */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Log de Execução</h4>
                  <ScrollArea className="h-32 rounded-lg border bg-muted/30 p-3">
                    <div className="space-y-1 font-mono text-xs">
                      {logs.map((log, i) => (
                        <p key={i} className="text-muted-foreground">{log}</p>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </CardContent>
            </Card>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <ThemeCard form={form} satelliteCount={satelliteCount} />
              <WordPressCard form={form} projects={projects} projectsLoading={projectsLoading} />
              <PublicationModeCard form={form} />
              <SchedulingCard form={form} isScheduleMode={publicationMode === 'scheduled'} />
              <LocaleCard form={form} />
              <InternalLinkingCard 
                projectId={form.watch('projectId')} 
                onProjectSelect={(id) => form.setValue('projectId', id)}
              />

              {/* Submit Button */}
              <div className="flex justify-end pt-4">
                <Button 
                  type="submit" 
                  size="lg"
                  disabled={isGenerating}
                  className="gap-2"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Gerando Plano...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Gerar Plano de Autoridade
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </TabsContent>
      </Tabs>
    </div>
  );
}
