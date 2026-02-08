import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface WordCountOption {
  value: string;
  label: string;
  range: { min: number; max: number };
}

export const wordCountOptions: WordCountOption[] = [
  { value: 'muito_pequeno', label: 'Muito Pequeno (600-1200 palavras)', range: { min: 600, max: 1200 } },
  { value: 'pequeno', label: 'Pequeno (1200-2400 palavras)', range: { min: 1200, max: 2400 } },
  { value: 'medio', label: 'Médio (2400-3600 palavras)', range: { min: 2400, max: 3600 } },
  { value: 'grande', label: 'Grande (2600-5200 palavras)', range: { min: 2600, max: 5200 } },
];

export interface WordCountSelectorProps {
  value: string;
  onChange: (value: string) => void;
  showLabel?: boolean;
  label?: string;
  className?: string;
  accentColor?: string;
}

export function WordCountSelector({
  value,
  onChange,
  showLabel = true,
  label = 'Aplicar tamanho a todos:',
  className,
  accentColor = '#4169E1',
}: WordCountSelectorProps) {
  const selectedOption = wordCountOptions.find(opt => opt.value === value);

  return (
    <div className={cn('space-y-2', className)}>
      {showLabel && (
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <Label className="text-sm text-muted-foreground">{label}</Label>
        </div>
      )}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger 
          className="w-full bg-background"
          style={value ? { borderColor: `${accentColor}40` } : {}}
        >
          <SelectValue placeholder="Selecionar tamanho padrão" />
        </SelectTrigger>
        <SelectContent className="bg-popover border shadow-lg z-50">
          {wordCountOptions.map((option) => (
            <SelectItem 
              key={option.value} 
              value={option.value}
              className="cursor-pointer hover:bg-accent"
            >
              <span className="flex items-center gap-2">
                <span 
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: option.value === value ? accentColor : '#d1d5db' }}
                />
                {option.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      {selectedOption && (
        <p className="text-xs text-muted-foreground">
          ✓ Tamanho aplicado: {selectedOption.range.min.toLocaleString('pt-BR')}-{selectedOption.range.max.toLocaleString('pt-BR')} palavras
        </p>
      )}
    </div>
  );
}

// Helper function to get word count range from value
export function getWordCountRange(value: string): { min: number; max: number } | null {
  const option = wordCountOptions.find(opt => opt.value === value);
  return option?.range || null;
}

// Helper to get average word count from a size value
export function getAverageWordCount(value: string): number {
  const range = getWordCountRange(value);
  if (!range) return 2000; // default
  return Math.round((range.min + range.max) / 2);
}
