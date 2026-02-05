import { useAuth } from '@/hooks/useAuth';
import { useArticles } from '@/hooks/useArticles';
import { useProjects } from '@/hooks/useProjects';
import { useNewsAgents } from '@/hooks/useNewsAgents';
import { Loader2 } from 'lucide-react';
import { DashboardStats } from '@/components/dashboard/DashboardStats';
import { ActivityChart } from '@/components/dashboard/ActivityChart';
import { PlanCard } from '@/components/dashboard/PlanCard';
import { EconomyCard } from '@/components/dashboard/EconomyCard';
import { NewsAgentsSummary } from '@/components/dashboard/NewsAgentsSummary';
import { AuthorityPlannerSummary } from '@/components/dashboard/AuthorityPlannerSummary';
import { RecentArticlesList } from '@/components/dashboard/RecentArticlesList';

export default function Dashboard() {
  const { user } = useAuth();
  const { articles, stats, isLoading: articlesLoading } = useArticles();
  const { projects, isLoading: projectsLoading } = useProjects();
  const { agents, activeAgentsCount, totalArticles: agentArticles } = useNewsAgents();

  if (articlesLoading || projectsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Calculate stats
  const totalArticles = stats?.total || 0;
  const todayArticles = articles?.filter(a => {
    const today = new Date();
    const articleDate = new Date(a.created_at);
    return articleDate.toDateString() === today.toDateString();
  }).length || 0;

  return (
    <div className="p-6 space-y-6">
      {/* Top Stats Row */}
      <DashboardStats 
        totalArticles={totalArticles}
        todayArticles={todayArticles}
        imagesGenerated={totalArticles * 4} // Estimate
        todayImages={todayArticles * 4}
        linkExtractions={0}
        maxLinkExtractions={100}
      />

      {/* Chart + Plan Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ActivityChart articles={articles || []} />
        </div>
        <div className="lg:col-span-1">
          <PlanCard 
            planName="Plano Starter - Ilimitado"
            articlesUsed={totalArticles}
            sitesUsed={projects?.length || 0}
            maxSites={3}
            queueLimit={10}
          />
        </div>
      </div>

      {/* Economy Card */}
      <EconomyCard 
        totalArticles={totalArticles}
        totalImages={totalArticles * 4}
      />

      {/* Agents + Authority Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <NewsAgentsSummary 
          activeAgents={activeAgentsCount}
          publishedToday={0}
        />
        <AuthorityPlannerSummary 
          plansCreated={0}
          totalArticles={0}
        />
      </div>

      {/* Recent Articles */}
      <RecentArticlesList articles={articles?.slice(0, 5) || []} />
    </div>
  );
}
