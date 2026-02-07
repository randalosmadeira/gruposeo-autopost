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
import { Badge } from '@/components/ui/badge';
import { Sparkles, Eye, EyeOff, ExternalLink, Infinity, Loader2, Check, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface AIConfigCardProps {
  settings: {
    byok_enabled?: boolean;
    ai_provider?: string;
    // API keys are no longer exposed - only boolean flags
    has_gemini_key?: boolean;
    has_openai_key?: boolean;
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
  const [byokEnabled, setByokEnabled] = useState(settings?.byok_enabled ?? false);
  const [aiProvider, setAiProvider] = useState(settings?.ai_provider ?? 'gemini');
  // New API key input - never pre-filled with existing key for security
  const [newApiKey, setNewApiKey] = useState('');
  const [titleModel, setTitleModel] = useState(settings?.title_model ?? 'gemini-3-pro-preview');
  const [contentModel, setContentModel] = useState(settings?.content_model ?? 'gemini-3-pro-preview');
  const [imageModel, setImageModel] = useState(settings?.image_model ?? 'gemini-3-pro-image-preview');
  const [timezone, setTimezone] = useState(settings?.timezone ?? 'America/Sao_Paulo');
  const [isTesting, setIsTesting] = useState(false);

  const models = aiProvider === 'gemini' ? GEMINI_MODELS : OPENAI_MODELS;
  const imageModels = aiProvider === 'gemini' ? GEMINI_IMAGE_MODELS : OPENAI_IMAGE_MODELS;
  
  // Check if the current provider has a key configured
  const hasCurrentProviderKey = aiProvider === 'gemini' 
    ? settings?.has_gemini_key 
    : settings?.has_openai_key;

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
      // Real validation - call the provider's API to verify the key
      if (aiProvider === 'openai') {
        const response = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${newApiKey}` }
        });
        
        if (response.ok) {
          toast({
            title: '✓ Chave OpenAI válida!',
            description: 'Conexão estabelecida com sucesso.',
          });
        } else if (response.status === 401) {
          toast({
            title: 'Chave inválida',
            description: 'A chave API OpenAI não é válida ou expirou.',
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Erro ao validar',
            description: `Status: ${response.status}`,
            variant: 'destructive',
          });
        }
      } else {
        // Gemini validation
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${newApiKey}`
        );
        
        if (response.ok) {
          toast({
            title: '✓ Chave Gemini válida!',
            description: 'Conexão estabelecida com sucesso.',
          });
        } else if (response.status === 400 || response.status === 403) {
          toast({
            title: 'Chave inválida',
            description: 'A chave API Gemini não é válida ou está desativada.',
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Erro ao validar',
            description: `Status: ${response.status}`,
            variant: 'destructive',
          });
        }
      }
    } catch (error) {
      toast({
        title: 'Erro de conexão',
        description: 'Não foi possível conectar ao provedor. Verifique sua conexão.',
        variant: 'destructive',
      });
    } finally {
      setIsTesting(false);
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

    // Only include API key in update if a new one was provided
    if (newApiKey) {
      if (aiProvider === 'gemini') {
        updates.gemini_api_key = newApiKey;
      } else {
        updates.openai_api_key = newApiKey;
      }
    }

    await onSave(updates);
    setNewApiKey(''); // Clear after save
  };

  const handleRemoveApiKey = async () => {
    const updates: Record<string, unknown> = {};
    if (aiProvider === 'gemini') {
      updates.gemini_api_key = null;
    } else {
      updates.openai_api_key = null;
    }
    await onSave(updates);
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
                  {settings?.has_gemini_key && (
                    <Badge variant="secondary" className="text-xs">
                      <Check className="w-3 h-3 mr-1" />
                      Configurado
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="openai" id="openai" />
                  <Label htmlFor="openai" className="cursor-pointer">OpenAI</Label>
                  {settings?.has_openai_key && (
                    <Badge variant="secondary" className="text-xs">
                      <Check className="w-3 h-3 mr-1" />
                      Configurado
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
              {/* Current key status */}
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Status da chave {aiProvider === 'gemini' ? 'Gemini' : 'OpenAI'}:</span>
                  {hasCurrentProviderKey ? (
                    <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                      <Check className="w-3 h-3 mr-1" />
                      Configurada
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      <X className="w-3 h-3 mr-1" />
                      Não configurada
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
                  Sua chave será <span className="text-primary">armazenada de forma segura</span> no servidor e nunca será exibida novamente.
                </p>
              </div>
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
