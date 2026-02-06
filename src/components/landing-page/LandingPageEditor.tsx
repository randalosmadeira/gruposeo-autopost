import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  Target,
  Save,
  Loader2,
  Send,
  Globe,
  Copy,
  ExternalLink,
  CheckCircle,
  Image,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface LandingPageSection {
  id: string;
  title: string;
  content: string;
  type: string;
}

interface LandingPageEditorProps {
  title: string;
  headline: string;
  sections: LandingPageSection[];
  featuredImage?: string;
  onTitleChange: (title: string) => void;
  onHeadlineChange: (headline: string) => void;
  onSectionChange: (id: string, field: 'title' | 'content', value: string) => void;
  onPublish: (projectId: string) => Promise<void>;
  onSave: () => void;
  isPublishing: boolean;
  isSaving: boolean;
  lastSaved: Date | null;
  projects: Array<{ id: string; name: string; is_connected: boolean }>;
  selectedProjectId?: string;
  publishedUrl?: string;
}

const colors = {
  primary: '#FF6B2B',
  textPrimary: '#1A1A1A',
  textSecondary: '#666666',
  border: '#E0E0E0',
  background: '#FFFFFF',
  backgroundSecondary: '#F5F7FA',
  lightOrange: '#FFF7ED',
  success: '#22C55E',
};

export function LandingPageEditor({
  title,
  headline,
  sections,
  featuredImage,
  onTitleChange,
  onHeadlineChange,
  onSectionChange,
  onPublish,
  onSave,
  isPublishing,
  isSaving,
  lastSaved,
  projects,
  selectedProjectId,
  publishedUrl,
}: LandingPageEditorProps) {
  const [selectedProject, setSelectedProject] = useState(selectedProjectId || '');
  const [copiedUrl, setCopiedUrl] = useState(false);

  const connectedProjects = projects.filter((p) => p.is_connected);

  const handleCopyUrl = () => {
    if (publishedUrl) {
      navigator.clipboard.writeText(publishedUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  const handlePublish = async () => {
    if (selectedProject) {
      await onPublish(selectedProject);
    }
  };

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: colors.background }}>
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: colors.border }}>
        <div className="flex items-center gap-3">
          <Target className="w-5 h-5" style={{ color: colors.primary }} />
          <div>
            <h2 className="font-semibold" style={{ color: colors.textPrimary }}>
              Editor de Landing Page
            </h2>
            <p className="text-xs" style={{ color: colors.textSecondary }}>
              {lastSaved 
                ? `Salvo às ${lastSaved.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                : 'Não salvo'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1" />
            ) : (
              <Save className="w-4 h-4 mr-1" />
            )}
            Salvar
          </Button>
        </div>
      </div>

      {/* Published URL Banner */}
      {publishedUrl && (
        <div 
          className="px-4 py-3 flex items-center justify-between"
          style={{ backgroundColor: `${colors.success}15`, borderBottom: `1px solid ${colors.success}30` }}
        >
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5" style={{ color: colors.success }} />
            <span className="text-sm font-medium" style={{ color: colors.success }}>
              Landing page publicada com sucesso!
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyUrl}
              className="text-green-600 hover:text-green-700 hover:bg-green-50"
            >
              {copiedUrl ? (
                <CheckCircle className="w-4 h-4 mr-1" />
              ) : (
                <Copy className="w-4 h-4 mr-1" />
              )}
              {copiedUrl ? 'Copiado!' : 'Copiar URL'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="text-green-600 hover:text-green-700 hover:bg-green-50"
            >
              <a href={publishedUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 mr-1" />
                Abrir
              </a>
            </Button>
          </div>
        </div>
      )}

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* Title & Headline */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Título da Página (SEO)</Label>
              <Input
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                placeholder="Título otimizado para SEO"
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Headline Principal</Label>
              <Textarea
                value={headline}
                onChange={(e) => onHeadlineChange(e.target.value)}
                placeholder="A headline principal que aparecerá no topo da página"
                rows={2}
              />
            </div>
          </div>

          {/* Featured Image */}
          {featuredImage ? (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Imagem Destacada</Label>
              <div className="relative rounded-lg overflow-hidden border" style={{ borderColor: colors.border }}>
                <img 
                  src={featuredImage} 
                  alt="Featured" 
                  className="w-full h-48 object-cover"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  className="absolute bottom-2 right-2"
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Trocar Imagem
                </Button>
              </div>
            </div>
          ) : (
            <div 
              className="p-8 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-3"
              style={{ borderColor: colors.border }}
            >
              <Image className="w-8 h-8" style={{ color: colors.textSecondary }} />
              <p className="text-sm" style={{ color: colors.textSecondary }}>
                Nenhuma imagem destacada
              </p>
              <Button variant="outline" size="sm">
                Adicionar Imagem
              </Button>
            </div>
          )}

          {/* Sections */}
          <div className="space-y-4">
            <Label className="text-sm font-medium">Seções do Conteúdo</Label>
            {sections.map((section, index) => (
              <div 
                key={section.id}
                className="p-4 rounded-lg border space-y-3"
                style={{ borderColor: colors.border }}
              >
                <div className="flex items-center gap-3">
                  <Badge 
                    variant="secondary"
                    className="uppercase text-[10px] font-bold"
                    style={{ backgroundColor: colors.lightOrange, color: colors.primary }}
                  >
                    Seção {index + 1}
                  </Badge>
                  <Input
                    value={section.title}
                    onChange={(e) => onSectionChange(section.id, 'title', e.target.value)}
                    className="h-9 font-medium"
                    placeholder="Título da seção"
                  />
                </div>
                <Textarea
                  value={section.content}
                  onChange={(e) => onSectionChange(section.id, 'content', e.target.value)}
                  placeholder="Conteúdo da seção..."
                  rows={4}
                  className="text-sm"
                />
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>

      {/* Publishing Footer */}
      <div 
        className="p-4 border-t space-y-3"
        style={{ borderColor: colors.border, backgroundColor: colors.backgroundSecondary }}
      >
        <div className="flex items-center gap-3">
          <Globe className="w-5 h-5" style={{ color: colors.primary }} />
          <Select value={selectedProject} onValueChange={setSelectedProject}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Selecione um projeto para publicar" />
            </SelectTrigger>
            <SelectContent>
              {connectedProjects.length === 0 ? (
                <SelectItem value="none" disabled>
                  Nenhum projeto conectado
                </SelectItem>
              ) : (
                connectedProjects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={handlePublish}
          disabled={isPublishing || !selectedProject}
          className="w-full h-12 text-base font-semibold bg-orange-500 hover:bg-orange-600"
        >
          {isPublishing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Publicando...
            </>
          ) : (
            <>
              <Send className="w-5 h-5 mr-2" />
              Publicar no WordPress
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
