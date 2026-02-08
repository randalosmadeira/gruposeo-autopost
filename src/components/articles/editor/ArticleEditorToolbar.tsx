import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Upload,
  Globe,
  Plus,
  Minus,
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { VideoInsertPopover } from './VideoInsertPopover';

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
  const { toast } = useToast();
  const [linkUrl, setLinkUrl] = useState('');
  const [isLinkPopoverOpen, setIsLinkPopoverOpen] = useState(false);
  
  // Image insertion state
  const [isImagePopoverOpen, setIsImagePopoverOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [imageAlt, setImageAlt] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Table insertion state
  const [isTablePopoverOpen, setIsTablePopoverOpen] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);
  const [tableHasHeader, setTableHasHeader] = useState(true);

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

  // Insert image from URL
  const handleInsertImageUrl = () => {
    if (imageUrl) {
      const imgHtml = `<img src="${imageUrl}" alt="${imageAlt || 'Imagem'}" class="max-w-full h-auto rounded-lg my-4" />`;
      execCommand('insertHTML', imgHtml);
      setImageUrl('');
      setImageAlt('');
      setIsImagePopoverOpen(false);
      toast({
        title: 'Imagem inserida!',
        description: 'A imagem foi adicionada ao conteúdo.',
      });
    }
  };

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Arquivo inválido',
        description: 'Por favor, selecione um arquivo de imagem.',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'Arquivo muito grande',
        description: 'O tamanho máximo é 5MB.',
        variant: 'destructive',
      });
      return;
    }

    // Convert to base64 and insert
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      const imgHtml = `<img src="${base64}" alt="${imageAlt || file.name}" class="max-w-full h-auto rounded-lg my-4" />`;
      execCommand('insertHTML', imgHtml);
      setImageAlt('');
      setIsImagePopoverOpen(false);
      toast({
        title: 'Imagem inserida!',
        description: 'A imagem foi adicionada ao conteúdo.',
      });
    };
    reader.readAsDataURL(file);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Generate table HTML
  const generateTableHtml = () => {
    let html = '<table class="w-full border-collapse my-6">';
    
    for (let i = 0; i < tableRows; i++) {
      html += '<tr>';
      for (let j = 0; j < tableCols; j++) {
        if (i === 0 && tableHasHeader) {
          html += `<th class="border border-border px-4 py-2 bg-muted font-semibold text-left">Cabeçalho ${j + 1}</th>`;
        } else {
          const rowNum = tableHasHeader ? i : i + 1;
          html += `<td class="border border-border px-4 py-2">Célula ${rowNum}-${j + 1}</td>`;
        }
      }
      html += '</tr>';
    }
    
    html += '</table>';
    return html;
  };

  const handleInsertTable = () => {
    const tableHtml = generateTableHtml();
    execCommand('insertHTML', tableHtml);
    setIsTablePopoverOpen(false);
    toast({
      title: 'Tabela inserida!',
      description: `Tabela ${tableRows}x${tableCols} adicionada ao conteúdo.`,
    });
  };

  return (
    <div className="flex items-center gap-1 px-4 py-2 bg-card border-b overflow-x-auto">
      {/* Heading Dropdown - Hierarquia Google SEO */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1 h-8 px-2 text-sm">
            Formatação
            <ChevronDown className="w-3 h-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => handleFormatHeading('h1')}>
            <Heading1 className="w-4 h-4 mr-2" />
            <span className="font-bold">H1 - Título Principal</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleFormatHeading('h2')}>
            <Heading2 className="w-4 h-4 mr-2" />
            <span className="font-semibold">H2 - Seção Principal</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleFormatHeading('h3')}>
            <Heading3 className="w-4 h-4 mr-2" />
            <span className="font-medium">H3 - Subseção</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleFormatHeading('h4')}>
            <span className="w-4 h-4 mr-2 text-xs font-bold flex items-center justify-center">H4</span>
            <span>H4 - Detalhe</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleFormatHeading('h5')}>
            <span className="w-4 h-4 mr-2 text-xs font-bold flex items-center justify-center">H5</span>
            <span className="text-sm">H5 - Subdetalhe</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleFormatHeading('h6')}>
            <span className="w-4 h-4 mr-2 text-xs font-bold flex items-center justify-center">H6</span>
            <span className="text-xs">H6 - Menor Título</span>
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
            <Label className="text-sm font-medium">URL do link</Label>
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

      {/* Image Insertion */}
      <Popover open={isImagePopoverOpen} onOpenChange={setIsImagePopoverOpen}>
        <PopoverTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8"
            title="Inserir imagem"
          >
            <Image className="w-4 h-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96" align="start">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Image className="w-5 h-5 text-primary" />
              <h4 className="font-semibold">Inserir Imagem</h4>
            </div>
            
            <Tabs defaultValue="url" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="url" className="gap-2">
                  <Globe className="w-4 h-4" />
                  URL
                </TabsTrigger>
                <TabsTrigger value="upload" className="gap-2">
                  <Upload className="w-4 h-4" />
                  Upload
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="url" className="space-y-3 pt-3">
                <div className="space-y-2">
                  <Label className="text-sm">URL da Imagem</Label>
                  <Input
                    placeholder="https://exemplo.com/imagem.jpg"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Texto Alternativo (SEO)</Label>
                  <Input
                    placeholder="Descrição da imagem"
                    value={imageAlt}
                    onChange={(e) => setImageAlt(e.target.value)}
                  />
                </div>
                <Button 
                  onClick={handleInsertImageUrl} 
                  className="w-full"
                  disabled={!imageUrl}
                >
                  Inserir Imagem
                </Button>
              </TabsContent>
              
              <TabsContent value="upload" className="space-y-3 pt-3">
                <div className="space-y-2">
                  <Label className="text-sm">Texto Alternativo (SEO)</Label>
                  <Input
                    placeholder="Descrição da imagem"
                    value={imageAlt}
                    onChange={(e) => setImageAlt(e.target.value)}
                  />
                </div>
                <div 
                  className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm font-medium">Clique para selecionar</p>
                  <p className="text-xs text-muted-foreground mt-1">PNG, JPG, WebP (max 5MB)</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </TabsContent>
            </Tabs>
          </div>
        </PopoverContent>
      </Popover>

      {/* Video Insertion */}
      <VideoInsertPopover 
        onInsertVideo={(embedHtml) => {
          execCommand('insertHTML', embedHtml);
        }}
      />

      {/* Table Insertion */}
      <Popover open={isTablePopoverOpen} onOpenChange={setIsTablePopoverOpen}>
        <PopoverTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8"
            title="Inserir tabela"
          >
            <Table className="w-4 h-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Table className="w-5 h-5 text-primary" />
              <h4 className="font-semibold">Inserir Tabela</h4>
            </div>
            
            {/* Table Size Selection */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm">Linhas</Label>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="h-8 w-8"
                    onClick={() => setTableRows(Math.max(1, tableRows - 1))}
                    disabled={tableRows <= 1}
                  >
                    <Minus className="w-3 h-3" />
                  </Button>
                  <span className="w-8 text-center font-medium">{tableRows}</span>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="h-8 w-8"
                    onClick={() => setTableRows(Math.min(20, tableRows + 1))}
                    disabled={tableRows >= 20}
                  >
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm">Colunas</Label>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="h-8 w-8"
                    onClick={() => setTableCols(Math.max(1, tableCols - 1))}
                    disabled={tableCols <= 1}
                  >
                    <Minus className="w-3 h-3" />
                  </Button>
                  <span className="w-8 text-center font-medium">{tableCols}</span>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="h-8 w-8"
                    onClick={() => setTableCols(Math.min(10, tableCols + 1))}
                    disabled={tableCols >= 10}
                  >
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Header Row Option */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <span className="text-sm">Primeira linha como cabeçalho</span>
              <Button 
                variant={tableHasHeader ? "default" : "outline"} 
                size="sm"
                onClick={() => setTableHasHeader(!tableHasHeader)}
              >
                {tableHasHeader ? 'Sim' : 'Não'}
              </Button>
            </div>
            
            {/* Preview Grid */}
            <div className="p-3 bg-muted/30 rounded-lg">
              <p className="text-xs text-muted-foreground mb-2">Prévia:</p>
              <div 
                className="grid gap-0.5 mx-auto w-fit"
                style={{ gridTemplateColumns: `repeat(${Math.min(tableCols, 6)}, minmax(0, 1fr))` }}
              >
                {Array.from({ length: Math.min(tableRows, 4) * Math.min(tableCols, 6) }).map((_, i) => {
                  const isHeader = tableHasHeader && i < Math.min(tableCols, 6);
                  return (
                    <div 
                      key={i} 
                      className={`w-6 h-4 rounded-sm ${isHeader ? 'bg-primary' : 'bg-primary/30'}`}
                    />
                  );
                })}
              </div>
              {(tableRows > 4 || tableCols > 6) && (
                <p className="text-[10px] text-muted-foreground mt-1 text-center">
                  Tabela completa: {tableRows} × {tableCols}
                </p>
              )}
            </div>

            <Button onClick={handleInsertTable} className="w-full">
              Inserir Tabela {tableRows}×{tableCols}
            </Button>
          </div>
        </PopoverContent>
      </Popover>

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
