// Types for bulk generation configuration - shared between components and hooks
export interface BulkGenerationConfig {
  // Content size
  contentLength: 'short' | 'medium' | 'long' | 'very-long';
  
  // Audience & Geographic
  geographicReach: string;
  audienceType: string;
  targetAudience: string;
  painPoints: string;
  ctaObjective: string;
  
  // Company data (optional)
  companyName: string;
  companyPhone: string;
  companyAddress: string;
  additionalInfo: string;
  
  // Content structure
  metaDescription: boolean;
  lists: boolean;
  tables: boolean;
  conclusion: boolean;
  faq: boolean;
  faqCount: number;
  
  // Internal linking
  internalLinking: boolean;
  projectId: string;
  
  // AI Model
  aiModel: string;
  
  // Advanced settings
  seoOptimization: boolean;
  realtimeData: boolean;
  humanizeContent: boolean;
  generateImages: boolean;
  imageCount: number;
  imageStyle: string;
  
  // Tone & Voice
  tone: string;
  pointOfView: string;
  language: string;
}

export const defaultBulkConfig: BulkGenerationConfig = {
  contentLength: 'long',
  geographicReach: '',
  audienceType: 'geral',
  targetAudience: '',
  painPoints: '',
  ctaObjective: '',
  companyName: '',
  companyPhone: '',
  companyAddress: '',
  additionalInfo: '',
  metaDescription: true,
  lists: true,
  tables: false,
  conclusion: true,
  faq: true,
  faqCount: 5,
  internalLinking: false,
  projectId: '',
  aiModel: 'standard',
  seoOptimization: true,
  realtimeData: false,
  humanizeContent: false,
  generateImages: false,
  imageCount: 2,
  imageStyle: 'fotorrealístico',
  tone: 'profissional',
  pointOfView: 'terceira-singular',
  language: 'pt-BR',
};
