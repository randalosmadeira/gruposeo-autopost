import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Sparkles, Loader2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface RecreateArticleButtonProps {
  articleId: string;
  keyword: string;
  onRecreateComplete: (newContent: string, newTitle: string, newExcerpt: string) => void;
  hasError?: boolean;
  isEmpty?: boolean;
}

export function RecreateArticleButton({ 
  articleId, 
  keyword, 
  onRecreateComplete,
  hasError = false,
  isEmpty = false,
}: RecreateArticleButtonProps) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isRecreating, setIsRecreating] = useState(false);

  const shouldShowButton = hasError || isEmpty;

  const handleRecreate = async () => {
    setIsRecreating(true);
    setIsDialogOpen(false);

    try {
      toast({
        title: 'Recriando artigo...',
        description: 'A IA está gerando um novo conteúdo completo. Isso pode levar alguns minutos.',
      });

      // Call the generate-article function to recreate
      const { data, error } = await supabase.functions.invoke('generate-article', {
        body: {
          keyword,
          articleId,
          regenerate: true, // Flag to indicate full regeneration
          language: 'pt-BR',
        },
      });

      if (error) throw error;

      if (data?.content) {
        onRecreateComplete(
          data.content,
          data.title || keyword,
          data.excerpt || ''
        );

        // Update the article in database
        await supabase
          .from('articles')
          .update({
            content: data.content,
            title: data.title,
            excerpt: data.excerpt,
            status: 'ready',
            error_message: null,
          })
          .eq('id', articleId);

        toast({
          title: 'Artigo recriado com sucesso!',
          description: 'O novo conteúdo foi gerado e salvo.',
        });
      }
    } catch (error) {
      console.error('Recreate error:', error);
      toast({
        title: 'Erro ao recriar',
        description: 'Não foi possível recriar o artigo. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsRecreating(false);
    }
  };

  if (!shouldShowButton && !isRecreating) {
    return null;
  }

  return (
    <>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => setIsDialogOpen(true)}
        disabled={isRecreating}
        className="gap-2 animate-pulse"
      >
        {isRecreating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Recriando...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            Recriar com IA
          </>
        )}
      </Button>

      <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Recriar Artigo Completo?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                Esta ação irá <strong>substituir todo o conteúdo atual</strong> por um novo artigo 
                gerado pela IA baseado na palavra-chave: <strong>"{keyword}"</strong>
              </p>
              <p className="text-amber-600 font-medium">
                ⚠️ O conteúdo atual será perdido permanentemente.
              </p>
              <p>
                A IA irá gerar:
              </p>
              <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                <li>Novo título otimizado para SEO</li>
                <li>Conteúdo completo com estrutura H2/H3/H4</li>
                <li>Meta-descrição</li>
                <li>Seguindo todas as diretrizes dos prompts configurados</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleRecreate}
              className="bg-primary hover:bg-primary/90"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Confirmar e Recriar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
