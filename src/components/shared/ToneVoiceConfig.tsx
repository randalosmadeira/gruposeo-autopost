import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Wand2 } from 'lucide-react';

// Tone of Voice options
export const toneOptions = [
  { value: 'none', label: 'Nenhum' },
  { value: 'amigavel', label: 'Amigável' },
  { value: 'profissional', label: 'Profissional' },
  { value: 'informativo', label: 'Informativo' },
  { value: 'transacional', label: 'Transacional' },
  { value: 'inspirador', label: 'Inspirador' },
  { value: 'neutro', label: 'Neutro' },
  { value: 'espirituoso', label: 'Espirituoso' },
  { value: 'casual', label: 'Casual' },
  { value: 'autoritativo', label: 'Autoritativo' },
  { value: 'encorajador', label: 'Encorajador' },
  { value: 'persuasivo', label: 'Persuasivo' },
  { value: 'poetico', label: 'Poético' },
];

// Point of View options
export const pointOfViewOptions = [
  { value: 'primeira-singular', label: 'Primeira pessoa do singular (eu)' },
  { value: 'primeira-plural', label: 'Primeira pessoa do plural (nós)' },
  { value: 'segunda-singular', label: 'Segunda pessoa do singular (você/tu)' },
  { value: 'segunda-plural', label: 'Segunda pessoa do plural (vocês)' },
  { value: 'terceira-singular', label: 'Terceira pessoa do singular (ele/ela)' },
  { value: 'terceira-plural', label: 'Terceira pessoa do plural (eles/elas)' },
  { value: 'impessoal', label: 'Impessoal' },
];

// Language options
export const languageOptions = [
  { value: 'pt-BR', label: 'Português', flag: '🇧🇷' },
  { value: 'en-US', label: 'Inglês', flag: '🇺🇸' },
  { value: 'es-ES', label: 'Espanhol', flag: '🇪🇸' },
];

export interface ToneVoiceConfigProps {
  tone: string;
  onToneChange: (value: string) => void;
  customTone?: string;
  onCustomToneChange?: (value: string) => void;
  pointOfView: string;
  onPointOfViewChange: (value: string) => void;
  language: string;
  onLanguageChange: (value: string) => void;
  accentColor?: string;
  showLanguageToggle?: boolean;
  compact?: boolean;
}

export function ToneVoiceConfig({
  tone,
  onToneChange,
  customTone = '',
  onCustomToneChange,
  pointOfView,
  onPointOfViewChange,
  language,
  onLanguageChange,
  accentColor = '#4169E1',
  showLanguageToggle = true,
  compact = false,
}: ToneVoiceConfigProps) {
  const maxCustomToneLength = 50;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Wand2 className="w-5 h-5" style={{ color: accentColor }} />
        <h3 className="font-semibold text-base">Tom de Voz e Estilo</h3>
      </div>

      <div className={cn(
        "grid gap-6",
        compact ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2"
      )}>
        {/* Tom de Voz */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Tom de voz</Label>
            {onCustomToneChange && (
              <span className="text-xs text-muted-foreground">
                {customTone.length}/{maxCustomToneLength} caracteres
              </span>
            )}
          </div>
          
          {onCustomToneChange ? (
            <div className="space-y-2">
              <Select value={tone} onValueChange={onToneChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione ou digite o tom de voz" />
                </SelectTrigger>
                <SelectContent>
                  {toneOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Ex: Amigável"
                value={customTone}
                onChange={(e) => {
                  if (e.target.value.length <= maxCustomToneLength) {
                    onCustomToneChange(e.target.value);
                  }
                }}
                className="h-9"
              />
            </div>
          ) : (
            <Select value={tone} onValueChange={onToneChange}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tom de voz" />
              </SelectTrigger>
              <SelectContent>
                {toneOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Ponto de Vista */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Ponto de Vista</Label>
          <Select value={pointOfView} onValueChange={onPointOfViewChange}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o ponto de vista da narrativa" />
            </SelectTrigger>
            <SelectContent>
              {pointOfViewOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Idioma */}
      {showLanguageToggle && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Idioma</Label>
          <div className="flex gap-2">
            {languageOptions.map(lang => (
              <button
                key={lang.value}
                type="button"
                onClick={() => onLanguageChange(lang.value)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all',
                  language === lang.value
                    ? 'shadow-sm'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                )}
                style={{
                  borderColor: language === lang.value ? accentColor : undefined,
                  backgroundColor: language === lang.value ? `${accentColor}10` : undefined,
                }}
              >
                <span className="text-base">{lang.flag}</span>
                <span className="text-sm font-medium">{lang.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ToneVoiceConfig;
