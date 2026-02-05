import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { 
  FileText, 
  Clock, 
  Send, 
  Calendar,
  Globe,
  MapPin,
  Sparkles,
  ArrowRight,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useProjects } from '@/hooks/useProjects';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

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

type PublicationMode = 'draft' | 'pending' | 'publish' | 'scheduled';

const publicationModes: { value: PublicationMode; label: string; icon: React.ElementType }[] = [
  { value: 'draft', label: 'Rascunho', icon: FileText },
  { value: 'pending', label: 'Pendente', icon: Clock },
  { value: 'publish', label: 'Publicar', icon: Send },
  { value: 'scheduled', label: 'Agendador', icon: Calendar },
];

const languages = [
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'pt-PT', label: 'Português (Portugal)' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'es-ES', label: 'Español' },
];

const countries = [
  { value: 'BR', label: 'Brasil' },
  { value: 'PT', label: 'Portugal' },
  { value: 'US', label: 'Estados Unidos' },
  { value: 'GB', label: 'Reino Unido' },
  { value: 'ES', label: 'Espanha' },
];

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
  const selectedMode = form.watch('publicationMode');

  const onSubmit = async (data: FormData) => {
    setIsGenerating(true);
    
    try {
      // TODO: Implement authority plan generation via AI
      console.log('Generating authority plan:', data);
      
      toast({
        title: 'Plano criado!',
        description: `Plano de autoridade para "${data.centralTheme}" iniciado com ${data.satelliteCount} artigos satélites.`,
      });

      // Navigate to articles list or a new authority plans page
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
          {/* Central Theme Card */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <FormField
                control={form.control}
                name="centralTheme"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tema Central *</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Ex: Marketing Digital para Iniciantes" 
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      A IA irá gerar 1 artigo pilar + {satelliteCount} artigos satélites sobre este tema
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="satelliteCount"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel className="flex items-center gap-2">
                        <span className="text-primary">⊞</span>
                        Quantidade de Artigos Satélites
                      </FormLabel>
                      <span className="text-primary font-semibold">{field.value}</span>
                    </div>
                    <FormControl>
                      <div className="space-y-2">
                        <Slider
                          value={[field.value]}
                          onValueChange={(value) => field.onChange(value[0])}
                          min={1}
                          max={10}
                          step={1}
                          className="py-2"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Limitado pelo seu plano atual (10 satélites máx.)</span>
                          <span>Máx.: 10</span>
                        </div>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* WordPress Site Card */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <FormField
                control={form.control}
                name="projectId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Site WordPress *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um projeto..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {projectsLoading ? (
                          <SelectItem value="" disabled>Carregando...</SelectItem>
                        ) : projects && projects.length > 0 ? (
                          projects.map((project) => (
                            <SelectItem key={project.id} value={project.id}>
                              {project.name}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="" disabled>Nenhum projeto encontrado</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Categorias (Opcional)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="marketing">Marketing</SelectItem>
                          <SelectItem value="tecnologia">Tecnologia</SelectItem>
                          <SelectItem value="negocios">Negócios</SelectItem>
                          <SelectItem value="vendas">Vendas</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>Vazio = Categoria</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="author"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Autor</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="autorrecurso">Autorrecurso</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Publication Mode Card */}
          <Card>
            <CardContent className="pt-6">
              <FormField
                control={form.control}
                name="publicationMode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Modo de Publicação</FormLabel>
                    <FormControl>
                      <div className="grid grid-cols-4 gap-3 mt-2">
                        {publicationModes.map((mode) => {
                          const Icon = mode.icon;
                          const isSelected = field.value === mode.value;
                          
                          return (
                            <button
                              key={mode.value}
                              type="button"
                              onClick={() => field.onChange(mode.value)}
                              className={cn(
                                'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all',
                                'hover:border-primary/50 hover:bg-accent/50',
                                isSelected 
                                  ? 'border-primary bg-primary/5 text-primary' 
                                  : 'border-border text-muted-foreground'
                              )}
                            >
                              <Icon className="w-5 h-5" />
                              <span className="text-sm font-medium">{mode.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Language & Country Card */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="language"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Globe className="w-4 h-4" />
                        Idioma
                      </FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {languages.map((lang) => (
                            <SelectItem key={lang.value} value={lang.value}>
                              {lang.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        País
                      </FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {countries.map((country) => (
                            <SelectItem key={country.value} value={country.value}>
                              {country.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

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
