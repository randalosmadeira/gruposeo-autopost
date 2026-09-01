import { AlertTriangle, CheckCircle2, FileCheck2, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  isMajoritarianRole,
  type ElectoralComplianceProfile,
  type ElectoralComplianceResult,
} from '@/lib/electoralCompliance';

interface Props {
  profile: ElectoralComplianceProfile;
  result: ElectoralComplianceResult;
  electionDate: string;
  onChange: (patch: Partial<ElectoralComplianceProfile>) => void;
  onElectionDateChange: (value: string) => void;
}

const ToggleRow = ({ id, checked, onChange, label, description }: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description: string;
}) => (
  <label htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/40">
    <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300" />
    <span><span className="block text-sm font-semibold">{label}</span><span className="block text-xs text-muted-foreground">{description}</span></span>
  </label>
);

const TextField = ({ label, value, onChange, placeholder, type = 'text' }: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) => (
  <div><Label>{label}</Label><Input type={type} placeholder={placeholder} value={value || ''} onChange={(e) => onChange(e.target.value)} /></div>
);

export function ElectoralCompliancePanel({ profile, result, electionDate, onChange, onElectionDateChange }: Props) {
  const majoritarian = isMajoritarianRole(profile.candidateRole);

  return (
    <div className="space-y-4">
      <Card className="border-orange-500/30">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-5 w-5 text-orange-500" /> Compliance Eleitoral 2026</CardTitle>
              <CardDescription>Gate técnico de conformidade. Publicação continua condicionada à revisão jurídica da campanha.</CardDescription>
            </div>
            <Badge variant={result.canPublish ? 'default' : 'destructive'}>{result.canPublish ? 'APTO PARA PUBLICAÇÃO' : `${result.blockers.length} BLOQUEIO(S)`}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><div className="flex items-center justify-between text-xs"><span>Índice de conformidade operacional</span><strong>{result.score}%</strong></div><Progress value={result.score} /></div>
          {result.blockers.length > 0 && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-bold text-red-600 dark:text-red-400"><AlertTriangle className="h-4 w-4" /> Bloqueios de publicação</div>
              <ul className="space-y-1 text-xs text-muted-foreground">{result.blockers.map((item) => <li key={item}>• {item}</li>)}</ul>
            </div>
          )}
          {result.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-700 dark:text-amber-400"><FileCheck2 className="h-4 w-4" /> Alertas de revisão</div>
              <ul className="space-y-1 text-xs text-muted-foreground">{result.warnings.map((item) => <li key={item}>• {item}</li>)}</ul>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Identificação oficial da candidatura</CardTitle><CardDescription>Dados da candidatura, chapa e responsável pela publicação.</CardDescription></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <TextField label="Nome completo *" value={profile.candidateName} onChange={(value) => onChange({ candidateName: value })} />
            <TextField label="Nome de urna *" value={profile.ballotName} onChange={(value) => onChange({ ballotName: value })} />
            <TextField label="Número *" value={profile.ballotNumber} onChange={(value) => onChange({ ballotNumber: value })} />
            <TextField label="Partido *" value={profile.politicalParty} onChange={(value) => onChange({ politicalParty: value })} />
            <TextField label="Federação/coligação" value={profile.federationOrCoalition} onChange={(value) => onChange({ federationOrCoalition: value })} />
            <TextField label="CNPJ da campanha *" placeholder="00.000.000/0000-00" value={profile.campaignCnpj} onChange={(value) => onChange({ campaignCnpj: value })} />
            <TextField label="Responsável pela publicação *" value={profile.responsibleName} onChange={(value) => onChange({ responsibleName: value })} />
            <TextField label="Data do 1º turno" type="date" value={electionDate} onChange={onElectionDateChange} />
            {majoritarian && <TextField label={profile.candidateRole === 'senador' ? 'Suplentes *' : 'Vice *'} value={profile.majoritarianRunningMateOrAlternates} onChange={(value) => onChange({ majoritarianRunningMateOrAlternates: value })} placeholder="Nomes conforme registro" />}
            {majoritarian && profile.federationOrCoalition && <TextField label="Legendas da federação/coligação *" value={profile.majoritarianPartyLegends} onChange={(value) => onChange({ majoritarianPartyLegends: value })} placeholder="Partidos integrantes" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Domínio oficial e Justiça Eleitoral</CardTitle><CardDescription>Controle dos prazos de comunicação do endereço eletrônico.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <TextField label="Site oficial HTTPS *" placeholder="https://..." value={profile.officialWebsite} onChange={(value) => onChange({ officialWebsite: value })} />
            <ToggleRow id="site-preexisting" checked={Boolean(profile.websitePreexisting)} onChange={(value) => onChange({ websitePreexisting: value })} label="Endereço já existia antes da campanha" description="Se não constou do RRC/DRAP, o sistema aplica a espera de 48 horas após o registro." />
            {profile.websitePreexisting && <ToggleRow id="site-initial-filing" checked={Boolean(profile.websiteListedInInitialFiling)} onChange={(value) => onChange({ websiteListedInInitialFiling: value })} label="Endereço preexistente constou do RRC/DRAP" description="Distingue endereço originalmente informado de endereço regularizado depois." />}
            {profile.websitePreexisting === false && <TextField label="Data/hora de criação do endereço" type="datetime-local" value={profile.websiteCreatedAt} onChange={(value) => onChange({ websiteCreatedAt: value })} />}
            <TextField label="Data/hora da comunicação à Justiça Eleitoral *" type="datetime-local" value={profile.websiteRegistrationDate} onChange={(value) => onChange({ websiteRegistrationDate: value })} />
            <ToggleRow id="site-registered" checked={profile.websiteRegisteredWithElectoralJustice} onChange={(value) => onChange({ websiteRegisteredWithElectoralJustice: value })} label="Endereço eletrônico comunicado à Justiça Eleitoral" description="Endereço criado durante a campanha também é controlado pelo prazo de comunicação aplicável." />
            <ToggleRow id="provider-br" checked={profile.providerEstablishedInBrazil} onChange={(value) => onChange({ providerEstablishedInBrazil: value })} label="Provedor/hospedagem estabelecido no Brasil" description="Gate aplicado ao site oficial eleitoral." />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">LGPD eleitoral e governança de dados</CardTitle><CardDescription>Canal do titular, encarregado, registro das operações e segurança de dados.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <TextField label="Política de Privacidade HTTPS *" placeholder="https://.../privacidade" value={profile.privacyPolicyUrl} onChange={(value) => onChange({ privacyPolicyUrl: value })} />
          <TextField label="Canal de direitos do titular *" placeholder="E-mail, URL ou canal oficial" value={profile.dataSubjectRightsChannel} onChange={(value) => onChange({ dataSubjectRightsChannel: value })} />
          <TextField label="Encarregado pelo tratamento de dados *" value={profile.dataProtectionOfficerName} onChange={(value) => onChange({ dataProtectionOfficerName: value })} />
          <div className="md:col-span-2 grid gap-3 md:grid-cols-2">
            <ToggleRow id="processing-record" checked={Boolean(profile.dataProcessingRecordMaintained)} onChange={(value) => onChange({ dataProcessingRecordMaintained: value })} label="Registro das operações de tratamento ativo" description="Registrar tipo/origem do dado, titulares, finalidade, base legal, retenção, compartilhamentos, contratos e medidas de segurança." />
            <ToggleRow id="security-measures" checked={Boolean(profile.securityMeasuresConfirmed)} onChange={(value) => onChange({ securityMeasuresConfirmed: value })} label="Medidas técnicas e administrativas de segurança confirmadas" description="Controles de acesso, proteção contra perda/vazamento e resposta a incidentes." />
            <ToggleRow id="sensitive-data" checked={Boolean(profile.processesSensitiveData)} onChange={(value) => onChange({ processesSensitiveData: value })} label="A campanha trata dados pessoais sensíveis" description="Ativa validação adicional de consentimento e base legal." />
            {profile.processesSensitiveData && <ToggleRow id="sensitive-consent" checked={Boolean(profile.sensitiveDataExplicitConsentConfirmed)} onChange={(value) => onChange({ sensitiveDataExplicitConsentConfirmed: value })} label="Consentimento específico, expresso e destacado validado" description="Marque somente após validação da hipótese jurídica aplicável." />}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">IA, mídia sintética e fontes</CardTitle><CardDescription>Registro do uso de IA e bloqueios temporais automáticos.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Modo de produção</Label><Select value={profile.contentMode} onValueChange={(value) => onChange({ contentMode: value as ElectoralComplianceProfile['contentMode'] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="editorial-factual">Assistência editorial factual</SelectItem><SelectItem value="synthetic-media">Conteúdo sintético multimídia</SelectItem><SelectItem value="manual">Conteúdo manual</SelectItem></SelectContent></Select></div>
            <ToggleRow id="uses-ai" checked={profile.usesAi} onChange={(value) => onChange({ usesAi: value })} label="Uso de IA registrado" description="Mantém trilha de auditoria sobre as etapas em que IA foi utilizada." />
            <ToggleRow id="uses-synthetic" checked={profile.usesSyntheticMedia} onChange={(value) => onChange({ usesSyntheticMedia: value, contentMode: value ? 'synthetic-media' : profile.contentMode })} label="Há imagem, áudio ou vídeo sintético/manipulado" description="Ativa rotulagem e janela de 72h antes a 24h após o pleito." />
            <ToggleRow id="ai-label" checked={profile.syntheticMediaDisclosure} onChange={(value) => onChange({ syntheticMediaDisclosure: value })} label="Rotulagem explícita de mídia sintética" description="A identificação deve ser destacada, acessível e informar a tecnologia utilizada." />
            <ToggleRow id="source-check" checked={profile.sourceVerificationRequired} onChange={(value) => onChange({ sourceVerificationRequired: value })} label="Fontes primárias obrigatórias" description="Dados, estatísticas, atos públicos, citações e projetos exigem fonte, data e URL." />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Mensageria, impulsionamento e monetização</CardTitle><CardDescription>Controles específicos para comunicação direta e mídia paga.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <ToggleRow id="message-consent" checked={profile.messagingConsentConfirmed} onChange={(value) => onChange({ messagingConsentConfirmed: value })} label="Base de mensageria com origem legítima e base legal/consentimento aplicável" description="Não usar cadastro vendido, raspado ou de origem não comprovada." />
            <ToggleRow id="sender-identification" checked={Boolean(profile.senderIdentificationConfirmed)} onChange={(value) => onChange({ senderIdentificationConfirmed: value })} label="Identificação completa do remetente configurada" description="Aplicável às mensagens eletrônicas e instantâneas da campanha." />
            <ToggleRow id="unsubscribe" checked={profile.unsubscribeMechanismConfirmed} onChange={(value) => onChange({ unsubscribeMechanismConfirmed: value })} label="Descadastramento e eliminação disponíveis" description="O contato pode solicitar opt-out e eliminação dos dados." />
            <ToggleRow id="unsubscribe-48" checked={Boolean(profile.unsubscribeWithin48HoursConfirmed)} onChange={(value) => onChange({ unsubscribeWithin48HoursConfirmed: value })} label="SLA de 48 horas para descadastramento configurado" description="Registra e bloqueia novas comunicações após a solicitação." />
            <ToggleRow id="paid-boosting" checked={profile.paidBoosting} onChange={(value) => onChange({ paidBoosting: value })} label="Haverá impulsionamento pago" description="Ativa as validações do provedor, contratação, identificação e janela temporal." />
            {profile.paidBoosting && <TextField label="Provedor/plataforma *" placeholder="Meta, TikTok, outro provedor habilitado..." value={profile.paidBoostingProvider} onChange={(value) => onChange({ paidBoostingProvider: value })} />}
            {profile.paidBoosting && <ToggleRow id="boost-authorized" checked={Boolean(profile.paidBoostingContractedByAuthorizedActor)} onChange={(value) => onChange({ paidBoostingContractedByAuthorizedActor: value })} label="Contratação direta por ator autorizado confirmada" description="Não habilitar impulsionamento por terceiro não autorizado." />}
            {profile.paidBoosting && <ToggleRow id="boost-id" checked={Boolean(profile.paidBoostingIdentificationConfirmed)} onChange={(value) => onChange({ paidBoostingIdentificationConfirmed: value })} label="Identificação eleitoral do impulsionamento confirmada" description="CNPJ/CPF do responsável e indicação de propaganda eleitoral, conforme aplicável." />}
            <div><Label>Monetização do portal eleitoral</Label><Select value={profile.monetizationMode} onValueChange={(value) => onChange({ monetizationMode: value as ElectoralComplianceProfile['monetizationMode'] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="off">Desativada — padrão recomendado</SelectItem><SelectItem value="adsense-editorial">AdSense em área editorial separada</SelectItem><SelectItem value="other">Outro modelo</SelectItem></SelectContent></Select></div>
            {profile.monetizationMode !== 'off' && <ToggleRow id="monetization-review" checked={profile.monetizationLegalReviewConfirmed} onChange={(value) => onChange({ monetizationLegalReviewConfirmed: value })} label="Monetização revisada pela assessoria eleitoral/contábil" description="Obrigatória no gate interno antes de ativar publicidade em ambiente oficial de campanha." />}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Gate humano de publicação</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <ToggleRow id="legal-review-required" checked={profile.legalReviewRequired} onChange={(value) => onChange({ legalReviewRequired: value })} label="Revisão humana/jurídica obrigatória" description="Esta trava permanece ligada para conteúdo eleitoral." />
          <ToggleRow id="legal-review-confirmed" checked={profile.legalReviewConfirmed} onChange={(value) => onChange({ legalReviewConfirmed: value })} label="Peça atual foi revisada e liberada" description="Marcar somente depois de conferir fatos, fontes, rotulagem, período, dados pessoais e identificação legal." />
          {result.canPublish && <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/5 p-3 text-sm text-green-700 dark:text-green-400"><CheckCircle2 className="h-5 w-5" /> Todos os bloqueios configurados foram superados.</div>}
        </CardContent>
      </Card>
    </div>
  );
}
