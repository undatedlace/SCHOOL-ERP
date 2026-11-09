import { Notice, NoticeAudience } from '../../core/models';

export const AUDIENCE_LABEL: Record<NoticeAudience, string> = {
  ALL: 'Everyone',
  STAFF: 'Staff only',
  CLASSES: 'Classes',
  DIVISIONS: 'Divisions',
};

/** "Everyone", "Staff only", "Std 1, Std 2" or "Std 1-A, Std 2-B". */
export function audienceText(n: Pick<Notice, 'audience' | 'classes' | 'divisions'>): string {
  if (n.audience === 'CLASSES') return n.classes.map((c) => c.name).join(', ');
  if (n.audience === 'DIVISIONS') return n.divisions.map((d) => d.label).join(', ');
  return AUDIENCE_LABEL[n.audience];
}

/** Toggles an id in a list, without changing the list it was given. */
export const toggle = (ids: string[], id: string): string[] =>
  ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
