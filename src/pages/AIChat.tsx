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
  Shield, RefreshCw, Globe, Paperclip, X, CheckCircle,
  FileUp, BarChart3
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  attachments?: UploadedFile[];
}

interface ProjectContext {
  id: string;
  name: string;
  domain: string;
  wordpress_url: string | null;
  is_connected: boolean;
  seo_plugin: string | null;
}

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  format: string;
  status: 'uploading' | 'uploaded' | 'analyzing' | 'completed' | 'error';
  analysis?: any;
  error?: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;
const ANALYZE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-file`;

interface QuickAction {
  label: string;
  icon: typeof Target;
  prompt: string;
  directAction?: { type: string; project_id: string };
}

const quickActions: QuickAction[] = [
  { label: 'Sugerir palavras-chave', icon: Target, prompt: 'Sugira 10 palavras-chave de cauda longa para o nicho de ' },
  { label: 'Criar título SEO', icon: Sparkles, prompt: 'Crie 5 títulos otimizados para SEO sobre ' },
  { label: 'Gerar outline', icon: FileText, prompt: 'Crie uma estrutura completa de artigo SEO sobre ' },
  { label: 'Auditoria SEO completa', icon: Search, prompt: 'Executando auditoria SEO completa em todos os projetos...', directAction: { type: 'run_all_projects_audit', project_id: 'all' } },
  { label: 'Links quebrados e 404', icon: AlertTriangle, prompt: 'Verifique os status das últimas correções de links quebrados, FAQs duplicadas e URLs em duplicidade.' },
  { label: 'Backlinks e linkagem', icon: Link, prompt: 'Mostre as sugestões de links internos pendentes e quantos backlinks já foram criados entre meus artigos.' },
  { label: 'Meta tags e SEO', icon: Shield, prompt: 'Quantas meta tags foram auditadas e corrigidas? Mostre os resultados reais das últimas execuções do Agente SEO.' },
  { label: 'Sincronizar WordPress', icon: RefreshCw, prompt: 'Sincronizando estatísticas WordPress...', directAction: { type: 'sync_wordpress_stats', project_id: 'all' } },
  { label: 'Estatísticas de artigos', icon: Globe, prompt: 'Mostre estatísticas completas: artigos gerados, publicados, prontos e com erro.' },
];

async function streamChat({
  messages,
  context,
  onDelta,
  onDone,
  onError,
}: {
  messages: Array<{ role: string; content: string }>;
  context?: { projects: ProjectContext[]; articleCount?: number; userId?: string };
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileFormat(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (ext === 'csv') return 'csv';
  if (ext === 'xlsx' || ext === 'xls') return 'xlsx';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'json') return 'json';
  if (ext === 'xml') return 'xml';
  return ext;
}

const ACCEPTED_FORMATS = '.csv,.xlsx,.xls,.pdf,.tsv,.txt,.json,.xml';
const ACCEPTED_EXTENSIONS = ['csv', 'xlsx', 'xls', 'pdf', 'tsv', 'txt', 'json', 'xml'];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export default function AIChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [projects, setProjects] = useState<ProjectContext[]>([]);
  const [articleCount, setArticleCount] = useState(0);
  const [pendingFiles, setPendingFiles] = useState<UploadedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const uploadAndAnalyzeFile = async (file: File): Promise<UploadedFile | null> => {
    if (!user) {
      toast({ title: 'Erro no upload', description: 'Faça login para enviar arquivos.', variant: 'destructive' });
      return null;
    }

    const format = getFileFormat(file.name);
    if (!ACCEPTED_EXTENSIONS.includes(format)) {
      toast({
        title: 'Formato não suportado',
        description: 'Envie arquivos CSV, XLSX, PDF, JSON, XML ou TXT exportados do GSC, Google Ads, AdSense ou Tag Manager.',
        variant: 'destructive',
      });
      return null;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: 'Arquivo muito grande',
        description: 'O arquivo deve ter no máximo 20MB.',
        variant: 'destructive',
      });
      return null;
    }

    // Ensure we have a valid session before uploading
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      // Try refreshing
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        toast({ title: 'Sessão expirada', description: 'Por favor, faça login novamente.', variant: 'destructive' });
        return null;
      }
    }

    const fileId = crypto.randomUUID();
    // Sanitize filename: remove accents, replace spaces and special chars
    const sanitizedName = file.name
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
      .replace(/[^a-zA-Z0-9._-]/g, '_'); // replace special chars with underscore
    const filePath = `${user.id}/${fileId}-${sanitizedName}`;
    
    const uploadedFile: UploadedFile = {
      id: fileId,
      name: file.name,
      size: file.size,
      format,
      status: 'uploading',
    };

    setPendingFiles(prev => [...prev, uploadedFile]);

    try {
      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('analysis-uploads')
        .upload(filePath, file);

      if (uploadError) throw new Error(uploadError.message);

      // Create DB record
      const { data: dbRecord, error: dbError } = await supabase
        .from('analysis_uploads')
        .insert({
          user_id: user.id,
          file_name: file.name,
          file_path: filePath,
          file_type: 'generic',
          file_format: format === 'xls' ? 'xlsx' : format,
          file_size_bytes: file.size,
          status: 'uploaded',
        })
        .select('id')
        .single();

      if (dbError) throw new Error(dbError.message);

      // Update state
      const realId = dbRecord.id;
      setPendingFiles(prev => prev.map(f =>
        f.id === fileId ? { ...f, id: realId, status: 'uploaded' } : f
      ));

      // Trigger analysis
      setPendingFiles(prev => prev.map(f =>
        f.id === realId ? { ...f, status: 'analyzing' } : f
      ));

      const { data: { session } } = await supabase.auth.getSession();
      const analyzeResp = await fetch(ANALYZE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ uploadId: realId }),
      });

      const result = await analyzeResp.json();

      if (!analyzeResp.ok || !result.success) {
        throw new Error(result.error || 'Erro na análise');
      }

      const completedFile: UploadedFile = {
        id: realId,
        name: file.name,
        size: file.size,
        format,
        status: 'completed',
        analysis: result.analysis,
      };

      setPendingFiles(prev => prev.map(f =>
        f.id === realId ? completedFile : f
      ));

      return completedFile;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Erro desconhecido';
      setPendingFiles(prev => prev.map(f =>
        f.id === fileId ? { ...f, status: 'error', error: errMsg } : f
      ));
      toast({
        title: 'Erro no upload',
        description: errMsg,
        variant: 'destructive',
      });
      return null;
    }
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files).slice(0, 5); // Max 5 files at once
    
    for (const file of fileArray) {
      await uploadAndAnalyzeFile(file);
    }
  };

  const removePendingFile = (fileId: string) => {
    setPendingFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const cleanupCompletedFiles = async () => {
    if (!user) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(ANALYZE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ action: 'cleanup' }),
      });
      const result = await resp.json();
      if (result.success) {
        toast({
          title: '🗑️ Limpeza concluída',
          description: result.message,
        });
        setPendingFiles(prev => prev.filter(f => f.status !== 'completed'));
      }
    } catch {
      toast({ title: 'Erro na limpeza', variant: 'destructive' });
    }
  };

  const executeDirectAction = async (action: QuickAction) => {
    if (!action.directAction || isLoading) return;

    const userMsg: Message = {
      role: 'user',
      content: action.label,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    // Show "executing" message
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: `⏳ **${action.prompt}**\n\nAguarde enquanto executo a ação...`,
      timestamp: new Date(),
    }]);

    try {
      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          executeActions: [action.directAction],
          context: { userId: user?.id },
        }),
      });
      const result = await resp.json();
      const actionResult = result.results?.[0]?.result || 'Ação executada sem retorno.';

      // Replace the "executing" message with the result
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: `**⚡ ${action.label} — Resultado:**\n\n${actionResult}`,
          timestamp: new Date(),
        };
        return updated;
      });
    } catch (error) {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: `❌ Erro ao executar ${action.label}: ${error instanceof Error ? error.message : 'erro desconhecido'}`,
          timestamp: new Date(),
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async (text?: string) => {
    const messageText = text || input.trim();
    if ((!messageText && pendingFiles.length === 0) || isLoading) return;

    // Build message content including file analysis results
    let fullContent = messageText;
    const completedFiles = pendingFiles.filter(f => f.status === 'completed' && f.analysis);

    if (completedFiles.length > 0) {
      const analysisContext = completedFiles.map(f => {
        const a = f.analysis;
        return `\n\n📎 **Arquivo analisado: ${f.name}** (${f.format.toUpperCase()})\n` +
          `Tipo detectado: ${a.file_type || 'genérico'}\n` +
          `Score de saúde SEO: ${a.health_score ?? 'N/A'}/100\n` +
          `Resumo: ${a.summary || 'N/A'}\n` +
          `Issues críticos: ${(a.critical_issues || []).length}\n` +
          `Oportunidades: ${(a.opportunities || []).length}\n` +
          `Recomendações: ${(a.recommendations || []).length}`;
      }).join('');

      const detailedAnalysis = completedFiles.map(f => {
        return `\n\nDADOS COMPLETOS DA ANÁLISE DO ARQUIVO "${f.name}":\n${JSON.stringify(f.analysis, null, 2)}`;
      }).join('');

      fullContent = (messageText || 'Analise os arquivos anexados e me dê um plano de ação completo com prioridades.') +
        analysisContext +
        '\n\n[CONTEXTO TÉCNICO PARA A IA - dados completos da análise]:' +
        detailedAnalysis;
    }

    const userMsg: Message = {
      role: 'user',
      content: messageText || 'Analise os arquivos anexados e me dê um plano de ação completo.',
      timestamp: new Date(),
      attachments: completedFiles.length > 0 ? [...completedFiles] : undefined,
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    // Clear completed files after sending
    if (completedFiles.length > 0) {
      setPendingFiles(prev => prev.filter(f => f.status !== 'completed'));
    }

    let assistantSoFar = '';

    const allMessages = [...messages, { role: 'user' as const, content: fullContent }]
      .map(m => ({ role: m.role, content: m.content }));

    try {
      await streamChat({
        messages: allMessages,
        context: { projects, articleCount, userId: user?.id },
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
        onDone: async () => {
          // Detect and execute action blocks from AI response
          const actionMatch = assistantSoFar.match(/```action\s*\n?([\s\S]*?)\n?```/);
          if (actionMatch) {
            try {
              const actionData = JSON.parse(actionMatch[1].trim());
              const resp = await fetch(CHAT_URL, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                },
                body: JSON.stringify({
                  executeActions: [actionData],
                  context: { userId: user?.id },
                }),
              });
              const result = await resp.json();
              if (result.results?.[0]?.result) {
                const actionResult = result.results[0].result;
                setMessages(prev => [...prev, {
                  role: 'assistant',
                  content: `**⚡ Resultado da ação:**\n\n${actionResult}`,
                  timestamp: new Date(),
                }]);
              }
            } catch {
              // Action parse failed, ignore
            }
          }

          // Auto-cleanup after analysis is fully processed
          if (completedFiles.length > 0) {
            setTimeout(() => cleanupCompletedFiles(), 2000);
          }

          setIsLoading(false);
        },
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
    setPendingFiles([]);
    toast({ title: 'Chat limpo', description: 'Conversa reiniciada.' });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const hasCompletedFiles = pendingFiles.some(f => f.status === 'completed');
  const hasAnalyzingFiles = pendingFiles.some(f => f.status === 'uploading' || f.status === 'analyzing');

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
      <Card
        className={cn(
          "flex-1 flex flex-col overflow-hidden border-border/50 transition-colors",
          isDragOver && "border-primary border-2 bg-primary/5"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        {isDragOver && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-primary/5 rounded-lg pointer-events-none">
            <div className="text-center">
              <FileUp className="w-12 h-12 text-primary mx-auto mb-2" />
              <p className="text-sm font-medium text-primary">Solte o arquivo aqui</p>
              <p className="text-xs text-muted-foreground">CSV, XLSX, PDF do GSC ou Ubersuggest</p>
            </div>
          </div>
        )}

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
                <p className="text-xs text-primary/80 mt-2 flex items-center justify-center gap-1">
                  <Paperclip className="w-3 h-3" />
                  Anexe arquivos do GSC, Google Ads, AdSense, Tag Manager ou Ubersuggest para análise automática com IA
                </p>
                {projects.length > 0 && (
                  <p className="text-xs text-primary mt-1">
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
                      onClick={() => {
                        if (action.directAction) {
                          executeDirectAction(action);
                        } else {
                          setInput(action.prompt);
                        }
                      }}
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
                  {/* Show attachments if any */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {msg.attachments.map(att => (
                        <span key={att.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-background/20 text-xs">
                          <BarChart3 className="w-3 h-3" />
                          {att.name}
                        </span>
                      ))}
                    </div>
                  )}
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

        {/* Pending files bar */}
        {pendingFiles.length > 0 && (
          <div className="border-t border-border/50 px-3 py-2 flex flex-wrap gap-2 items-center">
            {pendingFiles.map(f => (
              <div
                key={f.id}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border",
                  f.status === 'completed' && "bg-accent border-primary/30 text-primary",
                  f.status === 'error' && "bg-destructive/10 border-destructive/30 text-destructive",
                  (f.status === 'uploading' || f.status === 'analyzing') && "bg-primary/10 border-primary/30 text-primary",
                  f.status === 'uploaded' && "bg-muted border-border text-muted-foreground",
                )}
              >
                {f.status === 'completed' ? (
                  <CheckCircle className="w-3.5 h-3.5" />
                ) : f.status === 'error' ? (
                  <AlertTriangle className="w-3.5 h-3.5" />
                ) : (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                <span className="max-w-[120px] truncate font-medium">{f.name}</span>
                <span className="text-[10px] opacity-70">{formatFileSize(f.size)}</span>
                {(f.status === 'completed' || f.status === 'error') && (
                  <button onClick={() => removePendingFile(f.id)} className="ml-0.5 hover:opacity-70">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
            {hasCompletedFiles && (
              <span className="text-[10px] text-muted-foreground ml-1">
                ✅ Pronto — envie uma mensagem para a IA analisar
              </span>
            )}
          </div>
        )}

        {/* Input */}
        <div className="border-t border-border/50 p-3">
          <div className="flex gap-2 items-end">
            {/* File upload button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-[44px] w-[44px] flex-shrink-0 text-muted-foreground hover:text-primary"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || hasAnalyzingFiles}
              title="Anexar arquivo (GSC, Ubersuggest, CSV, XLSX, PDF)"
            >
              <Paperclip className="w-5 h-5" />
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_FORMATS}
              multiple
              className="hidden"
              onChange={e => {
                handleFileSelect(e.target.files);
                e.target.value = '';
              }}
            />
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={hasCompletedFiles
                ? "Descreva o que deseja analisar nos arquivos anexados..."
                : "Pergunte sobre SEO, plugin WordPress, auditorias, linkagem interna..."
              }
              className="min-h-[44px] max-h-[120px] resize-none border-border/50 bg-background"
              rows={1}
              disabled={isLoading}
            />
            <Button
              onClick={() => sendMessage()}
              disabled={(!input.trim() && !hasCompletedFiles) || isLoading || hasAnalyzingFiles}
              size="icon"
              className="h-[44px] w-[44px] flex-shrink-0"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
            Powered by Lovable AI · Anexe arquivos GSC, Google Ads, AdSense, Tag Manager (CSV/XLSX/PDF/JSON/XML) para análise automática
          </p>
        </div>
      </Card>
    </div>
  );
}
