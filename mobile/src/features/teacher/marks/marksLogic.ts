/**
 * Pure rules for the teacher's tests and marks: reading what is typed in a marks box, what is
 * sent to `PUT /assessments/:id/marks`, the live statistics, the distribution bands, the undo
 * stack and the order the keyboard's Next key follows. No React and no clock, so it is all tested.
 *
 * Money-like care with numbers: marks have at most two decimals, so everything that is compared
 * (bands, the maximum) is compared in hundredths as whole numbers, never as floating-point
 * percentages.
 */

export type AssessmentKind = 'UNIT' | 'MOCK' | 'TERM' | 'OTHER';

export const KINDS: readonly { value: AssessmentKind; label: string }[] = [
  { value: 'UNIT', label: 'Unit test' },
  { value: 'MOCK', label: 'Mock test' },
  { value: 'TERM', label: 'Term exam' },
  { value: 'OTHER', label: 'Other' },
];

export const kindLabel = (k: AssessmentKind): string => KINDS.find((x) => x.value === k)?.label ?? 'Test';

export const NAME_MIN = 2;
export const NAME_MAX = 100;
export const REMARK_MAX = 200;
export const MAX_MARKS_LIMIT = 1000;
/** A mark is below this percentage when it is called "Low". Also the top of the first band. */
export const LOW_PERCENT = 40;

// ---------- the API's shapes ----------

/** `GET /assessments` item, and the head of `GET /assessments/:id`. */
export interface TestSummary {
  id: string;
  name: string;
  kind: AssessmentKind;
  subject: { id: string; name: string };
  division: { id: string; label: string };
  /** The API sends a number; text is accepted too and never trimmed or rounded. */
  maxMarks: number | string;
  /** "YYYY-MM-DD" */
  conductedOn: string;
  published: boolean;
  publishedAt: string | null;
  createdBy: { id: string; fullName: string };
  /** Students with a saved row (marks, absent or just a remark). */
  entered: number;
  /** Students in the division. */
  students: number;
}

export interface TestStats {
  entered: number;
  scored: number;
  absent: number;
  average: number | null;
  highest: number | null;
  lowest: number | null;
}

export interface TestStudent {
  studentId: string;
  admissionNo: string;
  name: string;
  rollNo: number | null;
  marks: number | string | null;
  absent: boolean;
  remark: string | null;
  percent: number | null;
}

/** `GET /assessments/:id` (and the answer to a save, publish and take back). */
export interface TestDetail extends Omit<TestSummary, 'students'> {
  stats: TestStats;
  students: TestStudent[];
}

export interface TestPage {
  items: TestSummary[];
  total: number;
  page: number;
  pageSize: number;
}

/** `GET /assessments/options`: what this teacher may set a test for. */
export interface TestOptions {
  divisions: { id: string; label: string; subjectIds: string[] }[];
  subjects: { id: string; name: string }[];
}

// ---------- numbers ----------

/** A decimal from the API as a number, or null. Accepts the text form ("10", "7.50"). */
export function numberOf(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value.trim());
  return null;
}

/** Hundredths as a whole number: 7.5 -> 750. Exact for numbers with at most two decimals. */
export const hundredths = (n: number): number => Math.round(n * 100);

/** A mark without trailing zeros: 18 -> "18", 17.5 -> "17.5", 7.25 -> "7.25". */
export const markText = (n: number): string => String(Math.round(n * 100) / 100);

/** The test's maximum as a number (0 when the API sent something unreadable). */
export const maxOf = (t: Pick<TestSummary, 'maxMarks'>): number => numberOf(t.maxMarks) ?? 0;

export type ParsedMarks = { ok: true; value: number | null } | { ok: false; message: string };

/**
 * What is typed in a marks box. Empty means "no mark"; otherwise a number from 0 up to the
 * maximum with at most two decimals. A comma is read as a decimal point.
 */
export function parseMarks(text: string, max: number): ParsedMarks {
  const t = text.trim().replace(',', '.');
  if (t === '') return { ok: true, value: null };
  if (!/^\d+(\.\d{0,2})?$/.test(t)) {
    return { ok: false, message: /^\d+\.\d{3,}$/.test(t) ? 'Use at most two decimal places' : 'Type a number, like 7 or 7.5' };
  }
  const value = Number(t);
  if (hundredths(value) > hundredths(max)) return { ok: false, message: `Cannot be more than ${markText(max)}` };
  return { ok: true, value };
}

/** Marks as a share of the maximum, in whole hundredths of a percent, or null. 7.5 of 10 -> 7500. */
function percentHundredths(marks: number, max: number): number | null {
  if (hundredths(max) <= 0) return null;
  return Math.round((hundredths(marks) * 10000) / hundredths(max));
}

