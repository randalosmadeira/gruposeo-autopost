import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Languages,
  Link2,
  Unlink2,
  ExternalLink,
  Loader2,
  FileText,
} from 'lucide-react';

// Bloco D (frontend half) — real hreflang linking UI. Reads/writes
// `translation_group_id`/`language` (migration
// 20260918020000_article_translation_groups.sql) through the
// `manage-article-translation` edge function, which also keeps the
// WordPress hreflang tags of the whole family in sync (`_shared/hreflang-sync.ts`).
// This component owns its own local notion of the article's current group —
// it does NOT go through `ArticleEditorSidebar`'s `onFieldUpdate`, because
// that flags the article as having unsaved changes, and linking/unlinking a
// translation is already persisted server-side the moment the mutation
// succeeds (nothing to "Salvar Alterações" afterwards).

const LANGUAGE_LABELS: Record<string, string> = {
  'pt-BR': 'Português (BR)',
  'pt-PT': 'Português (PT)',
  'en-US': 'Inglês (US)',
  'en-GB': 'Inglês (UK)',
  'es': 'Espanhol',
  'es-ES': 'Espanhol (ES)',
};

function languageLabel(code: string | null | undefined) {
  if (!code) return 'pt-BR';
  return LANGUAGE_LABELS[code] || code;
}

interface SiblingArticle {
  id: string;
  title: string | null;
  keyword: string;
  language: string | null;
  published_url: string | null;
  status: string;
}

interface CandidateArticle {
  id: string;
  title: string | null;
  keyword: string;
  language: string | null;
  translation_group_id: string | null;
}

interface TranslationsPanelProps {
  articleId: string;
  projectId: string | null | undefined;
  language: string | null | undefined;
  translationGroupId: string | null | undefined;
}

