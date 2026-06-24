import { API_URL } from '@/lib/config';

export function getContentJsonUrl(id: string) {
  return `${API_URL}/content/${encodeURIComponent(id)}.json`;
}
