/**
 * Pure rules for the timetable: school-day timings, clashes by time and week dates. No clock or
 * database in here (the caller passes what it needs), so they are easy to test.
 */
import { addDays, toDate } from '../attendance/attendance-rules.js';

export type SlotKind = 'PERIOD' | 'BREAK' | 'ASSEMBLY';

export interface SlotInput {
  kind: SlotKind;
  label: string;
  startsAt: string;
  endsAt: string;
  /** ISO weekdays, 1 Monday to 6 Saturday. */
  days: number[];
}

/** Monday to Saturday. Sunday is never a school day here. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6] as const;
export const WEEKDAY_NAMES = [
  '',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/** The most teaching periods on one day. */
export const MAX_PERIODS_PER_DAY = 12;
/** The most rows (periods, breaks, assemblies) a schedule may have in all. */
export const MAX_SLOTS = 40;

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const isTime = (v: string) => HHMM.test(v);

export function toMinutes(hhmm: string): number {
  const m = HHMM.exec(hhmm);
  if (!m) throw new Error(`Not a time: ${hhmm}`);
  return +m[1] * 60 + +m[2];
}

export function fromMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** True when two times of day overlap (touching end to start is not an overlap). */
export function overlaps(
  a: { startsAt: string; endsAt: string },
  b: { startsAt: string; endsAt: string },
): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

export interface GenerateInput {
  /** When the first row starts, "HH:mm". */
  firstStart: string;
  periodMinutes: number;
  periodsPerDay: number;
  /** Minutes between two periods (moving between rooms). 0 for none. */
  gapMinutes: number;
  /** An assembly before the first period, in minutes. 0 or missing for none. */
  assemblyMinutes?: number;
  breaks: { afterPeriod: number; label: string; minutes: number }[];
  days: number[];
}

/**
 * Builds a school day from a few numbers: when it starts, how long a period is, how many periods and
 * where the breaks fall. The school can still change any row afterwards.
 */
export function generateSlots(input: GenerateInput): SlotInput[] {
  const errors = checkGenerateInput(input);
  if (errors.length) throw new Error(errors.join('; '));
  const days = [...new Set(input.days)].sort((a, b) => a - b);
  const slots: SlotInput[] = [];
  let t = toMinutes(input.firstStart);
  const push = (kind: SlotKind, label: string, minutes: number) => {
    slots.push({
      kind,
      label,
      startsAt: fromMinutes(t),
      endsAt: fromMinutes(t + minutes),
      days,
    });
    t += minutes;
  };
  if (input.assemblyMinutes && input.assemblyMinutes > 0) {
    push('ASSEMBLY', 'Assembly', input.assemblyMinutes);
    t += input.gapMinutes;
  }
  for (let p = 1; p <= input.periodsPerDay; p++) {
    push('PERIOD', `Period ${p}`, input.periodMinutes);
    const breaks = input.breaks.filter((b) => b.afterPeriod === p);
    if (breaks.length) {
      for (const b of breaks)
        push('BREAK', b.label.trim() || 'Break', b.minutes);
    } else if (p < input.periodsPerDay) {
      t += input.gapMinutes;
    }
  }
  return slots;
}

export function checkGenerateInput(input: GenerateInput): string[] {
  const errors: string[] = [];
  if (!isTime(input.firstStart)) errors.push('The start time must be HH:mm');
  if (!(input.periodMinutes >= 5 && input.periodMinutes <= 180))
    errors.push('A period must be between 5 and 180 minutes');
  if (!(
    Number.isInteger(input.periodsPerDay) &&
    input.periodsPerDay >= 1 &&
    input.periodsPerDay <= MAX_PERIODS_PER_DAY
  ))
    errors.push(`A day has between 1 and ${MAX_PERIODS_PER_DAY} periods`);
  if (!(input.gapMinutes >= 0 && input.gapMinutes <= 30))
    errors.push('The gap between periods must be between 0 and 30 minutes');
  if ((input.assemblyMinutes ?? 0) < 0 || (input.assemblyMinutes ?? 0) > 120)
    errors.push('An assembly must be at most 120 minutes');
  for (const b of input.breaks) {
    if (b.afterPeriod < 1 || b.afterPeriod >= input.periodsPerDay)
      errors.push(
        `A break must come after a period between 1 and ${input.periodsPerDay - 1}`,
      );
    if (!(b.minutes >= 5 && b.minutes <= 180))
      errors.push('A break must be between 5 and 180 minutes');
  }
  if (!input.days.length || input.days.some((d) => !WEEKDAYS.includes(d as 1)))
    errors.push('Choose the days, Monday to Saturday');
  if (errors.length === 0) {
    const total =
      toMinutes(input.firstStart) +
      (input.assemblyMinutes ?? 0) +
      input.periodsPerDay * input.periodMinutes +
      input.breaks.reduce((s, b) => s + b.minutes, 0) +
      input.periodsPerDay * input.gapMinutes;
    if (total > 24 * 60) errors.push('The day would run past midnight');
  }
  return errors;
}

