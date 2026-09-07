import { authHeaders, saveIdToken } from '@/lib/auth';
import { API_URL } from '@/lib/config';

const DISCORD_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DISCORD_CLIENT_ID = '1449452278598602752';
const DISCORD_STATE_KEY = 'sf_discord_login_state';

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

function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function startDiscordLogin(): void {
  const state = randomToken();
  const returnTo = `${window.location.pathname}${window.location.search}`;
  sessionStorage.setItem(DISCORD_STATE_KEY, JSON.stringify({ state, returnTo }));
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: `${window.location.origin}/kanban/`,
    response_type: 'token',
    scope: 'identify',
    state,
    prompt: 'consent',
  });
  window.location.assign(`https://discord.com/oauth2/authorize?${params}`);
}

export async function consumeDiscordRedirectLogin(
  setUser: (user: { email: string; name: string; picture: string }) => void,
  refreshData?: () => Promise<void>
): Promise<boolean> {
  if (!window.location.hash) return false;

  const params = new URLSearchParams(window.location.hash.slice(1));
  const error = params.get('discord_error');
  if (error) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    throw new Error(error === 'Discord role required'
      ? 'บัญชี Discord นี้ยังไม่มี role ที่อนุญาตให้เข้าใช้งาน'
      : 'เข้าสู่ระบบด้วย Discord ไม่สำเร็จ');
  }

  const accessToken = params.get('access_token');
  const sessionToken = params.get('discord_token');
  if (!accessToken && !sessionToken) return false;

  const stored = sessionStorage.getItem(DISCORD_STATE_KEY);
  sessionStorage.removeItem(DISCORD_STATE_KEY);
  const savedState = stored ? JSON.parse(stored) as { state?: string; returnTo?: string } : {};
  if (accessToken && params.get('state') !== savedState.state) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    throw new Error('Discord login expired. Please try again.');
  }

  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);

  const token = sessionToken || await createDiscordSession(accessToken!);
  const returnTo = savedState.returnTo || params.get('return_to');
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

async function createDiscordSession(accessToken: string): Promise<string> {
  const res = await fetch(`${API_URL}/api/auth/discord/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: accessToken }),
  });
  const data = await res.json() as { success?: boolean; token?: string; error?: string };
  if (!res.ok || !data.success || !data.token) {
    throw new Error(data.error === 'Discord role required'
      ? 'บัญชี Discord นี้ยังไม่มี role ที่อนุญาตให้เข้าใช้งาน'
      : 'เข้าสู่ระบบด้วย Discord ไม่สำเร็จ');
  }
  return data.token;
}
