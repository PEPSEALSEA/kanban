const TOKEN_KEY = 'sf_id_token';
const TOKEN_EXPIRY_KEY = 'sf_id_token_exp';
const TOKEN_TTL_MS = 55 * 60 * 1000; // 55 min (Google ID tokens last 1 hour)

export function saveIdToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + TOKEN_TTL_MS));
  } catch {}
}

export function getIdToken(): string | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const exp = Number(localStorage.getItem(TOKEN_EXPIRY_KEY) || 0);
    if (!token || Date.now() > exp) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_EXPIRY_KEY);
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export function clearIdToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
  } catch {}
}

export function authHeaders(): Record<string, string> {
  const token = getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
