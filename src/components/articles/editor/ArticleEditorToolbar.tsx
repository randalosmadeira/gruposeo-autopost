import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Bold,
  Italic,
  Strikethrough,
  Underline,
  Link,
  Link2Off,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  ChevronDown,
  Image,
  Table,
  CheckCircle2,
  Loader2,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';

interface ArticleEditorToolbarProps {
  hasChanges: boolean;
  isSaving: boolean;
  lastSaved?: string | null;
  editorRef?: React.RefObject<HTMLDivElement>;
}

export function ArticleEditorToolbar({ 
  hasChanges, 
  isSaving,
  lastSaved,
  editorRef,
}: ArticleEditorToolbarProps) {
  const [linkUrl, setLinkUrl] = useState('');
  const [isLinkPopoverOpen, setIsLinkPopoverOpen] = useState(false);

  // Execute command on the contentEditable element
  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef?.current?.focus();
  };

  const handleFormatHeading = (level: string) => {
    execCommand('formatBlock', level);
  };

  const handleInsertLink = () => {
    if (linkUrl) {
      execCommand('createLink', linkUrl);
      setLinkUrl('');
      setIsLinkPopoverOpen(false);
    }
  };

  const handleRemoveLink = () => {
    execCommand('unlink');
  };

  return (
    <div className="flex items-center gap-1 px-4 py-2 bg-card border-b overflow-x-auto">
      {/* Heading Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1 h-8 px-2 text-sm">
            Título 1 (H1)
            <ChevronDown className="w-3 h-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => handleFormatHeading('h1')}>
            <Heading1 className="w-4 h-4 mr-2" />
            Título 1 (H1)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleFormatHeading('h2')}>
            <Heading2 className="w-4 h-4 mr-2" />
            Título 2 (H2)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleFormatHeading('h3')}>
            <Heading3 className="w-4 h-4 mr-2" />
            Título 3 (H3)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleFormatHeading('p')}>
            <AlignLeft className="w-4 h-4 mr-2" />
            Parágrafo
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Text Formatting */}
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-8 w-8"
        onClick={() => execCommand('bold')}
        title="Negrito (Ctrl+B)"
      >
        <Bold className="w-4 h-4" />
      </Button>
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-8 w-8"
        onClick={() => execCommand('italic')}
        title="Itálico (Ctrl+I)"
      >
        <Italic className="w-4 h-4" />
      </Button>
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-8 w-8"
        onClick={() => execCommand('strikeThrough')}
        title="Tachado"
      >
        <Strikethrough className="w-4 h-4" />
      </Button>
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-8 w-8"
        onClick={() => execCommand('underline')}
        title="Sublinhado (Ctrl+U)"
      >
        <Underline className="w-4 h-4" />
      </Button>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Link */}
      <Popover open={isLinkPopoverOpen} onOpenChange={setIsLinkPopoverOpen}>
        <PopoverTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8"
            title="Inserir link"
          >
            <Link className="w-4 h-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          <div className="space-y-3">
            <label className="text-sm font-medium">URL do link</label>
            <Input
              placeholder="https://exemplo.com"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleInsertLink()}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleInsertLink} className="flex-1">
                Inserir
              </Button>
              <Button size="sm" variant="outline" onClick={() => setIsLinkPopoverOpen(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-8 w-8"
        onClick={handleRemoveLink}
        title="Remover link"
      >
        <Link2Off className="w-4 h-4" />
      </Button>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Lists */}
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-8 w-8"
        onClick={() => execCommand('insertUnorderedList')}
        title="Lista com marcadores"
      >
        <List className="w-4 h-4" />
      </Button>
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-8 w-8"
        onClick={() => execCommand('insertOrderedList')}
        title="Lista numerada"
      >
        <ListOrdered className="w-4 h-4" />
      </Button>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Alignment */}
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-8 w-8"
        onClick={() => execCommand('justifyLeft')}
        title="Alinhar à esquerda"
      >
        <AlignLeft className="w-4 h-4" />
      </Button>
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-8 w-8"
        onClick={() => execCommand('justifyCenter')}
        title="Centralizar"
      >
        <AlignCenter className="w-4 h-4" />
      </Button>
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-8 w-8"
        onClick={() => execCommand('justifyRight')}
        title="Alinhar à direita"
      >
        <AlignRight className="w-4 h-4" />
      </Button>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Media */}
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-8 w-8"
        title="Inserir imagem"
      >
        <Image className="w-4 h-4" />
      </Button>
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-8 w-8"
        title="Inserir tabela"
      >
        <Table className="w-4 h-4" />
      </Button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Keyboard shortcuts hint */}
      <div className="hidden md:flex items-center gap-1 text-xs text-muted-foreground mr-2">
        <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">Ctrl+S</kbd>
        <span>salvar</span>
      </div>

      {/* Status indicator */}
      {isSaving ? (
        <Badge variant="secondary" className="gap-2 font-normal animate-pulse">
          <Loader2 className="w-3 h-3 animate-spin" />
          Salvando...
        </Badge>
      ) : hasChanges ? (
        <Badge variant="outline" className="gap-2 font-normal text-amber-600 border-amber-300 bg-amber-50">
          <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          Alterações pendentes
        </Badge>
      ) : lastSaved ? (
        <Badge variant="outline" className="gap-2 font-normal text-emerald-600 border-emerald-300 bg-emerald-50">
          <CheckCircle2 className="w-3 h-3" />
          {lastSaved}
        </Badge>
      ) : (
        <Badge variant="outline" className="gap-2 font-normal text-emerald-600 border-emerald-300 bg-emerald-50">
          <CheckCircle2 className="w-3 h-3" />
          Pronto
        </Badge>
      )}
    </div>
  );
}
