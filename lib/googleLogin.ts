import { jwtDecode } from 'jwt-decode';
import { googleLogout } from '@react-oauth/google';
import { saveIdToken, authHeaders } from '@/lib/auth';
import { API_URL } from '@/lib/config';
import { ALLOWED_EMAIL_DOMAIN, isAllowedAppEmail } from '@/lib/allowedEmail';

export type GoogleUser = {
  email: string;
  name: string;
  picture: string;
};

export class SchoolAccountRequiredError extends Error {
  email: string;

  constructor(email: string) {
    super(`บัญชี ${email} ไม่ได้รับอนุญาต — ต้องใช้ @${ALLOWED_EMAIL_DOMAIN}`);
    this.name = 'SchoolAccountRequiredError';
    this.email = email;
  }
}

export async function completeGoogleLogin(
  credential: string,
  setUser: (user: GoogleUser) => void,
  refreshData?: () => Promise<void>
): Promise<void> {
  const decoded = jwtDecode<{ email: string; name: string; picture: string }>(credential);
  if (!isAllowedAppEmail(decoded.email)) {
    googleLogout();
    throw new SchoolAccountRequiredError(decoded.email || '');
  }
  saveIdToken(credential);
  const newUser = { email: decoded.email, name: decoded.name, picture: decoded.picture };
  setUser(newUser);
  localStorage.setItem('homework_user', JSON.stringify(newUser));
  try {
    await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        action: 'addUser',
        display_name: newUser.name,
        photo_url: newUser.picture,
      }),
    });
    await refreshData?.();
  } catch {
    /* ignore */
  }
}
