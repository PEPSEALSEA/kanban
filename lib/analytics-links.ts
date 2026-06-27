export type ResourceMeta = {
  title: string;
  subject: string;
};

export type AnalyticsResourceLookups = {
  content: Record<string, ResourceMeta>;
  homework: Record<string, ResourceMeta>;
};

export type ResourceRef = {
  id: string;
  type: 'content' | 'homework';
  title: string;
  subject: string;
  href: string;
};

export function buildAnalyticsResourceLookups(
  learningContent: { id: string; title: string; subject: string }[],
  homework: { id: string; title: string; subject: string }[]
): AnalyticsResourceLookups {
  const content: Record<string, ResourceMeta> = {};
  const homeworkMap: Record<string, ResourceMeta> = {};

  for (const item of learningContent) {
    if (item.id) content[item.id] = { title: item.title, subject: item.subject };
  }
  for (const item of homework) {
    if (item.id) homeworkMap[item.id] = { title: item.title, subject: item.subject };
  }

  return { content, homework: homeworkMap };
}

export function buildResourceHref(type: 'content' | 'homework', id: string): string {
  const encoded = encodeURIComponent(id);
  if (type === 'content') return `/kanban/content#/view?id=${encoded}`;
  return `/kanban/#/view?id=${encoded}`;
}

export function inferResourceType(
  id: string,
  eventType: string | undefined,
  lookups: AnalyticsResourceLookups
): 'content' | 'homework' {
  if (eventType === 'check_content') return 'content';
  if (eventType === 'do_work') return 'homework';
  if (/^LC-\d+$/.test(id)) return 'content';
  if (lookups.content[id] && !lookups.homework[id]) return 'content';
  if (lookups.homework[id] && !lookups.content[id]) return 'homework';
  if (lookups.content[id]) return 'content';
  return 'homework';
}

export function resolveResourceRef(
  id: string | undefined,
  eventType: string | undefined,
  lookups?: AnalyticsResourceLookups
): ResourceRef | null {
  if (!id || !lookups) return null;

  const type = inferResourceType(id, eventType, lookups);
  const meta = type === 'content' ? lookups.content[id] : lookups.homework[id];

  return {
    id,
    type,
    title: meta?.title || id,
    subject: meta?.subject || (type === 'content' ? 'เนื้อหา' : 'การบ้าน'),
    href: buildResourceHref(type, id),
  };
}

export function formatResourceLabel(ref: ResourceRef): string {
  return `${ref.subject} · ${ref.title}`;
}
