import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, Clock, Send, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UseFormReturn } from 'react-hook-form';

type PublicationMode = 'draft' | 'pending' | 'publish' | 'scheduled';

const publicationModes: { value: PublicationMode; label: string; icon: React.ElementType }[] = [
  { value: 'draft', label: 'Rascunho', icon: FileText },
  { value: 'pending', label: 'Pendente', icon: Clock },
  { value: 'publish', label: 'Publicar', icon: Send },
  { value: 'scheduled', label: 'Agendador', icon: Calendar },
];

interface PublicationModeCardProps {
  form: UseFormReturn<any>;
}

export function PublicationModeCard({ form }: PublicationModeCardProps) {
  return (
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
  );
}
