import { useState, useRef } from 'react';
import { 
  Check,
  Upload,
  AlignLeft,
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
  Type
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
import { cn } from '@/lib/utils';

interface ArticleSection {
  id: string;
  title: string;
  content: string;
  level: 'h2' | 'h3';
  image?: string;
}

interface ArticleEditorProps {
  title: string;
  intro: string;
  sections: ArticleSection[];
  featuredImage?: string;
  onTitleChange: (title: string) => void;
  onIntroChange: (intro: string) => void;
  onSectionChange: (id: string, field: 'title' | 'content', value: string) => void;
  onPublish: () => void;
  isPublishing?: boolean;
}

const colors = {
  primary: '#4169E1',
  textPrimary: '#1A1A1A',
  textSecondary: '#666666',
  border: '#E0E0E0',
  success: '#4CAF50',
  background: '#FFFFFF',
  backgroundSecondary: '#F5F7FA',
  lightBlue: '#E3F2FD',
};

export function ArticleEditor({
  title,
  intro,
  sections,
  featuredImage,
  onTitleChange,
  onIntroChange,
  onSectionChange,
  onPublish,
  isPublishing,
}: ArticleEditorProps) {
  const [activeFormat, setActiveFormat] = useState('normal');
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
    <div className="h-full flex flex-col">
      {/* Success Banner */}
      <div 
        className="flex items-center justify-between p-4 border-b"
        style={{ 
          backgroundColor: '#E8F5E9',
          borderColor: '#C8E6C9'
        }}
      >
        <div className="flex items-center gap-3">
          <div 
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: colors.success }}
          >
            <Check className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-semibold" style={{ color: colors.textPrimary }}>
              Artigo Gerado com Sucesso!
            </p>
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              Seu artigo está pronto para edição e publicação.
            </p>
          </div>
        </div>
        <Button 
          onClick={onPublish}
          disabled={isPublishing}
          style={{ backgroundColor: colors.primary }}
        >
          <Upload className="w-4 h-4 mr-2" />
          Publicar
        </Button>
      </div>

      {/* Editor Toolbar */}
      <div 
        className="flex items-center gap-1 p-2 border-b overflow-x-auto"
        style={{ borderColor: colors.border, backgroundColor: colors.backgroundSecondary }}
      >
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
              className="h-8 w-8"
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
        
        <div className="flex items-center gap-2 px-3 py-1 rounded-full" style={{ backgroundColor: '#E8F5E9' }}>
          <Check className="w-4 h-4" style={{ color: colors.success }} />
          <span className="text-sm font-medium" style={{ color: colors.success }}>
            Pronto
          </span>
        </div>
      </div>

      {/* Article Content */}
      <div 
        ref={editorRef}
        className="flex-1 overflow-auto p-8"
        style={{ backgroundColor: colors.background }}
      >
        <article className="max-w-3xl mx-auto space-y-8">
          {/* Featured Image */}
          {featuredImage && (
            <div className="rounded-lg overflow-hidden border" style={{ borderColor: colors.border }}>
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
            className="text-3xl font-bold outline-none focus:bg-blue-50 rounded px-2 py-1 -mx-2"
            style={{ color: colors.textPrimary }}
          >
            {title}
          </h1>

          {/* Introduction */}
          <div
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => onIntroChange(e.currentTarget.innerHTML)}
            className="prose prose-lg max-w-none outline-none focus:bg-blue-50 rounded px-2 py-1 -mx-2"
            style={{ color: colors.textPrimary }}
            dangerouslySetInnerHTML={{ __html: intro }}
          />

          {/* Sections */}
          {sections.map((section) => (
            <section key={section.id} className="space-y-4">
              {/* Section Header */}
              <div className="flex items-center gap-3">
                <Badge 
                  variant="secondary"
                  className="uppercase text-[10px] font-bold px-2"
                  style={{ 
                    backgroundColor: colors.lightBlue,
                    color: colors.primary 
                  }}
                >
                  {section.level}
                </Badge>
                {section.level === 'h2' ? (
                  <h2
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => onSectionChange(section.id, 'title', e.currentTarget.textContent || '')}
                    className="text-2xl font-bold outline-none focus:bg-blue-50 rounded px-2 py-1 -mx-2 flex-1"
                    style={{ color: colors.textPrimary }}
                  >
                    {section.title}
                  </h2>
                ) : (
                  <h3
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => onSectionChange(section.id, 'title', e.currentTarget.textContent || '')}
                    className="text-xl font-semibold outline-none focus:bg-blue-50 rounded px-2 py-1 -mx-2 flex-1"
                    style={{ color: colors.textPrimary }}
                  >
                    {section.title}
                  </h3>
                )}
              </div>

              {/* Section Image */}
              {section.image && (
                <div className="rounded-lg overflow-hidden border" style={{ borderColor: colors.border }}>
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
                className="prose prose-lg max-w-none outline-none focus:bg-blue-50 rounded px-2 py-1 -mx-2"
                style={{ color: colors.textPrimary }}
                dangerouslySetInnerHTML={{ __html: section.content }}
              />
            </section>
          ))}
        </article>
      </div>
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
