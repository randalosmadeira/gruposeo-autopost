export type SupporterJobStatus = {
  status?: string | null;
  error_message?: string | null;
};

export type SupporterReviewKind = 'qa' | 'provider' | 'input' | 'unknown';

export function supporterReviewKind(job: SupporterJobStatus | null | undefined): SupporterReviewKind {
  const error = String(job?.error_message || '').toLowerCase();
  if (!error) return 'unknown';
  if (error.includes('qa_threshold_not_met')) return 'qa';
  if (error.includes('vision_provider_failure') || error.includes('anthropic_vision') || error.includes('openai_vision') || error.includes('provider_retry')) return 'provider';
  if (error.includes('supporter_photo_not_usable') || error.includes('no_source_images') || error.includes('required_consent')) return 'input';
  return 'unknown';
}

export function supporterReviewMessage(job: SupporterJobStatus | null | undefined) {
  const kind = supporterReviewKind(job);
  if (kind === 'provider') return 'O agente de visão ficou temporariamente indisponível antes da conclusão do QA. Sua foto não foi reprovada por qualidade. O sistema pode tentar novamente com o provedor alternativo.';
  if (kind === 'qa') return 'A composição foi gerada, mas o QA de fidelidade ou qualidade não atingiu o padrão exigido. O registro foi preservado para nova tentativa ou revisão.';
  if (kind === 'input') return 'A solicitação precisa de uma nova foto ou ajuste de dados antes de continuar.';
  return 'A geração não foi concluída automaticamente. O registro foi preservado para diagnóstico e nova tentativa.';
}
