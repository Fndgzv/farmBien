export const SESSION_WARNING_MS = 3 * 60 * 1000;

export type TokenSessionState = 'valid' | 'warning' | 'expired' | 'invalid';

export function getTokenExpirationMs(token: string | null): number | null {
  if (!token) return null;

  try {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[1]) return null;

    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const payload = JSON.parse(atob(padded));
    const expiresAtMs = Number(payload?.exp) * 1000;

    return Number.isFinite(expiresAtMs) && expiresAtMs > 0 ? expiresAtMs : null;
  } catch {
    return null;
  }
}

export function getTokenSessionState(
  token: string | null,
  nowMs = Date.now(),
  warningMs = SESSION_WARNING_MS
): TokenSessionState {
  const expiresAtMs = getTokenExpirationMs(token);
  if (!expiresAtMs) return 'invalid';
  if (expiresAtMs <= nowMs) return 'expired';
  if (expiresAtMs - nowMs <= warningMs) return 'warning';
  return 'valid';
}
