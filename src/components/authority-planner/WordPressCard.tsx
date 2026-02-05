import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UseFormReturn } from 'react-hook-form';

interface Project {
  id: string;
  name: string;
}

interface WordPressCardProps {
  form: UseFormReturn<any>;
  projects: Project[] | undefined;
  projectsLoading: boolean;
}

export function WordPressCard({ form, projects, projectsLoading }: WordPressCardProps) {
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
                    projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))
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
