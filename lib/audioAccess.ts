/** True if logged-in user may see the audio player (listed in AudioPermissions sheet). */
export function canAccessAudio(
  email: string | null | undefined,
  permittedEmails: string[]
): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return permittedEmails.some((e) => e.trim().toLowerCase() === normalized);
}
