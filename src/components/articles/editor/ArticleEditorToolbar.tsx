import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Bold, 
  Italic, 
  Link, 
  Strikethrough, 
  Underline,
  List,
  ListOrdered,
  IndentIncrease,
  IndentDecrease,
  Image as ImageIcon,
  Table,
  ChevronDown,
  Check
} from 'lucide-react';

interface ArticleEditorToolbarProps {
  hasChanges: boolean;
  isSaving: boolean;
}

export function ArticleEditorToolbar({ hasChanges, isSaving }: ArticleEditorToolbarProps) {
  return (
    <div className="flex items-center gap-1 p-2 border-b bg-card">
      {/* Heading Selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 gap-2 px-3 text-sm font-normal">
            Título 1 (H1)
            <ChevronDown className="w-3 h-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuItem className="gap-2">
            <span className="w-6 h-6 rounded bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium">H1</span>
            Título 1 (H1)
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2">
            <span className="w-6 h-6 rounded bg-muted text-muted-foreground flex items-center justify-center text-xs font-medium">H2</span>
            Subtítulo 2 (H2)
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2">
            <span className="w-6 h-6 rounded bg-muted text-muted-foreground flex items-center justify-center text-xs font-medium">H3</span>
            Subtítulo 3 (H3)
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2">
            <span className="w-6 h-6 rounded bg-muted text-muted-foreground flex items-center justify-center text-xs font-medium">H4</span>
            Subtítulo 4 (H4)
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2">
            <span className="w-6 h-6 rounded bg-muted text-muted-foreground flex items-center justify-center text-xs font-medium">H5</span>
            Subtítulo 5 (H5)
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2">
            <span className="w-6 h-6 rounded bg-muted text-muted-foreground flex items-center justify-center text-xs font-medium">H6</span>
            Subtítulo 6 (H6)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="h-6 w-px bg-border mx-1" />

      {/* Text Formatting */}
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
        <Bold className="w-4 h-4" />
      </Button>
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
        <Italic className="w-4 h-4" />
      </Button>
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
        <Link className="w-4 h-4" />
      </Button>
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
        <Strikethrough className="w-4 h-4" />
      </Button>
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
        <Underline className="w-4 h-4" />
      </Button>

      <div className="h-6 w-px bg-border mx-1" />

      {/* Lists */}
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
        <List className="w-4 h-4" />
      </Button>
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
        <ListOrdered className="w-4 h-4" />
      </Button>
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
        <IndentIncrease className="w-4 h-4" />
      </Button>
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
        <IndentDecrease className="w-4 h-4" />
      </Button>

      <div className="h-6 w-px bg-border mx-1" />

      {/* Media */}
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
        <ImageIcon className="w-4 h-4" />
      </Button>
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
        <Table className="w-4 h-4" />
      </Button>

      <div className="flex-1" />

      {/* Status Badge */}
      {isSaving ? (
        <Badge variant="outline" className="text-muted-foreground border-muted">
          Salvando...
        </Badge>
      ) : hasChanges ? (
        <Badge variant="outline" className="text-orange-600 border-orange-300">
          Não salvo
        </Badge>
      ) : (
        <Badge variant="outline" className="text-primary border-primary/30 bg-primary/10 gap-1">
          <Check className="w-3 h-3" />
          Salvo!
        </Badge>
      )}
    </div>
  );
}
