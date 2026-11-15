/**
 * Turns the `link` of a notification (a web path such as `/portal/homework` or `/app/messages/<id>`,
 * written by the API for the web app) into a route of this app. Used when a notification is opened
 * in the list, and by push taps. Anything unknown, odd or not a plain path leads to the
 * notifications list, so a bad link can never send a person somewhere unexpected.
 */

export type RouteBase = 'family' | 'teacher';

const ID = /^[A-Za-z0-9-]{1,64}$/;

/** The notifications list for a kind of account: where unknown links go. */
export const notificationsRoute = (base: RouteBase = 'family') => `/${base}/notifications`;

/** Web paths of the parent and student portal (`/portal/...`) and where they live in the family app. */
const FAMILY_SECTIONS: Record<string, string> = {
  homework: '/family/homework',
  results: '/family/results',
  attendance: '/family/attendance',
  fees: '/family/fees',
  notices: '/family/notices',
  calendar: '/family/calendar',
  timetable: '/family/timetable',
  absence: '/family/report-absence',
  messages: '/family/messages',
  notifications: '/family/notifications',
};

/** Web paths of the staff app (`/app/...`) that have a screen in the teacher app. */
const TEACHER_SECTIONS: Record<string, string> = {
  homework: '/teacher/homework',
  messages: '/teacher/messages',
  'my-leave': '/teacher/my-leave',
  'my-attendance': '/teacher/my-attendance',
  'my-timetable': '/teacher',
  notices: '/teacher/notices',
  notifications: '/teacher/notifications',
};

/** Sections whose second part is an id that opens one item (`/portal/messages/<id>`). */
const FAMILY_DETAIL = new Set(['messages', 'notices', 'homework']);
const TEACHER_DETAIL = new Set(['messages']);

export function linkToRoute(link: string | null | undefined, base: RouteBase = 'family'): string {
  const fallback = notificationsRoute(base);
  if (typeof link !== 'string') return fallback;

  const path = link.trim().split(/[?#]/)[0] ?? '';
  // Only plain paths of our own web app; never an address, a scheme or a path that climbs out.
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('..') || path.includes('\\')) return fallback;

  const [root, section, id, ...rest] = path.split('/').filter((part) => part !== '');
  if (rest.length > 0) return fallback;

  const family = base === 'family';
  if (root !== (family ? 'portal' : 'app')) return fallback;

  // `/portal` itself is the family home.
  if (!section) return family ? '/family' : '/teacher';

  const target = (family ? FAMILY_SECTIONS : TEACHER_SECTIONS)[section];
  if (!target) return fallback;
  if (id === undefined) return target;

  const detail = family ? FAMILY_DETAIL : TEACHER_DETAIL;
  if (detail.has(section) && ID.test(id)) return `${target}/${id}`;
  return target;
}
