import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Link2,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Filter,
  ArrowUpDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { IndexedArticle, TopicCluster, KeywordRule } from '@/hooks/useInternalLinking';

interface InternalLinkingReportsProps {
  indexedArticles: IndexedArticle[];
  topicClusters: TopicCluster[];
  keywordRules: KeywordRule[];
}

type ReportType = 'needs-attention' | 'top-performing' | 'orphan-articles' | 'keyword-coverage';

export function InternalLinkingReports({
  indexedArticles,
  topicClusters,
  keywordRules,
}: InternalLinkingReportsProps) {
  const [selectedReport, setSelectedReport] = useState<ReportType>('needs-attention');
  const [sortBy, setSortBy] = useState<'score' | 'title'>('score');

  // Generate reports data
  const reports = useMemo(() => {
    // Articles that need attention (low linkability, no cluster)
    const needsAttention = indexedArticles
      .filter(a => a.linkability_score < 40 || !a.topic_cluster)
      .sort((a, b) => a.linkability_score - b.linkability_score)
      .map(a => ({
        ...a,
        issues: [
          ...(a.linkability_score < 40 ? ['Baixa linkabilidade'] : []),
          ...(!a.topic_cluster ? ['Sem cluster temático'] : []),
          ...(!a.primary_keyword ? ['Sem keyword principal'] : []),
        ],
      }));

    // Top performing articles
    const topPerforming = indexedArticles
      .filter(a => a.linkability_score >= 70)
      .sort((a, b) => b.linkability_score - a.linkability_score)
      .slice(0, 20);

    // Orphan articles (no cluster)
    const orphanArticles = indexedArticles.filter(a => !a.topic_cluster);

    // Keyword coverage analysis
    const keywordCoverage = keywordRules.map(rule => {
      const matchingArticles = indexedArticles.filter(a => 
        a.primary_keyword?.toLowerCase().includes(rule.keyword.toLowerCase()) ||
        a.secondary_keywords?.some(kw => kw.toLowerCase().includes(rule.keyword.toLowerCase()))
      );
      return {
        ...rule,
        coverage: matchingArticles.length,
        coveragePercent: indexedArticles.length > 0 
          ? Math.round((matchingArticles.length / indexedArticles.length) * 100)
          : 0,
      };
    }).sort((a, b) => b.coverage - a.coverage);

    return {
      needsAttention,
      topPerforming,
      orphanArticles,
      keywordCoverage,
    };
  }, [indexedArticles, keywordRules]);

  const exportToCSV = () => {
    let data: any[] = [];
    let filename = '';

    switch (selectedReport) {
      case 'needs-attention':
        data = reports.needsAttention.map(a => ({
          Título: a.wp_post_title,
          URL: a.wp_post_url,
          'Score Linkabilidade': a.linkability_score,
          Cluster: a.topic_cluster || 'Sem cluster',
          Keyword: a.primary_keyword || 'Sem keyword',
          Problemas: a.issues.join(', '),
        }));
        filename = 'artigos-precisam-atencao.csv';
        break;
      case 'top-performing':
        data = reports.topPerforming.map(a => ({
          Título: a.wp_post_title,
          URL: a.wp_post_url,
          'Score Linkabilidade': a.linkability_score,
          Cluster: a.topic_cluster || '-',
          Keyword: a.primary_keyword || '-',
        }));
        filename = 'artigos-top-performance.csv';
        break;
      case 'orphan-articles':
        data = reports.orphanArticles.map(a => ({
          Título: a.wp_post_title,
          URL: a.wp_post_url,
          'Score Linkabilidade': a.linkability_score,
          Keyword: a.primary_keyword || 'Sem keyword',
        }));
        filename = 'artigos-orfaos.csv';
        break;
      case 'keyword-coverage':
        data = reports.keywordCoverage.map(r => ({
          Keyword: r.keyword,
          'URL Destino': r.target_url,
          'Artigos com Keyword': r.coverage,
          'Cobertura (%)': r.coveragePercent,
          'Vezes Aplicada': r.times_applied,
          Status: r.is_active ? 'Ativa' : 'Inativa',
        }));
        filename = 'cobertura-keywords.csv';
        break;
    }

    if (data.length === 0) return;

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(h => `"${row[h]}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  };

  const renderReportContent = () => {
    switch (selectedReport) {
      case 'needs-attention':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <span className="font-medium">
                  {reports.needsAttention.length} artigos precisam de atenção
                </span>
              </div>
            </div>
            
            {reports.needsAttention.length > 0 ? (
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Artigo</TableHead>
                      <TableHead className="text-center">Score</TableHead>
                      <TableHead>Problemas</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reports.needsAttention.map((article) => (
                      <TableRow key={article.id}>
                        <TableCell className="max-w-[300px]">
                          <p className="font-medium truncate">{article.wp_post_title}</p>
                          <p className="text-xs text-muted-foreground truncate">{article.wp_post_url}</p>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-12 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-red-500 rounded-full"
                                style={{ width: `${article.linkability_score}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium">{article.linkability_score}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {article.issues.map((issue, i) => (
                              <Badge key={i} variant="destructive" className="text-xs">
                                {issue}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => window.open(article.wp_post_url, '_blank')}
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            ) : (
              <div className="text-center py-10 text-muted-foreground">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-green-500" />
                <p className="font-medium text-foreground">Todos os artigos estão otimizados!</p>
                <p className="text-sm">Nenhum artigo precisa de atenção no momento.</p>
              </div>
            )}
          </div>
        );

      case 'top-performing':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-500" />
              <span className="font-medium">
                {reports.topPerforming.length} artigos com alta performance
              </span>
            </div>
            
            {reports.topPerforming.length > 0 ? (
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Artigo</TableHead>
                      <TableHead>Cluster</TableHead>
                      <TableHead className="text-center">Score</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reports.topPerforming.map((article, idx) => (
                      <TableRow key={article.id}>
                        <TableCell className="font-medium text-muted-foreground">
                          {idx + 1}
                        </TableCell>
                        <TableCell className="max-w-[250px]">
                          <p className="font-medium truncate">{article.wp_post_title}</p>
                          {article.primary_keyword && (
                            <Badge variant="secondary" className="text-xs mt-1">
                              {article.primary_keyword}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {article.topic_cluster ? (
                            <Badge variant="outline">{article.topic_cluster}</Badge>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-12 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-green-500 rounded-full"
                                style={{ width: `${article.linkability_score}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium">{article.linkability_score}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => window.open(article.wp_post_url, '_blank')}
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            ) : (
              <div className="text-center py-10 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum artigo com alta performance ainda</p>
                <p className="text-sm">Artigos com score acima de 70 aparecerão aqui.</p>
              </div>
            )}
          </div>
        );

      case 'orphan-articles':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Link2 className="w-5 h-5 text-amber-500" />
              <span className="font-medium">
                {reports.orphanArticles.length} artigos sem cluster (órfãos)
              </span>
            </div>
            
            {reports.orphanArticles.length > 0 ? (
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {reports.orphanArticles.map((article) => (
                    <Card key={article.id} className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{article.wp_post_title}</p>
                          <p className="text-sm text-muted-foreground truncate">{article.wp_post_url}</p>
                          <div className="flex items-center gap-4 mt-2">
                            {article.primary_keyword && (
                              <Badge variant="secondary">{article.primary_keyword}</Badge>
                            )}
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">Linkabilidade:</span>
                              <Progress value={article.linkability_score} className="w-16 h-1.5" />
                              <span className="text-xs font-medium">{article.linkability_score}</span>
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(article.wp_post_url, '_blank')}
                        >
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Abrir
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-10 text-muted-foreground">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-green-500" />
                <p className="font-medium text-foreground">Todos os artigos estão em clusters!</p>
                <p className="text-sm">Não há artigos órfãos no momento.</p>
              </div>
            )}
          </div>
        );

      case 'keyword-coverage':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-primary" />
              <span className="font-medium">
                Cobertura das {reports.keywordCoverage.length} regras de linkagem
              </span>
            </div>
            
            {reports.keywordCoverage.length > 0 ? (
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Keyword</TableHead>
                      <TableHead>URL Destino</TableHead>
                      <TableHead className="text-center">Cobertura</TableHead>
                      <TableHead className="text-center">Aplicações</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reports.keywordCoverage.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell className="font-medium">{rule.keyword}</TableCell>
                        <TableCell className="max-w-[200px] truncate text-muted-foreground">
                          {rule.target_url}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Progress value={rule.coveragePercent} className="w-16 h-1.5" />
                            <span className="text-xs font-medium">{rule.coveragePercent}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline">{rule.times_applied}x</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={rule.is_active ? 'default' : 'secondary'}>
                            {rule.is_active ? 'Ativa' : 'Inativa'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            ) : (
              <div className="text-center py-10 text-muted-foreground">
                <Filter className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma regra de linkagem configurada</p>
                <p className="text-sm">Crie regras para ver a cobertura.</p>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  const reportOptions = [
    { value: 'needs-attention', label: 'Precisam de Atenção', count: reports.needsAttention.length },
    { value: 'top-performing', label: 'Top Performance', count: reports.topPerforming.length },
    { value: 'orphan-articles', label: 'Artigos Órfãos', count: reports.orphanArticles.length },
    { value: 'keyword-coverage', label: 'Cobertura de Keywords', count: reports.keywordCoverage.length },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Relatórios de Linkagem</CardTitle>
            <CardDescription>
              Análise detalhada dos artigos e oportunidades de otimização
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedReport} onValueChange={(v) => setSelectedReport(v as ReportType)}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {reportOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex items-center justify-between w-full gap-2">
                      <span>{opt.label}</span>
                      <Badge variant="secondary" className="ml-2 text-xs">
                        {opt.count}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={exportToCSV}>
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {renderReportContent()}
      </CardContent>
    </Card>
  );
}
