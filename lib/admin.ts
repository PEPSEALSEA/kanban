/** Admin accounts — excluded from analytics logging and counts. */
export const ADMIN_EMAILS = [
  'pepsealsea@gmail.com',
  'iampep2009@gmail.com',
  'sealseapep@gmail.com',
] as const;

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return (ADMIN_EMAILS as readonly string[]).includes(email.trim().toLowerCase());
}
