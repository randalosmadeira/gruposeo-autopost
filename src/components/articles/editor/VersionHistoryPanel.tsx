import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
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
import { 
  History, 
  Clock, 
  RotateCcw, 
  FileText, 
  Eye,
  Loader2,
  CalendarDays,
  Trash2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ArticleVersion {
  id: string;
  article_id: string;
  version_number: number;
  title: string | null;
  content: string | null;
  excerpt: string | null;
  word_count: number | null;
  created_at: string;
  change_description: string | null;
  is_auto_save: boolean;
}

interface VersionHistoryPanelProps {
  articleId: string;
  currentTitle: string | null;
  currentContent: string | null;
  onRestoreVersion: (title: string, content: string, excerpt: string) => void;
}

export function VersionHistoryPanel({
  articleId,
  currentTitle,
  currentContent,
  onRestoreVersion,
}: VersionHistoryPanelProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [versions, setVersions] = useState<ArticleVersion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<ArticleVersion | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isRestoreDialogOpen, setIsRestoreDialogOpen] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchVersions();
    }
  }, [isOpen, articleId]);

  const fetchVersions = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('article_versions')
        .select('*')
        .eq('article_id', articleId)
        .order('version_number', { ascending: false })
        .limit(50);

      if (error) throw error;
      setVersions(data || []);
    } catch (error) {
      console.error('Error fetching versions:', error);
      toast({
        title: 'Erro ao carregar histórico',
        description: 'Não foi possível carregar o histórico de versões.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePreview = (version: ArticleVersion) => {
    setSelectedVersion(version);
    setIsPreviewOpen(true);
  };

  const handleRestoreClick = (version: ArticleVersion) => {
    setSelectedVersion(version);
    setIsRestoreDialogOpen(true);
  };

  const handleRestore = async () => {
    if (!selectedVersion) return;

    setIsRestoring(true);
    try {
      // Restore the version content
      onRestoreVersion(
        selectedVersion.title || '',
        selectedVersion.content || '',
        selectedVersion.excerpt || ''
      );

      toast({
        title: 'Versão restaurada!',
        description: `Versão ${selectedVersion.version_number} foi restaurada com sucesso.`,
      });

      setIsRestoreDialogOpen(false);
      setIsOpen(false);
    } catch (error) {
      console.error('Restore error:', error);
      toast({
        title: 'Erro ao restaurar',
        description: 'Não foi possível restaurar esta versão.',
        variant: 'destructive',
      });
    } finally {
      setIsRestoring(false);
    }
  };

  const handleDeleteVersion = async (versionId: string) => {
    try {
      const { error } = await supabase
        .from('article_versions')
        .delete()
        .eq('id', versionId);

      if (error) throw error;

      setVersions(prev => prev.filter(v => v.id !== versionId));
      toast({
        title: 'Versão excluída',
        description: 'A versão foi removida do histórico.',
      });
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: 'Erro ao excluir',
        description: 'Não foi possível excluir esta versão.',
        variant: 'destructive',
      });
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    return formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <History className="w-4 h-4" />
            Histórico
          </Button>
        </SheetTrigger>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              Histórico de Versões
            </SheetTitle>
            <SheetDescription>
              Visualize e restaure versões anteriores do artigo. Cada edição é salva automaticamente.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : versions.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="font-medium text-lg">Nenhuma versão anterior</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  As versões serão salvas automaticamente quando você editar o artigo.
                </p>
              </div>
            ) : (
              <ScrollArea className="h-[calc(100vh-200px)]">
                <div className="space-y-3 pr-4">
                  {/* Current version indicator */}
                  <div className="p-4 rounded-lg border-2 border-primary bg-primary/5">
                    <div className="flex items-center justify-between mb-2">
                      <Badge className="bg-primary text-primary-foreground">
                        Versão Atual
                      </Badge>
                      <span className="text-xs text-muted-foreground">Agora</span>
                    </div>
                    <h4 className="font-medium truncate">{currentTitle || 'Sem título'}</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      {currentContent?.split(/\s+/).filter(Boolean).length || 0} palavras
                    </p>
                  </div>

                  {/* Version list */}
                  {versions.map((version) => (
                    <div
                      key={version.id}
                      className="p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors group"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            v{version.version_number}
                          </Badge>
                          {version.is_auto_save && (
                            <Badge variant="secondary" className="text-xs">
                              Auto-save
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handlePreview(version)}
                            title="Pré-visualizar"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleRestoreClick(version)}
                            title="Restaurar"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteVersion(version.id)}
                            title="Excluir"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      <h4 className="font-medium truncate text-sm">
                        {version.title || 'Sem título'}
                      </h4>

                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <CalendarDays className="w-3 h-3" />
                          {formatRelativeTime(version.created_at)}
                        </span>
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          {version.word_count || 0} palavras
                        </span>
                      </div>

                      {version.change_description && (
                        <p className="text-xs text-muted-foreground mt-2 italic">
                          {version.change_description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Preview Dialog */}
      <Sheet open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <SheetContent className="w-full sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" />
              Pré-visualização - Versão {selectedVersion?.version_number}
            </SheetTitle>
            <SheetDescription>
              {selectedVersion && formatDate(selectedVersion.created_at)}
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="h-[calc(100vh-150px)] mt-6">
            <div className="prose prose-sm max-w-none pr-4">
              {selectedVersion?.title && (
                <h1 className="text-xl font-bold mb-4">{selectedVersion.title}</h1>
              )}
              {selectedVersion?.content ? (
                <div 
                  dangerouslySetInnerHTML={{ __html: selectedVersion.content }} 
                  className="[&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-6 [&_h2]:mb-3
                    [&_h3]:text-base [&_h3]:font-medium [&_h3]:mt-4 [&_h3]:mb-2
                    [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                />
              ) : (
                <p className="text-muted-foreground italic">Sem conteúdo</p>
              )}
            </div>
          </ScrollArea>

          <div className="absolute bottom-4 right-4 left-4 flex gap-2 bg-background pt-4 border-t">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={() => setIsPreviewOpen(false)}
            >
              Fechar
            </Button>
            <Button 
              className="flex-1 gap-2"
              onClick={() => {
                setIsPreviewOpen(false);
                if (selectedVersion) {
                  handleRestoreClick(selectedVersion);
                }
              }}
            >
              <RotateCcw className="w-4 h-4" />
              Restaurar esta versão
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Restore Confirmation Dialog */}
      <AlertDialog open={isRestoreDialogOpen} onOpenChange={setIsRestoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-primary" />
              Restaurar Versão {selectedVersion?.version_number}?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Ao restaurar esta versão, o conteúdo atual será substituído pelo conteúdo 
                salvo em <strong>{selectedVersion && formatDate(selectedVersion.created_at)}</strong>.
              </p>
              <p className="text-amber-600">
                ⚠️ Uma cópia da versão atual será salva automaticamente antes da restauração.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRestoring}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleRestore}
              disabled={isRestoring}
              className="gap-2"
            >
              {isRestoring ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4" />
              )}
              Confirmar Restauração
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
