import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ConversionBrief } from '@/lib/nexus-editorial';

interface Props {
  value: ConversionBrief;
  sources: string;
  onChange: (value: ConversionBrief) => void;
  onSourcesChange: (value: string) => void;
}
export function NexusEditorialBrief({ value, sources, onChange, onSourcesChange }: Props) {
  const fields: Array<{ key: keyof ConversionBrief; label: string; placeholder: string }> = [
    { key: 'offer', label: 'Oferta ou solução real', placeholder: 'O que o negócio efetivamente oferece?' },
    { key: 'benefit', label: 'Benefício para o leitor', placeholder: 'Que valor concreto a solução pode entregar?' },
    { key: 'objection', label: 'Dúvida ou objeção principal', placeholder: 'Custo, tempo, adequação ou outra dúvida' },
    { key: 'action', label: 'Próxima ação', placeholder: 'Ler o guia, solicitar orçamento, agendar...' },
    { key: 'destination', label: 'Destino da ação', placeholder: 'https://seusite.com.br/contato' },
    { key: 'urgencyEvidence', label: 'Fato que justifica urgência (opcional)', placeholder: 'Prazo real, fonte e validade. Sem esse fato, não será solicitada urgência.' },
  ];
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Conteúdo útil com benefícios, evidências e uma próxima ação adequada ao nicho. Notícias preservam sua finalidade informativa.</p>
    <div className="space-y-2"><Label htmlFor="nexus-stage">Etapa do leitor</Label>
      <select id="nexus-stage" value={value.stage || 'discovery'} onChange={e => onChange({ ...value, stage: e.target.value as ConversionBrief['stage'] })} className="w-full rounded-md border border-input bg-background p-2">
        <option value="discovery">Descoberta: entender a necessidade</option><option value="consideration">Consideração: comparar alternativas</option><option value="decision">Decisão: avaliar compra ou contratação</option>
      </select>
    </div>
    {fields.map(field => <div className="space-y-2" key={field.key}>
      <Label htmlFor={`nexus-${field.key}`}>{field.label}</Label>
      <Input id={`nexus-${field.key}`} value={value[field.key] || ''} maxLength={field.key === 'action' ? 300 : 1600} placeholder={field.placeholder} onChange={e => onChange({ ...value, [field.key]: e.target.value })} />
    </div>)}
    <div className="space-y-2"><Label htmlFor="nexus-sources">Fontes e trechos de apoio</Label>
      <Textarea id="nexus-sources" value={sources} maxLength={8000} rows={7} placeholder="Cole os trechos relevantes com URL, entidade e data. Uma URL isolada não comprova que a fonte foi lida. Use somente informações autorizadas para este conteúdo." onChange={e => onSourcesChange(e.target.value)} />
      <p className="text-xs text-muted-foreground">{sources.length}/8.000 caracteres. O material será enviado ao provedor de IA usado na geração. Não inclua segredos ou dados privados de clientes.</p>
    </div>
    <p className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">Sem escassez artificial, estatísticas inventadas ou promessa de resultado. O briefing orienta a escrita; não equivale à validação factual das alegações.</p>
  </div>;
}
