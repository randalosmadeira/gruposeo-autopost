import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator,
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { 
  Globe, 
  FileText, 
  CheckCircle2, 
  MoreHorizontal, 
  Loader2, 
  Trash2, 
  Settings,
  AlertTriangle,
  Eye,
  EyeOff
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { Tables, TablesUpdate } from '@/integrations/supabase/types';

type Project = Tables<'projects'>;

const SEO_PLUGINS = [
  { value: 'none', label: 'Nenhum' },
  { value: 'yoast', label: 'Yoast SEO' },
  { value: 'rankmath', label: 'Rank Math' },
  { value: 'aioseo', label: 'All in One SEO' },
];

interface ProjectCardProps {
  project: Project;
  stats: { total: number; published: number };
  onUpdate: (data: TablesUpdate<'projects'> & { id: string }) => Promise<void>;
  onDelete: (id: string) => void;
  isUpdating?: boolean;
}

/**
 * Sanitiza a URL do WordPress removendo sufixos de API e barras finais
 * para evitar duplicação de paths durante chamadas de API
 */
function sanitizeWordPressUrl(url: string): string {
  if (!url) return '';
  
  let sanitized = url.trim();
  
  // Remove sufixos de API que não devem estar na URL base
  const apiSuffixes = [
    '/wp-json/cfrdm/v1/',
    '/wp-json/cfrdm/v1',
    '/wp-json/wp/v2/',
    '/wp-json/wp/v2',
    '/wp-json/',
    '/wp-json',
  ];
  
  for (const suffix of apiSuffixes) {
    if (sanitized.toLowerCase().endsWith(suffix.toLowerCase())) {
      sanitized = sanitized.slice(0, -suffix.length);
      break;
    }
  }
  
  // Remove barra final
  sanitized = sanitized.replace(/\/+$/, '');
  
  return sanitized;
}

export function ProjectCard({ project, stats, onUpdate, onDelete, isUpdating }: ProjectCardProps) {
  const { toast } = useToast();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [formData, setFormData] = useState({
    name: project.name,
    domain: project.domain,
    description: project.description || '',
    wordpress_url: sanitizeWordPressUrl(project.wordpress_url || ''),
    wordpress_username: project.wordpress_username || '',
    wordpress_app_password: project.wordpress_app_password || '',
    seo_plugin: project.seo_plugin || 'none',
    // ZicaJuris fields
    nicho: (project as any).nicho || 'auto',
    empresa_nome: (project as any).empresa_nome || '',
    empresa_telefone: (project as any).empresa_telefone || '',
    empresa_endereco: (project as any).empresa_endereco || '',
    empresa_whatsapp: (project as any).empresa_whatsapp || '',
    // Social Media & CTAs
    social_instagram: (project as any).social_instagram || '',
    social_youtube: (project as any).social_youtube || '',
    social_linkedin: (project as any).social_linkedin || '',
    social_twitter: (project as any).social_twitter || '',
    social_tiktok: (project as any).social_tiktok || '',
    social_google_maps: (project as any).social_google_maps || '',
    social_linktree: (project as any).social_linktree || '',
    cta_comunidade: (project as any).cta_comunidade || '',
    cta_conclusao: (project as any).cta_conclusao || '',
    cta_leads: (project as any).cta_leads || '',
  });

  const hasCredentials = !!(
    project.wordpress_url &&
    project.wordpress_username &&
    project.wordpress_app_password
  );

  const handleTestConnection = async () => {
    const cleanUrl = sanitizeWordPressUrl(formData.wordpress_url);
    
    if (!cleanUrl || !formData.wordpress_username || !formData.wordpress_app_password) {
      toast({
        title: 'Dados incompletos',
        description: 'Preencha URL, usuário e senha do WordPress.',
        variant: 'destructive',
      });
      return;
    }

    // Update form with sanitized URL
    setFormData({ ...formData, wordpress_url: cleanUrl });

    setIsTesting(true);
    try {
      const response = await fetch(`${cleanUrl}/wp-json/wp/v2/posts?per_page=1`, {
        headers: {
          'Authorization': 'Basic ' + btoa(`${formData.wordpress_username}:${formData.wordpress_app_password}`),
        },
      });

      if (response.ok) {
        toast({
          title: 'Conexão bem-sucedida!',
          description: 'O WordPress está acessível com essas credenciais.',
        });
      } else {
        toast({
          title: 'Falha na conexão',
          description: 'Verifique as credenciais e se o plugin Application Passwords está instalado.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Erro de conexão',
        description: 'Não foi possível conectar ao site. Verifique a URL e as credenciais.',
        variant: 'destructive',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    const cleanUrl = sanitizeWordPressUrl(formData.wordpress_url);
    
    await onUpdate({
      id: project.id,
      name: formData.name,
      domain: formData.domain,
      description: formData.description || null,
      wordpress_url: cleanUrl || null,
      wordpress_username: formData.wordpress_username || null,
      wordpress_app_password: formData.wordpress_app_password || null,
      seo_plugin: formData.seo_plugin,
      is_connected: !!(cleanUrl && formData.wordpress_username && formData.wordpress_app_password),
      // ZicaJuris fields
      nicho: formData.nicho === 'auto' ? null : formData.nicho,
      empresa_nome: formData.empresa_nome || null,
      empresa_telefone: formData.empresa_telefone || null,
      empresa_endereco: formData.empresa_endereco || null,
      empresa_whatsapp: formData.empresa_whatsapp || null,
      // Social Media & CTAs
      social_instagram: formData.social_instagram || null,
      social_youtube: formData.social_youtube || null,
      social_linkedin: formData.social_linkedin || null,
      social_twitter: formData.social_twitter || null,
      social_tiktok: formData.social_tiktok || null,
      social_google_maps: formData.social_google_maps || null,
      social_linktree: formData.social_linktree || null,
      cta_comunidade: formData.cta_comunidade || null,
      cta_conclusao: formData.cta_conclusao || null,
      cta_leads: formData.cta_leads || null,
    } as any);
    setIsEditOpen(false);
  };

  return (
    <>
      <Card className="group hover:shadow-card-hover hover:-translate-y-1 transition-all">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center text-primary-foreground">
                <Globe className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-lg">{project.name}</CardTitle>
                <CardDescription className="text-xs">{project.domain}</CardDescription>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setIsEditOpen(true)}>
                  <Settings className="w-4 h-4 mr-2" />
                  Configurar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  className="text-destructive" 
                  onClick={() => onDelete(project.id)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {project.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">{project.description}</p>
          )}
          
          <div className="flex gap-4">
            <span className="flex items-center gap-1 text-sm">
              <FileText className="w-4 h-4" />
              <strong>{stats.total}</strong> artigos
            </span>
            <span className="flex items-center gap-1 text-sm">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              <strong>{stats.published}</strong> publicados
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <Badge 
              className={cn(
                hasCredentials 
                  ? 'bg-primary/10 text-primary border-primary/30' 
                  : 'bg-destructive/10 text-destructive border-destructive/30'
              )}
            >
              {hasCredentials ? (
                <><CheckCircle2 className="w-3 h-3 mr-1" />WordPress Configurado</>
              ) : (
                <><AlertTriangle className="w-3 h-3 mr-1" />Sem Credenciais</>
              )}
            </Badge>
            {project.seo_plugin && project.seo_plugin !== 'none' && (
              <Badge variant="outline" className="text-xs">
                {SEO_PLUGINS.find(p => p.value === project.seo_plugin)?.label}
              </Badge>
            )}
          </div>

          <Button 
            variant="outline" 
            size="sm" 
            className="w-full"
            onClick={() => setIsEditOpen(true)}
          >
            <Settings className="w-4 h-4 mr-2" />
            Configurar WordPress
          </Button>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Configurar Projeto</DialogTitle>
            <DialogDescription>
              Configure as credenciais WordPress para publicação automática
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            {/* Basic Info */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-muted-foreground uppercase">Informações Básicas</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome do Projeto</Label>
                  <Input 
                    value={formData.name} 
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Domínio</Label>
                  <Input 
                    value={formData.domain} 
                    onChange={(e) => setFormData({ ...formData, domain: e.target.value })} 
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Descrição (opcional)</Label>
                <Input 
                  value={formData.description} 
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })} 
                />
              </div>
            </div>

            {/* WordPress Credentials */}
            <div className="space-y-4 pt-4 border-t">
              <h4 className="text-sm font-medium text-muted-foreground uppercase">Credenciais WordPress</h4>
              
              <div className="p-3 bg-primary/5 rounded-lg border border-primary/20 text-sm">
                <p className="text-primary">
                  <strong>Dica:</strong> Vá em <em>Usuários → Perfil → Senhas de Aplicação</em> no WordPress para gerar uma senha.
                </p>
              </div>

              <div className="space-y-2">
                <Label>URL do WordPress</Label>
                <Input 
                  placeholder="https://meusite.com"
                  value={formData.wordpress_url} 
                  onChange={(e) => setFormData({ ...formData, wordpress_url: e.target.value })}
                  onBlur={(e) => setFormData({ ...formData, wordpress_url: sanitizeWordPressUrl(e.target.value) })}
                />
                <p className="text-xs text-muted-foreground">
                  Apenas a URL base (ex: https://meusite.com/blog). Não inclua /wp-json/
                </p>
              </div>
              
              <div className="space-y-2">
                <Label>Usuário WordPress</Label>
                <Input 
                  placeholder="admin"
                  value={formData.wordpress_username} 
                  onChange={(e) => setFormData({ ...formData, wordpress_username: e.target.value })} 
                />
              </div>
              
              <div className="space-y-2">
                <Label>Senha de Aplicação</Label>
                <div className="relative">
                  <Input 
                    type={showPassword ? 'text' : 'password'}
                    placeholder="xxxx xxxx xxxx xxxx"
                    value={formData.wordpress_app_password} 
                    onChange={(e) => setFormData({ ...formData, wordpress_app_password: e.target.value })} 
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <Button 
                variant="outline" 
                onClick={handleTestConnection}
                disabled={isTesting}
                className="w-full"
              >
                {isTesting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Globe className="w-4 h-4 mr-2" />
                )}
                Testar Conexão
              </Button>
            </div>

            {/* SEO Plugin */}
            <div className="space-y-4 pt-4 border-t">
              <h4 className="text-sm font-medium text-muted-foreground uppercase">Plugin SEO</h4>
              <div className="space-y-2">
                <Label>Plugin de SEO instalado</Label>
                <Select 
                  value={formData.seo_plugin} 
                  onValueChange={(value) => setFormData({ ...formData, seo_plugin: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEO_PLUGINS.map((plugin) => (
                      <SelectItem key={plugin.value} value={plugin.value}>
                        {plugin.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Se configurado, os artigos incluirão meta tags de SEO automaticamente.
                </p>
              </div>
            </div>

            {/* ZicaJuris - Nicho & Empresa */}
            <div className="space-y-4 pt-4 border-t">
              <h4 className="text-sm font-medium text-muted-foreground uppercase">🧬 DNA Verniz (ZicaJuris)</h4>
              
              <div className="space-y-2">
                <Label>Nicho do Projeto</Label>
                <Select 
                  value={formData.nicho} 
                  onValueChange={(value) => setFormData({ ...formData, nicho: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">🔍 Detecção Automática</SelectItem>
                    <SelectItem value="juridico">⚖️ Jurídico / Advocacia</SelectItem>
                    <SelectItem value="saude">🏥 Saúde / Medicina</SelectItem>
                    <SelectItem value="beleza">💄 Beleza / Estética</SelectItem>
                    <SelectItem value="tecnologia">💻 Tecnologia</SelectItem>
                    <SelectItem value="marketing">📈 Marketing Digital</SelectItem>
                    <SelectItem value="fintech">💰 Finanças / Fintech</SelectItem>
                    <SelectItem value="ecommerce">🛒 E-commerce</SelectItem>
                    <SelectItem value="b2b_saas">🏢 B2B / SaaS</SelectItem>
                    <SelectItem value="educacao">📚 Educação</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Define compliance e tom automáticos para todo conteúdo gerado neste projeto.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome da Empresa</Label>
                  <Input 
                    placeholder="Ex: RDM Advogados"
                    value={formData.empresa_nome} 
                    onChange={(e) => setFormData({ ...formData, empresa_nome: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>WhatsApp</Label>
                  <Input 
                    placeholder="(11) 99999-9999"
                    value={formData.empresa_whatsapp} 
                    onChange={(e) => setFormData({ ...formData, empresa_whatsapp: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input 
                  placeholder="(11) 3333-4444"
                  value={formData.empresa_telefone} 
                  onChange={(e) => setFormData({ ...formData, empresa_telefone: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Endereço</Label>
                <Input 
                  placeholder="Av. Paulista, 1000 - São Paulo"
                  value={formData.empresa_endereco} 
                  onChange={(e) => setFormData({ ...formData, empresa_endereco: e.target.value })}
                />
              </div>
            </div>

            {/* Social Media Links */}
            <div className="space-y-4 pt-4 border-t">
              <h4 className="text-sm font-medium text-muted-foreground uppercase">📱 Redes Sociais & Link Juice</h4>
              <p className="text-xs text-muted-foreground">
                URLs usadas automaticamente em CTAs, artigos e estratégias de SEO.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Instagram</Label>
                  <Input 
                    placeholder="https://instagram.com/..."
                    value={formData.social_instagram} 
                    onChange={(e) => setFormData({ ...formData, social_instagram: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>YouTube</Label>
                  <Input 
                    placeholder="https://youtube.com/@..."
                    value={formData.social_youtube} 
                    onChange={(e) => setFormData({ ...formData, social_youtube: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>LinkedIn</Label>
                  <Input 
                    placeholder="https://linkedin.com/in/..."
                    value={formData.social_linkedin} 
                    onChange={(e) => setFormData({ ...formData, social_linkedin: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>X (Twitter)</Label>
                  <Input 
                    placeholder="https://x.com/..."
                    value={formData.social_twitter} 
                    onChange={(e) => setFormData({ ...formData, social_twitter: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>TikTok</Label>
                  <Input 
                    placeholder="https://tiktok.com/@..."
                    value={formData.social_tiktok} 
                    onChange={(e) => setFormData({ ...formData, social_tiktok: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Google Maps</Label>
                  <Input 
                    placeholder="https://maps.app.goo.gl/..."
                    value={formData.social_google_maps} 
                    onChange={(e) => setFormData({ ...formData, social_google_maps: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Link Aggregator (Linktree/Links)</Label>
                <Input 
                  placeholder="https://linktr.ee/... ou site.com/links"
                  value={formData.social_linktree} 
                  onChange={(e) => setFormData({ ...formData, social_linktree: e.target.value })}
                />
              </div>
            </div>

            {/* CTA Strategy */}
            <div className="space-y-4 pt-4 border-t">
              <h4 className="text-sm font-medium text-muted-foreground uppercase">🎯 Estratégia de CTAs</h4>
              <p className="text-xs text-muted-foreground">
                CTAs personalizados inseridos automaticamente pela IA em todos os conteúdos gerados.
              </p>

              <div className="space-y-2">
                <Label>CTA Comunidade</Label>
                <Input 
                  placeholder="Ex: Siga @rdmadvogados no Instagram para dicas diárias"
                  value={formData.cta_comunidade} 
                  onChange={(e) => setFormData({ ...formData, cta_comunidade: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Usado no meio do artigo para engajamento social.</p>
              </div>

              <div className="space-y-2">
                <Label>CTA Conclusão / Fechamento</Label>
                <Input 
                  placeholder="Ex: Precisa de ajuda? Fale com nosso time no WhatsApp"
                  value={formData.cta_conclusao} 
                  onChange={(e) => setFormData({ ...formData, cta_conclusao: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Usado no final do artigo para conversão.</p>
              </div>

              <div className="space-y-2">
                <Label>CTA Leads (após erros frequentes)</Label>
                <Input 
                  placeholder="Ex: Baixe nosso guia gratuito para evitar esses erros"
                  value={formData.cta_leads} 
                  onChange={(e) => setFormData({ ...formData, cta_leads: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Usado após seções sobre erros comuns para captura de leads.</p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isUpdating || !formData.name || !formData.domain}>
              {isUpdating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
