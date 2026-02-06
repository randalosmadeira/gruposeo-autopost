import { 
  GraduationCap, 
  Play, 
  BookOpen, 
  Video, 
  FileText, 
  ArrowRight,
  Clock,
  Star,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

const courses = [
  {
    id: 'getting-started',
    title: 'Primeiros Passos',
    description: 'Aprenda o básico da plataforma e crie seu primeiro artigo',
    duration: '15 min',
    lessons: 5,
    progress: 100,
    icon: BookOpen,
    color: '#4169E1',
    status: 'completed',
  },
  {
    id: 'seo-mastery',
    title: 'SEO para Artigos',
    description: 'Técnicas avançadas de otimização para mecanismos de busca',
    duration: '45 min',
    lessons: 8,
    progress: 60,
    icon: Star,
    color: '#10B981',
    status: 'in-progress',
  },
  {
    id: 'landing-pages',
    title: 'Landing Pages de Alta Conversão',
    description: 'Crie páginas que vendem com copywriting persuasivo',
    duration: '30 min',
    lessons: 6,
    progress: 0,
    icon: FileText,
    color: '#FF6B2B',
    status: 'not-started',
  },
  {
    id: 'automation',
    title: 'Automação com Agentes',
    description: 'Configure agentes de notícias e automação de conteúdo',
    duration: '25 min',
    lessons: 5,
    progress: 0,
    icon: Video,
    color: '#8B5CF6',
    status: 'not-started',
  },
];

const quickTips = [
  {
    title: 'Dica do Dia',
    content: 'Use palavras-chave long-tail para melhor ranqueamento em nichos específicos.',
    type: 'tip',
  },
  {
    title: 'Novidade',
    content: 'Agora você pode integrar feeds RSS aos seus agentes de notícias!',
    type: 'new',
  },
];

export default function Academy() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg">
            <GraduationCap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Academia</h1>
            <p className="text-muted-foreground">Aprenda a dominar todas as funcionalidades da plataforma</p>
          </div>
        </div>
        <Badge variant="outline" className="text-primary border-primary">
          2 de 4 cursos concluídos
        </Badge>
      </div>

      {/* Progress Overview */}
      <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-lg">Seu Progresso</h3>
              <p className="text-sm text-muted-foreground">Continue de onde parou</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-primary">40%</p>
              <p className="text-xs text-muted-foreground">completo</p>
            </div>
          </div>
          <Progress value={40} className="h-2" />
        </CardContent>
      </Card>

      {/* Quick Tips */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {quickTips.map((tip, index) => (
          <Card key={index} className={tip.type === 'new' ? 'border-orange-200 bg-orange-50' : 'border-blue-200 bg-blue-50'}>
            <CardContent className="p-4 flex items-start gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${tip.type === 'new' ? 'bg-orange-500' : 'bg-primary'}`}>
                <Star className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="font-medium text-sm">{tip.title}</p>
                <p className="text-sm text-muted-foreground">{tip.content}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Courses Grid */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Cursos Disponíveis</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {courses.map((course) => {
            const Icon = course.icon;
            return (
              <Card 
                key={course.id} 
                className="hover:shadow-lg transition-all duration-300 cursor-pointer group"
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div 
                      className="w-12 h-12 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${course.color}15` }}
                    >
                      <Icon className="w-6 h-6" style={{ color: course.color }} />
                    </div>
                    {course.status === 'completed' && (
                      <Badge className="bg-emerald-500 text-emerald-50">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Concluído
                      </Badge>
                    )}
                    {course.status === 'in-progress' && (
                      <Badge variant="outline" className="border-primary text-primary">
                        Em andamento
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="text-base mt-3">{course.title}</CardTitle>
                  <CardDescription className="text-sm">{course.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-sm text-muted-foreground mb-3">
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {course.duration}
                    </span>
                    <span>{course.lessons} aulas</span>
                  </div>
                  
                  {course.progress > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Progresso</span>
                        <span className="font-medium">{course.progress}%</span>
                      </div>
                      <Progress value={course.progress} className="h-1.5" />
                    </div>
                  )}
                  
                  <Button 
                    className="w-full group-hover:translate-x-1 transition-transform"
                    variant={course.status === 'completed' ? 'outline' : 'default'}
                    style={course.status !== 'completed' ? { backgroundColor: course.color } : undefined}
                  >
                    {course.status === 'completed' ? 'Revisar' : course.status === 'in-progress' ? 'Continuar' : 'Começar'}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Featured Video */}
      <Card className="overflow-hidden">
        <div className="grid md:grid-cols-2">
          <div 
            className="aspect-video md:aspect-auto bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center cursor-pointer group"
          >
            <div className="w-16 h-16 rounded-full bg-primary-foreground/20 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Play className="w-8 h-8 text-primary-foreground ml-1" />
            </div>
          </div>
          <div className="p-6 flex flex-col justify-center">
            <Badge className="w-fit mb-2 bg-orange-500">Em destaque</Badge>
            <h3 className="text-xl font-semibold mb-2">Masterclass: SEO para Artigos com IA</h3>
            <p className="text-muted-foreground mb-4">
              Aprenda as melhores práticas para otimizar seus artigos gerados por IA 
              e alcançar as primeiras posições no Google.
            </p>
            <Button className="w-fit">
              Assistir Agora
              <Play className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
