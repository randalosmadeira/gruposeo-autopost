import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import {
  Bot,
  FileCode,
  Globe,
  Newspaper,
  Search,
  Shield,
  Save,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Copy,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface AgentConfig {
  id: string;
  name: string;
  icon: React.ElementType;
  iconColor: string;
  description: string;
  templatePath: string;
  enabled: boolean;
  prompt: string;
  category: string;
}

const STORAGE_KEY = 'cf_system_prompts_config';

const defaultAgents: AgentConfig[] = [
  {
    id: 'editor-seo-geo',
    name: 'Editor SEO + GEO',
    icon: Search,
    iconColor: '#4169E1',
    description: 'Redator SEO Sênior V4. Filosofia Madeira Sem Verniz. Flesch 70-100, 11 blocos, 5 CTAs, E-E-A-T.',
    templatePath: '/templates/system-prompt-editor-seo-geo.md',
    enabled: true,
    prompt: '',
    category: 'Geração',
  },
  {
    id: 'agente-jornalistico',
    name: 'Agente Jornalístico',
    icon: Newspaper,
    iconColor: '#10B981',
    description: 'Repostagem Jornalística v3.0. Pirâmide invertida + SEO + Compliance Lei 9.610/98.',
    templatePath: '/templates/system-prompt-agente-jornalistico.md',
    enabled: true,
    prompt: '',
    category: 'Geração',
  },
  {
    id: 'agente-construtor-blogs',
    name: 'Construtor de Blogs',
    icon: FileCode,
    iconColor: '#F97316',
    description: 'Planejador de blogs com clusters topicais, pillar pages e calendário editorial.',
    templatePath: '/templates/system-prompt-agente-construtor-blogs.md',
    enabled: true,
    prompt: '',
    category: 'Planejamento',
  },
  {
    id: 'agente-auditoria',
    name: 'Auditoria & Indexação',
    icon: Shield,
    iconColor: '#EF4444',
    description: 'Auditoria técnica SEO, análise de indexação, Schema Markup e correção automática.',
    templatePath: '/templates/system-prompt-agente-auditoria-indexacao.md',
    enabled: true,
    prompt: '',
    category: 'Automação',
  },
  {
    id: 'agente-metadados',
    name: 'Metadados & Schema',
    icon: Globe,
    iconColor: '#8B5CF6',
    description: 'Geração de metadados SEO (Title, Description, OG, Twitter) e JSON-LD Schema Markup.',
    templatePath: '/templates/system-prompt-agente-metadados-schema.md',
    enabled: true,
    prompt: '',
    category: 'Automação',
  },
];

export default function SystemPrompts() {
  const { toast } = useToast();
  const [agents, setAgents] = useState<AgentConfig[]>(defaultAgents);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState<Set<string>>(new Set());
  const [hasChanges, setHasChanges] = useState(false);

  // Load saved config from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<AgentConfig>[];
        setAgents(prev => prev.map(agent => {
          const savedAgent = parsed.find((s: any) => s.id === agent.id);
          if (savedAgent) {
            return { ...agent, enabled: savedAgent.enabled ?? agent.enabled, prompt: savedAgent.prompt || '' };
          }
          return agent;
        }));
      }
    } catch { /* ignore */ }
  }, []);

  const loadTemplate = async (agentId: string) => {
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return;
    
    setLoadingTemplates(prev => new Set([...prev, agentId]));
    try {
      const resp = await fetch(agent.templatePath);
      if (resp.ok) {
        const text = await resp.text();
        setAgents(prev => prev.map(a => a.id === agentId ? { ...a, prompt: text } : a));
        setHasChanges(true);
      } else {
        toast({ title: 'Erro', description: 'Template não encontrado.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Erro', description: 'Falha ao carregar template.', variant: 'destructive' });
    } finally {
      setLoadingTemplates(prev => { const s = new Set(prev); s.delete(agentId); return s; });
    }
  };

  const toggleAgent = (agentId: string) => {
    setAgents(prev => prev.map(a => a.id === agentId ? { ...a, enabled: !a.enabled } : a));
    setHasChanges(true);
  };

  const updatePrompt = (agentId: string, prompt: string) => {
    setAgents(prev => prev.map(a => a.id === agentId ? { ...a, prompt } : a));
    setHasChanges(true);
  };

  const saveAll = () => {
    const toSave = agents.map(a => ({ id: a.id, enabled: a.enabled, prompt: a.prompt }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    setHasChanges(false);
    toast({ title: 'Salvo!', description: 'Configurações dos agentes salvas com sucesso.' });
  };

  const copyPrompt = (prompt: string) => {
    navigator.clipboard.writeText(prompt);
    toast({ title: 'Copiado!', description: 'Prompt copiado para a área de transferência.' });
  };

  const enabledCount = agents.filter(a => a.enabled).length;
  const categories = [...new Set(agents.map(a => a.category))];

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <Bot className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">System Prompts dos Agentes</h1>
              <p className="text-sm text-muted-foreground">
                Gerencie, edite e ative os 5 agentes de IA disponíveis
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="text-sm">
              {enabledCount}/{agents.length} ativos
            </Badge>
            <Button onClick={saveAll} disabled={!hasChanges} className="bg-gradient-accent hover:opacity-90">
              <Save className="w-4 h-4 mr-2" />
              Salvar Tudo
            </Button>
          </div>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {categories.map(category => (
          <div key={category}>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">{category}</h2>
            <div className="space-y-3">
              {agents.filter(a => a.category === category).map(agent => {
                const Icon = agent.icon;
                const isExpanded = expandedAgent === agent.id;
                const isLoading = loadingTemplates.has(agent.id);

                return (
                  <Collapsible key={agent.id} open={isExpanded} onOpenChange={() => setExpandedAgent(isExpanded ? null : agent.id)}>
                    <Card className={cn('border transition-all', agent.enabled ? 'border-border' : 'border-border/50 opacity-70')}>
                      <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors py-4">
                          <div className="flex items-center gap-4">
                            <div className="p-2.5 rounded-xl" style={{ backgroundColor: `${agent.iconColor}15` }}>
                              <Icon className="w-5 h-5" style={{ color: agent.iconColor }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <CardTitle className="text-base">{agent.name}</CardTitle>
                                {agent.enabled ? (
                                  <Badge variant="outline" className="text-xs text-green-600 border-green-200 bg-green-50">
                                    <Eye className="w-3 h-3 mr-1" /> Ativo
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs text-muted-foreground">
                                    <EyeOff className="w-3 h-3 mr-1" /> Inativo
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground mt-0.5">{agent.description}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <Switch
                                checked={agent.enabled}
                                onCheckedChange={() => toggleAgent(agent.id)}
                                onClick={e => e.stopPropagation()}
                              />
                              {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                            </div>
                          </div>
                        </CardHeader>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent className="pt-0 space-y-4">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => loadTemplate(agent.id)}
                              disabled={isLoading}
                            >
                              <RotateCcw className={cn('w-3.5 h-3.5 mr-1.5', isLoading && 'animate-spin')} />
                              {agent.prompt ? 'Recarregar Template' : 'Carregar Template'}
                            </Button>
                            {agent.prompt && (
                              <Button variant="outline" size="sm" onClick={() => copyPrompt(agent.prompt)}>
                                <Copy className="w-3.5 h-3.5 mr-1.5" /> Copiar
                              </Button>
                            )}
                            <span className="text-xs text-muted-foreground ml-auto">
                              {agent.prompt.length.toLocaleString()} caracteres
                            </span>
                          </div>
                          <ScrollArea className="max-h-[500px]">
                            <Textarea
                              value={agent.prompt}
                              onChange={e => updatePrompt(agent.id, e.target.value)}
                              placeholder="Clique em 'Carregar Template' para carregar o prompt padrão ou cole seu prompt personalizado aqui..."
                              className="min-h-[300px] font-mono text-xs leading-relaxed resize-y"
                            />
                          </ScrollArea>
                        </CardContent>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
