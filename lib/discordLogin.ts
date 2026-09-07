import { authHeaders, saveIdToken } from '@/lib/auth';
import { API_URL } from '@/lib/config';

const DISCORD_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type DiscordSessionPayload = {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  exp: number;
};

function b64urlDecodeJson<T>(value: string): T {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

function decodeDiscordSession(token: string): DiscordSessionPayload {
  const [kind, payload] = token.split('.');
  if (kind !== 'discord' || !payload) throw new Error('Invalid Discord session');
  return b64urlDecodeJson<DiscordSessionPayload>(payload);
}

export function startDiscordLogin(): void {
  const returnTo = `${window.location.pathname}${window.location.search}`;
  const params = new URLSearchParams({ return_to: returnTo });
  window.location.assign(`${API_URL}/api/auth/discord/start?${params}`);
}

export function consumeDiscordRedirectLogin(
  setUser: (user: { email: string; name: string; picture: string }) => void,
  refreshData?: () => Promise<void>
): boolean {
  if (!window.location.hash) return false;

  const params = new URLSearchParams(window.location.hash.slice(1));
  const error = params.get('discord_error');
  if (error) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    throw new Error(error === 'Discord role required'
      ? 'บัญชี Discord นี้ยังไม่มี role ที่อนุญาตให้เข้าใช้งาน'
      : 'เข้าสู่ระบบด้วย Discord ไม่สำเร็จ');
  }

  const token = params.get('discord_token');
  if (!token) return false;

  const returnTo = params.get('return_to');
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);

  const payload = decodeDiscordSession(token);
  if (!payload.email || payload.exp * 1000 < Date.now()) {
    throw new Error('Discord login expired. Please try again.');
  }

  const user = {
    email: payload.email,
    name: payload.name || 'Discord user',
    picture: payload.picture || '/kanban/icon.png',
  };
  saveIdToken(token, DISCORD_TOKEN_TTL_MS);
  setUser(user);
  localStorage.setItem('homework_user', JSON.stringify(user));
  void fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      action: 'addUser',
      display_name: user.name,
      photo_url: user.picture,
    }),
  }).catch(() => {});
  void refreshData?.();

  if (returnTo && returnTo !== window.location.pathname && returnTo.startsWith('/kanban')) {
    window.location.replace(returnTo);
  }

  return true;
}
