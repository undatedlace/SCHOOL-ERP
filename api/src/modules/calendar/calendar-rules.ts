/** Pure rules for calendar events (no database), so they are easy to test. */

/** The days between two ISO dates, inclusive. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000) + 1;
}

/** The longest range a calendar request may ask for. */
export const MAX_RANGE_DAYS = 400;
/** The longest an event may last. */
export const MAX_EVENT_DAYS = 60;

export interface EventTiming {
  startsOn: string;
  endsOn: string;
  startTime: string | null;
  endTime: string | null;
}

/** Returns a message for the first problem with an event's dates and times, or null. */
export function timingProblem(t: EventTiming): string | null {
  if (t.endsOn < t.startsOn)
    return 'The last day cannot be before the first day';
  if (daysBetween(t.startsOn, t.endsOn) > MAX_EVENT_DAYS) {
    return `An event can last at most ${MAX_EVENT_DAYS} days`;
  }
  if (t.endTime && !t.startTime)
    return 'Give a start time as well as an end time';
  if (
    t.startTime &&
    t.endTime &&
    t.startsOn === t.endsOn &&
    t.endTime < t.startTime
  ) {
    return 'The end time cannot be before the start time';
  }
  return null;
}

/** The text of the notice sent for an event. */
export function announcementBody(e: {
  startsOn: string;
  endsOn: string;
  startTime: string | null;
  endTime: string | null;
  description: string | null;
}): string {
  const when =
    e.startsOn === e.endsOn ? e.startsOn : `${e.startsOn} to ${e.endsOn}`;
  const time = e.startTime
    ? ` at ${e.startTime}${e.endTime ? `-${e.endTime}` : ''}`
    : '';
  return [`When: ${when}${time}`, e.description].filter(Boolean).join('\n\n');
}
