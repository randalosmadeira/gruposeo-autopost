/** Mensagens de erro do Supabase Auth (em inglês) traduzidas para o usuário. O que não for reconhecido volta como veio. */
const RULES: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/email not confirmed/i, () => 'Seu e-mail ainda não foi confirmado. Abra o link que enviamos para você e depois entre aqui.'],
  [/you can only request this after (\d+) seconds?/i, (m) => `Aguarde ${m[1]} segundos antes de tentar de novo.`],
  [/invalid login credentials/i, () => 'E-mail ou senha incorretos.'],
  [/user already registered|already been registered|email address is already/i, () => 'Este e-mail já tem conta. Use "Entrar" ou "Esqueci minha senha".'],
  [/password should be at least (\d+)/i, (m) => `A senha precisa ter pelo menos ${m[1]} caracteres.`],
  [/rate limit|too many requests|over_email_send_rate_limit/i, () => 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.'],
  [/unable to validate email address|invalid format|invalid email/i, () => 'Confira o e-mail digitado.'],
];

export function friendlyAuthError(message: string): string {
  for (const [re, make] of RULES) {
    const m = message.match(re);
    if (m) return make(m);
  }
  return message;
}
