export type ContentStatus = 'scheduled' | 'generating' | 'draft' | 'published' | 'error' | 'ready';

export interface ContentItem {
  id: string;
  title: string;
  type: 'article' | 'news' | 'landing';
  status: ContentStatus;
  date: Date;
  imageUrl?: string | null;
  projectId?: string | null;
  projectName?: string;
  keyword?: string;
  excerpt?: string | null;
}

export type CalendarView = 'month' | 'week' | 'day';

export const statusConfig: Record<ContentStatus, { 
  label: string; 
  color: string; 
  bgColor: string;
  icon: string;
}> = {
  scheduled: { 
    label: 'Agendado', 
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
    icon: 'Clock',
  },
  generating: { 
    label: 'Gerando', 
    color: 'text-amber-700',
    bgColor: 'bg-amber-100',
    icon: 'RefreshCw',
  },
  draft: { 
    label: 'Rascunho', 
    color: 'text-gray-700',
    bgColor: 'bg-gray-100',
    icon: 'FileText',
  },
  ready: { 
    label: 'Pronto', 
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-100',
    icon: 'CheckCircle2',
  },
  published: { 
    label: 'Publicado', 
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    icon: 'CheckCircle2',
  },
  error: { 
    label: 'Erro', 
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    icon: 'AlertCircle',
  },
};

export const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const WEEKDAYS_FULL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
