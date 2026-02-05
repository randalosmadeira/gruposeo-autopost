import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { UseFormReturn } from 'react-hook-form';
import { useMemo } from 'react';

interface Project {
  id: string;
  name: string;
  wordpress_url?: string | null;
  wordpress_username?: string | null;
  wordpress_app_password?: string | null;
  is_connected?: boolean;
}

interface WordPressCardProps {
  form: UseFormReturn<any>;
  projects: Project[] | undefined;
  projectsLoading: boolean;
}

export function WordPressCard({ form, projects, projectsLoading }: WordPressCardProps) {
  const selectedProjectId = form.watch('projectId');
  
  const selectedProject = useMemo(() => {
    if (!selectedProjectId || !projects) return null;
    return projects.find(p => p.id === selectedProjectId);
  }, [selectedProjectId, projects]);

  const hasCredentials = useMemo(() => {
    if (!selectedProject) return null;
    return !!(
      selectedProject.wordpress_url &&
      selectedProject.wordpress_username &&
      selectedProject.wordpress_app_password
    );
  }, [selectedProject]);

  return (
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
                    <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                      Carregando...
                    </div>
                  ) : projects && projects.length > 0 ? (
                    projects.map((project) => {
                      const isConfigured = !!(project.wordpress_url && project.wordpress_username && project.wordpress_app_password);
                      return (
                        <SelectItem key={project.id} value={project.id}>
                          <span className="flex items-center gap-2">
                            {project.name}
                            {isConfigured ? (
                              <CheckCircle2 className="w-3 h-3 text-primary" />
                            ) : (
                              <AlertTriangle className="w-3 h-3 text-amber-500" />
                            )}
                          </span>
                        </SelectItem>
                      );
                    })
                  ) : (
                    <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                      Nenhum projeto encontrado
                    </div>
                  )}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Credential Status Alert */}
        {selectedProject && hasCredentials === false && (
          <Alert variant="destructive" className="border-amber-500/50 bg-amber-500/10">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <AlertDescription className="text-amber-600 dark:text-amber-400">
              O projeto <strong>{selectedProject.name}</strong> não tem credenciais WordPress configuradas. 
              Configure URL, usuário e senha de aplicativo em{' '}
              <a href="/projects" className="underline font-medium hover:text-amber-700">
                Configurações do Projeto
              </a>{' '}
              para publicar artigos.
            </AlertDescription>
          </Alert>
        )}

        {selectedProject && hasCredentials === true && (
          <Alert className="border-primary/30 bg-primary/5">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <AlertDescription className="text-primary">
              Credenciais WordPress configuradas para <strong>{selectedProject.name}</strong>
            </AlertDescription>
          </Alert>
        )}

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
  );
}
