import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Gavel,
  Plus,
  Trash2,
  Sparkles,
  Loader2,
  Shield,
  ExternalLink,
  AlertTriangle,
  Scale,
  Flame,
  Search,
  FileText,
} from 'lucide-react';
import { useNewsRewriter } from '@/hooks/useNewsRewriter';
import { useProjects } from '@/hooks/useProjects';
import { MadeiraNelesPainel } from '@/components/news-rewriter/MadeiraNelesPainel';
import { cn } from '@/lib/utils';

interface MandadoEntry {
  id: string;
  numero: string;
  nome: string;
  situacao: string;
  data: string;
  orgaoExpedidor: string;
  tipoPeca: string;
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
  situacao: 'Pendente de Cumprimento',
  data: '',
  orgaoExpedidor: '',
  tipoPeca: 'Mandado de Prisão',
  selected: true,
});

export default function BNMPRepost() {
  const navigate = useNavigate();
  const { rewriteNews, isRewriting, progress, lastViralPackage } = useNewsRewriter();
  const { projects } = useProjects();

  const [mandados, setMandados] = useState<MandadoEntry[]>([createEmptyMandado()]);
  const [keyword, setKeyword] = useState('');
  const [projectId, setProjectId] = useState<string>('');
  const [autoPublish, setAutoPublish] = useState(false);
  const [showResult, setShowResult] = useState(false);

  const currentProject = projects?.find(p => p.id === projectId);

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

  const handleSubmit = async () => {
    if (selectedMandados.length === 0) return;

    // Build content from mandados for the rewriter
    const mandadosText = selectedMandados.map((m, i) =>
      `${i + 1}. Nome: ${m.nome} | Tipo: ${m.tipoPeca} | Situação: ${m.situacao} | Data: ${m.data || 'N/A'} | Órgão: ${m.orgaoExpedidor || 'N/A'} | Nº: ${m.numero || 'N/A'}`
    ).join('\n');

    const sourceContent = `DADOS PÚBLICOS DO BNMP - BANCO NACIONAL DE MONITORAMENTO DE PRISÕES (CNJ)
Portal: https://portalbnmp.cnj.jus.br/

MANDADOS ENCONTRADOS (${selectedMandados.length} registros):

${mandadosText}

CONTEXTO: Dados de domínio público disponíveis no BNMP 3.0 do Conselho Nacional de Justiça. Qualquer pessoa pode consultar essas informações em portalbnmp.cnj.jus.br. O compartilhamento NÃO gera prejuízo às investigações policiais ou atos judiciais, conforme Art. 5º, XXXIII da CF e Lei 12.527/2011 (Lei de Acesso à Informação).

TIPO DE CONTEÚDO: Repostagem informativa de mandados de prisão/captura/busca e apreensão — modo BNMP Madeira Neles.

INSTRUÇÕES ESPECIAIS:
- Incluir DISCLAIMER LEGAL visível no início e final
- Respeitar presunção de inocência (Art. 5º, LVII, CF)
- Links internos para conteúdos criminais (mín 4, máx 10)
- Links externos: BNMP, CNJ, PF, Poupatempo, Certidão Antecedentes, TJs
- CTA para advogado criminalista urgente
- Explicar como consultar o BNMP
- Gerar FAQ sobre mandados e direitos
- Imagem temática criminal (nunca fotos reais)`;

    const result = await rewriteNews({
      sourceUrl: 'https://portalbnmp.cnj.jus.br/',
      sourceContent,
      sourceName: 'BNMP - Banco Nacional de Monitoramento de Prisões (CNJ)',
      analysisAngle: 'Análise Criminal — Utilidade Pública e Direitos do Cidadão',
      keyword: keyword || `mandado de prisão ${selectedMandados[0]?.nome || ''}`.trim(),
      niche: 'advocacia',
      articleLength: 'medium',
      projectId: projectId && projectId !== 'none' ? projectId : undefined,
      language: 'pt-BR',
      autoPublish: autoPublish && projectId && projectId !== 'none',
      rewriteMode: 'madeira_neles',
    });

    if (result) {
      setShowResult(true);
    }
  };

  return (
    <div className="container max-w-6xl py-6 space-y-6">
      {/* Header */}
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

      {/* Legal Disclaimer */}
      <Alert className="border-amber-500/50 bg-amber-500/5">
        <Shield className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-sm">
          <strong>⚖️ Aviso Legal:</strong> Informações de domínio público do BNMP 3.0 (CNJ). 
          Qualquer pessoa pode consultar em{' '}
          <a href="https://portalbnmp.cnj.jus.br/" target="_blank" rel="noopener noreferrer" className="text-primary underline">
            portalbnmp.cnj.jus.br
          </a>. 
          O compartilhamento NÃO gera prejuízo às investigações (Art. 5º, XXXIII CF + Lei 12.527/2011).
        </AlertDescription>
      </Alert>

      {showResult && lastViralPackage ? (
        <MadeiraNelesPainel viralPackage={lastViralPackage} articleId="" articleTitle={`Mandados BNMP - ${selectedMandados[0]?.nome || ''}`} />
      ) : (
        <>
          {/* Quick Link to BNMP */}
          <Card className="border-primary/20">
            <CardContent className="py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Search className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Consultar mandados no BNMP</p>
                    <p className="text-xs text-muted-foreground">Pesquise no portal oficial e insira os dados abaixo</p>
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

          {/* Project Selector */}
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
                    placeholder="Ex: mandado de prisão pendente"
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

          {/* Mandados Input Table */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Scale className="w-5 h-5 text-orange-500" />
                    Mandados Encontrados
                  </CardTitle>
                  <CardDescription>
                    Insira os dados dos mandados consultados no BNMP
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={addMandado}>
                  <Plus className="w-4 h-4 mr-1" />
                  Adicionar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">✓</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Tipo de Peça</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Órgão Expedidor</TableHead>
                      <TableHead>Nº Mandado</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mandados.map((mandado) => (
                      <TableRow key={mandado.id}>
                        <TableCell>
                          <Checkbox
                            checked={mandado.selected}
                            onCheckedChange={(v) => updateMandado(mandado.id, 'selected', !!v)}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            placeholder="Nome completo"
                            value={mandado.nome}
                            onChange={e => updateMandado(mandado.id, 'nome', e.target.value)}
                            className="min-w-[180px]"
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={mandado.tipoPeca}
                            onValueChange={v => updateMandado(mandado.id, 'tipoPeca', v)}
                          >
                            <SelectTrigger className="min-w-[180px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TIPO_PECA_OPTIONS.map(t => (
                                <SelectItem key={t} value={t}>{t}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            placeholder="Pendente de Cumprimento"
                            value={mandado.situacao}
                            onChange={e => updateMandado(mandado.id, 'situacao', e.target.value)}
                            className="min-w-[160px]"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            placeholder="DD/MM/AAAA"
                            value={mandado.data}
                            onChange={e => updateMandado(mandado.id, 'data', e.target.value)}
                            className="min-w-[110px]"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            placeholder="Vara/Comarca"
                            value={mandado.orgaoExpedidor}
                            onChange={e => updateMandado(mandado.id, 'orgaoExpedidor', e.target.value)}
                            className="min-w-[200px]"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            placeholder="Nº do mandado"
                            value={mandado.numero}
                            onChange={e => updateMandado(mandado.id, 'numero', e.target.value)}
                            className="min-w-[200px]"
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeMandado(mandado.id)}
                            disabled={mandados.length <= 1}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>

              {selectedMandados.length > 0 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {selectedMandados.length} mandado(s) selecionado(s)
                  </p>
                  <Badge variant="outline" className="text-orange-500 border-orange-500">
                    Modo Madeira Neles 🔥
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Progress */}
          {isRewriting && (
            <Card className="border-orange-500/30">
              <CardContent className="py-6">
                <div className="flex items-center gap-4">
                  <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
                  <div>
                    <p className="font-medium">Gerando conteúdo BNMP Madeira Neles...</p>
                    <p className="text-sm text-muted-foreground">{progress}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Submit Button */}
          <div className="flex justify-end">
            <Button
              size="lg"
              onClick={handleSubmit}
              disabled={selectedMandados.length === 0 || isRewriting}
              className="bg-orange-500 hover:bg-orange-600 text-white gap-2"
            >
              {isRewriting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Gerando...
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
