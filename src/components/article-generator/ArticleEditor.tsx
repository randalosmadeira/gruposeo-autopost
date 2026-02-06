import { useState, useRef } from 'react';
import { 
  Check,
  Upload,
  Bold,
  Italic,
  Link2,
  Strikethrough,
  Underline,
  List,
  ListOrdered,
  Indent,
  Outdent,
  Image,
  Heading2,
  Heading3,
  Type,
  Loader2,
  Globe,
  Save,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ArticleSection {
  id: string;
  title: string;
  content: string;
  level: 'h2' | 'h3';
  image?: string;
}

interface Project {
  id: string;
  name: string;
  domain: string;
  is_connected: boolean;
}

interface ArticleEditorProps {
  title: string;
  intro: string;
  sections: ArticleSection[];
  featuredImage?: string;
  onTitleChange: (title: string) => void;
  onIntroChange: (intro: string) => void;
  onSectionChange: (id: string, field: 'title' | 'content', value: string) => void;
  onPublish: (projectId: string) => void;
  onSave?: () => void;
  isPublishing?: boolean;
  isSaving?: boolean;
  lastSaved?: Date | null;
  projects?: Project[];
  selectedProjectId?: string;
  publishedUrl?: string;
}

export function ArticleEditor({
  title,
  intro,
  sections,
  featuredImage,
  onTitleChange,
  onIntroChange,
  onSectionChange,
  onPublish,
  onSave,
  isPublishing,
  isSaving,
  lastSaved,
  projects = [],
  selectedProjectId,
  publishedUrl,
}: ArticleEditorProps) {
  const [activeFormat, setActiveFormat] = useState('normal');
  const [publishProjectId, setPublishProjectId] = useState(selectedProjectId || '');
  const editorRef = useRef<HTMLDivElement>(null);

  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
  };

  const toolbarButtons = [
    { icon: <Bold className="w-4 h-4" />, command: 'bold', tooltip: 'Negrito' },
    { icon: <Italic className="w-4 h-4" />, command: 'italic', tooltip: 'Itálico' },
    { icon: <Link2 className="w-4 h-4" />, command: 'createLink', tooltip: 'Link', needsValue: true },
    { icon: <Strikethrough className="w-4 h-4" />, command: 'strikeThrough', tooltip: 'Tachado' },
    { icon: <Underline className="w-4 h-4" />, command: 'underline', tooltip: 'Sublinhado' },
    { type: 'separator' },
    { icon: <List className="w-4 h-4" />, command: 'insertUnorderedList', tooltip: 'Lista' },
    { icon: <ListOrdered className="w-4 h-4" />, command: 'insertOrderedList', tooltip: 'Lista Numerada' },
    { icon: <Indent className="w-4 h-4" />, command: 'indent', tooltip: 'Recuar' },
    { icon: <Outdent className="w-4 h-4" />, command: 'outdent', tooltip: 'Desrecuar' },
    { type: 'separator' },
    { icon: <Image className="w-4 h-4" />, command: 'insertImage', tooltip: 'Imagem', needsValue: true },
  ];

  return (
    <div className="h-full flex flex-col animate-fade-in">
      {/* Success Banner */}
      <div className="flex items-center justify-between p-4 border-b bg-green-50 border-green-200 animate-scale-in">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-green-500">
            <Check className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-semibold text-foreground">
              Artigo Gerado com Sucesso!
            </p>
            <p className="text-sm text-muted-foreground">
              {lastSaved ? (
                <>Salvo às {lastSaved.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</>
              ) : (
                <>Seu artigo está pronto para edição e publicação.</>
              )}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Save Button */}
          {onSave && (
            <Button 
              variant="outline"
              onClick={onSave}
              disabled={isSaving}
              className="transition-all duration-200"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Salvar
            </Button>
          )}

          {/* WordPress Project Selector */}
          {projects.length > 0 && (
            <Select value={publishProjectId} onValueChange={setPublishProjectId}>
              <SelectTrigger className="w-48">
                <Globe className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Selecionar site" />
              </SelectTrigger>
              <SelectContent>
                {projects.filter(p => p.is_connected).map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Published URL Link */}
          {publishedUrl && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(publishedUrl, '_blank')}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Ver no Site
            </Button>
          )}

          {/* Publish Button */}
          <Button 
            onClick={() => onPublish(publishProjectId)}
            disabled={isPublishing || !publishProjectId}
            className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
          >
            {isPublishing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            Publicar no WordPress
          </Button>
        </div>
      </div>

      {/* Editor Toolbar */}
      <div className="flex items-center gap-1 p-2 border-b bg-muted/50 overflow-x-auto">
        <Select value={activeFormat} onValueChange={setActiveFormat}>
          <SelectTrigger className="w-32 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="normal">
              <div className="flex items-center gap-2">
                <Type className="w-4 h-4" />
                Normal
              </div>
            </SelectItem>
            <SelectItem value="h1">
              <div className="flex items-center gap-2">
                <Heading2 className="w-4 h-4" />
                Título H1
              </div>
            </SelectItem>
            <SelectItem value="h2">
              <div className="flex items-center gap-2">
                <Heading2 className="w-4 h-4" />
                Título H2
              </div>
            </SelectItem>
            <SelectItem value="h3">
              <div className="flex items-center gap-2">
                <Heading3 className="w-4 h-4" />
                Título H3
              </div>
            </SelectItem>
          </SelectContent>
        </Select>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {toolbarButtons.map((btn, idx) => 
          btn.type === 'separator' ? (
            <Separator key={idx} orientation="vertical" className="h-6 mx-1" />
          ) : (
            <Button
              key={idx}
              variant="ghost"
              size="icon"
              className="h-8 w-8 transition-colors duration-200"
              title={btn.tooltip}
              onClick={() => {
                if (btn.needsValue) {
                  const value = prompt(`Enter ${btn.tooltip}:`);
                  if (value) execCommand(btn.command!, value);
                } else {
                  execCommand(btn.command!);
                }
              }}
            >
              {btn.icon}
            </Button>
          )
        )}

        <div className="flex-1" />
        
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-green-100">
          <Check className="w-4 h-4 text-green-600" />
          <span className="text-sm font-medium text-green-600">
            Pronto
          </span>
        </div>
      </div>

      {/* Article Content */}
      <ScrollArea className="flex-1">
        <div 
          ref={editorRef}
          className="p-8 bg-background"
        >
          <article className="max-w-3xl mx-auto space-y-8">
            {/* Featured Image */}
            {featuredImage && (
              <div className="rounded-lg overflow-hidden border border-border animate-fade-in">
                <img 
                  src={featuredImage} 
                  alt="Featured" 
                  className="w-full h-64 object-cover"
                />
              </div>
            )}

            {/* Title */}
            <h1
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => onTitleChange(e.currentTarget.textContent || '')}
              className="text-3xl font-bold outline-none focus:bg-primary/5 rounded px-2 py-1 -mx-2 text-foreground transition-colors duration-200"
            >
              {title}
            </h1>

            {/* Introduction */}
            <div
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => onIntroChange(e.currentTarget.innerHTML)}
              className="prose prose-lg max-w-none outline-none focus:bg-primary/5 rounded px-2 py-1 -mx-2 text-foreground transition-colors duration-200"
              dangerouslySetInnerHTML={{ __html: intro }}
            />

            {/* Sections */}
            {sections.map((section, index) => (
              <section 
                key={section.id} 
                className="space-y-4 animate-fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {/* Section Header */}
                <div className="flex items-center gap-3">
                  <Badge 
                    variant="secondary"
                    className="uppercase text-[10px] font-bold px-2 bg-primary/10 text-primary"
                  >
                    {section.level}
                  </Badge>
                  {section.level === 'h2' ? (
                    <h2
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(e) => onSectionChange(section.id, 'title', e.currentTarget.textContent || '')}
                      className="text-2xl font-bold outline-none focus:bg-primary/5 rounded px-2 py-1 -mx-2 flex-1 text-foreground transition-colors duration-200"
                    >
                      {section.title}
                    </h2>
                  ) : (
                    <h3
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(e) => onSectionChange(section.id, 'title', e.currentTarget.textContent || '')}
                      className="text-xl font-semibold outline-none focus:bg-primary/5 rounded px-2 py-1 -mx-2 flex-1 text-foreground transition-colors duration-200"
                    >
                      {section.title}
                    </h3>
                  )}
                </div>

                {/* Section Image */}
                {section.image && (
                  <div className="rounded-lg overflow-hidden border border-border">
                    <img 
                      src={section.image} 
                      alt={section.title}
                      className="w-full h-48 object-cover"
                    />
                  </div>
                )}

                {/* Section Content */}
                <div
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => onSectionChange(section.id, 'content', e.currentTarget.innerHTML)}
                  className="prose prose-lg max-w-none outline-none focus:bg-primary/5 rounded px-2 py-1 -mx-2 text-foreground transition-colors duration-200"
                  dangerouslySetInnerHTML={{ __html: section.content }}
                />
              </section>
            ))}
          </article>
        </div>
      </ScrollArea>
    </div>
  );
}

// Helper type for article data
export interface ArticleData {
  title: string;
  intro: string;
  sections: ArticleSection[];
  featuredImage?: string;
}

// Default empty article
export const defaultArticleData: ArticleData = {
  title: '',
  intro: '<p>Introdução do seu artigo...</p>',
  sections: [],
  featuredImage: undefined,
};
