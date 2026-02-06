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
}: ArticleTypeCardProps) {
  const iconStyles = {
    primary: 'bg-blue-100 text-blue-600',
    accent: 'bg-orange-100 text-orange-600',
    default: 'bg-muted text-muted-foreground',
  };

  const buttonStyles = {
    primary: 'bg-primary hover:bg-primary/90 text-primary-foreground',
    accent: 'bg-orange-500 hover:bg-orange-600 text-white',
    default: 'bg-foreground text-background hover:bg-foreground/90',
  };

  const badgeStyles = {
    premium: 'bg-amber-100 text-amber-700 border-amber-200',
    beta: 'bg-purple-100 text-purple-700 border-purple-200',
    new: 'bg-orange-100 text-orange-700 border-orange-200',
    unlimited: 'bg-blue-100 text-blue-700 border-blue-200',
  };

  return (
    <Card className={cn(
      'group relative border shadow-sm transition-all duration-300',
      'hover:shadow-md hover:-translate-y-0.5',
      comingSoon && 'opacity-60 pointer-events-none'
    )}>
      <CardContent className="p-6">
        {/* Header with Icon and Badges */}
        <div className="flex items-start justify-between mb-4">
          <div 
            className={cn(
              'w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110',
              iconStyles[variant]
            )}
            style={iconColor ? { backgroundColor: `${iconColor}15`, color: iconColor } : undefined}
          >
            <Icon className="w-6 h-6" />
          </div>
          {badges && badges.length > 0 && (
            <div className="flex gap-1.5">
              {badges.map((badge) => (
                <Badge
                  key={badge.label}
                  variant="outline"
                  className={cn('text-[10px] px-2 py-0.5 font-medium', badgeStyles[badge.variant])}
                >
                  {badge.label}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Title and Subtitle */}
        <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
        {subtitle && (
          <p className="text-xs text-muted-foreground mb-2">{subtitle}</p>
        )}
        <p className="text-sm text-muted-foreground mb-4 line-clamp-3">{description}</p>

        {/* Features */}
        <div className="mb-5">
          <p className="text-xs font-medium text-muted-foreground mb-2">Principais recursos</p>
          <div className="flex flex-wrap gap-1.5">
            {features.map((feature) => (
              <Badge 
                key={feature} 
                variant="secondary" 
                className="text-xs font-normal px-2 py-0.5"
              >
                {feature}
              </Badge>
            ))}
          </div>
        </div>

        {/* CTA */}
        {comingSoon ? (
          <div className="text-center py-3">
            <p className="text-sm font-medium text-muted-foreground">Em breve</p>
            <p className="text-xs text-muted-foreground">Estamos trabalhando nesta funcionalidade</p>
          </div>
        ) : (
          <Button asChild className={cn('w-full gap-2', buttonStyles[variant])}>
            <Link to={href}>
              Criar agora
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
    <Card className="border shadow-sm col-span-full lg:col-span-2">
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
            <Folder className="w-6 h-6 text-purple-600" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-semibold text-foreground">Modelos de Artigo</h3>
              <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200 text-[10px]">
                Popular
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Configure suas preferências uma vez, reutilize sempre. Crie e gerencie modelos personalizados 
              com suas configurações preferidas. Economize tempo reutilizando configurações de SEO, tamanho, 
              tom de voz e muito mais.
            </p>
            <div className="flex flex-wrap gap-3 mb-4">
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                Configurações salvas
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Zap className="w-4 h-4 text-amber-500" />
                Reutilização rápida
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Settings className="w-4 h-4 text-blue-500" />
                Templates personalizados
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Sparkles className="w-4 h-4 text-purple-500" />
                Padrões inteligentes
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-5">
              <Badge variant="secondary" className="text-xs">Gestão Simples</Badge>
              <Badge variant="secondary" className="text-xs">Modelos Ilimitados</Badge>
              <Badge variant="secondary" className="text-xs">Sempre Disponível</Badge>
            </div>
          </div>
          <div className="hidden md:flex flex-col gap-2 min-w-[200px]">
            <p className="text-sm font-medium text-foreground mb-1">Gerencie seus modelos</p>
            <p className="text-xs text-muted-foreground mb-3">Acesse e organize todos os seus templates.</p>
            <Button variant="default" className="w-full gap-2 bg-orange-500 hover:bg-orange-600 text-white">
              <Sparkles className="w-4 h-4" />
              Acessar Modelos
            </Button>
            <Button variant="outline" className="w-full gap-2">
              <Folder className="w-4 h-4" />
              Criar com Modelo
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-4 flex items-center gap-1.5 bg-muted/50 rounded-lg p-3">
          <Sparkles className="w-4 h-4 text-purple-500" />
          <strong>Dica:</strong> Seus modelos salvos aparecerão automaticamente no formulário de criação de artigos.
        </p>
      </CardContent>
    </Card>
  );
}

export default function ArticleTypeSelection() {
  const articleTypes: ArticleTypeCardProps[] = [
    {
      title: 'Artigo de Blog',
      subtitle: 'Conteúdo educacional de qualidade',
      description: 'Crie postagens de blog envolventes e informativas para o seu público. Perfeito para storytelling, tutoriais e conteúdo de liderança de pensamento.',
      icon: FileText,
      features: ['Otimizado para SEO', 'Múltiplos Formatos', 'Imagens Automáticas'],
      href: '/articles/new',
      variant: 'primary',
    },
    {
      title: 'Página de Vendas',
      subtitle: 'Domine o Google Local',
      description: 'Especial para prestadores de serviço e ofertas. Crie páginas que unem SEO Geográfico com roteiros de vendas focados na dor do cliente para gerar leads qualificados.',
      icon: Target,
      features: ['SEO Local Avançado', 'Foco em Leads', 'Copy Persuasiva'],
      href: '/landing-page/new',
      variant: 'accent',
      badges: [{ label: 'Alta Conversão', variant: 'premium' }],
    },
    {
      title: 'Artigos em Massa',
      subtitle: 'Escala Global',
      description: 'Gere múltiplos artigos de uma vez para escalar sua produção de conteúdo. Ideal para campanhas de marketing de conteúdo e estratégias de SEO.',
      icon: Layers,
      features: ['Processamento em Lote', 'Baseado em Modelos', 'Economia de Tempo'],
      href: '/bulk-generator',
      variant: 'default',
    },
    {
      title: 'Reviews de Produto',
      subtitle: 'Análises detalhadas e confiáveis',
      description: 'Análises completas e imparciais de produtos, destacando prós, contras e recomendações para ajudar seu público a tomar decisões informadas.',
      icon: Star,
      features: ['Análise Técnica', 'Comparativo', 'Pontuação'],
      href: '/articles/new/review',
      variant: 'default',
      comingSoon: true,
    },
    {
      title: 'Artigos de Notícia',
      subtitle: 'Conteúdo sempre atualizado',
      description: 'Crie notícias atualizadas e relevantes sobre temas de interesse do seu público-alvo.',
      icon: Zap,
      features: ['Trending Topics', 'Fact Check', 'Atualização Automática'],
      href: '/news-rewriter',
      variant: 'default',
      badges: [{ label: 'NOVO', variant: 'new' }],
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

      {/* Cards Grid - Top Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
        {articleTypes.slice(0, 3).map((type) => (
          <ArticleTypeCard key={type.title} {...type} />
        ))}
      </div>

      {/* Cards Grid - Second Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {articleTypes.slice(3).map((type) => (
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
