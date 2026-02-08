import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FileText, Sparkles, Loader2 } from 'lucide-react';

export interface ArticleSizeOption {
  value: string;
  label: string;
  words: string;
}

export interface PointOfViewOption {
  value: string;
  label: string;
}

interface GeneratorMainConfigProps {
  keyword: string;
  title: string;
  tone: string;
  pointOfView: string;
  size: string;
  language: string;
  onKeywordChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  onToneChange: (value: string) => void;
  onPointOfViewChange: (value: string) => void;
  onSizeChange: (value: string) => void;
  onLanguageChange: (value: string) => void;
  onGenerateTitle: () => void;
  isGeneratingTitle: boolean;
  tones?: string[];
  pointsOfView?: PointOfViewOption[];
  articleSizes?: ArticleSizeOption[];
}

const defaultTones = [
  'Profissional',
  'Casual',
  'Acadêmico',
  'Persuasivo',
  'Educativo',
];

const defaultPointsOfView: PointOfViewOption[] = [
  { value: 'terceira', label: 'Terceira Pessoa (Neutro)' },
  { value: 'primeira', label: 'Primeira Pessoa (Eu)' },
  { value: 'segunda', label: 'Segunda Pessoa (Você)' },
];

const defaultArticleSizes: ArticleSizeOption[] = [
  { value: 'muito_pequeno', label: 'Muito Pequeno', words: '600-1.200 palavras' },
  { value: 'pequeno', label: 'Pequeno', words: '1.200-2.400 palavras' },
  { value: 'medio', label: 'Médio', words: '2.400-3.600 palavras' },
  { value: 'grande', label: 'Grande', words: '2.600-5.200 palavras' },
];

export function GeneratorMainConfig({
  keyword,
  title,
  tone,
  pointOfView,
  size,
  language,
  onKeywordChange,
  onTitleChange,
  onToneChange,
  onPointOfViewChange,
  onSizeChange,
  onLanguageChange,
  onGenerateTitle,
  isGeneratingTitle,
  tones = defaultTones,
  pointsOfView = defaultPointsOfView,
  articleSizes = defaultArticleSizes,
}: GeneratorMainConfigProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2 text-foreground">
        <FileText className="w-5 h-5 text-primary" />
        Detalhes Principais
      </h2>

      {/* Keyword Field */}
      <div className="space-y-2">
        <Label className="text-[13px] font-medium">
          Palavra-chave Principal <span className="text-red-500">*</span>
        </Label>
        <Input
          placeholder="ex: inteligência artificial, marketing digital"
          value={keyword}
          onChange={(e) => onKeywordChange(e.target.value)}
          maxLength={200}
          className="h-11"
        />
        <p className="text-xs text-muted-foreground">
          O tópico principal que seu artigo focará para otimização SEO
        </p>
      </div>

      {/* Title Field */}
      <div className="space-y-2">
        <Label className="text-[13px] font-medium">
          Título do Artigo <span className="text-red-500">*</span>
        </Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              placeholder="Digite seu título ou gere um"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              maxLength={80}
              className="h-11 pr-16"
            />
            <span 
              className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs ${
                title.length > 60 ? 'text-orange-500' : 'text-muted-foreground'
              }`}
            >
              {title.length}/80
            </span>
          </div>
          <Button 
            onClick={onGenerateTitle}
            disabled={isGeneratingTitle}
            className="h-11 px-4 bg-primary hover:bg-primary/90"
          >
            {isGeneratingTitle ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            Gerar Título
          </Button>
        </div>
        {title.length > 60 && (
          <p className="text-xs text-orange-500">
            ⚠️ Título muito longo. Recomendamos menos de 60 caracteres para melhor SEO.
          </p>
        )}
      </div>

      {/* 2x2 Grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-[13px] font-medium">Tom de Voz</Label>
          <Select value={tone} onValueChange={onToneChange}>
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {tones.map((t) => (
                <SelectItem key={t} value={t.toLowerCase()}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-[13px] font-medium">Ponto de Vista</Label>
          <Select value={pointOfView} onValueChange={onPointOfViewChange}>
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pointsOfView.map((pov) => (
                <SelectItem key={pov.value} value={pov.value}>
                  {pov.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-[13px] font-medium">Tamanho do Artigo</Label>
          <Select value={size} onValueChange={onSizeChange}>
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {articleSizes.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label} ({s.words})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-[13px] font-medium">Idioma</Label>
          <Select value={language} onValueChange={onLanguageChange}>
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pt-BR">🇧🇷 Português (Brasil)</SelectItem>
              <SelectItem value="en-US">🇺🇸 English (US)</SelectItem>
              <SelectItem value="es">🇪🇸 Español</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

export { defaultTones, defaultPointsOfView, defaultArticleSizes };
