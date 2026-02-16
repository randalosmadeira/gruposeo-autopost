import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  Flame, Zap, Target, Palette, Copy, Eye, FileText,
  BarChart3, Clock, Hash, Sparkles, TrendingUp,
  Smartphone, Video, Layers, CheckCircle2, ExternalLink,
  Gavel, Users, AlertTriangle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export interface ViralPackage {
  viralAnalysis?: {
    potencialViral?: number;
    tribunal?: string;
    instancia?: string;
    tipoDecisao?: string;
    areaDireito?: string;
    teseJuridica?: string;
    gatilhosAplicados?: string[];
    numeroAfetados?: string;
    identificacaoPublica?: string;
  };
  hooks?: Array<{
    tipo?: string;
    titulo?: string;
    subtitulo?: string;
    potencial?: number;
  }>;
  conceitoVisual?: {
    estiloBase?: string;
    paleta?: { principal?: string; secundaria?: string; acento?: string; texto?: string };
    promptImagem?: string;
    fontes?: string;
  };
  copyPost?: {
    textoCompleto?: string;
    hashtags?: string[];
    notaTecnica?: string;
  };
  variacoes?: {
    storiesResumo?: string;
    reelsResumo?: string;
    carrosselResumo?: string;
  };
  resumoExecutivo?: {
    tema?: string;
    potencialViral?: number;
    formatoRecomendado?: string;
    melhorHorario?: string;
  };
  seo?: {
    metaTitle?: string;
    metaDescription?: string;
    slug?: string;
    focusKeyword?: string;
    keywords?: string[];
    faqQuestions?: string[];
  };
}

interface Props {
  viralPackage: ViralPackage;
  articleId: string;
  articleTitle: string;
}

function ViralScoreBadge({ score }: { score: number }) {
  const color = score >= 8 ? 'text-green-500' : score >= 5 ? 'text-yellow-500' : 'text-red-500';
  const bg = score >= 8 ? 'bg-green-500/10' : score >= 5 ? 'bg-yellow-500/10' : 'bg-red-500/10';
  return (
    <div className={cn("inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold", bg, color)}>
      <Flame className="w-4 h-4" />
      {score}/10
    </div>
  );
}

function ColorSwatch({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-6 h-6 rounded border border-border" style={{ backgroundColor: color }} />
      <div>
        <span className="text-xs font-mono">{color}</span>
        <span className="text-xs text-muted-foreground ml-1">({label})</span>
      </div>
    </div>
  );
}

