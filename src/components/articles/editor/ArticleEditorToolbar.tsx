import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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
  Check,
  Unlink
} from 'lucide-react';

interface ArticleEditorToolbarProps {
  hasChanges: boolean;
  isSaving: boolean;
  onFormat?: (command: string, value?: string) => void;
  isEditMode?: boolean;
}

export function ArticleEditorToolbar({ 
  hasChanges, 
  isSaving, 
  onFormat,
  isEditMode = false 
}: ArticleEditorToolbarProps) {
  const [linkUrl, setLinkUrl] = useState('');
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);

  const handleFormat = (command: string, value?: string) => {
    if (onFormat) {
      onFormat(command, value);
    } else {
      // Fallback to execCommand for contenteditable
      document.execCommand(command, false, value);
    }
  };

  const handleInsertLink = () => {
    if (linkUrl) {
      handleFormat('createLink', linkUrl);
      setLinkUrl('');
      setLinkPopoverOpen(false);
    }
  };

  const handleRemoveLink = () => {
    handleFormat('unlink');
    setLinkPopoverOpen(false);
  };

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
          <DropdownMenuItem className="gap-2" onClick={() => handleFormat('formatBlock', 'h1')}>
            <span className="w-6 h-6 rounded bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium">H1</span>
            Título 1 (H1)
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2" onClick={() => handleFormat('formatBlock', 'h2')}>
            <span className="w-6 h-6 rounded bg-muted text-muted-foreground flex items-center justify-center text-xs font-medium">H2</span>
            Subtítulo 2 (H2)
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2" onClick={() => handleFormat('formatBlock', 'h3')}>
            <span className="w-6 h-6 rounded bg-muted text-muted-foreground flex items-center justify-center text-xs font-medium">H3</span>
            Subtítulo 3 (H3)
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2" onClick={() => handleFormat('formatBlock', 'h4')}>
            <span className="w-6 h-6 rounded bg-muted text-muted-foreground flex items-center justify-center text-xs font-medium">H4</span>
            Subtítulo 4 (H4)
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2" onClick={() => handleFormat('formatBlock', 'h5')}>
            <span className="w-6 h-6 rounded bg-muted text-muted-foreground flex items-center justify-center text-xs font-medium">H5</span>
            Subtítulo 5 (H5)
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2" onClick={() => handleFormat('formatBlock', 'h6')}>
            <span className="w-6 h-6 rounded bg-muted text-muted-foreground flex items-center justify-center text-xs font-medium">H6</span>
            Subtítulo 6 (H6)
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2" onClick={() => handleFormat('formatBlock', 'p')}>
            <span className="w-6 h-6 rounded bg-muted text-muted-foreground flex items-center justify-center text-xs font-medium">P</span>
            Parágrafo
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="h-6 w-px bg-border mx-1" />

      {/* Text Formatting */}
      <Button 
        variant="ghost" 
        size="sm" 
        className="h-8 w-8 p-0"
        onClick={() => handleFormat('bold')}
        title="Negrito (Ctrl+B)"
      >
        <Bold className="w-4 h-4" />
      </Button>
      <Button 
        variant="ghost" 
        size="sm" 
        className="h-8 w-8 p-0"
        onClick={() => handleFormat('italic')}
        title="Itálico (Ctrl+I)"
      >
        <Italic className="w-4 h-4" />
      </Button>
      
      {/* Link Popover */}
      <Popover open={linkPopoverOpen} onOpenChange={setLinkPopoverOpen}>
        <PopoverTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 w-8 p-0"
            title="Inserir link"
          >
            <Link className="w-4 h-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">URL do link</label>
              <Input
                placeholder="https://exemplo.com"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInsertLink()}
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleInsertLink} className="flex-1">
                <Link className="w-3 h-3 mr-1" />
                Inserir
              </Button>
              <Button size="sm" variant="outline" onClick={handleRemoveLink}>
                <Unlink className="w-3 h-3 mr-1" />
                Remover
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Button 
        variant="ghost" 
        size="sm" 
        className="h-8 w-8 p-0"
        onClick={() => handleFormat('strikeThrough')}
        title="Tachado"
      >
        <Strikethrough className="w-4 h-4" />
      </Button>
      <Button 
        variant="ghost" 
        size="sm" 
        className="h-8 w-8 p-0"
        onClick={() => handleFormat('underline')}
        title="Sublinhado (Ctrl+U)"
      >
        <Underline className="w-4 h-4" />
      </Button>

      <div className="h-6 w-px bg-border mx-1" />

      {/* Lists */}
      <Button 
        variant="ghost" 
        size="sm" 
        className="h-8 w-8 p-0"
        onClick={() => handleFormat('insertUnorderedList')}
        title="Lista com marcadores"
      >
        <List className="w-4 h-4" />
      </Button>
      <Button 
        variant="ghost" 
        size="sm" 
        className="h-8 w-8 p-0"
        onClick={() => handleFormat('insertOrderedList')}
        title="Lista numerada"
      >
        <ListOrdered className="w-4 h-4" />
      </Button>
      <Button 
        variant="ghost" 
        size="sm" 
        className="h-8 w-8 p-0"
        onClick={() => handleFormat('indent')}
        title="Aumentar recuo"
      >
        <IndentIncrease className="w-4 h-4" />
      </Button>
      <Button 
        variant="ghost" 
        size="sm" 
        className="h-8 w-8 p-0"
        onClick={() => handleFormat('outdent')}
        title="Diminuir recuo"
      >
        <IndentDecrease className="w-4 h-4" />
      </Button>

      <div className="h-6 w-px bg-border mx-1" />

      {/* Media */}
      <Button 
        variant="ghost" 
        size="sm" 
        className="h-8 w-8 p-0"
        title="Inserir imagem"
      >
        <ImageIcon className="w-4 h-4" />
      </Button>
      <Button 
        variant="ghost" 
        size="sm" 
        className="h-8 w-8 p-0"
        title="Inserir tabela"
      >
        <Table className="w-4 h-4" />
      </Button>

      <div className="flex-1" />

      {/* Status Badge */}
      {isSaving ? (
        <Badge variant="outline" className="text-muted-foreground border-muted">
          Salvando...
        </Badge>
      ) : hasChanges ? (
        <Badge variant="outline" className="text-destructive border-destructive/30">
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
