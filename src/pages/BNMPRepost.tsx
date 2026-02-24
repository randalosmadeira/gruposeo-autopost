import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Gavel,
  Plus,
  Trash2,
  Sparkles,
  Loader2,
  Shield,
  ExternalLink,
  Scale,
  Flame,
  Search,
  FileText,
  RotateCcw,
  MessageSquare,
  ClipboardPaste,
  Bot,
  CheckCircle2,
} from 'lucide-react';
import { useNewsRewriter } from '@/hooks/useNewsRewriter';
import { useProjects } from '@/hooks/useProjects';
import { MadeiraNelesPainel } from '@/components/news-rewriter/MadeiraNelesPainel';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface MandadoEntry {
  id: string;
  numero: string;
  nome: string;
  alcunha: string;
  situacao: string;
  data: string;
  orgaoExpedidor: string;
  tipoPeca: string;
  crimeRelacionado: string;
  observacoes: string;
  selected: boolean;
}

const TIPO_PECA_OPTIONS = [
  'Mandado de Prisão',
  'Mandado de Busca e Apreensão',
  'Mandado de Captura',
  'Mandado de Internação',
];

const createEmptyMandado = (): MandadoEntry => ({
  id: crypto.randomUUID(),
  numero: '',
  nome: '',
  alcunha: '',
  situacao: 'Pendente de Cumprimento',
  data: '',
  orgaoExpedidor: '',
  tipoPeca: 'Mandado de Prisão',
  crimeRelacionado: '',
  observacoes: '',
  selected: true,
});

