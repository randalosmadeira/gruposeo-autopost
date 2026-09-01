import { AlertTriangle, CheckCircle2, FileCheck2, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ElectoralComplianceProfile, ElectoralComplianceResult } from '@/lib/electoralCompliance';

interface Props {
  profile: ElectoralComplianceProfile;
  result: ElectoralComplianceResult;
  electionDate: string;
  onChange: (patch: Partial<ElectoralComplianceProfile>) => void;
  onElectionDateChange: (value: string) => void;
}

const ToggleRow = ({
  id,
  checked,
  onChange,
  label,
  description,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description: string;
}) => (
  <label htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/40">
    <input
      id={id}
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className="mt-0.5 h-4 w-4 rounded border-gray-300"
    />
    <span>
      <span className="block text-sm font-semibold">{label}</span>
      <span className="block text-xs text-muted-foreground">{description}</span>
    </span>
  </label>
);

export function ElectoralCompliancePanel({ profile, result, electionDate, onChange, onElectionDateChange }: Props) {
  return (
    <div className="space-y-4">
      <Card className="border-orange-500/30">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-5 w-5 text-orange-500" /> Compliance Eleitoral 2026
              </CardTitle>
              <CardDescription>
                Gate de segurança antes de publicar. O sistema não substitui revisão jurídica da campanha.
              </CardDescription>
            </div>
            <Badge variant={result.canPublish ? 'default' : 'destructive'}>
              {result.canPublish ? 'APTO PARA PUBLICAÇÃO' : `${result.blockers.length} BLOQUEIO(S)`}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span>Índice de conformidade operacional</span>
              <strong>{result.score}%</strong>
            </div>
            <Progress value={result.score} />
          </div>

          {result.blockers.length > 0 && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-bold text-red-600 dark:text-red-400">
                <AlertTriangle className="h-4 w-4" /> Bloqueios de publicação
              </div>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {result.blockers.map((item) => <li key={item}>• {item}</li>)}
              </ul>
            </div>
          )}

          {result.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-700 dark:text-amber-400">
                <FileCheck2 className="h-4 w-4" /> Alertas de revisão
              </div>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {result.warnings.map((item) => <li key={item}>• {item}</li>)}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Identificação oficial da candidatura</CardTitle>
            <CardDescription>Dados usados no rodapé, banners e trilha de auditoria.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div><Label>Nome completo *</Label><Input value={profile.candidateName} onChange={(e) => onChange({ candidateName: e.target.value })} /></div>
            <div><Label>Nome de urna *</Label><Input value={profile.ballotName} onChange={(e) => onChange({ ballotName: e.target.value })} /></div>
            <div><Label>Número *</Label><Input inputMode="numeric" value={profile.ballotNumber} onChange={(e) => onChange({ ballotNumber: e.target.value })} /></div>
            <div><Label>Partido *</Label><Input value={profile.politicalParty} onChange={(e) => onChange({ politicalParty: e.target.value })} /></div>
            <div><Label>Federação/coligação</Label><Input value={profile.federationOrCoalition} onChange={(e) => onChange({ federationOrCoalition: e.target.value })} /></div>
            <div><Label>CNPJ da campanha *</Label><Input placeholder="00.000.000/0000-00" value={profile.campaignCnpj} onChange={(e) => onChange({ campaignCnpj: e.target.value })} /></div>
            <div><Label>Responsável pela publicação *</Label><Input value={profile.responsibleName} onChange={(e) => onChange({ responsibleName: e.target.value })} /></div>
            <div><Label>Data do 1º turno</Label><Input type="date" value={electionDate} onChange={(e) => onElectionDateChange(e.target.value)} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Domínio oficial e infraestrutura</CardTitle>
            <CardDescription>O endereço usado na campanha precisa ser controlado e auditável.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Site oficial HTTPS *</Label><Input placeholder="https://..." value={profile.officialWebsite} onChange={(e) => onChange({ officialWebsite: e.target.value })} /></div>
            <div><Label>Data/hora de comunicação/registro do endereço</Label><Input type="datetime-local" value={profile.websiteRegistrationDate} onChange={(e) => onChange({ websiteRegistrationDate: e.target.value })} /></div>
            <div><Label>Política de Privacidade</Label><Input placeholder="https://.../privacidade" value={profile.privacyPolicyUrl} onChange={(e) => onChange({ privacyPolicyUrl: e.target.value })} /></div>
            <ToggleRow
              id="electoral-site-registered"
              checked={profile.websiteRegisteredWithElectoralJustice}
              onChange={(value) => onChange({ websiteRegisteredWithElectoralJustice: value })}
              label="Endereço eletrônico informado à Justiça Eleitoral"
              description="Confirmação operacional exigida antes de liberar publicação oficial."
            />
            <ToggleRow
              id="electoral-provider-br"
              checked={profile.providerEstablishedInBrazil}
              onChange={(value) => onChange({ providerEstablishedInBrazil: value })}
              label="Provedor/hospedagem estabelecido no Brasil"
              description="Mantém o domínio oficial dentro da regra aplicável à propaganda eleitoral na internet."
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">IA, mídia sintética e fontes</CardTitle>
            <CardDescription>Registro de uso de IA e bloqueios temporais automáticos.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Modo de produção</Label>
              <Select value={profile.contentMode} onValueChange={(value) => onChange({ contentMode: value as ElectoralComplianceProfile['contentMode'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="editorial-factual">Assistência editorial factual</SelectItem>
                  <SelectItem value="synthetic-media">Conteúdo sintético multimídia</SelectItem>
                  <SelectItem value="manual">Conteúdo manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <ToggleRow id="uses-ai" checked={profile.usesAi} onChange={(value) => onChange({ usesAi: value })} label="Uso de IA registrado" description="Mantém trilha de auditoria sobre etapas em que IA foi empregada." />
            <ToggleRow id="uses-synthetic" checked={profile.usesSyntheticMedia} onChange={(value) => onChange({ usesSyntheticMedia: value, contentMode: value ? 'synthetic-media' : profile.contentMode })} label="Há imagem, áudio ou vídeo sintético/manipulado" description="Ativa rotulagem obrigatória e janela eleitoral de bloqueio." />
            <ToggleRow id="ai-label" checked={profile.syntheticMediaDisclosure} onChange={(value) => onChange({ syntheticMediaDisclosure: value })} label="Rotulagem explícita de mídia sintética" description="A identificação deve ser destacada, acessível e informar a tecnologia utilizada." />
            <ToggleRow id="source-check" checked={profile.sourceVerificationRequired} onChange={(value) => onChange({ sourceVerificationRequired: value })} label="Fontes primárias obrigatórias" description="Dados, estatísticas, atos públicos, citações e projetos precisam de fonte, data e URL." />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mensageria, impulsionamento e monetização</CardTitle>
            <CardDescription>Recursos de maior risco ficam desativados até haver validação explícita.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ToggleRow id="message-consent" checked={profile.messagingConsentConfirmed} onChange={(value) => onChange({ messagingConsentConfirmed: value })} label="Base de mensageria com consentimento/base válida" description="Não usar base comprada, raspada ou origem não comprovada." />
            <ToggleRow id="unsubscribe" checked={profile.unsubscribeMechanismConfirmed} onChange={(value) => onChange({ unsubscribeMechanismConfirmed: value })} label="Descadastramento/bloqueio disponível" description="Registrar opt-out e impedir novos disparos ao contato descadastrado." />
            <ToggleRow id="paid-boosting" checked={profile.paidBoosting} onChange={(value) => onChange({ paidBoosting: value })} label="Haverá impulsionamento pago" description="Ativa validações específicas do provedor e registro de responsabilidade." />
            {profile.paidBoosting && <div><Label>Provedor/plataforma</Label><Input placeholder="Meta, TikTok, outro..." value={profile.paidBoostingProvider} onChange={(e) => onChange({ paidBoostingProvider: e.target.value })} /></div>}
            <div>
              <Label>Monetização do portal eleitoral</Label>
              <Select value={profile.monetizationMode} onValueChange={(value) => onChange({ monetizationMode: value as ElectoralComplianceProfile['monetizationMode'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Desativada — padrão recomendado</SelectItem>
                  <SelectItem value="adsense-editorial">AdSense em área editorial separada</SelectItem>
                  <SelectItem value="other">Outro modelo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {profile.monetizationMode !== 'off' && (
              <ToggleRow id="monetization-review" checked={profile.monetizationLegalReviewConfirmed} onChange={(value) => onChange({ monetizationLegalReviewConfirmed: value })} label="Monetização revisada pela assessoria eleitoral/contábil" description="Necessária antes de habilitar publicidade em ambiente oficial de campanha." />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gate humano de publicação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ToggleRow id="legal-review-required" checked={profile.legalReviewRequired} onChange={(value) => onChange({ legalReviewRequired: value })} label="Revisão humana/jurídica obrigatória" description="Esta trava deve permanecer ligada para conteúdo eleitoral." />
          <ToggleRow id="legal-review-confirmed" checked={profile.legalReviewConfirmed} onChange={(value) => onChange({ legalReviewConfirmed: value })} label="Peça atual foi revisada e liberada" description="Marcar somente depois da conferência de fatos, fontes, rotulagem, período e identificação legal." />
          {result.canPublish && (
            <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/5 p-3 text-sm text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-5 w-5" /> Todos os bloqueios configurados foram superados.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
