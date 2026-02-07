import { AIConfigCard } from '@/components/settings/AIConfigCard';
import { WordPressSitesCard } from '@/components/settings/WordPressSitesCard';
import { PromptTemplatesCard } from '@/components/settings/PromptTemplatesCard';
import { TokenUsageCard } from '@/components/settings/TokenUsageCard';
import { useSettings } from '@/hooks/useSettings';

export default function SettingsPage() {
  const { settings, updateSettings } = useSettings();

  const handleSaveSettings = async (updates: Record<string, any>) => {
    await updateSettings.mutateAsync(updates);
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground lowercase">
          configurações
        </h1>
      </div>

      <div className="space-y-6">
        {/* AI Configuration */}
        <AIConfigCard 
          settings={settings as any}
          onSave={handleSaveSettings}
          isSaving={updateSettings.isPending}
        />

        {/* Token Usage Monitoring */}
        <TokenUsageCard />

        {/* WordPress Sites */}
        <WordPressSitesCard />

        {/* Prompt Templates */}
        <PromptTemplatesCard />
      </div>
    </div>
  );
}
