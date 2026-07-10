import { API_URL } from '@/lib/config';
import { authHeaders } from '@/lib/auth';

export type AdminPageSize = 20 | 50;

export type AdminListResult<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};

export async function fetchAdminJson<T>(action: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const qs = new URLSearchParams({ action });
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    qs.set(key, String(value));
  }
  const res = await fetch(`${API_URL}?${qs.toString()}`, { headers: authHeaders() });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || `Failed: ${action}`);
  return data.data as T;
}

export function totalPages(total: number, limit: number) {
  return Math.max(1, Math.ceil(total / limit));
}