export function TranslationsPanel({ articleId, projectId, language, translationGroupId }: TranslationsPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [groupId, setGroupId] = useState<string | null>(translationGroupId || null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setGroupId(translationGroupId || null);
  }, [translationGroupId]);

  // `language`/`translation_group_id` (migration 20260918020000) are not yet
  // in the generated Supabase types (src/integrations/supabase/types.ts is a
  // snapshot regenerated separately from migrations — several other columns
  // added by recent migrations, e.g. `organization_id` on other tables, have
  // the same gap elsewhere in this repo). Querying them through the typed
  // client requires an `any` escape hatch here; the columns themselves are
  // real (see the migration) and this is purely a generated-types lag.
  const siblingsQuery = useQuery({
    queryKey: ['article-translation-siblings', articleId, groupId],
    queryFn: async () => {
      if (!groupId) return [] as SiblingArticle[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see note above
      const { data, error } = await (supabase.from('articles') as any)
        .select('id, title, keyword, language, published_url, status')
        .eq('translation_group_id', groupId)
        .neq('id', articleId);
      if (error) throw error;
      return (data || []) as SiblingArticle[];
    },
    enabled: !!groupId,
  });

  const candidatesQuery = useQuery({
    queryKey: ['article-translation-candidates', projectId, articleId],
    queryFn: async () => {
      if (!projectId) return [] as CandidateArticle[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see note above
      const { data, error } = await (supabase.from('articles') as any)
        .select('id, title, keyword, language, translation_group_id')
        .eq('project_id', projectId)
        .neq('id', articleId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as CandidateArticle[];
    },
    enabled: pickerOpen && !!projectId,
  });

  const filteredCandidates = useMemo(() => {
    const list = candidatesQuery.data || [];
    if (!search.trim()) return list.slice(0, 30);
    const q = search.toLowerCase();
    return list
      .filter((a) => (a.title || a.keyword || '').toLowerCase().includes(q))
      .slice(0, 30);
  }, [candidatesQuery.data, search]);

  const invalidateSiblings = (nextGroupId: string | null) => {
    queryClient.invalidateQueries({ queryKey: ['article-translation-siblings', articleId, nextGroupId] });
    queryClient.invalidateQueries({ queryKey: ['article-translation-candidates', projectId, articleId] });
  };

  const linkMutation = useMutation({
    mutationFn: async (siblingArticleId: string) => {
      const { data, error } = await supabase.functions.invoke('manage-article-translation', {
        body: { action: 'link', articleId, siblingArticleId },
      });
      if (error || data?.success === false) {
        const code = data?.code as string | undefined;
        const message = code === 'translation_group_conflict'
          ? 'Esse artigo já pertence a outro grupo de tradução.'
          : String(data?.error || error?.message || 'Falha ao vincular tradução.');
        throw new Error(message);
      }
      return data as { translationGroupId: string };
    },
    onSuccess: (data) => {
      setGroupId(data.translationGroupId);
      invalidateSiblings(data.translationGroupId);
      setPickerOpen(false);
      setSearch('');
      toast({ title: 'Tradução vinculada', description: 'O grupo de tradução foi atualizado e o hreflang sincronizado.' });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao vincular tradução',
        description: error instanceof Error ? error.message : 'Não foi possível vincular a tradução.',
        variant: 'destructive',
      });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('manage-article-translation', {
        body: { action: 'unlink', articleId },
      });
      if (error || data?.success === false) {
        throw new Error(String(data?.error || error?.message || 'Falha ao desvincular tradução.'));
      }
      return data;
    },
    onSuccess: () => {
      const oldGroupId = groupId;
      setGroupId(null);
      invalidateSiblings(oldGroupId);
      toast({ title: 'Tradução desvinculada', description: 'O artigo saiu do grupo de tradução.' });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao desvincular tradução',
        description: error instanceof Error ? error.message : 'Não foi possível desvincular a tradução.',
        variant: 'destructive',
      });
    },
  });

  return (
    <div className="space-y-3 pt-2 border-t">
      <div className="flex items-center gap-2">
        <Languages className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium">Idiomas / Traduções</span>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Idioma deste artigo</span>
        <Badge variant="secondary" className="text-xs">{languageLabel(language)}</Badge>
      </div>

      {groupId ? (
        <div className="space-y-2">
          {siblingsQuery.isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Carregando artigos-irmãos...
            </div>
          ) : siblingsQuery.data && siblingsQuery.data.length > 0 ? (
            siblingsQuery.data.map((sibling) => (
              <div key={sibling.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border text-xs">
                <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{sibling.title || sibling.keyword}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Badge variant="outline" className="text-[10px]">{languageLabel(sibling.language)}</Badge>
                    {sibling.published_url ? (
                      <a
                        href={sibling.published_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-primary hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Ver publicado
                      </a>
                    ) : (
                      <span className="text-muted-foreground">Não publicado</span>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground py-1">Nenhum outro artigo neste grupo.</p>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => unlinkMutation.mutate()}
            disabled={unlinkMutation.isPending}
            className="w-full gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            {unlinkMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Unlink2 className="w-3.5 h-3.5" />
            )}
            Desvincular tradução
          </Button>
        </div>
      ) : (
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              disabled={!projectId}
            >
              <Link2 className="w-3.5 h-3.5" />
              Vincular tradução
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <Command>
              <CommandInput
                placeholder="Buscar artigo do mesmo projeto..."
                value={search}
                onValueChange={setSearch}
              />
              <CommandList className="max-h-72">
                <CommandEmpty>
                  {candidatesQuery.isLoading ? 'Carregando...' : 'Nenhum artigo encontrado neste projeto'}
                </CommandEmpty>
                <CommandGroup>
                  {filteredCandidates.map((candidate) => (
                    <CommandItem
                      key={candidate.id}
                      disabled={linkMutation.isPending}
                      onSelect={() => linkMutation.mutate(candidate.id)}
                      className="cursor-pointer"
                    >
                      <FileText className="w-4 h-4 mr-2 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{candidate.title || candidate.keyword}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {languageLabel(candidate.language)}
                          {candidate.translation_group_id ? ' • já tem grupo' : ''}
                        </p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}

      {!projectId && (
        <p className="text-xs text-muted-foreground">Vincule este artigo a um projeto WordPress para gerenciar traduções.</p>
      )}
    </div>
  );
}

export default TranslationsPanel;
