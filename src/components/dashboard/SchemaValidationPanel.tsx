import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle, 
  ExternalLink,
  RefreshCw,
  FileText
} from "lucide-react";
import { useArticles } from "@/hooks/useArticles";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

interface SchemaValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  info?: string[];
  schemas_validated?: number;
}

interface ArticleConfig {
  schema_validation?: SchemaValidation;
  last_validation_at?: string;
  google_test_url?: string;
  wordpress_post_id?: number;
}

export const SchemaValidationPanel = () => {
  const { articles, isLoading } = useArticles();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['articles', user?.id] });
  };

  // Filter only published articles
  const publishedArticles = articles?.filter(a => a.status === 'published') || [];

  // Calculate stats
  const stats = publishedArticles.reduce((acc, article) => {
    const config = article.config as ArticleConfig | null;
    const validation = config?.schema_validation;
    
    if (!validation) {
      acc.notValidated++;
    } else if (validation.valid) {
      acc.valid++;
    } else {
      acc.invalid++;
    }
    
    acc.totalErrors += validation?.errors?.length || 0;
    acc.totalWarnings += validation?.warnings?.length || 0;
    
    return acc;
  }, { valid: 0, invalid: 0, notValidated: 0, totalErrors: 0, totalWarnings: 0 });

  const getValidationIcon = (validation: SchemaValidation | undefined) => {
    if (!validation) {
      return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
    if (validation.valid && validation.warnings?.length === 0) {
      return <CheckCircle2 className="h-4 w-4 text-primary" />;
    }
    if (validation.valid && validation.warnings?.length > 0) {
      return <AlertTriangle className="h-4 w-4 text-warning" />;
    }
    return <AlertCircle className="h-4 w-4 text-destructive" />;
  };

  const getValidationBadge = (validation: SchemaValidation | undefined) => {
    if (!validation) {
      return <Badge variant="secondary">Não validado</Badge>;
    }
    if (validation.valid && validation.warnings?.length === 0) {
      return <Badge variant="default" className="bg-primary/10 text-primary hover:bg-primary/20">Válido</Badge>;
    }
    if (validation.valid && validation.warnings?.length > 0) {
      return <Badge variant="outline" className="border-warning text-warning">{validation.warnings.length} avisos</Badge>;
    }
    return <Badge variant="destructive">{validation.errors?.length} erros</Badge>;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Validação de Schemas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5" />
            Validação de Schemas JSON-LD
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Stats summary */}
        <div className="flex gap-4 mt-2 text-sm">
          <div className="flex items-center gap-1">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <span>{stats.valid} válidos</span>
          </div>
          <div className="flex items-center gap-1">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <span>{stats.invalid} com erros</span>
          </div>
          <div className="flex items-center gap-1">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <span>{stats.totalWarnings} avisos</span>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {publishedArticles.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Nenhum artigo publicado ainda</p>
            <p className="text-xs mt-1">A validação aparecerá aqui após publicação no WordPress</p>
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {publishedArticles.slice(0, 20).map((article) => {
                const config = article.config as ArticleConfig | null;
                const validation = config?.schema_validation;
                const googleTestUrl = config?.google_test_url || 
                  (article.published_url ? `https://search.google.com/test/rich-results?url=${encodeURIComponent(article.published_url)}` : null);

                return (
                  <div 
                    key={article.id} 
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {getValidationIcon(validation)}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate text-sm">{article.title || article.keyword}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {getValidationBadge(validation)}
                          {validation?.schemas_validated && (
                            <span className="text-xs text-muted-foreground">
                              {validation.schemas_validated} schemas
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {validation && (validation.errors?.length > 0 || validation.warnings?.length > 0) && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <AlertCircle className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-xs">
                              <div className="space-y-1 text-xs">
                                {validation.errors?.slice(0, 3).map((err, i) => (
                                  <p key={i} className="text-destructive">• {err}</p>
                                ))}
                                {validation.warnings?.slice(0, 3).map((warn, i) => (
                                  <p key={i} className="text-warning">• {warn}</p>
                                ))}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      
                      {googleTestUrl && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8"
                                onClick={() => window.open(googleTestUrl, '_blank')}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              Testar no Google Rich Results
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};
