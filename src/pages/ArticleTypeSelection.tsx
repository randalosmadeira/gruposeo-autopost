import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  FileText,
  Target,
  Layers,
  Star,
  Trophy,
  Zap,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Settings,
  Folder,
} from 'lucide-react';

interface ArticleTypeCardProps {
  title: string;
  subtitle?: string;
  description: string;
  icon: React.ElementType;
  features: string[];
  href: string;
  variant: 'primary' | 'accent' | 'default';
  badges?: { label: string; variant: 'premium' | 'beta' | 'new' | 'unlimited' }[];
  comingSoon?: boolean;
  iconColor?: string;
  iconBgColor?: string;
}

function ArticleTypeCard({
  title,
  subtitle,
  description,
  icon: Icon,
  features,
  href,
  variant,
  badges,
  comingSoon,
  iconColor,
  iconBgColor,
}: ArticleTypeCardProps) {
  const defaultIconStyles = {
    primary: { bg: '#EBF5FF', color: '#2563EB' },
    accent: { bg: '#FFF7ED', color: '#EA580C' },
    default: { bg: '#F3F4F6', color: '#6B7280' },
  };

  const buttonStyles = {
    primary: 'bg-primary hover:bg-primary/90 text-primary-foreground',
    accent: 'bg-[hsl(30,100%,50%)] hover:bg-[hsl(30,100%,45%)] text-white',
    default: 'bg-foreground text-background hover:bg-foreground/90',
  };

  const currentIconBg = iconBgColor || defaultIconStyles[variant].bg;
  const currentIconColor = iconColor || defaultIconStyles[variant].color;

  return (
    <Card className={cn(
      'group relative border shadow-sm transition-all duration-300 bg-white',
      'hover:shadow-lg hover:-translate-y-1',
      comingSoon && 'opacity-60 pointer-events-none'
    )}>
      <CardContent className="p-6">
        {/* Icon */}
        <div 
          className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110"
          style={{ backgroundColor: currentIconBg }}
        >
          <Icon className="w-6 h-6" style={{ color: currentIconColor }} />
        </div>

        {/* Title */}
        <h3 className="text-lg font-bold text-foreground mb-2">{title}</h3>
        
        {/* Description */}
        <p className="text-sm text-muted-foreground mb-5 leading-relaxed">{description}</p>

        {/* Features with checkmarks */}
        <div className="space-y-2 mb-6">
          {features.map((feature) => (
            <div key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
              <span>{feature}</span>
            </div>
          ))}
        </div>

        {/* CTA Button */}
        {comingSoon ? (
          <div className="text-center py-3">
            <p className="text-sm font-medium text-muted-foreground">Em breve</p>
          </div>
        ) : (
          <Button asChild className={cn('w-full gap-2 h-11 font-medium', buttonStyles[variant])}>
            <Link to={href}>
              Começar Agora
              <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function TemplatesCard() {
  return (
    <Card className="border shadow-sm bg-white">
      <CardContent className="p-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left side - Icon and Content */}
          <div className="flex-1">
            <div className="flex items-start gap-4 mb-4">
              <div 
                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: '#FEF3C7' }}
              >
                <Folder className="w-6 h-6" style={{ color: '#D97706' }} />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-lg font-bold text-foreground">Modelos de Artigo</h3>
                  <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px] px-2 py-0.5">
                    Popular
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Configure suas preferências uma vez, reutilize sempre
                </p>
              </div>
            </div>
            
            <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
              Crie e gerencie modelos personalizados com suas configurações preferidas. 
              Economize tempo reutilizando configurações de SEO, tamanho, tom de voz e muito mais.
            </p>

            {/* Features Grid */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                Configurações salvas
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Zap className="w-4 h-4 text-amber-500 flex-shrink-0" />
                Reutilização rápida
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Settings className="w-4 h-4 text-blue-500 flex-shrink-0" />
                Templates personalizados
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="w-4 h-4 text-purple-500 flex-shrink-0" />
                Padrões inteligentes
              </div>
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="text-xs bg-muted">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Gestão Simples
              </Badge>
              <Badge variant="secondary" className="text-xs bg-muted">
                <Settings className="w-3 h-3 mr-1" />
                Modelos Ilimitados
              </Badge>
              <Badge variant="secondary" className="text-xs bg-muted">
                <Zap className="w-3 h-3 mr-1" />
                Sempre Disponível
              </Badge>
            </div>
          </div>

          {/* Right side - Actions */}
          <div className="lg:w-[280px] flex flex-col justify-center">
            <div className="p-5 bg-muted/30 rounded-xl border border-border/50">
              <p className="font-semibold text-foreground mb-1">Gerencie seus modelos</p>
              <p className="text-xs text-muted-foreground mb-4">Acesse e organize todos os seus templates.</p>
              
              <div className="space-y-2">
                <Button 
                  asChild
                  className="w-full gap-2 h-11 bg-[hsl(30,100%,50%)] hover:bg-[hsl(30,100%,45%)] text-white font-medium"
                >
                  <Link to="/settings?tab=templates">
                    <Sparkles className="w-4 h-4" />
                    Acessar Modelos
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
                <Button 
                  asChild
                  variant="outline" 
                  className="w-full gap-2 h-11 font-medium"
                >
                  <Link to="/articles/new?useTemplate=true">
                    <Folder className="w-4 h-4" />
                    Criar com Modelo
                  </Link>
                </Button>
              </div>
            </div>

            {/* Tip */}
            <div className="mt-4 p-3 bg-purple-50 rounded-lg border border-purple-100">
              <p className="text-xs text-purple-700 flex items-start gap-2">
                <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Dica:</strong> Seus modelos salvos aparecerão automaticamente no formulário de criação de artigos.
                </span>
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ArticleTypeSelection() {
  // First row - 3 main article types
  const mainArticleTypes: ArticleTypeCardProps[] = [
    {
      title: 'Artigo de Blog',
      description: 'Crie postagens de blog envolventes e informativas para o seu público. Perfeito para storytelling, tutoriais e conteúdo de liderança de pensamento.',
      icon: FileText,
      features: ['Otimizado para SEO', 'Múltiplos Formatos', 'Imagens Automáticas'],
      href: '/articles/new',
      variant: 'primary',
      iconBgColor: '#EBF5FF',
      iconColor: '#2563EB',
    },
    {
      title: 'Página de Vendas',
      description: 'Gere páginas híbridas que unem a persuasão do copywriting com a força do SEO. Estrutura inteligente focada em dor, agitação e solução para converter visitantes em leads.',
      icon: Target,
      features: ['Copywriting Persuasivo', 'SEO Local e Nacional', 'Foco em Conversão'],
      href: '/landing-page/new',
      variant: 'accent',
      iconBgColor: '#FFF7ED',
      iconColor: '#EA580C',
    },
    {
      title: 'Artigos em Massa',
      description: 'Gere múltiplos artigos de uma vez para escalar sua produção de conteúdo. Ideal para campanhas de marketing de conteúdo e estratégias de SEO.',
      icon: Layers,
      features: ['Processamento em Lote', 'Baseado em Modelos', 'Economia de Tempo'],
      href: '/bulk-generator',
      variant: 'default',
      iconBgColor: '#F3F4F6',
      iconColor: '#6B7280',
    },
  ];

  // Second row - Review and Best Products
  const secondRowTypes: ArticleTypeCardProps[] = [
    {
      title: 'Review de Produto',
      description: 'Gere análises detalhadas de produtos com prós, contras e uma análise abrangente para ajudar seu público a tomar decisões informadas.',
      icon: Star,
      features: ['Tabelas Comparativas', 'Sistema de Avaliação', 'Pronto para Afiliados'],
      href: '/articles/new/review',
      variant: 'default',
      iconBgColor: '#FEF3C7',
      iconColor: '#D97706',
    },
    {
      title: 'Melhores Produtos',
      description: 'Compare e liste os melhores produtos de uma categoria específica.',
      icon: Trophy,
      features: ['Tabelas Comparativas', 'Sistema de Avaliação', 'Pronto para Afiliados'],
      href: '/articles/new/best-products',
      variant: 'accent',
      iconBgColor: '#DCFCE7',
      iconColor: '#16A34A',
    },
  ];

  return (
    <div className="p-6 lg:p-8 bg-muted/30 min-h-screen">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full mb-4">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-primary">Geração de Conteúdo Inteligente</span>
        </div>
        <h1 className="text-3xl lg:text-4xl font-bold text-foreground mb-3">
          Escolha o Tipo de <span className="text-primary">Artigo</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Crie conteúdo otimizado e de alta qualidade em minutos.
          Escolha o formato ideal para sua estratégia de marketing.
        </p>
      </div>

      {/* First Row - 3 Main Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
        {mainArticleTypes.map((type) => (
          <ArticleTypeCard key={type.title} {...type} />
        ))}
      </div>

      {/* Second Row - Review and Melhores Produtos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {secondRowTypes.map((type) => (
          <ArticleTypeCard key={type.title} {...type} />
        ))}
      </div>

      {/* Templates Section */}
      <TemplatesCard />

      {/* Footer Note */}
      <div className="text-center mt-8">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-muted rounded-full">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-sm text-muted-foreground">Todos os recursos estão disponíveis agora</span>
        </div>
      </div>
    </div>
  );
}
