import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Sparkles, ArrowRight, Loader2, CheckCircle2, FileText, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useProjects } from '@/hooks/useProjects';
import { useAuthorityPlanGeneration } from '@/hooks/useAuthorityPlanGeneration';
import { ThemeCard, WordPressCard, PublicationModeCard, LocaleCard } from '@/components/authority-planner';

const formSchema = z.object({
  centralTheme: z.string().min(3, 'O tema central deve ter pelo menos 3 caracteres'),
  satelliteCount: z.number().min(1).max(10),
  projectId: z.string().min(1, 'Selecione um site WordPress'),
  category: z.string().optional(),
  author: z.string().optional(),
  publicationMode: z.enum(['draft', 'pending', 'publish', 'scheduled']),
  language: z.string(),
  country: z.string(),
});

type FormData = z.infer<typeof formSchema>;

export default function AuthorityPlanner() {
  const navigate = useNavigate();
  const { projects, isLoading: projectsLoading } = useProjects();
  const { generatePlan, isGenerating, progress, generatedPlan } = useAuthorityPlanGeneration();

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
    },
  });

  const satelliteCount = form.watch('satelliteCount');

  const onSubmit = async (data: FormData) => {
    const result = await generatePlan({
      centralTheme: data.centralTheme,
      satelliteCount: data.satelliteCount,
      projectId: data.projectId,
      language: data.language,
      country: data.country,
      publicationMode: data.publicationMode,
    });

    if (result?.success) {
      // Stay on page to show results
    }
  };

  // Show results if plan was generated
  if (generatedPlan?.success) {
    return (
      <div className="container max-w-3xl py-8 space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <CheckCircle2 className="w-6 h-6 text-green-500" />
            Plano de Autoridade Gerado!
          </h1>
          <p className="text-muted-foreground">
            {generatedPlan.totalArticles} artigos foram criados com sucesso
          </p>
        </div>

        {/* Pillar Article */}
        <Card className="border-primary/50 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <span className="px-2 py-1 text-xs font-bold bg-primary text-primary-foreground rounded">PILAR</span>
              Artigo Principal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-4">
              {generatedPlan.pillar.featured_image_url && (
                <img 
                  src={generatedPlan.pillar.featured_image_url} 
                  alt={generatedPlan.pillar.title || 'Imagem do artigo'}
                  className="w-24 h-16 object-cover rounded-lg"
                />
              )}
              <div className="flex-1">
                <h3 className="font-semibold">{generatedPlan.pillar.title}</h3>
                <p className="text-sm text-muted-foreground">Keyword: {generatedPlan.pillar.keyword}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Satellite Articles */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="w-5 h-5" />
              Artigos Satélites ({generatedPlan.satellites.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {generatedPlan.satellites.map((article, index) => (
                <div key={article.id} className="flex items-start gap-4 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                  {article.featured_image_url ? (
                    <img 
                      src={article.featured_image_url} 
                      alt={article.title || 'Imagem do artigo'}
                      className="w-16 h-12 object-cover rounded"
                    />
                  ) : (
                    <div className="w-16 h-12 bg-muted rounded flex items-center justify-center">
                      <Image className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground mb-1">Satélite {index + 1}</p>
                    <h4 className="font-medium text-sm truncate">{article.title}</h4>
                    <p className="text-xs text-muted-foreground">Keyword: {article.keyword}</p>
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
          <Button onClick={() => window.location.reload()}>
            Criar Novo Plano
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-3xl py-8 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">Novo Plano de Autoridade</h1>
        <p className="text-muted-foreground">
          Defina o tema central e configurações do plano
        </p>
      </div>

      {/* Generation Progress */}
      {isGenerating && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="font-medium">Gerando Plano de Autoridade...</span>
            </div>
            <Progress value={undefined} className="h-2" />
            <p className="text-sm text-muted-foreground">{progress}</p>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>✅ Pesquisando tema e palavras-chave</p>
              <p>✅ Planejando estrutura do pilar</p>
              <p>✅ Definindo artigos satélites</p>
              <p>⏳ Gerando conteúdo com IA</p>
              <p>⏳ Criando imagens</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <ThemeCard form={form} satelliteCount={satelliteCount} />
          <WordPressCard form={form} projects={projects} projectsLoading={projectsLoading} />
          <PublicationModeCard form={form} />
          <LocaleCard form={form} />

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
    </div>
  );
}
