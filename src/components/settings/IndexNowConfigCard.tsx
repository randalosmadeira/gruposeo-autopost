import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Globe, Shield, Activity, RefreshCw, Key, ExternalLink, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

export function IndexNowConfigCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState({
    host: 'drmadeira1470.com.br',
    api_key: '',
    key_location: '',
    active: true
  });
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      fetchConfig();
      fetchLogs();
    }
  }, [user]);

  const fetchConfig = async () => {
    const { data, error } = await supabase
      .from('indexnow_config')
      .select('*')
      .maybeSingle();

    if (data) {
      setConfig({
        host: data.host,
        api_key: data.api_key,
        key_location: data.key_location,
        active: data.active
      });
    }
    setLoading(false);
  };

  const fetchLogs = async () => {
    const { data, error } = await supabase
      .from('indexnow_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (data) setLogs(data);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    
    const configData = {
      ...config,
      user_id: user.id,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('indexnow_config')
      .upsert(configData, { onConflict: 'user_id' });

    if (error) {
      toast({
        title: 'Erro ao salvar',
        description: error.message,
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Configuração salva! ✓',
        description: 'Protocolo IndexNow configurado para ' + config.host
      });
    }
    setSaving(false);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            <CardTitle>Protocolo IndexNow</CardTitle>
          </div>
          <Badge variant={config.active ? "default" : "secondary"}>
            {config.active ? "Ativo" : "Inativo"}
          </Badge>
        </div>
        <CardDescription>
          Acelere a descoberta de novos conteúdos pelo Bing, Yandex e ChatGPT Search.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Host do Domínio</Label>
            <Input 
              value={config.host} 
              onChange={e => setConfig(prev => ({ ...prev, host: e.target.value }))}
              placeholder="exemplo.com.br"
            />
          </div>
          <div className="space-y-2">
            <Label>API Key</Label>
            <div className="flex gap-2">
              <Input 
                type="password"
                value={config.api_key} 
                onChange={e => setConfig(prev => ({ ...prev, api_key: e.target.value }))}
                placeholder="4a1b2c3d..."
              />
              <Button variant="outline" size="icon" onClick={() => window.open(`https://www.bing.com/indexnow/getstarted`, '_blank')}>
                <Key className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Localização da Chave (.txt)</Label>
          <Input 
            value={config.key_location} 
            onChange={e => setConfig(prev => ({ ...prev, key_location: e.target.value }))}
            placeholder="https://exemplo.com.br/api_key.txt"
          />
        </div>

        <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
          <div className="space-y-0.5">
            <Label>Submissão Automática</Label>
            <p className="text-xs text-muted-foreground">Enviar URLs automaticamente após a geração</p>
          </div>
          <Switch 
            checked={config.active}
            onCheckedChange={val => setConfig(prev => ({ ...prev, active: val }))}
          />
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Últimas Submissões
          </h4>
          <ScrollArea className="h-[120px] rounded-md border p-2">
            {logs.length > 0 ? (
              <div className="space-y-2">
                {logs.map((log, i) => (
                  <div key={i} className="text-xs flex items-center justify-between p-2 rounded bg-muted/50">
                    <span className="truncate max-w-[200px]">{log.url}</span>
                    <div className="flex items-center gap-2">
                      {log.status_code === 200 || log.status_code === 202 ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <XCircle className="w-3 h-3 text-destructive" />
                      )}
                      <span className="font-mono">{log.status_code}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-center text-muted-foreground py-8">Nenhum log encontrado</p>
            )}
          </ScrollArea>
        </div>

        <Button className="w-full" onClick={handleSave} disabled={saving}>
          {saving && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
          Salvar Configurações IndexNow
        </Button>
      </CardContent>
    </Card>
  );
}
