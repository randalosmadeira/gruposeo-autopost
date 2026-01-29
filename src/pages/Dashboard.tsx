import { useAuth } from '@/hooks/useAuth';
import { useArticles } from '@/hooks/useArticles';
import { useProjects } from '@/hooks/useProjects';
import { useProfile } from '@/hooks/useProfile';
import { StatsGrid } from '@/components/dashboard/StatsCards';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { RecentArticles } from '@/components/dashboard/RecentArticles';
import { ArticlesChart } from '@/components/dashboard/ArticlesChart';
import { TipOfTheDay } from '@/components/dashboard/TipOfTheDay';
import { Sparkles, Loader2 } from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { articles, stats, isLoading: articlesLoading } = useArticles();
  const { projects, isLoading: projectsLoading } = useProjects();

  const displayName = profile?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'Usuário';

  if (articlesLoading || projectsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Welcome Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">👋</span>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
              Bem-vindo de volta, {displayName}
            </h1>
          </div>
          <p className="text-muted-foreground">
            Vamos criar conteúdo que engaja e converte.
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-xl">
          <Sparkles className="w-5 h-5 text-primary" />
          <span className="text-sm font-medium text-primary">
            {projects.length > 0 ? `${projects.length} projeto(s) ativo(s)` : 'Nenhum projeto ainda'}
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <StatsGrid stats={stats} projectCount={projects.length} />

      {/* Tip of the Day */}
      <TipOfTheDay />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <ArticlesChart articles={articles} />
        </div>
        <div className="xl:col-span-1">
          <QuickActions />
        </div>
      </div>

      {/* Recent Articles */}
      <RecentArticles articles={articles.slice(0, 5)} />
    </div>
  );
}
