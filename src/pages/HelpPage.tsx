import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { 
  BookOpen, 
  FileText, 
  Shield, 
  Sparkles, 
  Target, 
  Newspaper,
  Scale,
  TrendingUp,
  Zap,
  HelpCircle,
  CheckCircle2,
  XCircle,
  AlertTriangle
} from 'lucide-react';

export default function HelpPage() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <BookOpen className="h-8 w-8 text-primary" />
          Central de Ajuda MAA
        </h1>
        <p className="text-muted-foreground mt-2">
          Documentação completa do sistema Meus Artigos Automáticos
        </p>
      </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview" className="gap-2">
              <HelpCircle className="h-4 w-4" />
              Visão Geral
            </TabsTrigger>
            <TabsTrigger value="articles" className="gap-2">
              <FileText className="h-4 w-4" />
              Artigos
            </TabsTrigger>
            <TabsTrigger value="compliance" className="gap-2">
              <Shield className="h-4 w-4" />
              Compliance
            </TabsTrigger>
            <TabsTrigger value="seo" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              SEO
            </TabsTrigger>
            <TabsTrigger value="faq" className="gap-2">
              <HelpCircle className="h-4 w-4" />
              FAQ
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <FeatureCard
                icon={FileText}
                title="Geração de Artigos"
                description="Crie artigos otimizados para SEO com IA, incluindo imagens e estrutura profissional."
                items={[
                  'Artigos de blog (800-2500 palavras)',
                  'Páginas de vendas (Landing Pages)',
                  'Artigos em massa (campanhas SEO)',
                  'Sequências de artigos (Pillar + Cluster)'
                ]}
              />
              <FeatureCard
                icon={Newspaper}
                title="Agências de Notícias"
                description="Monitore e reescreva notícias com compliance de direitos autorais."
                items={[
                  'Monitoramento de fontes RSS',
                  'Repostagem com Lei 9.610/98',
                  'Créditos automáticos de fontes',
                  'Análise e contexto próprio (40%+)'
                ]}
              />
              <FeatureCard
                icon={Target}
                title="Planejador de Autoridade"
                description="Crie clusters de conteúdo para dominar tópicos no Google."
                items={[
                  'Artigo Pilar + Satélites',
                  'Link building interno automático',
                  'Estratégia E-E-A-T',
                  'Calendário editorial'
                ]}
              />
              <FeatureCard
                icon={Shield}
                title="Compliance OAB"
                description="Validação automática para advogados conforme Resolução 02/2015."
                items={[
                  'Detecta termos proibidos',
                  'Alerta captação indevida',
                  'Valida tom institucional',
                  'Score de compliance'
                ]}
              />
              <FeatureCard
                icon={TrendingUp}
                title="Otimização SEO"
                description="Análise completa de SEO on-page para máximo rankeamento."
                items={[
                  'Score SEO (0-100)',
                  'Flesch Reading Ease',
                  'Análise de palavras-chave',
                  'Verificação de estrutura H1-H3'
                ]}
              />
              <FeatureCard
                icon={Zap}
                title="Publicação WordPress"
                description="Publique diretamente em múltiplos sites WordPress."
                items={[
                  'Sincronização automática',
                  'Suporte Yoast/Rank Math',
                  'Publicação programada',
                  'Upload de imagens'
                ]}
              />
            </div>

            {/* Pricing */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Precificação MAA
                </CardTitle>
                <CardDescription>
                  Economia significativa comparado a plataformas tradicionais
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="p-4 rounded-lg bg-muted/50 text-center">
                    <p className="text-3xl font-bold text-primary">R$ 0,05</p>
                    <p className="text-sm text-muted-foreground">por artigo gerado</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50 text-center">
                    <p className="text-3xl font-bold text-primary">R$ 0,22</p>
                    <p className="text-sm text-muted-foreground">por imagem gerada</p>
                  </div>
                  <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/20 text-center">
                    <p className="text-3xl font-bold text-green-600">Até R$ 49,50</p>
                    <p className="text-sm text-muted-foreground">economia por artigo</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Articles Tab */}
          <TabsContent value="articles">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Tipos de Artigos</CardTitle>
                </CardHeader>
                <CardContent>
                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="blog">
                      <AccordionTrigger>Artigo de Blog</AccordionTrigger>
                      <AccordionContent className="space-y-3">
                        <p>Artigos informativos otimizados para SEO.</p>
                        <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
                          <li>Tamanho: 800-2500 palavras</li>
                          <li>Estrutura: H1, H2 (3-5x), H3</li>
                          <li>Parágrafos: máx 4 linhas (mobile-first)</li>
                          <li>Inclui FAQ para Featured Snippets</li>
                          <li>Meta description otimizada (150-160 chars)</li>
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="landing">
                      <AccordionTrigger>Página de Vendas (Landing Page)</AccordionTrigger>
                      <AccordionContent className="space-y-3">
                        <p>Copywriting persuasivo focado em conversão.</p>
                        <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
                          <li>Frameworks: AIDA, PAS, FAB</li>
                          <li>CTAs estratégicos</li>
                          <li>Gatilhos mentais (escassez, autoridade, prova social)</li>
                          <li>SEO Local e Nacional</li>
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="massa">
                      <AccordionTrigger>Artigos em Massa</AccordionTrigger>
                      <AccordionContent className="space-y-3">
                        <p>Processamento em lote para campanhas SEO.</p>
                        <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
                          <li>5-50+ artigos por campanha</li>
                          <li>Templates padronizados</li>
                          <li>Variações por região/tema</li>
                          <li>Publicação programada</li>
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="pillar">
                      <AccordionTrigger>Pillar + Cluster (Autoridade)</AccordionTrigger>
                      <AccordionContent className="space-y-3">
                        <p>Estratégia de cluster de conteúdo para dominar tópicos.</p>
                        <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
                          <li>Artigo Pilar: 2000+ palavras, guia completo</li>
                          <li>Artigos Satélites: 1200 palavras cada</li>
                          <li>Links internos automáticos entre artigos</li>
                          <li>Fluxo de autoridade otimizado</li>
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Estrutura Padrão de Artigo</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <Badge>1</Badge>
                      <div>
                        <p className="font-medium">Título otimizado</p>
                        <p className="text-sm text-muted-foreground">55-65 caracteres, palavra-chave no início</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <Badge>2</Badge>
                      <div>
                        <p className="font-medium">Meta description</p>
                        <p className="text-sm text-muted-foreground">150-160 caracteres, CTA implícito</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <Badge>3</Badge>
                      <div>
                        <p className="font-medium">Introdução com gancho</p>
                        <p className="text-sm text-muted-foreground">100-150 palavras, problema/solução</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <Badge>4</Badge>
                      <div>
                        <p className="font-medium">Desenvolvimento com H2/H3</p>
                        <p className="text-sm text-muted-foreground">3-5 seções H2, parágrafos de 2-4 linhas</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <Badge>5</Badge>
                      <div>
                        <p className="font-medium">Conclusão + CTA</p>
                        <p className="text-sm text-muted-foreground">Resumo + chamada para ação suave</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <Badge>6</Badge>
                      <div>
                        <p className="font-medium">FAQ (quando aplicável)</p>
                        <p className="text-sm text-muted-foreground">5-8 perguntas para Featured Snippets</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Compliance Tab */}
          <TabsContent value="compliance">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Scale className="h-5 w-5" />
                    Código de Ética OAB (Resolução 02/2015)
                  </CardTitle>
                  <CardDescription>
                    Diretrizes para conteúdo de escritórios de advocacia
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-3">
                      <h4 className="font-semibold flex items-center gap-2 text-green-600">
                        <CheckCircle2 className="h-4 w-4" />
                        Permitido
                      </h4>
                      <ul className="space-y-2 text-sm">
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                          Conteúdo educacional sobre direitos
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                          Explicação de procedimentos jurídicos
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                          Análise de decisões judiciais
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                          Orientações gerais (sem substituir consulta)
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                          Cases de sucesso (SEM identificar clientes)
                        </li>
                      </ul>
                    </div>
                    <div className="space-y-3">
                      <h4 className="font-semibold flex items-center gap-2 text-destructive">
                        <XCircle className="h-4 w-4" />
                        Proibido
                      </h4>
                      <ul className="space-y-2 text-sm">
                        <li className="flex items-start gap-2">
                          <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                          Captação indevida de clientela (mercantilização)
                        </li>
                        <li className="flex items-start gap-2">
                          <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                          Garantias de resultado ("100% de sucesso")
                        </li>
                        <li className="flex items-start gap-2">
                          <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                          Promoções/descontos ("advogado barato")
                        </li>
                        <li className="flex items-start gap-2">
                          <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                          Sensacionalismo ou apelo emocional excessivo
                        </li>
                        <li className="flex items-start gap-2">
                          <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                          Comparações com concorrentes
                        </li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Newspaper className="h-5 w-5" />
                    Lei de Direitos Autorais (Lei 9.610/98)
                  </CardTitle>
                  <CardDescription>
                    Diretrizes para repostagem de conteúdo jornalístico
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-3">
                      <h4 className="font-semibold flex items-center gap-2 text-green-600">
                        <CheckCircle2 className="h-4 w-4" />
                        Permitido
                      </h4>
                      <ul className="space-y-2 text-sm">
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                          Reescrever 100% com palavras próprias
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                          Citações curtas (máx 2-3 frases) com aspas
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                          Creditar fonte original (veículo + link)
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                          Adicionar análise própria (40%+ do conteúdo)
                        </li>
                      </ul>
                    </div>
                    <div className="space-y-3">
                      <h4 className="font-semibold flex items-center gap-2 text-destructive">
                        <XCircle className="h-4 w-4" />
                        Proibido
                      </h4>
                      <ul className="space-y-2 text-sm">
                        <li className="flex items-start gap-2">
                          <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                          Copiar/colar parágrafos inteiros
                        </li>
                        <li className="flex items-start gap-2">
                          <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                          Parafrasear apenas trocando palavras (plágio)
                        </li>
                        <li className="flex items-start gap-2">
                          <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                          Remover créditos da fonte original
                        </li>
                        <li className="flex items-start gap-2">
                          <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                          Republicar conteúdo de agências sem licença
                        </li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-yellow-200 bg-yellow-50/50 dark:bg-yellow-950/20 dark:border-yellow-900">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
                    <AlertTriangle className="h-5 w-5" />
                    Termos Detectados Automaticamente
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {[
                      'garantido', '100% de sucesso', 'melhor advogado',
                      'resultado garantido', 'certeza de ganhar', 'promoção',
                      'desconto', 'preço mais baixo', 'advogado mais barato',
                      'grátis', 'aproveite', 'compre agora', 'oferta'
                    ].map((term) => (
                      <Badge key={term} variant="destructive" className="text-xs">
                        {term}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* SEO Tab */}
          <TabsContent value="seo">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Checklist SEO (Pontuação mín: 80/100)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <SEOCheckItem label="Palavra-chave no título" weight={15} />
                    <SEOCheckItem label="Meta description otimizada" weight={10} />
                    <SEOCheckItem label="H1 único" weight={5} />
                    <SEOCheckItem label="3-5 H2 com variações da keyword" weight={15} />
                    <SEOCheckItem label="Parágrafos < 4 linhas" weight={10} />
                    <SEOCheckItem label="Imagens com alt text" weight={10} />
                    <SEOCheckItem label="2-3 links internos" weight={10} />
                    <SEOCheckItem label="1-2 links externos autoritativos" weight={10} />
                    <SEOCheckItem label="FAQ presente" weight={10} />
                    <SEOCheckItem label="Legibilidade Flesch > 60" weight={15} isLast />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>E-E-A-T (Google 2026)</CardTitle>
                  <CardDescription>
                    Experience, Expertise, Authoritativeness, Trustworthiness
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="p-4 rounded-lg bg-muted/50">
                      <h4 className="font-semibold mb-2">Experience</h4>
                      <p className="text-sm text-muted-foreground">
                        Demonstre experiência prática no assunto. Mencione casos, projetos, ou vivências reais.
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/50">
                      <h4 className="font-semibold mb-2">Expertise</h4>
                      <p className="text-sm text-muted-foreground">
                        Mostre conhecimento técnico. Cite leis, jurisprudência, dados recentes.
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/50">
                      <h4 className="font-semibold mb-2">Authoritativeness</h4>
                      <p className="text-sm text-muted-foreground">
                        Construa autoridade com backlinks, citações de fontes confiáveis (gov, edu).
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/50">
                      <h4 className="font-semibold mb-2">Trustworthiness</h4>
                      <p className="text-sm text-muted-foreground">
                        Inspire confiança com byline do autor, HTTPS, política de privacidade.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Escala Flesch Reading Ease</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 p-2 rounded bg-green-50 dark:bg-green-950/20">
                      <span className="font-mono font-bold text-green-600 w-16">70-100</span>
                      <span className="text-sm">Muito Fácil - Ideal para público geral</span>
                    </div>
                    <div className="flex items-center gap-3 p-2 rounded bg-green-50/50 dark:bg-green-950/10">
                      <span className="font-mono font-bold text-green-500 w-16">60-70</span>
                      <span className="text-sm">Fácil - Bom para blogs e artigos</span>
                    </div>
                    <div className="flex items-center gap-3 p-2 rounded bg-yellow-50 dark:bg-yellow-950/20">
                      <span className="font-mono font-bold text-yellow-600 w-16">50-60</span>
                      <span className="text-sm">Médio - Aceitável, considere simplificar</span>
                    </div>
                    <div className="flex items-center gap-3 p-2 rounded bg-red-50 dark:bg-red-950/20">
                      <span className="font-mono font-bold text-red-500 w-16">0-50</span>
                      <span className="text-sm">Difícil - Necessita revisão para legibilidade</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* FAQ Tab */}
          <TabsContent value="faq">
            <Card>
              <CardHeader>
                <CardTitle>Perguntas Frequentes</CardTitle>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="item-1">
                    <AccordionTrigger>
                      Quantos artigos posso gerar por dia?
                    </AccordionTrigger>
                    <AccordionContent>
                      Não há limite fixo de artigos. O sistema utiliza créditos baseados no consumo.
                      Cada artigo custa aproximadamente R$ 0,05 e cada imagem R$ 0,22.
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-2">
                    <AccordionTrigger>
                      O conteúdo gerado é único?
                    </AccordionTrigger>
                    <AccordionContent>
                      Sim. A IA gera conteúdo original a cada solicitação. Para repostagens,
                      o sistema garante score de originalidade acima de 90%.
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-3">
                    <AccordionTrigger>
                      Posso usar para escritório de advocacia?
                    </AccordionTrigger>
                    <AccordionContent>
                      Sim! O sistema inclui validação automática de compliance OAB (Resolução 02/2015),
                      detectando termos proibidos e alertando sobre possíveis violações éticas.
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-4">
                    <AccordionTrigger>
                      Como funciona a repostagem de notícias?
                    </AccordionTrigger>
                    <AccordionContent>
                      O sistema reescreve 100% do conteúdo com estrutura própria, adiciona análise
                      e contexto (mín 40%), e credita a fonte original no rodapé, garantindo
                      conformidade com a Lei 9.610/98.
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-5">
                    <AccordionTrigger>
                      Quais modelos de IA estão disponíveis?
                    </AccordionTrigger>
                    <AccordionContent>
                      O sistema utiliza um AI Gateway proprietário com acesso a modelos Google Gemini
                      e OpenAI GPT-5. O modelo padrão é google/gemini-3-flash-preview para
                      melhor custo-benefício.
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-6">
                    <AccordionTrigger>
                      Como integrar com meu WordPress?
                    </AccordionTrigger>
                    <AccordionContent>
                      Vá em Configurações → Projetos → Adicionar Site WordPress. Você precisará
                      da URL do site, usuário e senha de aplicação (Application Password).
                      O sistema detecta automaticamente plugins SEO como Yoast e Rank Math.
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
  items
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  items: string[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className="h-5 w-5 text-primary" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1 text-sm text-muted-foreground">
          {items.map((item, i) => (
            <li key={i} className="flex items-center gap-2">
              <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function SEOCheckItem({ 
  label, 
  weight, 
  isLast = false 
}: { 
  label: string; 
  weight: number;
  isLast?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-2 ${!isLast ? 'border-b' : ''}`}>
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-green-500" />
        <span className="text-sm">{label}</span>
      </div>
      <Badge variant="outline">peso: {weight}</Badge>
    </div>
  );
}
