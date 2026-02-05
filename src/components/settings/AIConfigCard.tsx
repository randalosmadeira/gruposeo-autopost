import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sparkles, Eye, EyeOff, ExternalLink, Infinity, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface AIConfigCardProps {
  settings: {
    byok_enabled?: boolean;
    ai_provider?: string;
    gemini_api_key?: string;
    openai_api_key?: string;
    title_model?: string;
    content_model?: string;
    image_model?: string;
    timezone?: string;
  } | null;
  onSave: (updates: Record<string, any>) => Promise<void>;
  isSaving: boolean;
}

const GEMINI_MODELS = [
  { value: 'gemini-3-pro-preview', label: 'gemini-3-pro-preview' },
  { value: 'gemini-3-flash-preview', label: 'gemini-3-flash-preview' },
  { value: 'gemini-2.5-pro', label: 'gemini-2.5-pro' },
  { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
];

const OPENAI_MODELS = [
  { value: 'gpt-5', label: 'gpt-5' },
  { value: 'gpt-5-mini', label: 'gpt-5-mini' },
  { value: 'gpt-5-nano', label: 'gpt-5-nano' },
];

const IMAGE_MODELS = [
  { value: 'gemini-3-pro-image-preview', label: 'pré-visualização de imagem gemini-3' },
  { value: 'gemini-2.5-flash-image', label: 'gemini-2.5-flash-image' },
];

const TIMEZONES = [
  { value: 'America/Sao_Paulo', label: 'Brasília (UTC-3)' },
  { value: 'America/Manaus', label: 'Manaus (UTC-4)' },
  { value: 'America/Belem', label: 'Belém (UTC-3)' },
  { value: 'America/Fortaleza', label: 'Fortaleza (UTC-3)' },
  { value: 'America/Recife', label: 'Recife (UTC-3)' },
  { value: 'America/Cuiaba', label: 'Cuiabá (UTC-4)' },
  { value: 'America/Porto_Velho', label: 'Porto Velho (UTC-4)' },
  { value: 'America/Rio_Branco', label: 'Rio Branco (UTC-5)' },
];

export function AIConfigCard({ settings, onSave, isSaving }: AIConfigCardProps) {
  const { toast } = useToast();
  const [showApiKey, setShowApiKey] = useState(false);
  const [byokEnabled, setByokEnabled] = useState(settings?.byok_enabled ?? false);
  const [aiProvider, setAiProvider] = useState(settings?.ai_provider ?? 'gemini');
  const [apiKey, setApiKey] = useState(
    aiProvider === 'gemini' 
      ? settings?.gemini_api_key ?? '' 
      : settings?.openai_api_key ?? ''
  );
  const [titleModel, setTitleModel] = useState(settings?.title_model ?? 'gemini-3-pro-preview');
  const [contentModel, setContentModel] = useState(settings?.content_model ?? 'gemini-3-pro-preview');
  const [imageModel, setImageModel] = useState(settings?.image_model ?? 'gemini-3-pro-image-preview');
  const [timezone, setTimezone] = useState(settings?.timezone ?? 'America/Sao_Paulo');
  const [isTesting, setIsTesting] = useState(false);

  const models = aiProvider === 'gemini' ? GEMINI_MODELS : OPENAI_MODELS;

  const handleProviderChange = (provider: string) => {
    setAiProvider(provider);
    // Reset models based on provider
    if (provider === 'gemini') {
      setTitleModel('gemini-3-pro-preview');
      setContentModel('gemini-3-pro-preview');
      setApiKey(settings?.gemini_api_key ?? '');
    } else {
      setTitleModel('gpt-5');
      setContentModel('gpt-5');
      setApiKey(settings?.openai_api_key ?? '');
    }
  };

  const handleTestApiKey = async () => {
    if (!apiKey) {
      toast({
        title: 'Chave API não informada',
        description: 'Insira sua chave API para testar.',
        variant: 'destructive',
      });
      return;
    }

    setIsTesting(true);
    try {
      // Simple test - just validate the format
      const isValidFormat = aiProvider === 'gemini' 
        ? apiKey.startsWith('AI') || apiKey.length > 20
        : apiKey.startsWith('sk-');

      if (isValidFormat) {
        toast({
          title: 'Formato válido!',
          description: 'A chave API parece estar no formato correto.',
        });
      } else {
        toast({
          title: 'Formato inválido',
          description: 'A chave API não parece estar no formato correto.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    await onSave({
      byok_enabled: byokEnabled,
      ai_provider: aiProvider,
      gemini_api_key: aiProvider === 'gemini' ? apiKey : settings?.gemini_api_key,
      openai_api_key: aiProvider === 'openai' ? apiKey : settings?.openai_api_key,
      title_model: titleModel,
      content_model: contentModel,
      image_model: imageModel,
      timezone,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          Configuração da IA
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* BYOK Toggle */}
        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
          <div className="flex items-center gap-3">
            <Switch 
              checked={byokEnabled} 
              onCheckedChange={setByokEnabled}
            />
            <div>
              <p className="font-medium">Ativar Modo Ilimitado / BYOK</p>
              <p className="text-sm text-muted-foreground">
                {byokEnabled 
                  ? 'Modo Ilimitado Ativo. O sistema usará sua chave API pessoal.'
                  : 'Usando créditos do sistema. Ative para usar sua própria chave.'}
              </p>
            </div>
          </div>
          <Infinity className="w-5 h-5 text-primary" />
        </div>

        {byokEnabled && (
          <>
            {/* Provider Selection */}
            <div className="p-4 bg-muted/30 rounded-lg border space-y-3">
              <Label className="text-sm font-medium">Provedor de IA</Label>
              <RadioGroup 
                value={aiProvider} 
                onValueChange={handleProviderChange}
                className="flex gap-6"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="gemini" id="gemini" />
                  <Label htmlFor="gemini" className="cursor-pointer">Google Gemini</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="openai" id="openai" />
                  <Label htmlFor="openai" className="cursor-pointer">OpenAI</Label>
                </div>
              </RadioGroup>
              <p className="text-xs text-muted-foreground">
                {aiProvider === 'gemini' 
                  ? 'Usando modelos Google Gemini (Gemini 2.5 Flash, Imagen, etc.)'
                  : 'Usando modelos OpenAI (GPT-5, GPT-5-mini, etc.)'}
              </p>
            </div>

            {/* API Key */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Sua Chave API</Label>
                <a 
                  href={aiProvider === 'gemini' 
                    ? 'https://aistudio.google.com/apikey'
                    : 'https://platform.openai.com/api-keys'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  Pegue aqui sua chave API
                </a>
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={aiProvider === 'gemini' ? 'AIza...' : 'sk-...'}
                    className="font-mono pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                <Button 
                  variant="outline" 
                  onClick={handleTestApiKey}
                  disabled={isTesting}
                >
                  {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Testar'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Sua chave será <span className="text-primary">armazenada de forma segura</span> e usada apenas para suas gerações.
              </p>
            </div>

            {/* Model Selection */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Modelo de Título</Label>
                <Select value={titleModel} onValueChange={setTitleModel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((model) => (
                      <SelectItem key={model.value} value={model.value}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Modelo de Conteúdo</Label>
                <Select value={contentModel} onValueChange={setContentModel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((model) => (
                      <SelectItem key={model.value} value={model.value}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Modelo de Imagem</Label>
                <Select value={imageModel} onValueChange={setImageModel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IMAGE_MODELS.map((model) => (
                      <SelectItem key={model.value} value={model.value}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </>
        )}

        {/* Timezone */}
        <div className="space-y-2">
          <Label>Fuso Horário</Label>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>
                  {tz.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Usado para agendamentos do News Agent e exibição de dados.
          </p>
        </div>

        <Button onClick={handleSave} disabled={isSaving} className="bg-primary">
          {isSaving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : null}
          Salvar configurações
        </Button>
      </CardContent>
    </Card>
  );
}
