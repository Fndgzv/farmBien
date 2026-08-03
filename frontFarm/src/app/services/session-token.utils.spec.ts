import {
  getTokenExpirationMs,
  getTokenSessionState,
  SESSION_WARNING_MS,
} from './session-token.utils';

function createUnsignedTestToken(exp: number | undefined): string {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(exp === undefined ? {} : { exp })}.test`;
}

describe('session-token utils', () => {
  it('convierte exp de segundos a milisegundos', () => {
    const token = createUnsignedTestToken(1_800_000_000);
    expect(getTokenExpirationMs(token)).toBe(1_800_000_000_000);
  });

  it('activa la advertencia exactamente tres minutos antes', () => {
    const now = 1_700_000_000_000;
    const token = createUnsignedTestToken((now + SESSION_WARNING_MS) / 1000);
    expect(getTokenSessionState(token, now)).toBe('warning');
  });

  it('mantiene vigente un token con mas de tres minutos', () => {
    const now = 1_700_000_000_000;
    const token = createUnsignedTestToken((now + SESSION_WARNING_MS + 1_000) / 1000);
    expect(getTokenSessionState(token, now)).toBe('valid');
  });

  it('rechaza tokens expirados, corruptos o sin exp', () => {
    const now = 1_700_000_000_000;
    expect(getTokenSessionState(createUnsignedTestToken(now / 1000), now)).toBe('expired');
    expect(getTokenSessionState('token-invalido', now)).toBe('invalid');
    expect(getTokenSessionState(createUnsignedTestToken(undefined), now)).toBe('invalid');
  });
});