// Parse pasted text from BNMP portal table format
function parseBulkText(text: string): MandadoEntry[] {
  const entries: MandadoEntry[] = [];

  // Regex for BNMP process numbers (e.g. 0000894-73.2022.8.02.0001.01.0007-01)
  const processNumberRegex = /(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\.\d{2}\.\d{4}-\d{2})/g;
  const matches = [...text.matchAll(processNumberRegex)];

  if (matches.length > 0) {
    // Tabular BNMP format detected — split text by process numbers
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index!;
      const end = i + 1 < matches.length ? matches[i + 1].index! : text.length;
      const block = text.substring(start, end).trim();
      const numero = matches[i][1];

      const entry = createEmptyMandado();
      entry.numero = numero;

      // Extract "Mandado de Prisão" / "Mandado de Busca e Apreensão" etc at end of block
      if (/Mandado de Busca/i.test(block)) entry.tipoPeca = 'Mandado de Busca e Apreensão';
      else if (/Mandado de Captura/i.test(block)) entry.tipoPeca = 'Mandado de Captura';
      else if (/Mandado de Interna/i.test(block)) entry.tipoPeca = 'Mandado de Internação';
      else entry.tipoPeca = 'Mandado de Prisão';

      // Status
      if (/Pendente de Cumprimento/i.test(block)) entry.situacao = 'Pendente de Cumprimento';
      else if (/Cumprido/i.test(block)) entry.situacao = 'Cumprido';
      else if (/Suspenso/i.test(block)) entry.situacao = 'Suspenso';

      // Extract dates (DD/MM/YYYY) — typically 2: birth date and expedition date
      const dates = [...block.matchAll(/(\d{2}\/\d{2}\/\d{4})/g)].map(m => m[1]);
      // Last date before "Pendente/Cumprido" is usually the expedition date
      if (dates.length >= 2) {
        entry.data = dates[dates.length - 1]; // expedition date is the later one contextually
      } else if (dates.length === 1) {
        entry.data = dates[0];
      }

      // Remove process number from block to parse name
      let rest = block.replace(processNumberRegex, '').trim();

      // Remove the peça type from end
      rest = rest.replace(/Mandado de (Prisão|Busca e Apreensão|Captura|Internação)/gi, '').trim();

      // Remove known status text
      rest = rest.replace(/Pendente de Cumprimento/gi, '').trim();
      rest = rest.replace(/Cumprido|Suspenso|Cancelado/gi, '').trim();

      // Remove dates
      rest = rest.replace(/\d{2}\/\d{2}\/\d{4}/g, '').trim();

      // Extract name: first capitalized words before "Não Informado" or known alcunhas
      const restParts = rest.split(/\s+/);
      const nameWords: string[] = [];
      const stopWords = ['Não', 'NÃO', 'VARA', 'FORUM', 'COMARCA', 'Vara', 'Mandado', 'NÚCLEO', 'Pendente', 'Cumprido'];
      for (const w of restParts) {
        if (stopWords.some(s => w.startsWith(s))) break;
        if (/^[A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑa-záàâãéèêíïóôõöúçñ]/.test(w) && w.length > 1) {
          nameWords.push(w);
        } else if (nameWords.length >= 2) {
          break;
        }
      }
      entry.nome = nameWords.join(' ').trim();

      // Extract orgão — look for VARA / TRIBUNAL / FORUM patterns
      const orgaoMatch = block.match(/((?:\d+[ªº]?\s*)?(?:VARA|Vara|JUIZADO|Juizado|NÚCLEO|FORUM|Fórum|EXECU)[^\n]*?)(?:\s*Mandado|\s*$)/i);
      if (orgaoMatch) {
        entry.orgaoExpedidor = orgaoMatch[1].replace(/[-–—]\s*$/, '').trim();
      }

      if (entry.nome && entry.nome.length > 3) {
        entries.push(entry);
      }
    }
    return entries;
  }

  // Fallback: try label-based parsing (Nome:, Tipo:, etc.)
  const blocks = text.split(/(?:\n\s*\n|\n(?=\d+[\.\)\-]\s))/g).filter(b => b.trim());
  for (const block of blocks) {
    const lines = block.trim();
    if (!lines || lines.length < 5) continue;
    const entry = createEmptyMandado();

    const nomeMatch = lines.match(/(?:nome|procurado|réu)[:\s—\-]+([^\n|]+)/i);
    if (nomeMatch) entry.nome = nomeMatch[1].trim();

    if (/busca\s*e?\s*apreens/i.test(lines)) entry.tipoPeca = 'Mandado de Busca e Apreensão';
    else if (/captura/i.test(lines)) entry.tipoPeca = 'Mandado de Captura';

    const numMatch = lines.match(/(?:processo|nº|número)[:\s—\-]*([0-9.\-\/]+)/i);
    if (numMatch) entry.numero = numMatch[1].trim();

    const orgMatch = lines.match(/(?:comarca|tribunal|vara|orgão)[:\s—\-]+([^\n|]+)/i);
    if (orgMatch) entry.orgaoExpedidor = orgMatch[1].trim();

    const dataMatch = lines.match(/(\d{2}\/\d{2}\/\d{4})/);
    if (dataMatch) entry.data = dataMatch[1].trim();

    if (entry.nome) entries.push(entry);
  }

  return entries;
}

