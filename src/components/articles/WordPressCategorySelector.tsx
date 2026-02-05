import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger 
} from '@/components/ui/collapsible';
import { 
  ChevronDown, 
  ChevronRight, 
  FolderOpen, 
  RefreshCw,
  AlertCircle,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useWordPressAPI } from '@/hooks/useWordPressAPI';

interface Category {
  id: number;
  name: string;
  slug: string;
  parent: number;
  count: number;
}

interface WordPressCategorySelectorProps {
  projectId: string | null;
  selectedCategories: number[];
  onCategoriesChange: (categories: number[]) => void;
  disabled?: boolean;
}

export function WordPressCategorySelector({
  projectId,
  selectedCategories,
  onCategoriesChange,
  disabled = false,
}: WordPressCategorySelectorProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedParents, setExpandedParents] = useState<Set<number>>(new Set([0]));
  const { getCategories } = useWordPressAPI(projectId);

  const fetchCategories = async () => {
    if (!projectId) {
      setError('Selecione um projeto WordPress');
      return;
    }

    setIsLoading(true);
    setError(null);

    const result = await getCategories(100);

    if (result.success && result.data) {
      setCategories(result.data);
    } else {
      setError(result.error || 'Erro ao carregar categorias');
    }

    setIsLoading(false);
  };

  useEffect(() => {
    if (projectId) {
      fetchCategories();
    }
  }, [projectId]);

  const toggleCategory = (categoryId: number) => {
    if (disabled) return;

    const newSelected = selectedCategories.includes(categoryId)
      ? selectedCategories.filter(id => id !== categoryId)
      : [...selectedCategories, categoryId];

    onCategoriesChange(newSelected);
  };

  const toggleExpanded = (parentId: number) => {
    const newExpanded = new Set(expandedParents);
    if (newExpanded.has(parentId)) {
      newExpanded.delete(parentId);
    } else {
      newExpanded.add(parentId);
    }
    setExpandedParents(newExpanded);
  };

  // Build category tree
  const buildCategoryTree = (parentId: number = 0): Category[] => {
    return categories.filter(cat => cat.parent === parentId);
  };

  const getChildCategories = (parentId: number): Category[] => {
    return categories.filter(cat => cat.parent === parentId);
  };

  const hasChildren = (categoryId: number): boolean => {
    return categories.some(cat => cat.parent === categoryId);
  };

  const renderCategory = (category: Category, level: number = 0) => {
    const children = getChildCategories(category.id);
    const isExpanded = expandedParents.has(category.id);
    const isSelected = selectedCategories.includes(category.id);

    return (
      <div key={category.id} className="space-y-1">
        <div 
          className={`flex items-center gap-2 p-2 rounded-md transition-colors hover:bg-muted/50 ${
            isSelected ? 'bg-primary/10' : ''
          }`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
        >
          {children.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0"
              onClick={() => toggleExpanded(category.id)}
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </Button>
          ) : (
            <div className="w-5" />
          )}

          <Checkbox
            id={`cat-${category.id}`}
            checked={isSelected}
            onCheckedChange={() => toggleCategory(category.id)}
            disabled={disabled}
          />

          <Label
            htmlFor={`cat-${category.id}`}
            className={`flex-1 text-sm cursor-pointer ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            {category.name}
          </Label>

          <Badge variant="outline" className="text-xs">
            {category.count}
          </Badge>
        </div>

        {children.length > 0 && isExpanded && (
          <div>
            {children.map(child => renderCategory(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (!projectId) {
    return (
      <div className="p-4 text-center text-muted-foreground border rounded-lg bg-muted/20">
        <WifiOff className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Nenhum projeto WordPress vinculado</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2 p-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-3/4" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center border rounded-lg bg-destructive/10">
        <AlertCircle className="w-8 h-8 mx-auto mb-2 text-destructive" />
        <p className="text-sm text-destructive mb-3">{error}</p>
        <Button variant="outline" size="sm" onClick={fetchCategories}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  const rootCategories = buildCategoryTree(0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FolderOpen className="w-4 h-4" />
          Categorias WordPress
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchCategories}
          disabled={isLoading}
          className="h-7"
        >
          <RefreshCw className={`w-3 h-3 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {categories.length === 0 ? (
        <div className="p-4 text-center text-muted-foreground border rounded-lg">
          <p className="text-sm">Nenhuma categoria encontrada</p>
        </div>
      ) : (
        <ScrollArea className="h-[200px] border rounded-lg">
          <div className="p-2 space-y-1">
            {rootCategories.map(category => renderCategory(category))}
          </div>
        </ScrollArea>
      )}

      {selectedCategories.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedCategories.map(catId => {
            const category = categories.find(c => c.id === catId);
            if (!category) return null;
            return (
              <Badge
                key={catId}
                variant="secondary"
                className="text-xs cursor-pointer hover:bg-destructive/20"
                onClick={() => toggleCategory(catId)}
              >
                {category.name} ×
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}
