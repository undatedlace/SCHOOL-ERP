/** The school's quiet hours for teachers, in India time ("HH:mm"). */
export interface QuietHours {
  start: string;
  end: string;
  /** Sundays are quiet all day. */
  sundays: boolean;
}

export const DEFAULT_QUIET: QuietHours = {
  start: '19:00',
  end: '07:00',
  sundays: true,
};

const IST_OFFSET_MS = 5.5 * 3_600_000;
const DAY_MS = 86_400_000;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

const minutesOf = (hhmm: string, fallback: string) => {
  const m = TIME.exec(TIME.test(hhmm) ? hhmm : fallback)!;
  return Number(m[1]) * 60 + Number(m[2]);
};

/**
 * When a message sent at `now` may be pushed to a teacher: null when it is not quiet now, otherwise the moment
 * quiet hours end (the next "end" time that is not itself inside a quiet Sunday). The inbox is always written at
 * once; only the push waits. Pure, so it is tested without a clock.
 */
export function quietPushAt(now: Date, quiet: QuietHours): Date | null {
  const start = minutesOf(quiet.start, DEFAULT_QUIET.start);
  const end = minutesOf(quiet.end, DEFAULT_QUIET.end);

  // Work in "India wall-clock time" by shifting, then reading the UTC fields.
  const isQuiet = (shifted: number) => {
    const d = new Date(shifted);
    if (quiet.sundays && d.getUTCDay() === 0) return true;
    if (start === end) return false;
    const m = d.getUTCHours() * 60 + d.getUTCMinutes();
    return start > end ? m >= start || m < end : m >= start && m < end;
  };

  let t = now.getTime() + IST_OFFSET_MS;
  if (!isQuiet(t)) return null;
  for (let i = 0; i < 9; i++) {
    // The next moment the quiet period could end: the next "end" time after t.
    const d = new Date(t);
    let next = Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      Math.floor(end / 60),
      end % 60,
    );
    if (next <= t) next += DAY_MS;
    t = next;
    if (!isQuiet(t)) return new Date(t - IST_OFFSET_MS);
  }
  // Cannot happen with valid settings (Sundays are one day in seven); never hold a push for ever.
  return new Date(now.getTime() + DAY_MS);
}
