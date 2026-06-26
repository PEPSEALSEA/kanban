import { API_URL } from '@/lib/config';
import { audioItemsToStorage } from '@/lib/audioItems';
import { authHeaders } from '@/lib/auth';

type ContentFormData = {
  date: string;
  subject: string;
  title: string;
  description: string;
  audios: string[];
  attachments: string[];
  links: string[];
};

export async function saveLearningContent(
  formData: ContentFormData,
  customSubject: string,
  contentId?: string | null
): Promise<string> {
  const subject = formData.subject === 'Other' ? customSubject : formData.subject;
  const { audio_url, audio_file_id } = audioItemsToStorage(formData.audios);

  const params: Record<string, string> = {
    action: contentId ? 'editLearningContent' : 'addLearningContent',
    date: formData.date,
    subject,
    title: formData.title,
    description: formData.description,
    audio_url,
    audio_file_id,
    attachments: formData.attachments.join(','),
    links: formData.links.join(','),
  };

  if (contentId) params.id = contentId;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(params),
  });

  const json = (await res.json()) as { success?: boolean; data?: string; error?: string };
  if (!json.success) throw new Error(json.error || 'Save failed');

  return contentId || json.data || '';
}