/** "75%" or "33.3%": the percentage to one decimal, or null. */
export function percentText(marks: number | null, max: number): string | null {
  if (marks === null) return null;
  const p = percentHundredths(marks, max);
  if (p === null) return null;
  return `${Math.round(p / 10) / 10}%`;
}

/** Whether a mark is under the "Low" line (below 40% of the maximum), compared exactly. */
export function isLowMark(marks: number | null, max: number): boolean {
  if (marks === null || hundredths(max) <= 0) return false;
  return hundredths(marks) * 100 < LOW_PERCENT * hundredths(max);
}

// ---------- what is typed ----------

/** One student's box as typed: text for the marks (so "7." can be typed), absent, and a remark. */
export interface EntryDraft {
  marks: string;
  absent: boolean;
  remark: string;
}

export type Drafts = Record<string, EntryDraft>;

export const emptyEntry = (): EntryDraft => ({ marks: '', absent: false, remark: '' });

const same = (a: EntryDraft, b: EntryDraft) => a.marks === b.marks && a.absent === b.absent && a.remark === b.remark;

/** Starts from what is saved. */
export function draftsFrom(students: readonly TestStudent[]): Drafts {
  return Object.fromEntries(
    students.map((s) => {
      const n = numberOf(s.marks);
      return [s.studentId, { marks: !s.absent && n !== null ? markText(n) : '', absent: s.absent, remark: s.remark ?? '' }];
    }),
  );
}

/** The saved rows as plain entries, for comparing with what is typed. */
function savedOf(students: readonly TestStudent[]): Drafts {
  return draftsFrom(students);
}

/** The message for each student whose marks box cannot be read, by student id. */
export function problemsOf(drafts: Drafts, max: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, d] of Object.entries(drafts)) {
    if (d.absent) continue;
    const parsed = parseMarks(d.marks, max);
    if (!parsed.ok) out[id] = parsed.message;
  }
  return out;
}

/** What the API takes for one student. Marks are left out when the student is absent. */
export interface MarkEntry {
  studentId: string;
  marks?: number | null;
  absent?: boolean;
  remark?: string;
}

/**
 * The rows that differ from what is saved, in class order, ready for `PUT /assessments/:id/marks`.
 * A row that cannot be read is left out (the screen asks for it to be fixed first); a row cleared
 * back to nothing is sent as no marks, so a wrong mark can be taken away.
 */
export function changesOf(students: readonly TestStudent[], drafts: Drafts, max: number): MarkEntry[] {
  const saved = savedOf(students);
  const out: MarkEntry[] = [];
  for (const s of students) {
    const d = drafts[s.studentId];
    const was = saved[s.studentId];
    if (!d || !was || same(d, was)) continue;
    const remark = d.remark.trim();
    if (d.absent) {
      out.push({ studentId: s.studentId, absent: true, remark });
      continue;
    }
    const parsed = parseMarks(d.marks, max);
    if (!parsed.ok) continue;
    out.push({ studentId: s.studentId, marks: parsed.value, absent: false, remark });
  }
  return out;
}

/** How many rows have changes the teacher has not saved. */
export const unsavedCount = (students: readonly TestStudent[], drafts: Drafts): number => {
  const saved = savedOf(students);
  return students.filter((s) => {
    const d = drafts[s.studentId];
    const was = saved[s.studentId];
    return d && was && !same(d, was);
  }).length;
};

// ---------- statistics as typed ----------

export interface LiveStats {
  /** Students with marks or marked absent. */
  entered: number;
  scored: number;
  absent: number;
  /** Students with nothing yet. */
  missing: number;
  /** To one decimal, like the API. */
  average: number | null;
  highest: number | null;
  lowest: number | null;
}

/** A student's mark as typed: a number, or null when absent, empty or unreadable. */
export function scoreOf(d: EntryDraft | undefined, max: number): number | null {
  if (!d || d.absent) return null;
  const p = parseMarks(d.marks, max);
  return p.ok ? p.value : null;
}

/** Entered count, average, highest and lowest over what is typed right now (absent left out of the average). */
export function liveStats(students: readonly { studentId: string }[], drafts: Drafts, max: number): LiveStats {
  const scores: number[] = [];
  let absent = 0;
  for (const s of students) {
    const d = drafts[s.studentId];
    if (d?.absent) absent++;
    else {
      const score = scoreOf(d, max);
      if (score !== null) scores.push(score);
    }
  }
  const sum = scores.reduce((a, b) => a + hundredths(b), 0);
  return {
    entered: scores.length + absent,
    scored: scores.length,
    absent,
    missing: students.length - scores.length - absent,
    average: scores.length ? Math.round(sum / scores.length / 10) / 10 : null,
    highest: scores.length ? Math.max(...scores) : null,
    lowest: scores.length ? Math.min(...scores) : null,
  };
}

