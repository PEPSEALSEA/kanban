export type UiVersion = 'classic' | 'experimental';

export const UI_VERSION_COOKIE = 'ui_version';
export const UI_VERSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function parseUiVersion(value: string | null | undefined): UiVersion {
  if (value === 'experimental') return 'experimental';
  return 'classic';
}

export function getUiVersionFromCookie(): UiVersion {
  if (typeof document === 'undefined') return 'classic';
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${UI_VERSION_COOKIE}=`));
  return parseUiVersion(match?.split('=')[1]);
}

export function setUiVersionCookie(version: UiVersion): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${UI_VERSION_COOKIE}=${version}; path=/; max-age=${UI_VERSION_COOKIE_MAX_AGE}; SameSite=Lax`;
}
