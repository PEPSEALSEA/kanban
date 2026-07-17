export const ADMIN_SHORT_NAV_ITEMS = [
  { name: 'Dashboard', path: '/admin' },
  { name: 'Kanban', path: '/admin/kanban' },
  { name: 'Archive', path: '/admin/content-archive' },
  { name: 'Subjects', path: '/admin/subjects' },
] as const;

export const ADMIN_NAV_MORE_EVENT = 'studyflow:admin-nav-more';

export function isAdminRoute(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

export function isAdminNavItemActive(pathname: string, path: string): boolean {
  if (path === '/admin') return pathname === '/admin';
  return pathname === path || pathname.startsWith(`${path}/`);
}
