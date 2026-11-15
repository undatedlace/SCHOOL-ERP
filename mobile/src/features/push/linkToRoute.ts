import type { RoleKind } from '@/auth/types';

/**
 * Notification links are the web app's paths (`/portal/...` for families, `/app/...` for staff).
 * This turns one into the screens to open in the phone app, as a stack: the first is a tab or a
 * list, and anything after it is pushed on top, so Back lands somewhere sensible.
 *
 * TODO(coordinator): switch to features/notifications/link-to-route.ts (agent F) after the merge.
 */
const ID = /^[A-Za-z0-9-]{8,64}$/;

const FAMILY_PAGES: Record<string, string> = {
  messages: '/family/messages',
  absence: '/family/report-absence',
  homework: '/family/homework',
  results: '/family/results',
  fees: '/family/fees',
  notices: '/family/notices',
  calendar: '/family/calendar',
  timetable: '/family/timetable',
  'my-timetable': '/family/timetable',
  attendance: '/family/attendance',
  notifications: '/family/notifications',
};

const TEACHER_PAGES: Record<string, string> = {
  messages: '/teacher/messages',
  homework: '/teacher/homework',
  'my-leave': '/teacher/my-leave',
  leave: '/teacher/my-leave',
  'my-timetable': '/teacher',
  timetable: '/teacher',
  students: '/teacher/students',
  notices: '/teacher/notices',
  marks: '/teacher/marks',
  attendance: '/teacher/attendance',
};

/** The screens to open for a notification link. Empty when the account has no screens in the app. */
export function routeStackForLink(link: string | null | undefined, kind: RoleKind): string[] {
  if (kind === 'other') return [];
  const fallback = kind === 'family' ? '/family/notifications' : '/teacher/notifications';
  if (!link) return [fallback];

  const path = link.split(/[?#]/)[0] ?? '';
  const parts = path.split('/').filter(Boolean);
  const [area, page, id] = parts;

  if (kind === 'family') {
    if (area !== 'portal') return [fallback];
    if (!page) return ['/family'];
    const target = FAMILY_PAGES[page];
    if (!target) return [fallback];
    if (page === 'messages' && id && ID.test(id) && parts.length === 3) return [target, `/family/messages/${id}`];
    return [target];
  }

  if (area !== 'app') return [fallback];
  if (!page) return ['/teacher'];
  const target = TEACHER_PAGES[page];
  // Not in the phone app yet (for example `student-leave`, or a single conversation): the inbox of notifications.
  if (!target) return [fallback];
  return [target];
}
