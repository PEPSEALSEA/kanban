import { jwtDecode } from 'jwt-decode';
import { saveIdToken, authHeaders } from '@/lib/auth';
import { API_URL } from '@/lib/config';

export type GoogleUser = {
  email: string;
  name: string;
  picture: string;
};

export async function completeGoogleLogin(
  credential: string,
  setUser: (user: GoogleUser) => void,
  refreshData?: () => Promise<void>
): Promise<void> {
  saveIdToken(credential);
  const decoded = jwtDecode<{ email: string; name: string; picture: string }>(credential);
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
