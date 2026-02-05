import { useMemo } from 'react';
import { Link2, FileText, Crown, ArrowRight, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Article {
  id: string;
  title: string | null;
  keyword: string;
  slug: string | null;
  status: string;
  featured_image_url: string | null;
  word_count: number | null;
  config?: {
    type?: 'pillar' | 'satellite';
    pillarId?: string;
    theme?: string;
  } | null;
}

interface ClusterVisualizationProps {
  pillar: Article;
  satellites: Article[];
  onArticleClick?: (article: Article) => void;
}

export function ClusterVisualization({ pillar, satellites, onArticleClick }: ClusterVisualizationProps) {
  const totalWords = useMemo(() => {
    const pillarWords = pillar.word_count || 0;
    const satelliteWords = satellites.reduce((sum, s) => sum + (s.word_count || 0), 0);
    return pillarWords + satelliteWords;
  }, [pillar, satellites]);

  const statusColor = (status: string) => {
    switch (status) {
      case 'published': return 'bg-primary/20 text-primary border-primary/30';
      case 'ready': return 'bg-accent text-accent-foreground border-accent';
      case 'draft': return 'bg-muted text-muted-foreground border-muted';
      default: return 'bg-secondary text-secondary-foreground border-secondary';
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Link2 className="w-5 h-5 text-primary" />
              Estrutura do Cluster
            </CardTitle>
            <CardDescription className="mt-1">
              {1 + satellites.length} artigos • {totalWords.toLocaleString()} palavras totais
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-xs">
            {pillar.config?.theme || pillar.keyword}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-6">
        {/* Cluster Visualization */}
        <div className="relative">
          {/* Pillar Article - Center/Top */}
          <div className="flex flex-col items-center mb-8">
            <div 
              className="relative group cursor-pointer"
              onClick={() => onArticleClick?.(pillar)}
            >
              {/* Crown Icon */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                <Crown className="w-6 h-6 text-primary fill-primary/20" />
              </div>
              
              {/* Pillar Card */}
              <div className="w-80 p-4 rounded-xl border-2 border-primary bg-card shadow-lg hover:shadow-xl transition-all group-hover:border-primary/80">
                <div className="flex items-start gap-3">
                  {pillar.featured_image_url ? (
                    <img 
                      src={pillar.featured_image_url} 
                      alt={pillar.title || 'Pilar'}
                      className="w-16 h-12 object-cover rounded-lg flex-shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-6 h-6 text-primary" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <Badge className="bg-primary text-primary-foreground text-xs mb-1">PILAR</Badge>
                    <h3 className="font-semibold text-sm line-clamp-2 leading-tight">
                      {pillar.title || pillar.keyword}
                    </h3>
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                      <span>{pillar.word_count?.toLocaleString() || 0} palavras</span>
                      <Badge variant="outline" className={`text-xs ${statusColor(pillar.status)}`}>
                        {pillar.status}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              {/* Connecting Lines Container */}
              <div className="absolute -bottom-8 left-1/2 w-0.5 h-8 bg-gradient-to-b from-primary to-muted-foreground/30" />
            </div>
          </div>

          {/* Connection Hub */}
          <div className="flex justify-center mb-6">
            <div className="w-4 h-4 rounded-full bg-primary/50 border-2 border-primary" />
          </div>

          {/* Horizontal Connector */}
          <div className="relative h-8 mb-4">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-0.5 bg-muted-foreground/30" />
            {/* Vertical drops */}
            {satellites.map((_, index) => {
              const position = ((index + 0.5) / satellites.length) * 80 + 10;
              return (
                <div 
                  key={index}
                  className="absolute top-0 w-0.5 h-8 bg-muted-foreground/30"
                  style={{ left: `${position}%` }}
                />
              );
            })}
          </div>

          {/* Satellite Articles */}
          <ScrollArea className="w-full">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
              {satellites.map((satellite, index) => (
                <div
                  key={satellite.id}
                  className="group cursor-pointer"
                  onClick={() => onArticleClick?.(satellite)}
                >
                  <div className="p-3 rounded-lg border bg-card hover:bg-accent/50 hover:border-primary/50 transition-all">
                    <div className="flex items-start gap-3">
                      {satellite.featured_image_url ? (
                        <img 
                          src={satellite.featured_image_url} 
                          alt={satellite.title || 'Satélite'}
                          className="w-12 h-10 object-cover rounded flex-shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-1">
                          <Badge variant="secondary" className="text-xs">S{index + 1}</Badge>
                          <ArrowRight className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Pilar</span>
                        </div>
                        <h4 className="font-medium text-sm line-clamp-2 leading-tight group-hover:text-primary transition-colors">
                          {satellite.title || satellite.keyword}
                        </h4>
                        <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                          <span>{satellite.word_count?.toLocaleString() || 0} palavras</span>
                          <Badge variant="outline" className={`text-xs ${statusColor(satellite.status)}`}>
                            {satellite.status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Legend */}
          <div className="mt-6 pt-4 border-t">
            <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-primary" />
                  <span>Pilar (artigo principal)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-secondary" />
                  <span>Satélite (link interno)</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Link2 className="w-3 h-3" />
                <span>Linhas indicam links internos</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
