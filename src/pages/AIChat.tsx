import { useState, useRef, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { 
  Send, Bot, User, Sparkles, Loader2, Trash2, 
  Target, FileText, Link, Search, AlertTriangle,
  Shield, RefreshCw, Globe
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ProjectContext {
  id: string;
  name: string;
  domain: string;
  wordpress_url: string | null;
  is_connected: boolean;
  seo_plugin: string | null;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;

const quickActions = [
  { label: 'Sugerir palavras-chave', icon: Target, prompt: 'Sugira 10 palavras-chave de cauda longa para o nicho de ' },
  { label: 'Criar título SEO', icon: Sparkles, prompt: 'Crie 5 títulos otimizados para SEO sobre ' },
  { label: 'Gerar outline', icon: FileText, prompt: 'Crie uma estrutura completa de artigo SEO sobre ' },
  { label: 'Auditoria SEO completa', icon: Search, prompt: 'Como funciona o Agente SEO Autônomo? Ele já rodou auditoria nos meus projetos WordPress? Mostre o que foi encontrado e corrigido.' },
  { label: 'Links quebrados e 404', icon: AlertTriangle, prompt: 'Como o AI Auto-Fix do plugin detecta e corrige automaticamente links quebrados (404), FAQs duplicadas e URLs em duplicidade nos meus sites WordPress?' },
  { label: 'Backlinks e linkagem interna', icon: Link, prompt: 'Como funciona o motor de linkagem interna inteligente? Ele já criou backlinks entre meus artigos automaticamente? Onde vejo os resultados?' },
  { label: 'Meta tags e SEO On-Page', icon: Shield, prompt: 'Como o AI Meta Auditor do plugin audita e corrige titles, meta descriptions, Open Graph tags e Twitter Cards automaticamente?' },
  { label: 'Diagnóstico WordPress', icon: RefreshCw, prompt: 'Quais módulos do plugin ContentFactory RDM estão ativos nos meus sites? Como verificar o diagnóstico e saúde de cada projeto?' },
];

async function streamChat({
  messages,
  context,
  onDelta,
  onDone,
  onError,
}: {
  messages: Array<{ role: string; content: string }>;
  context?: { projects: ProjectContext[]; articleCount?: number };
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}) {
  const resp = await fetch(CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ messages, context }),
  });

  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({ error: 'Erro de conexão' }));
    onError(errorData.error || `Erro ${resp.status}`);
    return;
  }

  if (!resp.body) {
    onError('Resposta vazia do servidor');
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let textBuffer = '';
  let streamDone = false;

  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) break;
    textBuffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
      let line = textBuffer.slice(0, newlineIndex);
      textBuffer = textBuffer.slice(newlineIndex + 1);

      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line.startsWith(':') || line.trim() === '') continue;
      if (!line.startsWith('data: ')) continue;

      const jsonStr = line.slice(6).trim();
      if (jsonStr === '[DONE]') {
        streamDone = true;
        break;
      }

      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch {
        textBuffer = line + '\n' + textBuffer;
        break;
      }
    }
  }

  // Flush remaining
  if (textBuffer.trim()) {
    for (let raw of textBuffer.split('\n')) {
      if (!raw) continue;
      if (raw.endsWith('\r')) raw = raw.slice(0, -1);
      if (raw.startsWith(':') || raw.trim() === '') continue;
      if (!raw.startsWith('data: ')) continue;
      const jsonStr = raw.slice(6).trim();
      if (jsonStr === '[DONE]') continue;
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch { /* ignore */ }
    }
  }

  onDone();
}

