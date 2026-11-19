import { describe, expect, it } from 'vitest';
import { friendlyAuthError } from '@/lib/auth-messages';

describe('mensagens de erro do login e do cadastro', () => {
  it.each([
    ['Email not confirmed', /ainda não foi confirmado/],
    ['For security purposes, you can only request this after 36 seconds.', /^Aguarde 36 segundos/],
    ['you can only request this after 1 second', /^Aguarde 1 segundos/],
    ['Invalid login credentials', /^E-mail ou senha incorretos/],
    ['User already registered', /já tem conta/],
    ['Password should be at least 6 characters.', /pelo menos 6 caracteres/],
    ['email rate limit exceeded', /Muitas tentativas/],
    ['Unable to validate email address: invalid format', /Confira o e-mail/],
  ])('"%s" vira português', (msg, esperado) => {
    expect(friendlyAuthError(msg)).toMatch(esperado);
  });

  it('o que não é reconhecido volta como veio (nada é escondido)', () => {
    expect(friendlyAuthError('Algo inesperado aconteceu')).toBe('Algo inesperado aconteceu');
    expect(friendlyAuthError('')).toBe('');
  });
});