/** The students as the screen shows them right now (typed marks), shaped like saved rows, for the distribution. */
export function entriesFromDrafts(students: readonly TestStudent[], drafts: Drafts, max: number): TestStudent[] {
  return students.map((s) => {
    const d = drafts[s.studentId];
    return { ...s, marks: scoreOf(d, max), absent: d?.absent ?? s.absent };
  });
}

// ---------- the distribution ----------

export interface Band {
  key: string;
  label: string;
  /** Lowest percentage in the band. */
  from: number;
  /** Students in it. */
  count: number;
}

const BAND_STARTS: readonly { from: number; label: string }[] = [
  { from: 0, label: 'Below 40%' },
  { from: 40, label: '40 to 49%' },
  { from: 50, label: '50 to 59%' },
  { from: 60, label: '60 to 69%' },
  { from: 70, label: '70 to 79%' },
  { from: 80, label: '80 to 89%' },
  { from: 90, label: '90% and above' },
];

/** The band (0 to 6) a mark falls in, compared exactly. */
export function bandIndex(marks: number, max: number): number {
  const m = hundredths(marks) * 100;
  const mx = hundredths(max);
  let index = 0;
  BAND_STARTS.forEach((b, i) => {
    if (m >= b.from * mx) index = i;
  });
  return index;
}

export interface ScoredStudent {
  studentId: string;
  name: string;
  marks: number;
}

export interface Distribution {
  bands: Band[];
  /** Largest band count, for drawing. */
  peak: number;
  scored: number;
  /** Not entered or absent. */
  missing: number;
  absent: number;
  notEntered: number;
  lowest: ScoredStudent[];
  highest: ScoredStudent[];
}

/** The three lowest and three highest, never the same student twice (fewer when few scored). */
export function extremes<T extends { marks: number; name: string }>(scored: readonly T[]): { lowest: T[]; highest: T[] } {
  const sorted = [...scored].sort((a, b) => a.marks - b.marks || a.name.localeCompare(b.name));
  const n = sorted.length;
  const high = Math.min(3, Math.floor(n / 2));
  const low = Math.min(3, n - high);
  return { lowest: sorted.slice(0, low), highest: sorted.slice(n - high).reverse() };
}

/** Students per band, who is missing, and the three lowest and highest, from the test's own entries. */
export function distributionOf(students: readonly TestStudent[], max: number): Distribution {
  const counts = BAND_STARTS.map(() => 0);
  const scored: ScoredStudent[] = [];
  let absent = 0;
  for (const s of students) {
    const n = numberOf(s.marks);
    if (s.absent) absent++;
    else if (n !== null) {
      counts[bandIndex(n, max)]!++;
      scored.push({ studentId: s.studentId, name: s.name, marks: n });
    }
  }
  const { lowest, highest } = extremes(scored);
  return {
    bands: BAND_STARTS.map((b, i) => ({ key: `b${b.from}`, label: b.label, from: b.from, count: counts[i]! })),
    peak: Math.max(0, ...counts),
    scored: scored.length,
    missing: students.length - scored.length,
    absent,
    notEntered: students.length - scored.length - absent,
    lowest,
    highest,
  };
}

/** One sentence for a screen reader that reads the whole chart. */
export function distributionSentence(d: Distribution): string {
  if (d.scored === 0) return 'Nobody has marks yet.';
  const parts = d.bands.filter((b) => b.count > 0).map((b) => `${b.label}: ${b.count}`);
  return `Marks of ${d.scored} students. ${parts.join('. ')}. Missing: ${d.missing}.`;
}

// ---------- undo ----------

/** What a row looked like before an edit. */
export interface Edit {
  studentId: string;
  before: EntryDraft;
}

export const MAX_UNDO = 50;

/**
 * Remembers a row's state before it is changed. Several edits in a row on the same student are
 * one edit (typing "7", then ".5" undoes back to the start in one tap).
 */
export function recordEdit(history: readonly Edit[], studentId: string, before: EntryDraft): Edit[] {
  const last = history[history.length - 1];
  if (last && last.studentId === studentId) return [...history];
  return [...history, { studentId, before }].slice(-MAX_UNDO);
}

/** Puts the last edited row back as it was. */
export function undoLast(drafts: Drafts, history: readonly Edit[]): { drafts: Drafts; history: Edit[]; undone: Edit | null } {
  const last = history[history.length - 1];
  if (!last) return { drafts, history: [...history], undone: null };
  return { drafts: { ...drafts, [last.studentId]: last.before }, history: history.slice(0, -1), undone: last };
}