function renderMarkdown(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-sm">$1</code>')
    .replace(/^### (.*$)/gm, '<h3 class="text-base font-semibold mt-3 mb-1">$1</h3>')
    .replace(/^## (.*$)/gm, '<h2 class="text-lg font-bold mt-4 mb-2">$1</h2>')
    .replace(/^# (.*$)/gm, '<h1 class="text-xl font-bold mt-4 mb-2">$1</h1>')
    .replace(/^- (.*$)/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^(\d+)\. (.*$)/gm, '<li class="ml-4 list-decimal">$2</li>')
    .replace(/\n/g, '<br/>');
}

export default function AIChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [projects, setProjects] = useState<ProjectContext[]>([]);
  const [articleCount, setArticleCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 50);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Load user's projects and article count for AI context
  useEffect(() => {
    const loadContext = async () => {
      if (!user) return;
      
      const [projectsRes, articlesRes] = await Promise.all([
        supabase
          .from('projects')
          .select('id, name, domain, wordpress_url, is_connected, seo_plugin')
          .eq('user_id', user.id),
        supabase
          .from('articles')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id),
      ]);

      if (projectsRes.data) setProjects(projectsRes.data);
      if (articlesRes.count !== null) setArticleCount(articlesRes.count);
    };
    loadContext();
  }, [user]);

  const sendMessage = async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || isLoading) return;

    const userMsg: Message = { role: 'user', content: messageText, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    let assistantSoFar = '';

    const allMessages = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));

    try {
      await streamChat({
        messages: allMessages,
        context: { projects, articleCount },
        onDelta: (chunk) => {
          assistantSoFar += chunk;
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant') {
              return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
            }
            return [...prev, { role: 'assistant', content: assistantSoFar, timestamp: new Date() }];
          });
        },
        onDone: () => setIsLoading(false),
        onError: (error) => {
          setIsLoading(false);
          toast({ title: 'Erro', description: error, variant: 'destructive' });
        },
      });
    } catch (e) {
      setIsLoading(false);
      toast({ title: 'Erro de conexão', description: 'Não foi possível conectar ao assistente IA.', variant: 'destructive' });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([]);
    toast({ title: 'Chat limpo', description: 'Conversa reiniciada.' });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] p-4 lg:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Assistente IA</h1>
            <p className="text-xs text-muted-foreground">SEO, conteúdo e estratégia</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {projects.length > 0 && (
            <Badge variant="outline" className="text-xs gap-1">
              <Globe className="w-3 h-3" />
              {projects.length} projeto{projects.length > 1 ? 's' : ''}
            </Badge>
          )}
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearChat} className="text-muted-foreground">
              <Trash2 className="w-4 h-4 mr-1" /> Limpar
            </Button>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <Card className="flex-1 flex flex-col overflow-hidden border-border/50">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Como posso ajudar?</h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-md">
                  Sou seu assistente especializado em SEO, conteúdo e automação WordPress.
                  Conheço todas as funcionalidades da plataforma e do plugin.
                </p>
                {projects.length > 0 && (
                  <p className="text-xs text-primary mt-2">
                    📋 {projects.length} projeto{projects.length > 1 ? 's' : ''} conectado{projects.length > 1 ? 's' : ''} • {articleCount} artigo{articleCount !== 1 ? 's' : ''}
                  </p>
                )}
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                {quickActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.label}
                      onClick={() => setInput(action.prompt)}
                      className="flex items-center gap-2 p-3 rounded-lg border border-border/50 bg-card hover:bg-accent/50 transition-colors text-left text-sm"
                    >
                      <Icon className="w-4 h-4 text-primary flex-shrink-0" />
                      <span className="text-foreground">{action.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  'flex gap-3',
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                )}
                <div
                  className={cn(
                    'max-w-[80%] rounded-xl px-4 py-3 text-sm',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/50 text-foreground'
                  )}
                >
                  {msg.role === 'assistant' ? (
                    <div
                      className="prose prose-sm max-w-none dark:prose-invert [&_li]:my-0.5"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-1">
                    <User className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))
          )}
          {isLoading && messages[messages.length - 1]?.role === 'user' && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div className="bg-muted/50 rounded-xl px-4 py-3">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-border/50 p-3">
          <div className="flex gap-2 items-end">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pergunte sobre SEO, plugin WordPress, auditorias, linkagem interna..."
              className="min-h-[44px] max-h-[120px] resize-none border-border/50 bg-background"
              rows={1}
              disabled={isLoading}
            />
            <Button
              onClick={() => sendMessage()}
              disabled={!input.trim() || isLoading}
              size="icon"
              className="h-[44px] w-[44px] flex-shrink-0"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
            Powered by Lovable AI · Conhece todas as funcionalidades da plataforma e plugin WordPress
          </p>
        </div>
      </Card>
    </div>
  );
}