export default function BNMPRepost() {
  const { rewriteNews, isRewriting, progress, lastViralPackage } = useNewsRewriter();
  const { projects } = useProjects();

  const [mandados, setMandados] = useState<MandadoEntry[]>([createEmptyMandado()]);
  const [keyword, setKeyword] = useState('');
  const [projectId, setProjectId] = useState<string>('');
  const [autoPublish, setAutoPublish] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [inputMode, setInputMode] = useState<string>('manual');
  const [bulkText, setBulkText] = useState('');
  const [bulkParsed, setBulkParsed] = useState(false);

  const addMandado = () => {
    setMandados(prev => [...prev, createEmptyMandado()]);
  };

  const removeMandado = (id: string) => {
    if (mandados.length <= 1) return;
    setMandados(prev => prev.filter(m => m.id !== id));
  };

  const updateMandado = (id: string, field: keyof MandadoEntry, value: string | boolean) => {
    setMandados(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m));
  };

  const selectedMandados = mandados.filter(m => m.selected && m.nome.trim());

  const handleParseBulk = () => {
    if (!bulkText.trim()) {
      toast.error('Cole as informações dos mandados no campo acima');
      return;
    }

    const parsed = parseBulkText(bulkText);
    if (parsed.length === 0) {
      // If parsing fails, treat the entire text as a single entry for AI processing
      const fallback = createEmptyMandado();
      fallback.nome = 'Dados colados (processamento IA)';
      fallback.observacoes = bulkText.trim().substring(0, 500);
      setMandados([fallback]);
      setBulkParsed(true);
      toast.info('Dados enviados para processamento autônomo pela IA');
      return;
    }

    setMandados(parsed);
    setBulkParsed(true);
    toast.success(`${parsed.length} mandado(s) identificado(s) automaticamente`);
  };

  const handleSubmitBulkDirect = async () => {
    if (!bulkText.trim()) {
      toast.error('Cole as informações dos mandados');
      return;
    }

    const sourceContent = `DADOS PÚBLICOS DO BNMP - BANCO NACIONAL DE MONITORAMENTO DE PRISÕES (CNJ)
Portal: https://portalbnmp.cnj.jus.br/#/pesquisa-peca

INFORMAÇÕES COLADAS PELO OPERADOR (MODO CHAT-IA AUTÔNOMO):

${bulkText.trim()}

CONTEXTO: Dados de domínio público disponíveis no BNMP 3.0 do Conselho Nacional de Justiça. Qualquer pessoa pode consultar essas informações em portalbnmp.cnj.jus.br. O compartilhamento NÃO gera prejuízo às investigações policiais ou atos judiciais, conforme Art. 5º, XXXIII da CF e Lei 12.527/2011 (Lei de Acesso à Informação).

TIPO DE CONTEÚDO: Repostagem informativa de mandados — MODO MADEIRA NELES BNMP.
MODO: CHAT-IA AUTÔNOMO — A IA deve interpretar, auditar e estruturar TODOS os mandados encontrados no texto acima.

INSTRUÇÕES ESPECIAIS MODO AUTÔNOMO:
- INTERPRETAR automaticamente nomes, tipos de mandado, tribunais, datas e status
- AUDITAR conformidade legal de cada dado
- EXECUTAR TODOS OS 9 BLOCOS DO PROMPT MESTRE BNMP
- GERAR artigo completo para CADA mandado identificado ou artigo consolidado se forem do mesmo contexto
- DISCLAIMER LEGAL obrigatório no início e final
- Presunção de inocência (Art. 5º, LVII, CF)
- Links internos criminais (mín 4, máx 10)
- Links externos: BNMP, CNJ, e-SAJ, PF, Poupatempo, Certidão Antecedentes, TJs, STJ, STF
- 3 CTAs para advogado criminalista urgente
- FAQ 5+ perguntas sobre mandados e direitos
- Prompts de imagem (editorial, thumbnail, Instagram) — sem rostos reais
- Variações: Stories, Reels, Carrossel, E-mail nurturing
- Palavras-chave SEO naturalmente no conteúdo
- Mínimo 2.400 palavras`;

    const result = await rewriteNews({
      sourceUrl: 'https://portalbnmp.cnj.jus.br/#/pesquisa-peca',
      sourceContent,
      sourceName: 'BNMP - Banco Nacional de Monitoramento de Prisões (CNJ)',
      analysisAngle: 'Análise Criminal — Utilidade Pública, Direitos do Cidadão e CTA Criminalista',
      keyword: keyword || 'mandado de prisão BNMP CNJ',
      niche: 'advocacia',
      articleLength: 'long',
      projectId: projectId && projectId !== 'none' ? projectId : undefined,
      language: 'pt-BR',
      autoPublish: autoPublish && projectId && projectId !== 'none',
      rewriteMode: 'madeira_neles',
    });

    if (result) {
      setShowResult(true);
    }
  };

  const handleSubmit = async () => {
    if (selectedMandados.length === 0) return;

    const mandadosText = selectedMandados.map((m, i) =>
      `${i + 1}. NOME: ${m.nome} | TIPO: ${m.tipoPeca} | STATUS: ${m.situacao} | DATA: ${m.data || 'N/A'} | COMARCA/TRIBUNAL: ${m.orgaoExpedidor || 'N/A'} | Nº PROCESSO: ${m.numero || 'N/A'} | CRIME: ${m.crimeRelacionado || 'Não informado'} | OBS: ${m.observacoes || 'Nenhuma'}`
    ).join('\n');

    const sourceContent = `DADOS PÚBLICOS DO BNMP - BANCO NACIONAL DE MONITORAMENTO DE PRISÕES (CNJ)
Portal: https://portalbnmp.cnj.jus.br/#/pesquisa-peca

MANDADOS ENCONTRADOS (${selectedMandados.length} registro(s)):

${mandadosText}

CONTEXTO: Dados de domínio público disponíveis no BNMP 3.0 do Conselho Nacional de Justiça. Qualquer pessoa pode consultar essas informações em portalbnmp.cnj.jus.br. O compartilhamento NÃO gera prejuízo às investigações policiais ou atos judiciais, conforme Art. 5º, XXXIII da CF e Lei 12.527/2011 (Lei de Acesso à Informação).

TIPO DE CONTEÚDO: Repostagem informativa de mandados — MODO MADEIRA NELES BNMP.
ATIVAÇÃO: MADEIRA NELES + ${selectedMandados[0]?.nome || ''} + ${selectedMandados[0]?.tipoPeca || 'Mandado de Prisão'} + ${selectedMandados[0]?.orgaoExpedidor || 'Tribunal'}

INSTRUÇÕES ESPECIAIS:
- EXECUTAR TODOS OS 9 BLOCOS DO PROMPT MESTRE BNMP
- DISCLAIMER LEGAL obrigatório no início e final
- Presunção de inocência (Art. 5º, LVII, CF)
- Links internos criminais (mín 4, máx 10)
- Links externos: BNMP, CNJ, e-SAJ, PF, Poupatempo, Certidão Antecedentes, TJs, STJ, STF
- 3 CTAs para advogado criminalista urgente
- FAQ 5+ perguntas sobre mandados e direitos
- Prompts de imagem (editorial, thumbnail, Instagram) — sem rostos reais
- Variações: Stories, Reels, Carrossel, E-mail nurturing
- Palavras-chave SEO naturalmente no conteúdo
- Mínimo 2.400 palavras`;

    const result = await rewriteNews({
      sourceUrl: 'https://portalbnmp.cnj.jus.br/#/pesquisa-peca',
      sourceContent,
      sourceName: 'BNMP - Banco Nacional de Monitoramento de Prisões (CNJ)',
      analysisAngle: 'Análise Criminal — Utilidade Pública, Direitos do Cidadão e CTA Criminalista',
      keyword: keyword || `mandado de prisão ${selectedMandados[0]?.nome || ''}`.trim(),
      niche: 'advocacia',
      articleLength: 'long',
      projectId: projectId && projectId !== 'none' ? projectId : undefined,
      language: 'pt-BR',
      autoPublish: autoPublish && projectId && projectId !== 'none',
      rewriteMode: 'madeira_neles',
    });

    if (result) {
      setShowResult(true);
    }
  };

  const handleNewRepost = () => {
    setShowResult(false);
    setMandados([createEmptyMandado()]);
    setKeyword('');
    setBulkText('');
    setBulkParsed(false);
  };

  return (
    <div className="container max-w-6xl py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center">
            <Gavel className="w-6 h-6 text-orange-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              Repostagem BNMP
              <Badge className="bg-orange-500 text-white">Madeira Neles 🔥</Badge>
            </h1>
            <p className="text-muted-foreground text-sm">
              Mandados de Prisão, Captura e Busca e Apreensão — Dados públicos do CNJ
            </p>
          </div>
        </div>
        {showResult && (
          <Button variant="outline" onClick={handleNewRepost}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Nova Repostagem
          </Button>
        )}
      </div>

      {/* Legal Disclaimer */}
      <Alert className="border-amber-500/50 bg-amber-500/5">
        <Shield className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-sm">
          <strong>⚖️ Aviso Legal — Modo Madeira Neles:</strong> Informações de domínio e acesso público, disponíveis no Portal BNMP do CNJ ({' '}
          <a href="https://portalbnmp.cnj.jus.br/" target="_blank" rel="noopener noreferrer" className="text-primary underline">
            portalbnmp.cnj.jus.br
          </a>
          ), em conformidade com o Art. 5º, LX da CF e Art. 8º do CPP. A divulgação NÃO interfere ou prejudica investigações policiais ou atos judiciais. Conteúdo estritamente informativo e de interesse público. — RDM Advogados Associados.
        </AlertDescription>
      </Alert>

      {showResult && lastViralPackage ? (
        <MadeiraNelesPainel viralPackage={lastViralPackage} articleId="" articleTitle={`Mandados BNMP - ${selectedMandados[0]?.nome || 'Chat IA'}`} />
      ) : (
        <>
          {/* Quick Link to BNMP */}
          <Card className="border-primary/20">
            <CardContent className="py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Search className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Consultar mandados no Portal BNMP</p>
                    <p className="text-xs text-muted-foreground">Pesquise no portal oficial do CNJ e insira os dados abaixo</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <a href="https://portalbnmp.cnj.jus.br/#/pesquisa-peca" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Abrir BNMP
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Config */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Configuração</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Projeto</Label>
                  <Select value={projectId} onValueChange={setProjectId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o projeto" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum projeto</SelectItem>
                      {projects?.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Keyword SEO (opcional)</Label>
                  <Input
                    placeholder="Ex: mandado de prisão pendente SP"
                    value={keyword}
                    onChange={e => setKeyword(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      autoPublish && "bg-orange-500/10 border-orange-500 text-orange-600"
                    )}
                    onClick={() => setAutoPublish(!autoPublish)}
                    disabled={!projectId || projectId === 'none'}
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    {autoPublish ? 'Auto-publicar ✓' : 'Auto-publicar'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Input Mode Tabs */}
          <Tabs value={inputMode} onValueChange={setInputMode} className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="manual" className="gap-2">
                <Scale className="w-4 h-4" />
                Manual
              </TabsTrigger>
              <TabsTrigger value="chat-ia" className="gap-2">
                <Bot className="w-4 h-4" />
                Chat IA — Colagem em Massa
              </TabsTrigger>
            </TabsList>

            {/* CHAT IA MODE */}
            <TabsContent value="chat-ia" className="space-y-4">
              <Card className="border-orange-500/30">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                      <MessageSquare className="w-5 h-5 text-orange-500" />
                    </div>
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        Chat IA — Processamento Autônomo
                        <Badge variant="outline" className="text-orange-500 border-orange-500 text-xs">Modo Autônomo</Badge>
                      </CardTitle>
                      <CardDescription>
                        Cole todas as informações dos mandados. A IA vai interpretar, auditar e gerar os artigos automaticamente.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    placeholder={`Cole aqui TODAS as informações dos mandados do BNMP...

Exemplo:
Nome: João Silva dos Santos
Tipo: Mandado de Prisão
Processo: 0001234-56.2025.8.26.0001
Comarca: TJSP — 3ª Vara Criminal de SP
Status: Ativo
Crime: Tráfico de Drogas
Data: 15/01/2025

Nome: Maria Souza Lima
Tipo: Mandado de Captura
...

Ou simplesmente cole o texto copiado do portal BNMP. A IA interpretará automaticamente.`}
                    value={bulkText}
                    onChange={e => { setBulkText(e.target.value); setBulkParsed(false); }}
                    className="min-h-[280px] font-mono text-sm"
                  />

                  {bulkText.trim() && (
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleParseBulk}
                        className="gap-2"
                      >
                        <ClipboardPaste className="w-4 h-4" />
                        Pré-visualizar Mandados Extraídos
                      </Button>

                      {bulkParsed && mandados.length > 0 && (
                        <div className="flex items-center gap-2 text-sm text-green-600">
                          <CheckCircle2 className="w-4 h-4" />
                          {mandados.length} mandado(s) identificado(s)
                        </div>
                      )}
                    </div>
                  )}

                   {bulkParsed && mandados.length > 0 && (
                    <Card className="border-muted">
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs font-medium text-muted-foreground">Mandados extraídos automaticamente:</p>
                          <Badge className="bg-orange-500 text-white text-xs">{mandados.length} encontrado(s)</Badge>
                        </div>
                        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                          {mandados.map((m, i) => (
                            <div key={m.id} className="flex items-start gap-3 text-sm p-3 rounded-md bg-muted/50 border border-border/50">
                              <Checkbox
                                checked={m.selected}
                                onCheckedChange={(v) => updateMandado(m.id, 'selected', !!v)}
                                className="mt-0.5"
                              />
                              <Badge variant="outline" className="text-orange-500 border-orange-500 text-xs shrink-0 mt-0.5">
                                #{i + 1}
                              </Badge>
                              <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold">{m.nome}</span>
                                  {m.alcunha && <Badge variant="secondary" className="text-xs">"{m.alcunha}"</Badge>}
                                </div>
                                <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                                  <span>{m.tipoPeca}</span>
                                  <span>•</span>
                                  <span>{m.situacao}</span>
                                  {m.data && <><span>•</span><span>{m.data}</span></>}
                                </div>
                                {m.orgaoExpedidor && (
                                  <p className="text-xs text-muted-foreground truncate">{m.orgaoExpedidor}</p>
                                )}
                                {m.numero && (
                                  <p className="text-xs text-muted-foreground font-mono truncate">{m.numero}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <Alert className="border-muted bg-muted/30">
                    <Bot className="h-4 w-4 text-orange-500" />
                    <AlertDescription className="text-xs text-muted-foreground">
                      <strong>Modo Autônomo:</strong> A IA irá (1) interpretar todos os dados colados, (2) auditar conformidade legal, (3) estruturar mandados, (4) gerar artigo completo com os 9 blocos do Prompt Mestre, (5) criar variações multiplataforma e prompts de imagem — tudo automaticamente.
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            </TabsContent>

            {/* MANUAL MODE */}
            <TabsContent value="manual" className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Scale className="w-5 h-5 text-orange-500" />
                        Dados do Mandado — Input Manual
                      </CardTitle>
                      <CardDescription>
                        Insira os dados extraídos do portal BNMP/CNJ campo a campo
                      </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={addMandado}>
                      <Plus className="w-4 h-4 mr-1" />
                      Adicionar Mandado
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {mandados.map((mandado, index) => (
                    <Card key={mandado.id} className={cn("border", mandado.selected ? "border-orange-500/30 bg-orange-500/5" : "border-muted")}>
                      <CardContent className="pt-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={mandado.selected}
                              onCheckedChange={(v) => updateMandado(mandado.id, 'selected', !!v)}
                            />
                            <Badge variant="outline" className="text-orange-500 border-orange-500">
                              Mandado #{index + 1}
                            </Badge>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeMandado(mandado.id)}
                            disabled={mandados.length <= 1}
                            className="text-destructive hover:text-destructive h-8 w-8"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Nome do Procurado *</Label>
                            <Input
                              placeholder="Nome completo conforme BNMP"
                              value={mandado.nome}
                              onChange={e => updateMandado(mandado.id, 'nome', e.target.value)}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Tipo de Mandado *</Label>
                            <Select
                              value={mandado.tipoPeca}
                              onValueChange={v => updateMandado(mandado.id, 'tipoPeca', v)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {TIPO_PECA_OPTIONS.map(t => (
                                  <SelectItem key={t} value={t}>{t}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Nº do Processo</Label>
                            <Input
                              placeholder="0000000-00.0000.0.00.0000"
                              value={mandado.numero}
                              onChange={e => updateMandado(mandado.id, 'numero', e.target.value)}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Comarca / Tribunal</Label>
                            <Input
                              placeholder="Ex: TJSP — 3ª Vara Criminal de SP"
                              value={mandado.orgaoExpedidor}
                              onChange={e => updateMandado(mandado.id, 'orgaoExpedidor', e.target.value)}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Status do Mandado</Label>
                            <Select
                              value={mandado.situacao}
                              onValueChange={v => updateMandado(mandado.id, 'situacao', v)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Pendente de Cumprimento">Pendente de Cumprimento</SelectItem>
                                <SelectItem value="Cumprido">Cumprido</SelectItem>
                                <SelectItem value="Suspenso">Suspenso</SelectItem>
                                <SelectItem value="Ativo">Ativo</SelectItem>
                                <SelectItem value="Cancelado">Cancelado</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Crime Relacionado</Label>
                            <Input
                              placeholder="Ex: Tráfico, Furto, Estelionato"
                              value={mandado.crimeRelacionado}
                              onChange={e => updateMandado(mandado.id, 'crimeRelacionado', e.target.value)}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Data de Expedição</Label>
                            <Input
                              placeholder="DD/MM/AAAA"
                              value={mandado.data}
                              onChange={e => updateMandado(mandado.id, 'data', e.target.value)}
                            />
                          </div>
                          <div className="space-y-1.5 md:col-span-2">
                            <Label className="text-xs font-medium">Observações Públicas</Label>
                            <Input
                              placeholder="Qualquer dado visível na consulta pública"
                              value={mandado.observacoes}
                              onChange={e => updateMandado(mandado.id, 'observacoes', e.target.value)}
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  {selectedMandados.length > 0 && (
                    <div className="flex items-center justify-between pt-2">
                      <p className="text-sm text-muted-foreground">
                        {selectedMandados.length} mandado(s) selecionado(s) para repostagem
                      </p>
                      <Badge variant="outline" className="text-orange-500 border-orange-500">
                        Modo Madeira Neles 🔥 — 9 Blocos
                      </Badge>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Progress */}
          {isRewriting && (
            <Card className="border-orange-500/30">
              <CardContent className="py-6">
                <div className="flex items-center gap-4">
                  <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
                  <div>
                    <p className="font-medium">Gerando conteúdo BNMP — Modo Madeira Neles...</p>
                    <p className="text-sm text-muted-foreground">{progress || 'Executando os 9 blocos do Prompt Mestre...'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Atalho Rápido Info */}
          <Alert className="border-muted">
            <Flame className="h-4 w-4 text-orange-500" />
            <AlertDescription className="text-xs text-muted-foreground">
              <strong>Atalho Rápido:</strong> MADEIRA NELES + [NOME] + [TIPO DE MANDADO] + [TRIBUNAL/COMARCA] — O sistema gera automaticamente todos os 9 blocos: Título SEO, Disclaimer Legal, Corpo Editorial, Linkagem Estratégica, CTAs Criminalistas, Prompts de Imagem, Variações Multiplataforma, SEO Keywords e Checklist de Compliance.
            </AlertDescription>
          </Alert>

          {/* Submit */}
          <div className="flex justify-end">
            <Button
              size="lg"
              onClick={inputMode === 'chat-ia' ? handleSubmitBulkDirect : handleSubmit}
              disabled={(inputMode === 'chat-ia' ? !bulkText.trim() : selectedMandados.length === 0) || isRewriting}
              className="bg-orange-500 hover:bg-orange-600 text-white gap-2"
            >
              {isRewriting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Gerando 9 Blocos...
                </>
              ) : inputMode === 'chat-ia' ? (
                <>
                  <Bot className="w-5 h-5" />
                  Processar Autônomo — IA
                  <Sparkles className="w-4 h-4" />
                </>
              ) : (
                <>
                  <Flame className="w-5 h-5" />
                  Gerar Repostagem BNMP
                  <Sparkles className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