/** Changes one row and remembers how it was, in one step. */
export function editRow(
  drafts: Drafts,
  history: readonly Edit[],
  studentId: string,
  change: Partial<EntryDraft>,
): { drafts: Drafts; history: Edit[] } {
  const before = drafts[studentId] ?? emptyEntry();
  const next = { ...before, ...change };
  if (same(before, next)) return { drafts, history: [...history] };
  return { drafts: { ...drafts, [studentId]: next }, history: recordEdit(history, studentId, before) };
}

// ---------- the keyboard's Next key ----------

/** The next student whose marks can be typed (an absent student is skipped), or null after the last. */
export function nextStudentId(
  students: readonly { studentId: string }[],
  drafts: Drafts,
  currentId: string,
): string | null {
  const at = students.findIndex((s) => s.studentId === currentId);
  for (let i = at + 1; i < students.length; i++) {
    const s = students[i]!;
    if (!drafts[s.studentId]?.absent) return s.studentId;
  }
  return null;
}

// ---------- the new-test form ----------

export interface TestDraft {
  name: string;
  kind: AssessmentKind;
  divisionId: string;
  subjectId: string;
  /** "YYYY-MM-DD", or "" when not chosen. */
  conductedOn: string;
  /** As typed. */
  maxMarks: string;
}

export const emptyTestDraft = (today: string): TestDraft => ({
  name: '',
  kind: 'UNIT',
  divisionId: '',
  subjectId: '',
  conductedOn: today,
  maxMarks: '',
});

export type TestErrors = Partial<Record<keyof TestDraft, string>>;

/** The subjects across all of a teacher's classes (or one class), for the list's filter. */
export function subjectChoices(options: TestOptions | undefined, divisionId: string): { id: string; name: string }[] {
  if (!options) return [];
  if (divisionId !== 'all') return subjectsFor(options, divisionId);
  const ids = new Set(options.divisions.flatMap((d) => d.subjectIds));
  return options.subjects.filter((s) => ids.has(s.id));
}

/** The subjects a teacher may use for a division (the API's `subjectIds`). */
export function subjectsFor(options: TestOptions | undefined, divisionId: string): { id: string; name: string }[] {
  if (!options) return [];
  const division = options.divisions.find((d) => d.id === divisionId);
  if (!division) return [];
  return options.subjects.filter((s) => division.subjectIds.includes(s.id));
}

export function validateTest(draft: TestDraft, options: TestOptions | undefined, today: string): TestErrors {
  const errors: TestErrors = {};
  const name = draft.name.trim();
  if (name.length < NAME_MIN) errors.name = `Give the test a name of at least ${NAME_MIN} letters`;
  else if (name.length > NAME_MAX) errors.name = `Keep the name under ${NAME_MAX} letters`;
  if (!draft.divisionId) errors.divisionId = 'Choose a class';
  if (!draft.subjectId) errors.subjectId = 'Choose a subject';
  else if (draft.divisionId && !subjectsFor(options, draft.divisionId).some((s) => s.id === draft.subjectId)) {
    errors.subjectId = 'You do not teach this subject in this class';
  }
  if (!draft.conductedOn) errors.conductedOn = 'Choose the day of the test';
  else if (draft.conductedOn > today) errors.conductedOn = 'The test day cannot be in the future';
  const max = draft.maxMarks.trim().replace(',', '.');
  if (max === '') errors.maxMarks = 'Type the most a student can score';
  else if (!/^\d+(\.\d{1,2})?$/.test(max)) errors.maxMarks = 'Type a number, like 10 or 25.5';
  else if (hundredths(Number(max)) < 1) errors.maxMarks = 'The maximum must be more than zero';
  else if (Number(max) > MAX_MARKS_LIMIT) errors.maxMarks = `The maximum cannot be more than ${MAX_MARKS_LIMIT}`;
  return errors;
}

export const hasErrors = (e: object): boolean => Object.keys(e).length > 0;

/** The body of `POST /assessments`. */
export function createBody(draft: TestDraft) {
  return {
    name: draft.name.trim(),
    kind: draft.kind,
    divisionId: draft.divisionId,
    subjectId: draft.subjectId,
    maxMarks: Number(draft.maxMarks.trim().replace(',', '.')),
    conductedOn: draft.conductedOn,
  };
}

// ---------- the list ----------

export type StatusFilter = 'all' | 'draft' | 'published';

export const STATUS_TABS: readonly { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Not published' },
  { value: 'published', label: 'Published' },
];

/** "7 of 10 entered" */
export const enteredText = (t: Pick<TestSummary, 'entered' | 'students'>): string => `${t.entered} of ${t.students} entered`;

/** Whether publishing makes sense: something is entered and nothing typed is unsaved. */
export function canPublish(entered: number, unsaved: number): boolean {
  return entered > 0 && unsaved === 0;
}
