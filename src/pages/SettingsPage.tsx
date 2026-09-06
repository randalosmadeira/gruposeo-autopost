import { lazy, Suspense } from 'react';
import { useSettings } from '@/hooks/useSettings';
import { InstitutionalInfo } from '@/components/shared/InstitutionalInfo';
import { ProfileIdentityCard } from '@/components/settings/ProfileIdentityCard';

import { Settings, UserRound, Globe, Cpu, FileCode2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const AIConfigCard = lazy(() => import('@/components/settings/AIConfigCard').then((module) => ({ default: module.AIConfigCard })));
const WordPressSitesCard = lazy(() => import('@/components/settings/WordPressSitesCard').then((module) => ({ default: module.WordPressSitesCard })));
const PromptTemplatesCard = lazy(() => import('@/components/settings/PromptTemplatesCard').then((module) => ({ default: module.PromptTemplatesCard })));
const TokenUsageCard = lazy(() => import('@/components/settings/TokenUsageCard').then((module) => ({ default: module.TokenUsageCard })));
const ArticleTemplatesCard = lazy(() => import('@/components/settings/ArticleTemplatesCard').then((module) => ({ default: module.ArticleTemplatesCard })));
const IndexNowConfigCard = lazy(() => import('@/components/settings/IndexNowConfigCard').then((module) => ({ default: module.IndexNowConfigCard })));
const PressCitationsCard = lazy(() => import('@/components/settings/PressCitationsCard').then((module) => ({ default: module.PressCitationsCard })));
const SubscriptionOverviewCard = lazy(() => import('@/components/settings/SubscriptionOverviewCard').then((module) => ({ default: module.SubscriptionOverviewCard })));
const BrandAssetsCard = lazy(() => import('@/components/settings/BrandAssetsCard').then((module) => ({ default: module.BrandAssetsCard })));
const ProjectCtaCard = lazy(() => import('@/components/settings/ProjectCtaCard').then((module) => ({ default: module.ProjectCtaCard })));

type SettingsMode = 'account' | 'integrations' | 'ai' | 'prompts';

const headings: Record<SettingsMode, { title: string; description: string; icon: typeof Settings }> = {
  account: { title: 'Minha Conta', description: 'Dados institucionais e informações da sua conta', icon: UserRound },
  integrations: { title: 'Meus Blogs', description: 'Sites e canais editoriais conectados', icon: Globe },
  ai: { title: 'Motor de IA', description: 'Configuração restrita da infraestrutura de inteligência artificial', icon: Cpu },
  prompts: { title: 'Engenharia de Prompts', description: 'Modelos proprietários e regras editoriais protegidas', icon: FileCode2 },
};

export default function SettingsPage({ mode = 'account' }: { mode?: SettingsMode }) {
  const { settings, updateSettings } = useSettings();
  const heading = headings[mode];
  const HeadingIcon = heading.icon;

  const handleSaveSettings = async (updates: Parameters<typeof updateSettings.mutateAsync>[0]) => {
    await updateSettings.mutateAsync(updates);
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <HeadingIcon className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{heading.title}</h1>
          <p className="text-sm text-muted-foreground">{heading.description}</p>
        </div>
      </div>

      <Suspense fallback={<div className="rounded-xl border p-6 text-sm text-muted-foreground" role="status">Carregando configurações...</div>}>
      <div className="space-y-6">
        {mode === 'account' ? (
          <>
            <ProfileIdentityCard />
            <SubscriptionOverviewCard />
            <InstitutionalInfo />
          </>
        ) : null}
        {mode === 'ai' ? <>
          <AIConfigCard 
            settings={settings ?? undefined}
            onSave={handleSaveSettings}
            isSaving={updateSettings.isPending}
          />
          <TokenUsageCard />
          <PressCitationsCard />
        </> : null}
        {mode === 'prompts' ? <>
          <ArticleTemplatesCard />
          <PromptTemplatesCard />
        </> : null}
        {mode === 'integrations' ? <>
          <Card>
            <CardHeader>
              <CardTitle>Geração em massa</CardTitle>
              <CardDescription>Importe planilhas ou listas de palavras-chave e controle a distribuição dos artigos por projeto.</CardDescription>
            </CardHeader>
            <CardContent><Button asChild><Link to="/keywords/bulk">Abrir gerador em massa</Link></Button></CardContent>
          </Card>
          <WordPressSitesCard />
          <ProjectCtaCard />
          <BrandAssetsCard />
        </> : null}
        {mode === 'ai' ? <IndexNowConfigCard /> : null}
      </div>
      </Suspense>
    </div>
  );
}
