import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { useProjects } from '@/hooks/useProjects';
import { useToast } from '@/hooks/use-toast';
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
  const { toast } = useToast();
  const { projects, isLoading: projectsLoading } = useProjects();
  const [isGenerating, setIsGenerating] = useState(false);

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
    setIsGenerating(true);
    
    try {
      // TODO: Implement authority plan generation via AI
      console.log('Generating authority plan:', data);
      
      toast({
        title: 'Plano criado!',
        description: `Plano de autoridade para "${data.centralTheme}" iniciado com ${data.satelliteCount} artigos satélites.`,
      });

      navigate('/articles');
    } catch (error) {
      toast({
        title: 'Erro ao criar plano',
        description: 'Tente novamente em alguns instantes.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="container max-w-3xl py-8 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">Novo Plano de Autoridade</h1>
        <p className="text-muted-foreground">
          Defina o tema central e configurações do plano
        </p>
      </div>

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
