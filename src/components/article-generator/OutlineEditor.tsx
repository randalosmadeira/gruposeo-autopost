import { useState } from 'react';
import { 
  GripVertical, 
  Pencil, 
  Trash2, 
  Plus,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface OutlineSection {
  id: string;
  title: string;
  level: 'h2' | 'h3';
  order: number;
}

interface OutlineEditorProps {
  sections: OutlineSection[];
  onSectionsChange: (sections: OutlineSection[]) => void;
  onGenerate: () => void;
  onReset: () => void;
  isGenerating: boolean;
  totalCredits: number;
}

const colors = {
  primary: '#4169E1',
  textPrimary: '#1A1A1A',
  textSecondary: '#666666',
  border: '#E0E0E0',
  background: '#FFFFFF',
  backgroundSecondary: '#F5F7FA',
  lightBlue: '#E3F2FD',
};

export function OutlineEditor({
  sections,
  onSectionsChange,
  onGenerate,
  onReset,
  isGenerating,
  totalCredits,
}: OutlineEditorProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const handleEditStart = (section: OutlineSection) => {
    setEditingId(section.id);
    setEditValue(section.title);
  };

  const handleEditSave = () => {
    if (editingId && editValue.trim()) {
      onSectionsChange(
        sections.map((s) =>
          s.id === editingId ? { ...s, title: editValue.trim() } : s
        )
      );
    }
    setEditingId(null);
    setEditValue('');
  };

  const handleDelete = (id: string) => {
    onSectionsChange(sections.filter((s) => s.id !== id));
  };

  const handleAddSection = () => {
    const newSection: OutlineSection = {
      id: `section-${Date.now()}`,
      title: 'Nova Seção',
      level: 'h2',
      order: sections.length + 1,
    };
    onSectionsChange([...sections, newSection]);
    handleEditStart(newSection);
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;

    const draggedIndex = sections.findIndex((s) => s.id === draggedId);
    const targetIndex = sections.findIndex((s) => s.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const newSections = [...sections];
    const [draggedSection] = newSections.splice(draggedIndex, 1);
    newSections.splice(targetIndex, 0, draggedSection);

    onSectionsChange(
      newSections.map((s, i) => ({ ...s, order: i + 1 }))
    );
  };

  const handleDragEnd = () => {
    setDraggedId(null);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b" style={{ borderColor: colors.border }}>
        <div className="flex items-center gap-3 mb-2">
          <Pencil className="w-5 h-5" style={{ color: colors.primary }} />
          <h2 className="text-lg font-semibold" style={{ color: colors.textPrimary }}>
            Editor de Estrutura de Artigo
          </h2>
        </div>
        <p className="text-sm" style={{ color: colors.textSecondary }}>
          Arraste seções e clique em elementos para editar a estrutura
        </p>
      </div>

      {/* Sections List */}
      <div className="flex-1 overflow-auto p-6">
        <div className="space-y-3">
          {sections.map((section, index) => (
            <div
              key={section.id}
              draggable={editingId !== section.id}
              onDragStart={(e) => handleDragStart(e, section.id)}
              onDragOver={(e) => handleDragOver(e, section.id)}
              onDragEnd={handleDragEnd}
              className={cn(
                'group flex items-center gap-3 p-4 rounded-lg border transition-all',
                draggedId === section.id && 'opacity-50',
                'hover:border-blue-200 hover:shadow-sm cursor-grab active:cursor-grabbing'
              )}
              style={{ 
                borderColor: colors.border,
                backgroundColor: colors.background
              }}
            >
              {/* Drag Handle */}
              <div 
                className="flex-shrink-0 cursor-grab active:cursor-grabbing"
                style={{ color: colors.textSecondary }}
              >
                <GripVertical className="w-5 h-5" />
              </div>

              {/* Level Badge */}
              <Badge 
                variant="secondary"
                className="flex-shrink-0 uppercase text-[10px] font-bold px-2"
                style={{ 
                  backgroundColor: colors.lightBlue,
                  color: colors.primary 
                }}
              >
                {section.level}
              </Badge>

              {/* Section Content */}
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <span 
                  className="font-medium text-sm flex-shrink-0"
                  style={{ color: colors.textSecondary }}
                >
                  {index + 1}.
                </span>
                
                {editingId === section.id ? (
                  <Input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={handleEditSave}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleEditSave();
                      if (e.key === 'Escape') {
                        setEditingId(null);
                        setEditValue('');
                      }
                    }}
                    autoFocus
                    className="h-8 text-sm"
                  />
                ) : (
                  <span 
                    className="text-sm font-medium truncate cursor-text"
                    style={{ color: colors.textPrimary }}
                    onClick={() => handleEditStart(section)}
                  >
                    {section.title}
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleEditStart(section)}
                >
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-red-50 hover:text-red-600"
                  onClick={() => handleDelete(section.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}

          {/* Add Section Button */}
          <button
            onClick={handleAddSection}
            className="w-full p-4 rounded-lg border-2 border-dashed flex items-center justify-center gap-2 transition-all hover:border-blue-300 hover:bg-blue-50/50"
            style={{ borderColor: colors.border, color: colors.textSecondary }}
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm font-medium">Adicionar Nova Seção</span>
          </button>
        </div>
      </div>

      {/* Action Buttons */}
      <div 
        className="p-4 border-t space-y-2"
        style={{ borderColor: colors.border, backgroundColor: colors.background }}
      >
        <Button
          onClick={onGenerate}
          disabled={isGenerating || sections.length === 0}
          className="w-full h-12 text-base"
          style={{ backgroundColor: colors.primary }}
        >
          <Sparkles className="w-5 h-5 mr-2" />
          Gerar Artigo Completo ({totalCredits} {totalCredits === 1 ? 'crédito' : 'créditos'})
        </Button>
        <Button
          onClick={onReset}
          variant="outline"
          className="w-full h-10"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Reiniciar & Começar de Novo
        </Button>
      </div>
    </div>
  );
}

// Helper to generate default outline sections based on keyword
export function generateDefaultOutline(keyword: string): OutlineSection[] {
  const sections: OutlineSection[] = [
    { id: 'intro', title: `O que é ${keyword}?`, level: 'h2', order: 1 },
    { id: 'benefits', title: `Benefícios de ${keyword}`, level: 'h2', order: 2 },
    { id: 'how-to', title: `Como usar ${keyword} na prática`, level: 'h2', order: 3 },
    { id: 'tips', title: 'Dicas importantes para iniciantes', level: 'h2', order: 4 },
    { id: 'mistakes', title: 'Erros comuns a evitar', level: 'h2', order: 5 },
    { id: 'tools', title: 'Ferramentas e recursos recomendados', level: 'h2', order: 6 },
    { id: 'future', title: 'Tendências e o futuro', level: 'h2', order: 7 },
  ];
  return sections;
}
