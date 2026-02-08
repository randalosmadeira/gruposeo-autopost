import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Plus,
  Trash2,
  Sparkles,
  FileText,
  Clock,
  Zap,
  Wand2,
  Loader2,
} from 'lucide-react';
import { wordCountOptions, getAverageWordCount } from './WordCountSelector';
import { cn } from '@/lib/utils';

export interface ArticleItem {
  id: string;
  keyword: string;
  title: string;
  size: string;
  location?: string; // For sales pages
  status: 'pending' | 'generating' | 'completed' | 'error';
}

interface ArticleListManagerProps {
  items: ArticleItem[];
  onItemsChange: (items: ArticleItem[]) => void;
  onGenerateTitles?: () => void;
  isGeneratingTitles?: boolean;
  showLocation?: boolean;
  type?: 'blog' | 'sales';
  accentColor?: string;
}

// Calculate estimated time per article based on word count
function getEstimatedMinutes(size: string): number {
  const range = getAverageWordCount(size);
  // Approximately 1 minute per 1000 words of generation
  return Math.ceil(range / 1000) + 1;
}

export function ArticleListManager({
  items,
  onItemsChange,
  onGenerateTitles,
  isGeneratingTitles = false,
  showLocation = false,
  type = 'blog',
  accentColor = '#4169E1',
}: ArticleListManagerProps) {
  const [defaultSize, setDefaultSize] = useState('medio');

  // Stats calculations
  const totalArticles = items.length;
  const estimatedCredits = items.reduce((sum, item) => {
    // Base credit cost per article size
    const sizeCosts: Record<string, number> = {
      muito_pequeno: 1,
      pequeno: 2,
      medio: 3,
      grande: 4,
    };
    return sum + (sizeCosts[item.size] || 2);
  }, 0);
  
  const estimatedTime = items.reduce((sum, item) => {
    return sum + getEstimatedMinutes(item.size);
  }, 0);

  const addItem = useCallback(() => {
    const newItem: ArticleItem = {
      id: crypto.randomUUID(),
      keyword: '',
      title: '',
      size: defaultSize,
      location: showLocation ? 'Brasil' : undefined,
      status: 'pending',
    };
    onItemsChange([...items, newItem]);
  }, [items, onItemsChange, defaultSize, showLocation]);

  const updateItem = useCallback((id: string, updates: Partial<ArticleItem>) => {
    onItemsChange(items.map(item => 
      item.id === id ? { ...item, ...updates } : item
    ));
  }, [items, onItemsChange]);

  const removeItem = useCallback((id: string) => {
    onItemsChange(items.filter(item => item.id !== id));
  }, [items, onItemsChange]);

  const applyDefaultSize = useCallback((size: string) => {
    setDefaultSize(size);
    onItemsChange(items.map(item => ({ ...item, size })));
  }, [items, onItemsChange]);

  // Handle paste for bulk adding
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text');
    const lines = text.split('\n').filter(line => line.trim());
    
    if (lines.length > 1) {
      e.preventDefault();
      const newItems: ArticleItem[] = lines.map(line => ({
        id: crypto.randomUUID(),
        keyword: line.trim(),
        title: '',
        size: defaultSize,
        location: showLocation ? 'Brasil' : undefined,
        status: 'pending' as const,
      }));
      onItemsChange([...items, ...newItems]);
    }
  }, [items, onItemsChange, defaultSize, showLocation]);

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-2" style={{ borderColor: `${accentColor}20` }}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${accentColor}15` }}
              >
                <FileText className="w-5 h-5" style={{ color: accentColor }} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total de artigos</p>
                <p className="text-2xl font-bold">{totalArticles}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2" style={{ borderColor: `${accentColor}20` }}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${accentColor}15` }}
              >
                <Zap className="w-5 h-5" style={{ color: accentColor }} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Créditos estimados</p>
                <p className="text-2xl font-bold">{estimatedCredits}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2" style={{ borderColor: `${accentColor}20` }}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${accentColor}15` }}
              >
                <Clock className="w-5 h-5" style={{ color: accentColor }} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tempo estimado</p>
                <p className="text-2xl font-bold">{estimatedTime} min</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Header with actions */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">
                Lista de {type === 'blog' ? 'Artigos' : 'Páginas'}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Configure palavra-chave, {type === 'blog' ? 'título' : 'headline'} e tamanho para cada {type === 'blog' ? 'artigo' : 'página'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={addItem} style={{ backgroundColor: accentColor }}>
                <Plus className="w-4 h-4 mr-2" />
                Adicionar
              </Button>
              {onGenerateTitles && (
                <Button 
                  variant="outline" 
                  onClick={onGenerateTitles}
                  disabled={isGeneratingTitles || items.length === 0 || items.every(i => !i.keyword)}
                >
                  {isGeneratingTitles ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Wand2 className="w-4 h-4 mr-2" />
                  )}
                  Gerar {type === 'blog' ? 'Títulos' : 'Headlines'}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead className={showLocation ? 'w-[25%]' : 'w-[35%]'}>Palavra-chave</TableHead>
                  <TableHead className={showLocation ? 'w-[30%]' : 'w-[40%]'}>
                    {type === 'blog' ? 'Título' : 'Headline'}
                  </TableHead>
                  <TableHead className="w-[15%]">Tamanho</TableHead>
                  {showLocation && <TableHead className="w-[15%]">Localização</TableHead>}
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Badge variant="secondary" className="rounded-full w-6 h-6 flex items-center justify-center p-0">
                        {index + 1}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Input
                        value={item.keyword}
                        onChange={(e) => updateItem(item.id, { keyword: e.target.value })}
                        placeholder="Ex: marketing digital"
                        onPaste={index === items.length - 1 ? handlePaste : undefined}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Input
                          value={item.title}
                          onChange={(e) => updateItem(item.id, { title: e.target.value })}
                          placeholder={`Ex: Guia Completo de ${item.keyword || 'Marketing Digital'}`}
                        />
                        {onGenerateTitles && (
                          <Button 
                            variant="ghost" 
                            size="icon"
                            className="shrink-0"
                            disabled={!item.keyword}
                          >
                            <Wand2 className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select 
                        value={item.size} 
                        onValueChange={(v) => updateItem(item.id, { size: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecionar" />
                        </SelectTrigger>
                        <SelectContent className="bg-popover">
                          {wordCountOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label.split(' ')[0]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    {showLocation && (
                      <TableCell>
                        <Input
                          value={item.location || ''}
                          onChange={(e) => updateItem(item.id, { location: e.target.value })}
                          placeholder="Brasil"
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItem(item.id)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={showLocation ? 6 : 5} className="text-center py-8 text-muted-foreground">
                      <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p>Nenhum {type === 'blog' ? 'artigo' : 'página'} adicionado</p>
                      <p className="text-xs">Clique em "Adicionar" para começar</p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>

          {/* Apply size to all */}
          {items.length > 0 && (
            <div className="flex items-center gap-3 mt-4 pt-4 border-t">
              <span className="text-sm text-muted-foreground">Aplicar tamanho a todos:</span>
              <Select value={defaultSize} onValueChange={applyDefaultSize}>
                <SelectTrigger className="w-[280px]">
                  <SelectValue placeholder="Selecionar tamanho padrão" />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  {wordCountOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tip */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4 flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-primary shrink-0" />
          <p className="text-sm text-muted-foreground">
            <strong>Dica:</strong> Cole múltiplas linhas usando Ctrl+V para adicionar vários {type === 'blog' ? 'artigos' : 'páginas'} de uma vez.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
