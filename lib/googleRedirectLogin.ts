import { GOOGLE_CLIENT_ID } from '@/lib/googleClientId';

const REDIRECT_STATE_KEY = 'sf_google_redirect_state';
const REDIRECT_NONCE_KEY = 'sf_google_redirect_nonce';
const REDIRECT_RETURN_TO_KEY = 'sf_google_redirect_return_to';
const BASE_PATH = '/kanban';

function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function appRootUrl(): string {
  return `${window.location.origin}${BASE_PATH}/`;
}

function safeReturnTo(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    if (!url.pathname.startsWith(BASE_PATH)) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

export function startGoogleRedirectLogin(): void {
  const state = randomToken();
  const nonce = randomToken();
  sessionStorage.setItem(REDIRECT_STATE_KEY, state);
  sessionStorage.setItem(REDIRECT_NONCE_KEY, nonce);
  sessionStorage.setItem(
    REDIRECT_RETURN_TO_KEY,
    `${window.location.pathname}${window.location.search}`
  );

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: appRootUrl(),
    response_type: 'id_token',
    scope: 'openid email profile',
    state,
    nonce,
    prompt: 'select_account',
  });

  window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

export type GoogleRedirectCredential = {
  credential: string;
  returnTo: string | null;
};

export function consumeGoogleRedirectCredential(): GoogleRedirectCredential | null {
  if (!window.location.hash) return null;

  const params = new URLSearchParams(window.location.hash.slice(1));
  const idToken = params.get('id_token');
  const state = params.get('state');
  const error = params.get('error');

  if (error) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    throw new Error(params.get('error_description') || 'Google login was cancelled');
  }

  if (!idToken) return null;

  const expectedState = sessionStorage.getItem(REDIRECT_STATE_KEY);
  const returnTo = safeReturnTo(sessionStorage.getItem(REDIRECT_RETURN_TO_KEY));
  sessionStorage.removeItem(REDIRECT_STATE_KEY);
  sessionStorage.removeItem(REDIRECT_NONCE_KEY);
  sessionStorage.removeItem(REDIRECT_RETURN_TO_KEY);
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);

  if (!expectedState || state !== expectedState) {
    throw new Error('Google login session expired. Please try again.');
  }

  return { credential: idToken, returnTo };
}
