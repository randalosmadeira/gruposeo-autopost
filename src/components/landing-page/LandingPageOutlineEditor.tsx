import { useState } from 'react';
import { 
  GripVertical, 
  Pencil, 
  Trash2, 
  Plus,
  Sparkles,
  RefreshCw,
  Target
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export interface LandingPageSection {
  id: string;
  title: string;
  type: 'hero' | 'problem' | 'solution' | 'benefits' | 'features' | 'testimonials' | 'pricing' | 'faq' | 'cta' | 'custom';
  order: number;
}

interface LandingPageOutlineEditorProps {
  sections: LandingPageSection[];
  onSectionsChange: (sections: LandingPageSection[]) => void;
  onGenerate: () => void;
  onReset: () => void;
  isGenerating: boolean;
  totalCredits: number;
}

const colors = {
  primary: '#FF6B2B',
  textPrimary: '#1A1A1A',
  textSecondary: '#666666',
  border: '#E0E0E0',
  background: '#FFFFFF',
  backgroundSecondary: '#F5F7FA',
  lightOrange: '#FFF7ED',
};

const sectionTypeLabels: Record<LandingPageSection['type'], string> = {
  hero: 'Hero',
  problem: 'Problema',
  solution: 'Solução',
  benefits: 'Benefícios',
  features: 'Features',
  testimonials: 'Depoimentos',
  pricing: 'Preço',
  faq: 'FAQ',
  cta: 'CTA',
  custom: 'Custom',
};

// Sortable Section Item Component
function SortableSectionItem({
  section,
  index,
  editingId,
  editValue,
  onEditStart,
  onEditChange,
  onEditSave,
  onEditCancel,
  onDelete,
}: {
  section: LandingPageSection;
  index: number;
  editingId: string | null;
  editValue: string;
  onEditStart: (section: LandingPageSection) => void;
  onEditChange: (value: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onDelete: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 200ms cubic-bezier(0.25, 1, 0.5, 1)',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex items-center gap-3 p-4 rounded-lg border transition-all duration-200',
        isDragging && 'opacity-50 shadow-lg scale-[1.02] z-50',
        'hover:border-orange-200 hover:shadow-sm'
      )}
      {...attributes}
    >
      {/* Drag Handle */}
      <div 
        className="flex-shrink-0 cursor-grab active:cursor-grabbing touch-none"
        style={{ color: colors.textSecondary }}
        {...listeners}
      >
        <GripVertical className="w-5 h-5" />
      </div>

      {/* Type Badge */}
      <Badge 
        variant="secondary"
        className="flex-shrink-0 uppercase text-[10px] font-bold px-2"
        style={{ 
          backgroundColor: colors.lightOrange,
          color: colors.primary 
        }}
      >
        {sectionTypeLabels[section.type]}
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
            onChange={(e) => onEditChange(e.target.value)}
            onBlur={onEditSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onEditSave();
              if (e.key === 'Escape') onEditCancel();
            }}
            autoFocus
            className="h-8 text-sm transition-all duration-200"
          />
        ) : (
          <span 
            className="text-sm font-medium truncate cursor-text hover:text-orange-600 transition-colors duration-200"
            style={{ color: colors.textPrimary }}
            onClick={() => onEditStart(section)}
          >
            {section.title}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 transition-colors duration-200"
          onClick={() => onEditStart(section)}
        >
          <Pencil className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 hover:bg-red-50 hover:text-red-600 transition-colors duration-200"
          onClick={() => onDelete(section.id)}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// Drag Overlay Item
function DragOverlayItem({ section, index }: { section: LandingPageSection; index: number }) {
  return (
    <div
      className="flex items-center gap-3 p-4 rounded-lg border bg-white shadow-xl"
      style={{ borderColor: colors.primary }}
    >
      <div style={{ color: colors.textSecondary }}>
        <GripVertical className="w-5 h-5" />
      </div>
      <Badge 
        variant="secondary"
        className="flex-shrink-0 uppercase text-[10px] font-bold px-2"
        style={{ 
          backgroundColor: colors.lightOrange,
          color: colors.primary 
        }}
      >
        {sectionTypeLabels[section.type]}
      </Badge>
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span 
          className="font-medium text-sm flex-shrink-0"
          style={{ color: colors.textSecondary }}
        >
          {index + 1}.
        </span>
        <span 
          className="text-sm font-medium truncate"
          style={{ color: colors.textPrimary }}
        >
          {section.title}
        </span>
      </div>
    </div>
  );
}

export function LandingPageOutlineEditor({
  sections,
  onSectionsChange,
  onGenerate,
  onReset,
  isGenerating,
  totalCredits,
}: LandingPageOutlineEditorProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleEditStart = (section: LandingPageSection) => {
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

  const handleEditCancel = () => {
    setEditingId(null);
    setEditValue('');
  };

  const handleDelete = (id: string) => {
    onSectionsChange(sections.filter((s) => s.id !== id));
  };

  const handleAddSection = () => {
    const newSection: LandingPageSection = {
      id: `section-${Date.now()}`,
      title: 'Nova Seção',
      type: 'custom',
      order: sections.length + 1,
    };
    onSectionsChange([...sections, newSection]);
    handleEditStart(newSection);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      const oldIndex = sections.findIndex((s) => s.id === active.id);
      const newIndex = sections.findIndex((s) => s.id === over.id);

      const newSections = arrayMove(sections, oldIndex, newIndex).map((s, i) => ({
        ...s,
        order: i + 1,
      }));

      onSectionsChange(newSections);
    }
  };

  const activeSection = activeId ? sections.find((s) => s.id === activeId) : null;
  const activeSectionIndex = activeId ? sections.findIndex((s) => s.id === activeId) : -1;

  return (
    <div className="h-full flex flex-col animate-fade-in">
      {/* Header */}
      <div className="p-6 border-b" style={{ borderColor: colors.border }}>
        <div className="flex items-center gap-3 mb-2">
          <Target className="w-5 h-5" style={{ color: colors.primary }} />
          <h2 className="text-lg font-semibold" style={{ color: colors.textPrimary }}>
            Editor de Estrutura da Landing Page
          </h2>
        </div>
        <p className="text-sm" style={{ color: colors.textSecondary }}>
          Arraste seções e clique em elementos para editar a estrutura
        </p>
      </div>

      {/* Sections List with DnD */}
      <div className="flex-1 overflow-auto p-6">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sections.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {sections.map((section, index) => (
                <SortableSectionItem
                  key={section.id}
                  section={section}
                  index={index}
                  editingId={editingId}
                  editValue={editValue}
                  onEditStart={handleEditStart}
                  onEditChange={setEditValue}
                  onEditSave={handleEditSave}
                  onEditCancel={handleEditCancel}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </SortableContext>

          {/* Drag Overlay */}
          <DragOverlay>
            {activeSection && (
              <DragOverlayItem section={activeSection} index={activeSectionIndex} />
            )}
          </DragOverlay>
        </DndContext>

        {/* Add Section Button */}
        <button
          onClick={handleAddSection}
          className="w-full p-4 mt-3 rounded-lg border-2 border-dashed flex items-center justify-center gap-2 transition-all duration-200 hover:border-orange-300 hover:bg-orange-50/50 hover:scale-[1.01]"
          style={{ borderColor: colors.border, color: colors.textSecondary }}
        >
          <Plus className="w-4 h-4" />
          <span className="text-sm font-medium">Adicionar Nova Seção</span>
        </button>
      </div>

      {/* Action Buttons */}
      <div 
        className="p-4 border-t space-y-2"
        style={{ borderColor: colors.border, backgroundColor: colors.background }}
      >
        <Button
          onClick={onGenerate}
          disabled={isGenerating || sections.length === 0}
          className="w-full h-12 text-base transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg bg-orange-500 hover:bg-orange-600"
        >
          <Sparkles className="w-5 h-5 mr-2" />
          Gerar Landing Page Completa ({totalCredits} {totalCredits === 1 ? 'crédito' : 'créditos'})
        </Button>
        <Button
          onClick={onReset}
          variant="outline"
          className="w-full h-10 transition-all duration-200 hover:bg-gray-50"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Reiniciar & Começar de Novo
        </Button>
      </div>
    </div>
  );
}

// Helper to generate default landing page outline based on config
export function generateLandingPageOutline(config: { 
  keyword: string; 
  offerType: string; 
  ctaObjective: string;
  faq: boolean;
}): LandingPageSection[] {
  const sections: LandingPageSection[] = [
    { id: 'hero', title: `${config.keyword} - Headline Principal`, type: 'hero', order: 1 },
    { id: 'problem', title: 'O Problema que Você Enfrenta', type: 'problem', order: 2 },
    { id: 'solution', title: `Nossa Solução: ${config.offerType}`, type: 'solution', order: 3 },
    { id: 'benefits', title: 'Principais Benefícios', type: 'benefits', order: 4 },
    { id: 'features', title: 'Como Funciona', type: 'features', order: 5 },
    { id: 'testimonials', title: 'O que Nossos Clientes Dizem', type: 'testimonials', order: 6 },
    { id: 'pricing', title: 'Investimento', type: 'pricing', order: 7 },
  ];

  if (config.faq) {
    sections.push({ id: 'faq', title: 'Perguntas Frequentes', type: 'faq', order: 8 });
  }

  sections.push({ 
    id: 'cta', 
    title: config.ctaObjective || 'Call to Action Final', 
    type: 'cta', 
    order: sections.length + 1 
  });

  return sections;
}
