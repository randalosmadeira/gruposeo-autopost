import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Sparkles, Eye, EyeOff, ExternalLink, Infinity, Loader2, Check, X, Search, Brain } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const VALIDATE_AI_KEY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-ai-key`;

interface AIConfigCardProps {
  settings: {
    byok_enabled?: boolean;
    ai_provider?: string;
    has_gemini_key?: boolean;
    has_openai_key?: boolean;
    has_anthropic_key?: boolean;
    has_serper_key?: boolean;
    title_model?: string;
    content_model?: string;
    image_model?: string;
    timezone?: string;
  } | null;
  onSave: (updates: Record<string, unknown>) => Promise<void>;
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

const GEMINI_IMAGE_MODELS = [
  { value: 'gemini-3-pro-image-preview', label: 'Gemini 3 Pro Image' },
  { value: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image' },
];

const OPENAI_IMAGE_MODELS = [
  { value: 'dall-e-3', label: 'DALL-E 3 (HD)' },
  { value: 'dall-e-3-standard', label: 'DALL-E 3 (Standard)' },
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
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showSerperKey, setShowSerperKey] = useState(false);
  const [byokEnabled, setByokEnabled] = useState(settings?.byok_enabled ?? false);
  const [aiProvider, setAiProvider] = useState(settings?.ai_provider ?? 'gemini');
  const [newApiKey, setNewApiKey] = useState('');
  const [newAnthropicKey, setNewAnthropicKey] = useState('');
  const [newSerperKey, setNewSerperKey] = useState('');
  const [titleModel, setTitleModel] = useState(settings?.title_model ?? 'gemini-3-pro-preview');
  const [contentModel, setContentModel] = useState(settings?.content_model ?? 'gemini-3-pro-preview');
  const [imageModel, setImageModel] = useState(settings?.image_model ?? 'gemini-3-pro-image-preview');
  const [timezone, setTimezone] = useState(settings?.timezone ?? 'America/Sao_Paulo');
  const [isTesting, setIsTesting] = useState(false);
  const [isTestingAnthropic, setIsTestingAnthropic] = useState(false);
  const [isTestingSerper, setIsTestingSerper] = useState(false);

  // Sync local state when settings load/change from the server
  useEffect(() => {
    if (settings) {
      setByokEnabled(settings.byok_enabled ?? false);
      setAiProvider(settings.ai_provider ?? 'gemini');
      setTitleModel(settings.title_model ?? 'gemini-3-pro-preview');
      setContentModel(settings.content_model ?? 'gemini-3-pro-preview');
      setImageModel(settings.image_model ?? 'gemini-3-pro-image-preview');
      setTimezone(settings.timezone ?? 'America/Sao_Paulo');
    }
  }, [settings]);

  const models = aiProvider === 'gemini' ? GEMINI_MODELS : OPENAI_MODELS;
  const imageModels = aiProvider === 'gemini' ? GEMINI_IMAGE_MODELS : OPENAI_IMAGE_MODELS;
  
  const hasCurrentProviderKey = aiProvider === 'gemini' 
    ? settings?.has_gemini_key 
    : settings?.has_openai_key;

  const integrationsConfigured = 
    (settings?.has_openai_key ? 1 : 0) + 
    (settings?.has_gemini_key ? 1 : 0) + 
    (settings?.has_anthropic_key ? 1 : 0) + 
    (settings?.has_serper_key ? 1 : 0);
  const integrationsProgress = (integrationsConfigured / 4) * 100;

  const handleProviderChange = (provider: string) => {
    setAiProvider(provider);
    setNewApiKey(''); // Clear the input when switching providers
    // Reset models based on provider
    if (provider === 'gemini') {
      setTitleModel('gemini-3-pro-preview');
      setContentModel('gemini-3-pro-preview');
      setImageModel('gemini-3-pro-image-preview');
    } else {
      setTitleModel('gpt-5');
      setContentModel('gpt-5');
      setImageModel('dall-e-3');
    }
  };

  const handleTestApiKey = async () => {
    if (!newApiKey) {
      toast({
        title: 'Chave API não informada',
        description: 'Insira sua nova chave API para testar.',
        variant: 'destructive',
      });
      return;
    }

    setIsTesting(true);
    try {
      // Validate via backend to avoid exposing key to third-party domains in the browser.
      let { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({
          title: 'Sessão expirada',
          description: 'Faça login novamente para validar a chave.',
          variant: 'destructive',
        });
        return;
      }

      const resp = await fetch(VALIDATE_AI_KEY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ provider: aiProvider, apiKey: newApiKey }),
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        toast({
          title: 'Falha ao validar',
          description: data?.error || `Erro HTTP ${resp.status}`,
          variant: 'destructive',
        });
        return;
      }

      if (data?.valid) {
        toast({
          title: '✓ Chave validada',
          description: `${data.message || 'Conexão estabelecida.'} Salvando...`,
        });

        const keyMap: Record<string, string> = {
          gemini: 'gemini_api_key',
          openai: 'openai_api_key',
        };
        await onSave({ [keyMap[aiProvider]]: newApiKey });
        setNewApiKey('');

        toast({ title: 'Chave salva!', description: 'Status atualizado com sucesso.' });
      } else {
        toast({
          title: 'Chave inválida',
          description: data?.message || 'A chave não foi aceita pelo provedor.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Erro de conexão',
        description: 'Não foi possível validar agora. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleTestExtraKey = async (provider: 'anthropic' | 'serper', key: string, setLoading: (v: boolean) => void, clearKey: () => void) => {
    if (!key) {
      toast({ title: 'Chave não informada', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({ title: 'Sessão expirada', variant: 'destructive' });
        return;
      }
      const resp = await fetch(VALIDATE_AI_KEY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ provider, apiKey: key }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        toast({ title: 'Falha ao validar', description: data?.error || `Erro ${resp.status}`, variant: 'destructive' });
        return;
      }
      if (data?.valid) {
        const dbKey = provider === 'anthropic' ? 'anthropic_api_key' : 'serper_api_key';
        await onSave({ [dbKey]: key });
        clearKey();
        toast({ title: '✓ Chave validada e salva!', description: data.message });
      } else {
        toast({ title: 'Chave inválida', description: data?.message, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Erro de conexão', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    const updates: Record<string, unknown> = {
      byok_enabled: byokEnabled,
      ai_provider: aiProvider,
      title_model: titleModel,
      content_model: contentModel,
      image_model: imageModel,
      timezone,
    };

    if (newApiKey) {
      updates[aiProvider === 'gemini' ? 'gemini_api_key' : 'openai_api_key'] = newApiKey;
    }
    if (newAnthropicKey) updates.anthropic_api_key = newAnthropicKey;
    if (newSerperKey) updates.serper_api_key = newSerperKey;

    await onSave(updates);
    setNewApiKey('');
    setNewAnthropicKey('');
    setNewSerperKey('');
  };

  const handleRemoveApiKey = async () => {
    const key = aiProvider === 'gemini' ? 'gemini_api_key' : 'openai_api_key';
    await onSave({ [key]: null });
  };

  const handleRemoveExtraKey = async (provider: 'anthropic' | 'serper') => {
    const key = provider === 'anthropic' ? 'anthropic_api_key' : 'serper_api_key';
    await onSave({ [key]: null });
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
                  {settings?.has_gemini_key ? (
                    <Badge className="text-xs bg-emerald-500/15 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/20">
                      <Check className="w-3 h-3 mr-1" />
                      Ativa
                    </Badge>
                  ) : (
                    <Badge className="text-xs bg-red-500/15 text-red-500 border-red-500/30 hover:bg-red-500/20">
                      <X className="w-3 h-3 mr-1" />
                      Não configurada
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="openai" id="openai" />
                  <Label htmlFor="openai" className="cursor-pointer">OpenAI</Label>
                  {settings?.has_openai_key ? (
                    <Badge className="text-xs bg-emerald-500/15 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/20">
                      <Check className="w-3 h-3 mr-1" />
                      Ativa
                    </Badge>
                  ) : (
                    <Badge className="text-xs bg-red-500/15 text-red-500 border-red-500/30 hover:bg-red-500/20">
                      <X className="w-3 h-3 mr-1" />
                      Não configurada
                    </Badge>
                  )}
                </div>
              </RadioGroup>
              <p className="text-xs text-muted-foreground">
                {aiProvider === 'gemini' 
                  ? 'Usando modelos Google Gemini (Gemini 2.5 Flash, Imagen, etc.)'
                  : 'Usando modelos OpenAI (GPT-5, GPT-5-mini, etc.)'}
              </p>
            </div>

            {/* API Key Status and Update */}
            <div className="space-y-3">
              {/* Integrations health */}
              <div className="p-3 bg-muted/30 rounded-lg border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Saúde das integrações</span>
                  <span className="text-xs text-muted-foreground">
                    {integrationsConfigured}/4 configuradas
                  </span>
                </div>
                <Progress value={integrationsProgress} />
                <div className="flex flex-wrap gap-2 mt-2">
                  {[
                    { label: 'Gemini', active: settings?.has_gemini_key },
                    { label: 'OpenAI', active: settings?.has_openai_key },
                    { label: 'Claude', active: settings?.has_anthropic_key },
                    { label: 'Serper', active: settings?.has_serper_key },
                  ].map(({ label, active }) => (
                    <Badge key={label} className={`text-xs ${active 
                      ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' 
                      : 'bg-red-500/15 text-red-500 border-red-500/30'}`}>
                      {active ? <Check className="w-3 h-3 mr-1" /> : <X className="w-3 h-3 mr-1" />}
                      {label}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Current key status */}
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Status da chave {aiProvider === 'gemini' ? 'Gemini' : 'OpenAI'}:</span>
                  {hasCurrentProviderKey ? (
                    <Badge className="text-xs bg-emerald-500/15 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/20">
                      <Check className="w-3 h-3 mr-1" />
                      ✅ Ativa
                    </Badge>
                  ) : (
                    <Badge className="text-xs bg-red-500/15 text-red-500 border-red-500/30 hover:bg-red-500/20">
                      <X className="w-3 h-3 mr-1" />
                      ❌ Não configurada
                    </Badge>
                  )}
                </div>
                {hasCurrentProviderKey && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-destructive hover:text-destructive"
                    onClick={handleRemoveApiKey}
                  >
                    Remover chave
                  </Button>
                )}
              </div>

              {/* New API Key Input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{hasCurrentProviderKey ? 'Atualizar Chave API' : 'Adicionar Chave API'}</Label>
                  <a 
                    href={aiProvider === 'gemini' 
                      ? 'https://aistudio.google.com/apikey'
                      : 'https://platform.openai.com/api-keys'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Obter chave API
                  </a>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showApiKey ? 'text' : 'password'}
                      value={newApiKey}
                      onChange={(e) => setNewApiKey(e.target.value)}
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
                    disabled={isTesting || !newApiKey}
                  >
                    {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Testar'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Ao testar com sucesso, salvamos a chave automaticamente e o status será atualizado.
                </p>
              </div>
            </div>

            {/* Anthropic (Claude) Key */}
            <div className="p-4 bg-muted/30 rounded-lg border space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Brain className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Anthropic (Claude)</span>
                  {settings?.has_anthropic_key ? (
                    <Badge className="text-xs bg-emerald-500/15 text-emerald-600 border-emerald-500/30">
                      <Check className="w-3 h-3 mr-1" /> Ativa
                    </Badge>
                  ) : (
                    <Badge className="text-xs bg-red-500/15 text-red-500 border-red-500/30">
                      <X className="w-3 h-3 mr-1" /> Não configurada
                    </Badge>
                  )}
                </div>
                {settings?.has_anthropic_key && (
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                    onClick={() => handleRemoveExtraKey('anthropic')}>
                    Remover
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Usado pelo pipeline de agentes para edição e conteúdo jurídico/saúde. Modelo: Claude 3.5 Sonnet.
              </p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showAnthropicKey ? 'text' : 'password'}
                    value={newAnthropicKey}
                    onChange={(e) => setNewAnthropicKey(e.target.value)}
                    placeholder="sk-ant-..."
                    className="font-mono pr-10"
                  />
                  <Button type="button" variant="ghost" size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowAnthropicKey(!showAnthropicKey)}>
                    {showAnthropicKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
                <Button variant="outline" 
                  onClick={() => handleTestExtraKey('anthropic', newAnthropicKey, setIsTestingAnthropic, () => setNewAnthropicKey(''))}
                  disabled={isTestingAnthropic || !newAnthropicKey}>
                  {isTestingAnthropic ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Testar'}
                </Button>
              </div>
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1">
                <ExternalLink className="w-3 h-3" /> Obter chave na Anthropic
              </a>
            </div>

            {/* Serper Key */}
            <div className="p-4 bg-muted/30 rounded-lg border space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Serper (Pesquisa Google)</span>
                  {settings?.has_serper_key ? (
                    <Badge className="text-xs bg-emerald-500/15 text-emerald-600 border-emerald-500/30">
                      <Check className="w-3 h-3 mr-1" /> Ativa
                    </Badge>
                  ) : (
                    <Badge className="text-xs bg-red-500/15 text-red-500 border-red-500/30">
                      <X className="w-3 h-3 mr-1" /> Não configurada
                    </Badge>
                  )}
                </div>
                {settings?.has_serper_key && (
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                    onClick={() => handleRemoveExtraKey('serper')}>
                    Remover
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Pesquisa de palavras-chave, análise de concorrência e enriquecimento de conteúdo SEO.
              </p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showSerperKey ? 'text' : 'password'}
                    value={newSerperKey}
                    onChange={(e) => setNewSerperKey(e.target.value)}
                    placeholder="Sua chave Serper..."
                    className="font-mono pr-10"
                  />
                  <Button type="button" variant="ghost" size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowSerperKey(!showSerperKey)}>
                    {showSerperKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
                <Button variant="outline"
                  onClick={() => handleTestExtraKey('serper', newSerperKey, setIsTestingSerper, () => setNewSerperKey(''))}
                  disabled={isTestingSerper || !newSerperKey}>
                  {isTestingSerper ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Testar'}
                </Button>
              </div>
              <a href="https://serper.dev/api-key" target="_blank" rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1">
                <ExternalLink className="w-3 h-3" /> Obter chave no Serper
              </a>
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
                    {imageModels.map((model) => (
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
