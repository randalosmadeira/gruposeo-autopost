import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AIConfigCard } from '@/components/settings/AIConfigCard';
import { WordPressSitesCard } from '@/components/settings/WordPressSitesCard';
import { PromptTemplatesCard } from '@/components/settings/PromptTemplatesCard';
import { TokenUsageCard } from '@/components/settings/TokenUsageCard';
import { ArticleTemplatesCard } from '@/components/settings/ArticleTemplatesCard';
import { useSettings } from '@/hooks/useSettings';
import { Settings, Folder, FileText, Globe, BarChart3 } from 'lucide-react';

export default function SettingsPage() {
  const { settings, updateSettings } = useSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'general';

  const handleSaveSettings = async (updates: Record<string, any>) => {
    await updateSettings.mutateAsync(updates);
  };

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value });
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Settings className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
          <p className="text-sm text-muted-foreground">Gerencie suas preferências e integrações</p>
        </div>
      </div>

      <Tabs value={currentTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-flex">
          <TabsTrigger value="general" className="gap-2">
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">Geral</span>
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2">
            <Folder className="w-4 h-4" />
            <span className="hidden sm:inline">Modelos</span>
          </TabsTrigger>
          <TabsTrigger value="prompts" className="gap-2">
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">Prompts</span>
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-2">
            <Globe className="w-4 h-4" />
            <span className="hidden sm:inline">Integrações</span>
          </TabsTrigger>
        </TabsList>

        {/* General Tab */}
        <TabsContent value="general" className="space-y-6">
          <AIConfigCard 
            settings={settings as any}
            onSave={handleSaveSettings}
            isSaving={updateSettings.isPending}
          />
          <TokenUsageCard />
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-6">
          <ArticleTemplatesCard />
        </TabsContent>

        {/* Prompts Tab */}
        <TabsContent value="prompts" className="space-y-6">
          <PromptTemplatesCard />
        </TabsContent>

        {/* Integrations Tab */}
        <TabsContent value="integrations" className="space-y-6">
          <WordPressSitesCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