/**
 * Checks a schedule's rows: times written properly, each ending after it starts, labels present,
 * days Monday to Saturday, no two rows on the same day overlapping, and not too many periods a day.
 */
export function validateSlots(slots: SlotInput[]): string[] {
  const errors: string[] = [];
  if (slots.length === 0) errors.push('Add at least one period');
  if (slots.length > MAX_SLOTS)
    errors.push(`A schedule has at most ${MAX_SLOTS} rows`);
  slots.forEach((s, i) => {
    const name = s.label?.trim() || `Row ${i + 1}`;
    if (!s.label?.trim()) errors.push(`Row ${i + 1} needs a name`);
    if (!isTime(s.startsAt) || !isTime(s.endsAt)) {
      errors.push(`${name}: times must be HH:mm`);
      return;
    }
    if (s.endsAt <= s.startsAt) errors.push(`${name} must end after it starts`);
    if (!s.days.length) errors.push(`${name}: choose at least one day`);
    if (s.days.some((d) => !WEEKDAYS.includes(d as 1)))
      errors.push(`${name}: days must be Monday to Saturday`);
  });
  if (errors.length) return errors;
  for (const day of WEEKDAYS) {
    const today = slots.filter((s) => s.days.includes(day));
    const periods = today.filter((s) => s.kind === 'PERIOD').length;
    if (periods > MAX_PERIODS_PER_DAY)
      errors.push(
        `${WEEKDAY_NAMES[day]} has ${periods} periods; at most ${MAX_PERIODS_PER_DAY}`,
      );
    for (let i = 0; i < today.length; i++) {
      for (let j = i + 1; j < today.length; j++) {
        if (overlaps(today[i], today[j]))
          errors.push(
            `${today[i].label} and ${today[j].label} overlap on ${WEEKDAY_NAMES[day]}`,
          );
      }
    }
  }
  return errors;
}

/** ISO weekday of a "YYYY-MM-DD" date: 1 Monday to 7 Sunday. */
export function weekdayOf(iso: string): number {
  const d = toDate(iso).getUTCDay();
  return d === 0 ? 7 : d;
}

/** The Monday of the week a date falls in. */
export const mondayOf = (iso: string) => addDays(iso, 1 - weekdayOf(iso));

/** Monday to Saturday of the week a date falls in. */
export function weekDates(iso: string): string[] {
  const monday = mondayOf(iso);
  return WEEKDAYS.map((d) => addDays(monday, d - 1));
}

export interface Candidate {
  staffId: string;
  name: string;
  /** Teaches this subject to this division. */
  teachesSubjectHere: boolean;
  /** Teaches this division (any subject, or its class teacher). */
  teachesDivision: boolean;
  /** Periods they already have that day (regular, less cancelled and covered, plus substitutions). */
  periodsThatDay: number;
}

/**
 * Orders the teachers who are free for a period: those who teach the subject to that division first,
 * then those who teach the division, then whoever has the fewest periods that day, then by name.
 */
export function rankCandidates<T extends Candidate>(list: T[]): T[] {
  return [...list].sort(
    (a, b) =>
      Number(b.teachesSubjectHere) - Number(a.teachesSubjectHere) ||
      Number(b.teachesDivision) - Number(a.teachesDivision) ||
      a.periodsThatDay - b.periodsThatDay ||
      a.name.localeCompare(b.name),
  );
}

/** "13:05" as "1:05 PM", for messages people read. */
export function to12Hour(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}
