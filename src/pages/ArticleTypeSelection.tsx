import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  FileText,
  Building2,
  Star,
  Trophy,
  Layers,
  Zap,
  CheckCircle2,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

interface ArticleTypeCardProps {
  title: string;
  description: string;
  icon: React.ElementType;
  features: string[];
  href: string;
  variant: 'primary' | 'accent' | 'default';
  badges?: { label: string; variant: 'premium' | 'beta' | 'default' }[];
  comingSoon?: boolean;
}

function ArticleTypeCard({
  title,
  description,
  icon: Icon,
  features,
  href,
  variant,
  badges,
  comingSoon,
}: ArticleTypeCardProps) {
  const iconBg = {
    primary: 'bg-primary/10 text-primary',
    accent: 'bg-accent/10 text-accent',
    default: 'bg-muted text-muted-foreground',
  };

  const buttonVariant = {
    primary: 'bg-gradient-primary hover:opacity-90 text-primary-foreground shadow-glow-primary/30',
    accent: 'bg-gradient-accent hover:opacity-90 text-accent-foreground shadow-glow-accent/30',
    default: 'bg-foreground text-background hover:bg-foreground/90',
  };

  return (
    <div className={cn(
      'group relative bg-card rounded-2xl p-6 border border-border shadow-card',
      'transition-all duration-300 hover:shadow-card-hover hover:-translate-y-1',
      comingSoon && 'opacity-60'
    )}>
      {/* Badges */}
      {badges && badges.length > 0 && (
        <div className="flex gap-2 mb-4">
          {badges.map((badge) => (
            <Badge
              key={badge.label}
              className={cn(
                badge.variant === 'premium' && 'bg-premium/10 text-premium',
                badge.variant === 'beta' && 'bg-info/10 text-info',
                badge.variant === 'default' && 'bg-muted text-muted-foreground'
              )}
            >
              {badge.variant === 'premium' && <Star className="w-3 h-3 mr-1" />}
              {badge.variant === 'beta' && <Sparkles className="w-3 h-3 mr-1" />}
              {badge.label}
            </Badge>
          ))}
        </div>
      )}

      {/* Icon */}
      <div className={cn(
        'flex items-center justify-center w-14 h-14 rounded-xl mb-4 transition-transform group-hover:scale-110',
        iconBg[variant]
      )}>
        <Icon className="w-7 h-7" />
      </div>

      {/* Content */}
      <h3 className="text-xl font-bold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground mb-4 line-clamp-3">{description}</p>

      {/* Features */}
      <ul className="space-y-2 mb-6">
        {features.map((feature) => (
          <li key={feature} className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
            <span className="text-muted-foreground">{feature}</span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      {comingSoon ? (
        <Button disabled className="w-full">
          Em breve
        </Button>
      ) : (
        <Button asChild className={cn('w-full', buttonVariant[variant])}>
          <Link to={href}>
            Começar Agora
            <ArrowRight className="w-4 h-4 ml-2" />
          </Link>
        </Button>
      )}
    </div>
  );
}

export default function ArticleTypeSelection() {
  const articleTypes: ArticleTypeCardProps[] = [
    {
      title: 'Artigo de Blog',
      description: 'Crie postagens de blog envolventes e informativas para o seu público. Perfeito para storytelling, tutoriais e conteúdo educacional.',
      icon: FileText,
      features: ['Otimizado para SEO', 'Múltiplos Formatos', 'Imagens Automáticas'],
      href: '/articles/new/blog',
      variant: 'primary',
    },
    {
      title: 'Página de Vendas',
      description: 'Gere páginas híbridas que unem copywriting persuasivo com SEO. Estrutura focada em dor, agitação e solução para converter visitantes.',
      icon: Building2,
      features: ['Copywriting Persuasivo', 'SEO Local e Nacional', 'Foco em Conversão'],
      href: '/articles/new/sales',
      variant: 'accent',
    },
    {
      title: 'Artigos em Massa',
      description: 'Gere múltiplos artigos de uma vez para escalar sua produção de conteúdo. Ideal para campanhas de SEO em larga escala.',
      icon: Layers,
      features: ['Processamento em Lote', 'Baseado em Modelos', 'Economia de Tempo'],
      href: '/articles/bulk',
      variant: 'default',
    },
    {
      title: 'Sequências de Artigos',
      description: 'Organize seu conteúdo em estruturas hierárquicas visuais, gere artigos em lote e publique automaticamente.',
      icon: Zap,
      features: ['Fluxo Visual Interativo', 'Geração em Lote', 'Publicação Automática'],
      href: '/topical-maps',
      variant: 'default',
      badges: [
        { label: 'Premium', variant: 'premium' },
        { label: 'Beta', variant: 'beta' },
      ],
    },
    {
      title: 'Review de Produto',
      description: 'Gere análises detalhadas de produtos com prós, contras e avaliação abrangente para ajudar seu público a tomar decisões.',
      icon: Star,
      features: ['Tabelas Comparativas', 'Sistema de Avaliação', 'Pronto para Afiliados'],
      href: '/articles/new/review',
      variant: 'default',
      comingSoon: true,
    },
    {
      title: 'Melhores Produtos',
      description: 'Compare e liste os melhores produtos de uma categoria específica. Ideal para conteúdo de afiliados.',
      icon: Trophy,
      features: ['Rankings Automáticos', 'Comparativos', 'Links de Afiliados'],
      href: '/articles/new/comparison',
      variant: 'default',
      comingSoon: true,
    },
  ];

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full mb-4">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-primary">Geração de Conteúdo Inteligente</span>
        </div>
        <h1 className="text-3xl lg:text-4xl font-bold text-foreground mb-3">
          Escolha o Tipo de Artigo
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Crie conteúdo otimizado e de alta qualidade em minutos.
          Escolha o formato ideal para sua estratégia de marketing.
        </p>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {articleTypes.map((type) => (
          <ArticleTypeCard key={type.title} {...type} />
        ))}
      </div>
    </div>
  );
}