export function MadeiraNelesPainel({ viralPackage, articleId, articleTitle }: Props) {
  const navigate = useNavigate();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('resumo');

  const { viralAnalysis, hooks, conceitoVisual, copyPost, variacoes, resumoExecutivo, seo } = viralPackage;

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const CopyButton = ({ text, field }: { text: string; field: string }) => (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 px-2"
      onClick={() => copyToClipboard(text, field)}
    >
      {copiedField === field ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
    </Button>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
            <Flame className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold">📦 Pacote Viral Pronto</h2>
            <p className="text-xs text-muted-foreground">{articleTitle}</p>
          </div>
        </div>
        <Button onClick={() => navigate(`/articles/${articleId}/edit`)} className="gap-2">
          <ExternalLink className="w-4 h-4" />
          Editar Artigo
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-6 w-full">
          <TabsTrigger value="resumo" className="text-xs gap-1"><BarChart3 className="w-3 h-3" />Resumo</TabsTrigger>
          <TabsTrigger value="hooks" className="text-xs gap-1"><Zap className="w-3 h-3" />Hooks</TabsTrigger>
          <TabsTrigger value="visual" className="text-xs gap-1"><Palette className="w-3 h-3" />Visual</TabsTrigger>
          <TabsTrigger value="copy" className="text-xs gap-1"><FileText className="w-3 h-3" />Copy</TabsTrigger>
          <TabsTrigger value="variacoes" className="text-xs gap-1"><Layers className="w-3 h-3" />Variações</TabsTrigger>
          <TabsTrigger value="seo" className="text-xs gap-1"><Target className="w-3 h-3" />SEO</TabsTrigger>
        </TabsList>

        {/* RESUMO TAB */}
        <TabsContent value="resumo" className="space-y-4 mt-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {resumoExecutivo?.tema && (
              <Card className="border-orange-500/20">
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground mb-1">Tema</p>
                  <p className="text-sm font-semibold">{resumoExecutivo.tema}</p>
                </CardContent>
              </Card>
            )}
            <Card className="border-orange-500/20">
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground mb-1">Potencial Viral</p>
                <ViralScoreBadge score={resumoExecutivo?.potencialViral || viralAnalysis?.potencialViral || 0} />
              </CardContent>
            </Card>
            {resumoExecutivo?.formatoRecomendado && (
              <Card className="border-orange-500/20">
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground mb-1">Formato Recomendado</p>
                  <Badge variant="secondary" className="capitalize">{resumoExecutivo.formatoRecomendado}</Badge>
                </CardContent>
              </Card>
            )}
            {resumoExecutivo?.melhorHorario && (
              <Card className="border-orange-500/20">
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground mb-1">Melhor Horário</p>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium">{resumoExecutivo.melhorHorario}</span>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Viral Analysis Details */}
          {viralAnalysis && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Gavel className="w-4 h-4 text-orange-500" />
                  Análise Jurídica
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                  {viralAnalysis.tribunal && (
                    <div><span className="text-muted-foreground">Tribunal:</span> <strong>{viralAnalysis.tribunal}</strong></div>
                  )}
                  {viralAnalysis.instancia && (
                    <div><span className="text-muted-foreground">Instância:</span> <strong>{viralAnalysis.instancia}</strong></div>
                  )}
                  {viralAnalysis.tipoDecisao && (
                    <div><span className="text-muted-foreground">Tipo:</span> <strong>{viralAnalysis.tipoDecisao}</strong></div>
                  )}
                  {viralAnalysis.areaDireito && (
                    <div><span className="text-muted-foreground">Área:</span> <strong>{viralAnalysis.areaDireito}</strong></div>
                  )}
                  {viralAnalysis.teseJuridica && (
                    <div className="sm:col-span-2"><span className="text-muted-foreground">Tese:</span> <em>{viralAnalysis.teseJuridica}</em></div>
                  )}
                  {viralAnalysis.numeroAfetados && (
                    <div className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Afetados:</span> <strong className="capitalize">{viralAnalysis.numeroAfetados}</strong>
                    </div>
                  )}
                  {viralAnalysis.identificacaoPublica && (
                    <div><span className="text-muted-foreground">Identificação pública:</span> <Badge variant="outline" className="ml-1 capitalize">{viralAnalysis.identificacaoPublica}</Badge></div>
                  )}
                </div>
                {viralAnalysis.gatilhosAplicados && viralAnalysis.gatilhosAplicados.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {viralAnalysis.gatilhosAplicados.map((g, i) => (
                      <Badge key={i} variant="secondary" className="text-xs capitalize bg-orange-500/10 text-orange-600">
                        <Sparkles className="w-3 h-3 mr-1" />{g}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* HOOKS TAB */}
        <TabsContent value="hooks" className="space-y-3 mt-4">
          {hooks && hooks.length > 0 ? (
            hooks.map((hook, i) => (
              <Card key={i} className={cn(
                "transition-all",
                i === 0 ? "border-orange-500/40 bg-orange-500/5" : "border-border"
              )}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Badge variant={i === 0 ? "default" : "outline"} className={cn(
                          "text-xs shrink-0",
                          i === 0 && "bg-orange-500 hover:bg-orange-600"
                        )}>
                          {i === 0 ? '⭐ Recomendado' : `Hook ${i + 1}`}
                        </Badge>
                        {hook.tipo && <span className="text-xs text-muted-foreground truncate">{hook.tipo}</span>}
                      </div>
                      <p className="font-bold text-sm leading-tight">{hook.titulo}</p>
                      {hook.subtitulo && <p className="text-xs text-muted-foreground mt-1">{hook.subtitulo}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {hook.potencial && <ViralScoreBadge score={hook.potencial} />}
                      <CopyButton text={`${hook.titulo}\n${hook.subtitulo || ''}`} field={`hook-${i}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                <AlertTriangle className="w-5 h-5 mx-auto mb-2" />
                Hooks não disponíveis neste pacote
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* VISUAL TAB */}
        <TabsContent value="visual" className="space-y-4 mt-4">
          {conceitoVisual ? (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Estilo Base</CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/30">
                    {conceitoVisual.estiloBase || 'MADEIRA NELES'}
                  </Badge>
                  {conceitoVisual.fontes && (
                    <p className="text-xs text-muted-foreground mt-2">🔤 {conceitoVisual.fontes}</p>
                  )}
                </CardContent>
              </Card>

              {conceitoVisual.paleta && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Paleta de Cores</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {conceitoVisual.paleta.principal && <ColorSwatch color={conceitoVisual.paleta.principal} label="Principal" />}
                    {conceitoVisual.paleta.secundaria && <ColorSwatch color={conceitoVisual.paleta.secundaria} label="Secundária" />}
                    {conceitoVisual.paleta.acento && <ColorSwatch color={conceitoVisual.paleta.acento} label="Acento" />}
                    {conceitoVisual.paleta.texto && <ColorSwatch color={conceitoVisual.paleta.texto} label="Texto" />}
                  </CardContent>
                </Card>
              )}

              {conceitoVisual.promptImagem && (
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">Prompt de Imagem (IA)</CardTitle>
                      <CopyButton text={conceitoVisual.promptImagem} field="prompt-img" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[100px]">
                      <p className="text-xs font-mono bg-muted/50 p-3 rounded-lg whitespace-pre-wrap">
                        {conceitoVisual.promptImagem}
                      </p>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                <Palette className="w-5 h-5 mx-auto mb-2" />
                Conceito visual não disponível
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* COPY TAB */}
        <TabsContent value="copy" className="space-y-4 mt-4">
          {copyPost?.textoCompleto ? (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Copy Completa do Post</CardTitle>
                    <CopyButton text={copyPost.textoCompleto} field="copy-full" />
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[300px]">
                    <div className="text-sm whitespace-pre-wrap bg-muted/30 p-4 rounded-lg leading-relaxed">
                      {copyPost.textoCompleto}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {copyPost.hashtags && copyPost.hashtags.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Hash className="w-4 h-4" />
                        Hashtags
                      </CardTitle>
                      <CopyButton text={copyPost.hashtags.join(' ')} field="hashtags" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1.5">
                      {copyPost.hashtags.map((h, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{h}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {copyPost.notaTecnica && (
                <Card className="bg-muted/30">
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs font-mono">{copyPost.notaTecnica}</p>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                <FileText className="w-5 h-5 mx-auto mb-2" />
                Copy não disponível
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* VARIAÇÕES TAB */}
        <TabsContent value="variacoes" className="space-y-4 mt-4">
          {variacoes ? (
            <>
              {variacoes.storiesResumo && (
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-pink-500" />
                        Stories (5 Cards)
                      </CardTitle>
                      <CopyButton text={variacoes.storiesResumo} field="stories" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm bg-muted/30 p-3 rounded-lg">{variacoes.storiesResumo}</p>
                  </CardContent>
                </Card>
              )}

              {variacoes.reelsResumo && (
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Video className="w-4 h-4 text-purple-500" />
                        Reels / Vídeo (60s)
                      </CardTitle>
                      <CopyButton text={variacoes.reelsResumo} field="reels" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm bg-muted/30 p-3 rounded-lg">{variacoes.reelsResumo}</p>
                  </CardContent>
                </Card>
              )}

              {variacoes.carrosselResumo && (
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Layers className="w-4 h-4 text-blue-500" />
                        Carrossel (10 Slides)
                      </CardTitle>
                      <CopyButton text={variacoes.carrosselResumo} field="carrossel" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm bg-muted/30 p-3 rounded-lg">{variacoes.carrosselResumo}</p>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                <Layers className="w-5 h-5 mx-auto mb-2" />
                Variações não disponíveis
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* SEO TAB */}
        <TabsContent value="seo" className="space-y-4 mt-4">
          {seo ? (
            <>
              {seo.metaTitle && (
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">Meta Title ({seo.metaTitle.length} chars)</span>
                      <CopyButton text={seo.metaTitle} field="meta-title" />
                    </div>
                    <p className="text-sm font-semibold text-blue-600">{seo.metaTitle}</p>
                  </CardContent>
                </Card>
              )}
              {seo.metaDescription && (
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">Meta Description ({seo.metaDescription.length} chars)</span>
                      <CopyButton text={seo.metaDescription} field="meta-desc" />
                    </div>
                    <p className="text-sm text-muted-foreground">{seo.metaDescription}</p>
                  </CardContent>
                </Card>
              )}
              {seo.focusKeyword && (
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <span className="text-xs text-muted-foreground">Focus Keyword</span>
                    <p className="text-sm font-medium mt-0.5">{seo.focusKeyword}</p>
                  </CardContent>
                </Card>
              )}
              {seo.keywords && seo.keywords.length > 0 && (
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <span className="text-xs text-muted-foreground mb-2 block">Keywords SEO</span>
                    <div className="flex flex-wrap gap-1.5">
                      {seo.keywords.map((k, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">{k}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              {seo.faqQuestions && seo.faqQuestions.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">FAQ Schema</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {seo.faqQuestions.map((q, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <span className="text-muted-foreground shrink-0">Q{i + 1}:</span>
                        <span>{q}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                <Target className="w-5 h-5 mx-auto mb-2" />
                Dados SEO não disponíveis
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
