import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent } from '@/components/ui/card';
import { UseFormReturn } from 'react-hook-form';

interface ThemeCardProps {
  form: UseFormReturn<any>;
  satelliteCount: number;
}

export function ThemeCard({ form, satelliteCount }: ThemeCardProps) {
  return (
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
                    <span>Quantidade de artigos satélite</span>
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
  );
}
