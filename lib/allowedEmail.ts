import { isAdminEmail } from '@/lib/admin';

export const ALLOWED_EMAIL_DOMAIN = 'bpk.ac.th';

export function isAllowedAppEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (isAdminEmail(normalized)) return true;
  return normalized.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
}
