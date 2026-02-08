// Types for bulk generation configuration - shared between components and hooks
export interface BulkGenerationConfig {
  // Content size - standardized across all generators
  contentLength: 'muito_pequeno' | 'pequeno' | 'medio' | 'grande';
  
  // Advanced SEO fields (new)
  segment: 'legal' | 'health' | 'fintech' | 'ecommerce' | 'b2b-saas' | 'education' | 'general';
  contentType: 'how-to' | 'listicle' | 'pillar' | 'comparative' | 'opinion' | 'news' | 'guide';
  goal: 'inform' | 'convert' | 'educate' | 'engage' | 'establish-authority';
  intentType: 'informational' | 'navigational' | 'transactional' | 'commercial';
  
  // Audience & Geographic
  geographicReach: string;
  audienceType: string;
  targetAudience: string;
  painPoints: string;
  ctaObjective: string;
  
  // Company data (optional - cited strategically in all content)
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
  contentLength: 'medio',
  // Advanced SEO defaults
  segment: 'general',
  contentType: 'how-to',
  goal: 'inform',
  intentType: 'informational',
  // Audience & Geographic
  geographicReach: '',
  audienceType: 'geral',
  targetAudience: '',
  painPoints: '',
  ctaObjective: '',
  // Company data
  companyName: '',
  companyPhone: '',
  companyAddress: '',
  additionalInfo: '',
  // Content structure
  metaDescription: true,
  lists: true,
  tables: true, // Always include tables for better SEO
  conclusion: true,
  faq: true,
  faqCount: 5,
  // Internal linking
  internalLinking: false,
  projectId: '',
  // AI Model
  aiModel: 'standard',
  // Advanced settings - optimized defaults
  seoOptimization: true,
  realtimeData: false,
  humanizeContent: true, // Always humanize by default
  generateImages: true, // Always generate images
  imageCount: 1,
  imageStyle: 'fotorrealístico',
  // Tone & Voice
  tone: 'profissional',
  pointOfView: 'terceira-singular',
  language: 'pt-BR',
};
