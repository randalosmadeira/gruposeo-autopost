import { StatsGrid } from '@/components/dashboard/StatsCards';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { RecentArticles } from '@/components/dashboard/RecentArticles';
import { ArticlesChart } from '@/components/dashboard/ArticlesChart';
import { TipOfTheDay } from '@/components/dashboard/TipOfTheDay';
import { Sparkles } from 'lucide-react';

export default function Dashboard() {
  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Welcome Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">👋</span>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
              Bem-vindo de volta, Rândalos
            </h1>
          </div>
          <p className="text-muted-foreground">
            Vamos criar conteúdo que engaja e converte.
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-xl">
          <Sparkles className="w-5 h-5 text-primary" />
          <span className="text-sm font-medium text-primary">
            Sistema pronto para gerar
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <StatsGrid />

      {/* Tip of the Day */}
      <TipOfTheDay />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Chart - Takes 2 columns on xl */}
        <div className="xl:col-span-2">
          <ArticlesChart />
        </div>

        {/* Quick Actions */}
        <div className="xl:col-span-1">
          <QuickActions />
        </div>
      </div>

      {/* Recent Articles */}
      <RecentArticles />
    </div>
  );
}