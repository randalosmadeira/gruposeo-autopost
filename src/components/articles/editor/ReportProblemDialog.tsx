import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertTriangle, Send, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface ReportProblemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  articleId: string;
  articleTitle: string | null;
  articleKeyword: string;
}

const PROBLEM_CATEGORIES = [
  { value: 'quality', label: 'Qualidade do conteúdo' },
  { value: 'irrelevant', label: 'Conteúdo irrelevante' },
  { value: 'formatting', label: 'Problemas de formatação' },
  { value: 'incomplete', label: 'Artigo incompleto' },
  { value: 'technical', label: 'Erros técnicos' },
  { value: 'other', label: 'Outro' },
];

export function ReportProblemDialog({
  open,
  onOpenChange,
  articleId,
  articleTitle,
  articleKeyword,
}: ReportProblemDialogProps) {
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const descriptionLength = description.length;
  const isValid = category && descriptionLength >= 10;

  const handleSubmit = async () => {
    if (!isValid) return;

    setIsSubmitting(true);
    try {
      // Get current user
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        throw new Error('Usuário não autenticado');
      }

      // Insert report into dedicated table
      const { error } = await supabase
        .from('article_reports')
        .insert({
          article_id: articleId,
          user_id: session.user.id,
          category,
          description,
          status: 'pending',
        });

      if (error) throw error;

      toast({
        title: 'Report enviado!',
        description: 'Nossa equipe irá analisar o problema reportado.',
      });

      // Reset form and close
      setCategory('');
      setDescription('');
      onOpenChange(false);
    } catch (error) {
      console.error('Report error:', error);
      toast({
        title: 'Erro ao enviar',
        description: 'Não foi possível enviar o report. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setCategory('');
    setDescription('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            Reportar Problema no Artigo
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Descreva o problema encontrado no artigo. Nossa equipe irá revisar e, 
          se necessário, reembolsar os créditos utilizados.
        </p>

        <div className="space-y-4 mt-2">
          {/* Article Info Card */}
          <div className="p-4 bg-muted/50 rounded-lg border">
            <p className="text-sm font-medium text-muted-foreground">Artigo:</p>
            <p className="font-medium">{articleTitle || articleKeyword}</p>
          </div>

          {/* Category Select */}
          <div className="space-y-2">
            <Label htmlFor="category">
              Categoria do Problema <span className="text-destructive">*</span>
            </Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="category">
                <SelectValue placeholder="Selecione a categoria do problema" />
              </SelectTrigger>
              <SelectContent>
                {PROBLEM_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description Textarea */}
          <div className="space-y-2">
            <Label htmlFor="description">
              Descrição do Problema <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="description"
              placeholder="Descreva detalhadamente o problema encontrado no artigo..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              className="resize-none"
            />
            <p className={`text-xs ${descriptionLength < 10 ? 'text-muted-foreground' : 'text-chart-2'}`}>
              Mínimo 10 caracteres ({descriptionLength}/10)
            </p>
          </div>

          {/* Refund Policy Notice */}
          <div className="flex gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-destructive text-sm">
                Política de Reembolso
              </p>
              <p className="text-sm text-destructive/80 mt-1">
                Nossa equipe irá revisar o artigo reportado. Se confirmarmos que há problemas 
                significativos na qualidade, os créditos utilizados serão reembolsados 
                automaticamente em sua conta.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button 
              variant="outline" 
              onClick={handleCancel}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!isValid || isSubmitting}
              className="gap-2"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Enviar Report
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}