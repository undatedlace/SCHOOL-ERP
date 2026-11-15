/**
 * Demo data for trying the mobile app (family and teacher screens) and the web app.
 *
 * What it does: signs in to a RUNNING API as the demo users (X-Client: mobile, Bearer token) and creates,
 * through the normal endpoints so every business rule applies: a timetable, attendance up to yesterday,
 * homework with hand-ins and marking, tests with marks and results, notices, calendar events, student
 * leave, staff leave, messages between families and teachers, and part payments for two students.
 *
 * Run (the API must be up, with the demo school seeded by `npm run seed:demo`):
 *   API_URL=http://localhost:3000 npm run seed:demo-app
 *   ONLY=timetable,homework npm run seed:demo-app     (run some sections; names are in SECTIONS below)
 *
 * It is idempotent: each section looks for its own marker data first (a known title, a schedule name, ...)
 * and skips when it is already there, so running it twice creates nothing twice. It never deletes or
 * resets anything. FOR DEMO SCHOOLS ONLY: it signs in with the shared demo password.
 */
import sharp from 'sharp';

const API = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const PASSWORD = process.env.DEMO_PASSWORD ?? 'Demo@1234';
const ONLY = process.env.ONLY?.split(',').map((s) => s.trim()) ?? null;

// ---------------------------------------------------------------- tiny HTTP client

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

class ApiError extends Error {
  constructor(
    public status: number,
    public path: string,
    message: string,
  ) {
    super(`${status} ${path}: ${message}`);
  }
}

const loginTimes: number[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Session {
  private token: string | null = null;
  constructor(public identifier: string) {}

  async login() {
    // The API allows 5 sign-ins a minute from one address, so sign-ins are paced and retried.
    for (let tries = 0; tries < 8; tries++) {
      const now = Date.now();
      while (loginTimes.length && now - loginTimes[0] > 62_000) loginTimes.shift();
      if (loginTimes.length >= 4) {
        await sleep(62_000 - (now - loginTimes[0]));
        continue;
      }
      loginTimes.push(Date.now());
      const res = await fetch(`${API}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-client': 'mobile' },
        body: JSON.stringify({ identifier: this.identifier, password: PASSWORD }),
      });
      const body = (await res.json().catch(() => ({}))) as Json;
      if (res.status === 429) {
        await sleep(20_000);
        continue;
      }
      if (!res.ok || !body.token) {
        throw new ApiError(res.status, 'auth/login', `${this.identifier}: ${body.message ?? 'no token'}`);
      }
      this.token = body.token;
      return;
    }
    throw new ApiError(429, 'auth/login', `${this.identifier}: still rate limited`);
  }

  /** Set when this demo login would not sign in (its password was changed): the principal acts instead. */
  private stand: Session | null = null;

  async req(method: string, path: string, body?: unknown, form?: FormData): Promise<Json> {
    if (this.stand) return this.stand.req(method, path, body, form);
    if (!this.token) {
      try {
        await this.login();
      } catch (e) {
        if (e instanceof ApiError && e.status === 401 && this.identifier !== PRINCIPAL && this.identifier.includes('@')) {
          console.log(`   ! ${this.identifier} would not sign in with the demo password; ${PRINCIPAL} acts in its place`);
          refused.push(`${this.identifier}: demo password rejected, ${PRINCIPAL} acted instead`);
          this.stand = as(PRINCIPAL);
          return this.stand.req(method, path, body, form);
        }
        throw e;
      }
    }
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.token}`,
      'x-client': 'mobile',
    };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(`${API}/api/v1${path}`, {
      method,
      headers,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
    const text = await res.text();
    let parsed: Json = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    if (!res.ok) {
      const msg = Array.isArray(parsed?.message) ? parsed.message.join('; ') : (parsed?.message ?? text);
      throw new ApiError(res.status, `${method} ${path}`, String(msg));
    }
    return parsed;
  }
  get = (p: string) => this.req('GET', p);
  post = (p: string, b?: unknown) => this.req('POST', p, b ?? {});
  put = (p: string, b?: unknown) => this.req('PUT', p, b ?? {});
  patch = (p: string, b?: unknown) => this.req('PATCH', p, b ?? {});

  async upload(purpose: string, bytes: Uint8Array, name: string, type: string): Promise<string> {
    const form = new FormData();
    form.append('purpose', purpose);
    form.append('file', new Blob([bytes as BlobPart], { type }), name);
    const out = await this.req('POST', '/files', undefined, form);
    return out.id as string;
  }
}

const sessions = new Map<string, Session>();
const as = (who: string): Session => {
  let s = sessions.get(who);
  if (!s) {
    s = new Session(who.includes('@') ? who : who.toLowerCase());
    sessions.set(who, s);
  }
  return s;
};

// ---------------------------------------------------------------- helpers

const created: Record<string, number> = {};
const skipped: string[] = [];
const refused: string[] = [];
const count = (k: string, n = 1) => (created[k] = (created[k] ?? 0) + n);
const log = (s: string) => console.log(s);

async function attempt<T>(what: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    refused.push(`${what} -> ${m}`);
    log(`   ! ${what}: ${m}`);
    return null;
  }
}

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
/** Today in India as a UTC-midnight Date. */
function todayIndia(): Date {
  const ist = new Date(Date.now() + 5.5 * 3600_000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400_000);
const TODAY = todayIndia();
const dow = (d: Date) => d.getUTCDay(); // 0 = Sunday

/** Deterministic pseudo-random numbers, so a rerun after a partial failure behaves the same. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

async function tinyPng(label: number): Promise<Uint8Array> {
  const colour = { r: 60 + (label * 37) % 160, g: 120 + (label * 53) % 100, b: 180 - (label * 29) % 100 };
  const buf = await sharp({
    create: { width: 240, height: 160, channels: 3, background: colour },
  })
    .png()
    .toBuffer();
  return new Uint8Array(buf);
}

// ---------------------------------------------------------------- shared discovery

interface Ctx {
  yearId: string;
  yearName: string;
  divisions: {
    id: string;
    label: string;
    className: string;
    name: string;
    classId: string;
  }[];
  /** division label -> { subjectName -> { subjectId, staffId, staffName } } and class teacher */
  teams: Map<string, { subject: Map<string, { subjectId: string; staffId: string; staffName: string }>; classTeacher: string | null }>;
  staff: Map<string, { id: string; name: string; userId: string | null; email: string }>; // by email
  students: Map<string, { id: string; name: string; divisionId: string | null; label: string | null }>; // by login (lower)
}

const ctx: Ctx = {
  yearId: '',
  yearName: '',
  divisions: [],
  teams: new Map(),
  staff: new Map(),
  students: new Map(),
};

const PRINCIPAL = 'principal@demo.school';
const OFFICE = 'office@demo.school';
const ACCOUNTS = 'accounts@demo.school';
const T1 = 'teacher@demo.school';

async function discover() {
  const p = as(PRINCIPAL);
  const sched = await p.get('/timetable/schedules');
  ctx.yearId = sched.academicYear.id;
  ctx.yearName = sched.academicYear.name;

  const divs = await p.get('/timetable/divisions');
  for (const d of divs) {
    ctx.divisions.push({ id: d.id, label: d.label, className: d.class.name, name: d.name, classId: d.class.id });
  }
  for (const d of ctx.divisions) {
    const w = await p.get(`/timetable/divisions/${d.id}?weekOf=${iso(addDays(TODAY, 1))}`);
    const subject = new Map<string, { subjectId: string; staffId: string; staffName: string }>();
    for (const t of w.team ?? []) {
      if (t.staff[0]) {
        subject.set(t.subject.name, { subjectId: t.subject.id, staffId: t.staff[0].id, staffName: t.staff[0].fullName });
      }
    }
    ctx.teams.set(d.label, { subject, classTeacher: w.classTeacher?.id ?? null });
  }

  // staff by login email
  let page = 1;
  for (;;) {
    const r = await p.get(`/staff?pageSize=100&page=${page}`);
    for (const s of r.items) {
      if (s.email) {
        ctx.staff.set(String(s.email).toLowerCase(), {
          id: s.id,
          name: s.fullName,
          userId: s.account?.userId ?? null,
          email: s.email,
        });
      }
    }
    if (page * r.pageSize >= r.total) break;
    page++;
  }
}

/** Students that have a login: found by signing in, then through the school lists. */
async function studentByLogin(login: string) {
  const key = login.toLowerCase();
  const hit = ctx.students.get(key);
  if (hit) return hit;
  const p = as(PRINCIPAL);
  const r = await p.get(`/students?search=${encodeURIComponent(key)}&pageSize=20`);
  const row = (r.items as Json[]).find((s) => String(s.admissionNo).toLowerCase() === key);
  if (!row) throw new Error(`No student with admission number ${login}`);
  const info = {
    id: row.id as string,
    name: row.fullName as string,
    divisionId: (row.current?.division?.id as string) ?? null,
    label: row.current ? `${row.current.class?.name}-${row.current.division?.name}` : null,
  };
  ctx.students.set(key, info);
  return info;
}

// ---------------------------------------------------------------- sections

type Section = { name: string; run: () => Promise<void> };
const SECTIONS: Section[] = [];

// ---- 1. timetable -------------------------------------------------------------------------------

const SCHEDULE_NAME = 'Demo timings (app)';
/** Lessons a week for each subject (Hindi, Art, PE and Computer are shared by many divisions). */
const WEEKLY: Record<string, number> = {
  English: 7,
  Mathematics: 7,
  EVS: 5,
  Hindi: 3,
  'Art & Craft': 3,
  'Physical Education': 3,
  Computer: 3,
};

SECTIONS.push({
  name: 'timetable',
  async run() {
    const p = as(PRINCIPAL);
    const list = await p.get('/timetable/schedules');
    let schedule = (list.schedules as Json[]).find((s) => s.name === SCHEDULE_NAME);
    if (!schedule) {
      const preview = await p.post('/timetable/schedules/preview', {
        firstStart: '08:30',
        periodMinutes: 40,
        periodsPerDay: 7,
        gapMinutes: 0,
        assemblyMinutes: 15,
        breaks: [
          { afterPeriod: 3, label: 'Short break', minutes: 10 },
          { afterPeriod: 5, label: 'Lunch', minutes: 30 },
        ],
        days: [1, 2, 3, 4, 5],
      });
      // Saturday is a half day: assembly, periods 1 to 4 and the short break.
      const slots = (preview.slots as Json[]).map((s) => {
        const half = s.kind === 'ASSEMBLY' || s.label === 'Short break' || ['Period 1', 'Period 2', 'Period 3', 'Period 4'].includes(s.label);
        return { kind: s.kind, label: s.label, startsAt: s.startsAt, endsAt: s.endsAt, days: half ? [1, 2, 3, 4, 5, 6] : s.days };
      });
      const made = await p.post('/timetable/schedules', { name: SCHEDULE_NAME });
      await p.put(`/timetable/schedules/${made.id}/slots`, { slots });
      count('timetable timings', 1);
      log(`   created timings "${SCHEDULE_NAME}"`);
    } else {
      skipped.push(`timings "${SCHEDULE_NAME}" exist`);
    }
    const fresh = await p.get('/timetable/schedules');
    schedule = (fresh.schedules as Json[]).find((s) => s.name === SCHEDULE_NAME);
    const toSet = (fresh.classes as Json[]).filter((c) => !c.scheduleId);
    if (toSet.length) {
      await p.put('/timetable/class-schedules', {
        classes: toSet.map((c) => ({ classId: c.id, scheduleId: schedule.id })),
      });
      log(`   timings set for ${toSet.length} class(es)`);
    }

    const weekOf = iso(addDays(TODAY, 1)); // Mon 16 Nov
    // Read every division's week, to know the slots, who is busy and who is already filled in.
    const views = new Map<string, Json>();
    for (const d of ctx.divisions) views.set(d.id, await p.get(`/timetable/divisions/${d.id}?weekOf=${weekOf}`));

    const busy = new Set<string>(); // `${startsAt}|${weekday}|${staffId}`
    const filled = new Set<string>();
    for (const d of ctx.divisions) {
      const v = views.get(d.id)!;
      const cells = (v.cells ?? []) as Json[];
      if (cells.length) filled.add(d.id);
      for (const c of cells) {
        const slot = (v.rows as Json[]).find((r) => r.key === c.slotId);
        if (slot && c.staff?.id) busy.add(`${slot.startsAt}|${c.weekday}|${c.staff.id}`);
      }
    }

    let totalEntries = 0;
    // Slots in time order (the same for every class on these timings).
    for (const d of ctx.divisions) {
      if (filled.has(d.id)) {
        skipped.push(`timetable of ${d.label} already has lessons`);
        continue;
      }
      const team = ctx.teams.get(d.label)!;
      if (team.subject.size === 0) {
        skipped.push(`timetable of ${d.label}: no subject teachers`);
        continue;
      }
      const v = views.get(d.id)!;
      const periods = (v.rows as Json[]).filter((r) => r.kind === 'PERIOD');
      const need = new Map<string, number>();
      for (const [name] of team.subject) need.set(name, WEEKLY[name] ?? 3);
      const rand = rng(hash(d.label));
      const entries: Json[] = [];
      const perDay = new Map<string, number>(); // `${weekday}|${subject}`
      // Go through the week day by day, period by period.
      for (let weekday = 1; weekday <= 6; weekday++) {
        for (const slot of periods) {
          if (!(slot.days as number[]).includes(weekday)) continue;
          const candidates = [...team.subject.entries()]
            .filter(([name, t]) => (need.get(name) ?? 0) > 0 && !busy.has(`${slot.startsAt}|${weekday}|${t.staffId}`))
            .filter(([name]) => (perDay.get(`${weekday}|${name}`) ?? 0) < 2);
          if (!candidates.length) continue;
          // Most lessons still to place first, with a little shuffle to vary the days.
          candidates.sort((a, b) => (need.get(b[0]) ?? 0) - (need.get(a[0]) ?? 0) + (rand() - 0.5) * 1.6);
          const [name, t] = candidates[0];
          need.set(name, (need.get(name) ?? 0) - 1);
          perDay.set(`${weekday}|${name}`, (perDay.get(`${weekday}|${name}`) ?? 0) + 1);
          busy.add(`${slot.startsAt}|${weekday}|${t.staffId}`);
          entries.push({ slotId: slot.key, weekday, subjectId: t.subjectId, staffId: t.staffId });
        }
      }
      for (let i = 0; i < entries.length; i += 100) {
        await p.put(`/timetable/divisions/${d.id}/entries`, { entries: entries.slice(i, i + 100) });
      }
      totalEntries += entries.length;
      log(`   ${d.label}: ${entries.length} lessons`);
    }
    count('timetable entries', totalEntries);

    // One-day changes for next week.
    const monday = TODAY.getUTCDay() === 0 ? addDays(TODAY, 1) : addDays(TODAY, 8 - dow(TODAY));
    const wed = iso(addDays(monday, 2));
    const fri = iso(addDays(monday, 4));
    const pick = (label: string) => ctx.divisions.find((x) => x.label === label);
    const jobs: { label: string; date: string; weekday: number; period: number; kind: 'SUBSTITUTE' | 'CANCELLED'; reason: string }[] = [
      { label: 'Nursery-A', date: wed, weekday: 3, period: 2, kind: 'SUBSTITUTE', reason: 'Class teacher at a training workshop' },
      { label: 'Std. I-A', date: fri, weekday: 5, period: 7, kind: 'CANCELLED', reason: 'Sports practice for Sports Day' },
    ];
    for (const j of jobs) {
      const d = pick(j.label);
      if (!d) continue;
      const w = await p.get(`/timetable/divisions/${d.id}?weekOf=${j.date}`);
      if ((w.changes as Json[]).length) {
        skipped.push(`day change for ${j.label} already there`);
        continue;
      }
      // The wanted period, or the nearest one after it that has a lesson.
      const dayPeriods = (w.rows as Json[]).filter((r) => r.kind === 'PERIOD' && (r.days as number[]).includes(j.weekday));
      const order = [...dayPeriods.slice(j.period - 1), ...dayPeriods.slice(0, j.period - 1).reverse()];
      const slot = order.find((r) => (w.cells as Json[]).some((c) => c.slotId === r.key && c.weekday === j.weekday && c.subject));
      if (!slot) {
        skipped.push(`day change for ${j.label}: no lesson that day`);
        continue;
      }
      const body: Json = { date: j.date, divisionId: d.id, slotId: slot.key, kind: j.kind, reason: j.reason };
      if (j.kind === 'SUBSTITUTE') {
        const free = await p.get(`/timetable/free-teachers?date=${j.date}&divisionId=${d.id}&slotId=${slot.key}`);
        const first = (Array.isArray(free) ? free : free.teachers ?? free.items ?? [])[0];
        const id = first?.staffId ?? first?.id ?? first?.staff?.id;
        if (!id) {
          refused.push(`substitute for ${j.label}: no free teacher found (${JSON.stringify(free).slice(0, 120)})`);
          continue;
        }
        body.substituteStaffId = id;
      }
      const ok = await attempt(`${j.kind} ${j.label} ${j.date}`, () => p.post('/timetable/adjustments', body));
      if (ok) count('timetable day changes');
    }
  },
});

// ---- 2. attendance ------------------------------------------------------------------------------

SECTIONS.push({
  name: 'attendance',
  async run() {
    const p = as(PRINCIPAL);
    const yesterday = addDays(TODAY, -1);
    const yearStart = iso(addDays(TODAY, -60)) > '2026-11-07' ? iso(addDays(TODAY, -60)) : '2026-11-07';
    const events = await p.get(`/calendar?from=${yearStart}&to=${iso(yesterday)}`);
    const holidays = new Set<string>();
    for (const e of events as Json[]) {
      if (e.category === 'HOLIDAY' && e.audience === 'ALL') {
        for (let d = new Date(e.startsOn + 'T00:00:00Z'); iso(d) <= e.endsOn; d = addDays(d, 1)) holidays.add(iso(d));
      }
    }
    const isSchoolDay = (d: Date) => dow(d) !== 0 && !holidays.has(iso(d)) && iso(d) >= yearStart;
    let marked = 0;
    let days = 0;
    for (const d of ctx.divisions) {
      // Find the last day anything was marked (looking back up to three weeks).
      let last: string | null = null;
      for (let back = 0; back < 21; back++) {
        const day = addDays(yesterday, -back);
        if (!isSchoolDay(day)) continue;
        const r = await p.get(`/attendance/divisions/${d.id}?date=${iso(day)}`);
        if (r.marked) {
          last = iso(day);
          break;
        }
      }
      const from = last ? addDays(new Date(last + 'T00:00:00Z'), 1) : addDays(yesterday, -9);
      let didSome = false;
      for (let day = from; iso(day) <= iso(yesterday); day = addDays(day, 1)) {
        if (!isSchoolDay(day)) continue;
        const r = await p.get(`/attendance/divisions/${d.id}?date=${iso(day)}`);
        if (r.marked || !r.students.length) continue;
        const rand = rng(hash(`${d.label}${iso(day)}`));
        const entries = (r.students as Json[]).map((st) => {
          const roll = rand();
          // Each child has a steady habit: a few are often late or absent.
          const habit = (hash(st.studentId) % 100) / 100;
          let status = 'PRESENT';
          let note: string | undefined;
          if (roll < 0.02 + (habit < 0.1 ? 0.08 : 0)) {
            status = 'ABSENT';
            note = ['Fever', 'Stomach ache', 'Family function', 'Cold and cough'][Math.floor(rand() * 4)];
          } else if (roll < 0.06 + (habit > 0.9 ? 0.08 : 0)) {
            status = 'LATE';
            note = 'Reached after assembly';
          } else if (roll > 0.992) {
            status = 'ON_LEAVE';
            note = 'Leave approved by the class teacher';
          }
          return { studentId: st.studentId, status, ...(note ? { note } : {}) };
        });
        const ok = await attempt(`attendance ${d.label} ${iso(day)}`, () =>
          p.put(`/attendance/divisions/${d.id}`, { date: iso(day), entries }),
        );
        if (ok) {
          marked += entries.length;
          days++;
          didSome = true;
        }
      }
      if (!didSome) skipped.push(`attendance of ${d.label} is up to date`);
    }
    count('attendance marks', marked);
    count('attendance division-days', days);
  },
});

// ---- 3. homework ----------------------------------------------------------------------------------

const div = (label: string) => {
  const d = ctx.divisions.find((x) => x.label === label);
  if (!d) throw new Error(`No division ${label}`);
  return d;
};
const subjectId = (label: string, name: string) => {
  const s = ctx.teams.get(label)?.subject.get(name);
  if (!s) throw new Error(`No subject ${name} in ${label}`);
  return s.subjectId;
};
const dayFromToday = (n: number) => iso(addDays(TODAY, n));

interface HwPlan {
  key: string;
  by: string;
  title: string;
  text: string;
  subject?: string; // subject name
  divisions: string[]; // labels
  students?: string[]; // admission numbers, for individual homework
  dueIn: number;
  handIn: boolean;
  maxMarks?: number;
  worksheet?: boolean;
}

const SEEMA = 'seema.tiwari@demo.school';
const ROHINI = 'rohini.kapoor@demo.school';
const SUNITA = 'sunita.deshpande@demo.school';
const ANWAR = 'anwar.hussain@demo.school';

const HOMEWORK: HwPlan[] = [
  { key: 'trace', by: T1, title: 'Trace the letters A to E', text: 'Trace each letter three times in your book. Stay inside the lines and use a soft pencil.', subject: 'English', divisions: ['Nursery-A'], dueIn: 1, handIn: true, maxMarks: 10, worksheet: true },
  { key: 'count', by: T1, title: 'Count and colour: numbers 1 to 10', text: 'Count the objects in the worksheet, write the number and colour them.', subject: 'Mathematics', divisions: ['Nursery-A'], dueIn: 5, handIn: true, maxMarks: 10, worksheet: true },
  { key: 'family', by: T1, title: 'Draw your family', text: 'Draw your family on a sheet of paper and write one name under each person.', subject: 'EVS', divisions: ['Nursery-A'], dueIn: 9, handIn: true },
  { key: 'rhyme', by: T1, title: 'Rhyme practice: Twinkle, Twinkle', text: 'Practise the rhyme with your parents and write the first line in your book.', subject: 'English', divisions: ['Nursery-A'], dueIn: 0, handIn: true },
  { key: 'reading', by: T1, title: 'Extra reading practice', text: 'Read the three-letter words on the page once a day this week. For Vivaan and Yusuf only.', subject: 'English', divisions: [], students: ['DS0005', 'DS0002'], dueIn: 3, handIn: true },
  { key: 'leaf', by: T1, title: 'Bring a leaf for the nature table', text: 'Bring one fallen leaf in your bag on Thursday. No need to hand in anything.', subject: 'EVS', divisions: ['Nursery-A'], dueIn: 4, handIn: false },
  { key: 'varnamala', by: SEEMA, title: 'Hindi varnamala practice', text: 'Write the vowels from अ to औ once in your Hindi notebook and say them aloud.', subject: 'Hindi', divisions: ['Nursery-A'], dueIn: 3, handIn: true, maxMarks: 10 },
  { key: 'parivar', by: SEEMA, title: 'Hindi: mera parivar', text: 'Write three lines about your family in Hindi.', subject: 'Hindi', divisions: ['Junior KG-A', 'Junior KG-B'], dueIn: 5, handIn: true, maxMarks: 10 },
  { key: 'fruit', by: ROHINI, title: 'Draw your favourite fruit', text: 'Draw and colour your favourite fruit on an A4 sheet.', subject: 'Art & Craft', divisions: ['Nursery-A'], dueIn: 4, handIn: true, worksheet: true },
  { key: 'boat', by: ROHINI, title: 'Paper folding: make a boat', text: 'Make a paper boat and bring it to class on Monday.', subject: 'Art & Craft', divisions: ['Junior KG-A'], dueIn: 8, handIn: false },
  { key: 'count20', by: SUNITA, title: 'Count 1 to 20 worksheet', text: 'Complete the worksheet and write the missing numbers.', subject: 'Mathematics', divisions: ['Junior KG-A'], dueIn: 2, handIn: true, maxMarks: 20, worksheet: true },
  { key: 'phonics', by: SUNITA, title: 'Phonics: sounds of a, e, i', text: 'Practise the sounds with the flash cards at home.', subject: 'English', divisions: ['Junior KG-A'], dueIn: 10, handIn: false },
  { key: 'shapes', by: ANWAR, title: 'Shapes around us', text: 'Find three things at home that look like a circle, a square and a triangle and draw them.', subject: 'Mathematics', divisions: ['Junior KG-B'], dueIn: 2, handIn: true, maxMarks: 10 },
  { key: 'atwords', by: ANWAR, title: "Write five words with 'at'", text: 'Write five words that end with -at (cat, hat, mat ...).', subject: 'English', divisions: ['Junior KG-B'], dueIn: 1, handIn: true },
  { key: 'addition', by: 'mohammed.rafiq@demo.school', title: 'Addition up to 20', text: 'Solve the sums on page 34 of your maths book.', subject: 'Mathematics', divisions: ['Std. I-A'], dueIn: 2, handIn: false },
  { key: 'computer', by: 'aditi.rao@demo.school', title: 'Parts of a computer', text: 'Draw a computer and name its four main parts.', subject: 'Computer', divisions: ['Std. I-A', 'Std. I-B'], dueIn: 6, handIn: false },
];

interface HandPlan {
  hw: string;
  login: string;
  note: string;
  after?: { status: 'REVIEWED' | 'REDO'; marks?: number; feedback: string };
}
const HANDINS: HandPlan[] = [
  { hw: 'trace', login: 'ds0002', note: 'Done, Ma said it looks good.', after: { status: 'REVIEWED', marks: 8, feedback: 'Neat tracing, well done. Try to stay inside the lines for E.' } },
  { hw: 'trace', login: 'ds0003', note: 'My trace page.', after: { status: 'REVIEWED', marks: 9, feedback: 'Excellent work!' } },
  { hw: 'trace', login: 'ds0004', note: 'Finished all five letters.' },
  { hw: 'trace', login: 'ds0005', note: 'I did it in a hurry.', after: { status: 'REDO', feedback: 'Please trace again slowly, inside the lines, and hand in once more.' } },
  { hw: 'count', login: 'ds0002', note: 'Counted and coloured everything.' },
  { hw: 'count', login: 'ds0005', note: 'All numbers done.' },
  { hw: 'rhyme', login: 'ds0003', note: 'Wrote the first line.', after: { status: 'REVIEWED', feedback: 'Lovely handwriting.' } },
  { hw: 'rhyme', login: 'ds0006', note: 'Practised with my mother.' },
  { hw: 'reading', login: 'ds0005', note: 'Read the words every day.' },
  { hw: 'varnamala', login: 'ds0002', note: 'Wrote all vowels.', after: { status: 'REVIEWED', marks: 7, feedback: 'Good effort. Take care with the shape of ऋ.' } },
  { hw: 'fruit', login: 'ds0004', note: 'My mango.' },
  { hw: 'count20', login: 'ds0031', note: 'Missing numbers filled.', after: { status: 'REVIEWED', marks: 18, feedback: 'Very good, only one number missed.' } },
  { hw: 'parivar', login: 'ds0031', note: 'Three lines written.' },
  { hw: 'parivar', login: 'ds0034', note: 'Done.', after: { status: 'REVIEWED', marks: 9, feedback: 'Nicely written.' } },
  { hw: 'shapes', login: 'ds0034', note: 'Drew a plate, a book and a roof.' },
];

SECTIONS.push({
  name: 'homework',
  async run() {
    const admin = as(PRINCIPAL);
    const existing = new Map<string, Json>();
    for (let page = 1; ; page++) {
      const r = await admin.get(`/homework?status=all&pageSize=100&page=${page}`);
      for (const h of r.items as Json[]) existing.set(h.title, h);
      if (page * r.pageSize >= r.total) break;
    }
    const ids = new Map<string, string>();
    for (const h of HOMEWORK) {
      const found = existing.get(h.title);
      if (found) {
        ids.set(h.key, found.id);
        skipped.push(`homework "${h.title}" exists`);
        continue;
      }
      const teacher = as(h.by);
      const body: Json = {
        title: h.title,
        instructions: h.text,
        dueOn: dayFromToday(h.dueIn),
        handIn: h.handIn,
      };
      if (h.maxMarks) body.maxMarks = h.maxMarks;
      if (h.divisions.length) {
        body.divisionIds = h.divisions.map((l) => div(l).id);
        if (h.subject) body.subjectId = subjectId(h.divisions[0], h.subject);
      } else if (h.subject) {
        body.subjectId = subjectId('Nursery-A', h.subject);
      }
      if (h.students) body.studentIds = await Promise.all(h.students.map(async (a) => (await studentByLogin(a)).id));
      if (h.worksheet) {
        const png = await tinyPng(hash(h.key));
        const fid = await attempt(`worksheet for ${h.key}`, () => teacher.upload('homework-attachment', png, 'worksheet.png', 'image/png'));
        if (fid) body.attachmentFileIds = [fid];
      }
      const made = await attempt(`homework "${h.title}"`, () => teacher.post('/homework', body));
      if (made) {
        ids.set(h.key, made.id);
        count('homework');
        log(`   homework: ${h.title} (${h.by.split('@')[0]}, due ${body.dueOn})`);
      }
    }

    // Hand-ins and marking.
    for (const h of HANDINS) {
      const hwId = ids.get(h.hw);
      if (!hwId) continue;
      const plan = HOMEWORK.find((x) => x.key === h.hw)!;
      const st = await studentByLogin(h.login);
      const rowOf = async () => {
        const roster = await admin.get(`/homework/${hwId}/hand-ins`);
        return (roster.students as Json[]).find((r) => r.studentId === st.id);
      };
      let row = await rowOf();
      if (!row) {
        refused.push(`hand-in ${h.login} ${h.hw}: student not in the roster`);
        continue;
      }
      if (!row.submission) {
        const student = as(h.login);
        const png = await tinyPng(hash(h.hw + h.login));
        const fid = await attempt(`photo for ${h.login}`, () => student.upload('homework-submission', png, 'my-work.png', 'image/png'));
        const done = await attempt(`hand-in ${h.login} ${h.hw}`, () =>
          student.put(`/homework/${hwId}/students/${st.id}/hand-in`, { note: h.note, ...(fid ? { fileIds: [fid] } : {}) }),
        );
        if (!done) continue;
        count('hand-ins');
        row = await rowOf();
      } else {
        skipped.push(`${h.login} already handed in ${h.hw}`);
      }
      if (h.after && row?.submission?.status === 'SUBMITTED') {
        const ok = await attempt(`${h.after.status} ${h.login} ${h.hw}`, () =>
          as(plan.by).put(`/homework/${hwId}/students/${st.id}/review`, h.after),
        );
        if (ok) count(h.after.status === 'REVIEWED' ? 'hand-ins marked' : 'hand-ins sent back');
      }
    }
  },
});

// ---- 4. tests and results ---------------------------------------------------------------------------

interface TestPlan {
  by: string;
  label: string; // division
  subject: string;
  name: string;
  kind: 'UNIT' | 'MOCK' | 'TERM' | 'OTHER';
  max: number;
  daysAgo: number;
  /** published (default), or a draft with only part of the class marked */
  draft?: boolean;
}

function buildTests(): TestPlan[] {
  const out: TestPlan[] = [];
  const add = (by: string, label: string, subjects: string[], rounds: { name: string; kind: TestPlan['kind']; max: number; daysAgo: number }[]) => {
    for (const subject of subjects) for (const r of rounds) out.push({ by, label, subject, ...r });
  };
  const three = [
    { name: 'Unit Test 1', kind: 'UNIT' as const, max: 20, daysAgo: 6 },
    { name: 'Unit Test 2', kind: 'UNIT' as const, max: 25, daysAgo: 3 },
    { name: 'Mock Test', kind: 'MOCK' as const, max: 50, daysAgo: 1 },
  ];
  const two = three.slice(0, 2);
  add(T1, 'Nursery-A', ['English', 'Mathematics'], three);
  add(T1, 'Nursery-A', ['EVS'], two);
  add(SEEMA, 'Nursery-A', ['Hindi'], two);
  add(SUNITA, 'Junior KG-A', ['English', 'Mathematics'], two);
  add(ANWAR, 'Junior KG-B', ['English', 'Mathematics'], two);
  add('mohammed.rafiq@demo.school', 'Std. I-A', ['English', 'Mathematics'], three);
  add('nikhil.bhatia@demo.school', 'Std. 2-A', ['Mathematics', 'EVS'], two);
  add('rakesh.menon@demo.school', 'Nursery-B', ['English'], two);
  // Drafts: marks entered for only some of the class, not shown to families.
  out.push({ by: T1, label: 'Nursery-A', subject: 'Mathematics', name: 'Term 1 Assessment', kind: 'TERM', max: 50, daysAgo: 0, draft: true });
  out.push({ by: SUNITA, label: 'Junior KG-A', subject: 'English', name: 'Term 1 Assessment', kind: 'TERM', max: 50, daysAgo: 0, draft: true });
  return out;
}

const REMARKS = ['Good effort', 'Needs more practice', 'Excellent', 'Careless mistakes', 'Improving steadily', 'Please revise the chapter'];

SECTIONS.push({
  name: 'tests',
  async run() {
    const admin = as(PRINCIPAL);
    const have = new Set<string>();
    for (let page = 1; ; page++) {
      const r = await admin.get(`/assessments?status=all&pageSize=100&page=${page}`);
      for (const a of r.items as Json[]) have.add(`${a.division?.id ?? a.divisionId}|${a.subject?.id ?? a.subjectId}|${a.name}`);
      if (page * r.pageSize >= r.total) break;
    }
    let tests = 0;
    let marks = 0;
    let published = 0;
    for (const t of buildTests()) {
      const d = div(t.label);
      const sid = subjectId(t.label, t.subject);
      if (have.has(`${d.id}|${sid}|${t.name}`)) {
        skipped.push(`test ${t.label} ${t.subject} ${t.name} exists`);
        continue;
      }
      const teacher = as(t.by);
      const made = await attempt(`test ${t.label} ${t.subject} ${t.name}`, () =>
        teacher.post('/assessments', {
          name: t.name,
          kind: t.kind,
          divisionId: d.id,
          subjectId: sid,
          maxMarks: t.max,
          conductedOn: iso(addDays(TODAY, -t.daysAgo)),
        }),
      );
      if (!made) continue;
      tests++;
      const detail = await teacher.get(`/assessments/${made.id}`);
      const rand = rng(hash(`${t.label}${t.subject}${t.name}`));
      const roster = detail.students as Json[];
      const entries: Json[] = [];
      roster.forEach((st, i) => {
        if (t.draft && i % 2 === 1) return; // draft: only some marked
        const ability = 0.4 + (hash(st.studentId) % 60) / 100; // 0.40 to 0.99
        if (!t.draft && rand() < 0.04) {
          entries.push({ studentId: st.studentId, absent: true, remark: 'Absent on the day' });
          return;
        }
        const raw = ability * 0.85 + rand() * 0.2;
        const score = Math.max(0, Math.min(t.max, Math.round(raw * t.max * 2) / 2));
        entries.push({
          studentId: st.studentId,
          marks: score,
          ...(rand() < 0.18 ? { remark: REMARKS[Math.floor(rand() * REMARKS.length)] } : {}),
        });
      });
      const saved = await attempt(`marks ${t.label} ${t.subject} ${t.name}`, () => teacher.put(`/assessments/${made.id}/marks`, { entries }));
      if (saved) marks += entries.length;
      if (!t.draft) {
        const ok = await attempt(`publish ${t.label} ${t.subject} ${t.name}`, () => teacher.post(`/assessments/${made.id}/publish`));
        if (ok) published++;
      }
    }
    count('tests', tests);
    count('marks entered', marks);
    count('tests published', published);
  },
});

// ---- 5. notices and calendar -------------------------------------------------------------------------

const classIdOf = (className: string) => {
  const d = ctx.divisions.find((x) => x.className === className);
  if (!d) throw new Error(`No class ${className}`);
  return d.classId;
};

SECTIONS.push({
  name: 'notices',
  async run() {
    const admin = as(PRINCIPAL);
    const have = new Set<string>();
    for (let page = 1; ; page++) {
      const r = await admin.get(`/notices?status=all&pageSize=100&page=${page}`);
      for (const n of r.items as Json[]) have.add(n.title);
      if (page * r.pageSize >= r.total) break;
    }
    const notices: { by: string; body: Json }[] = [
      { by: PRINCIPAL, body: { title: 'Winter uniform from 1 December', body: 'Dear parents, from Tuesday 1 December all children come in the winter uniform (sweater and full-sleeve shirt). Please label every item with your child\'s name.', audience: 'ALL', expiresOn: dayFromToday(20) } },
      { by: OFFICE, body: { title: 'School photo day on Saturday', body: 'Class photographs will be taken on Saturday from 9 am. Children come in full, clean uniform. This notice will go away after the weekend.', audience: 'ALL', expiresOn: dayFromToday(3) } },
      { by: PRINCIPAL, body: { title: 'Staff: child safety refresher', body: 'All teaching and non-teaching staff attend the child safety refresher in the staff room on Monday 30 November at 3:30 pm. Please be on time.', audience: 'STAFF', expiresOn: dayFromToday(16) } },
      { by: PRINCIPAL, body: { title: 'Nursery: bring a change of clothes', body: 'Dear Nursery parents, please keep one spare set of clothes and a small towel in your child\'s bag from this week.', audience: 'CLASSES', classIds: [classIdOf('Nursery')] } },
      { by: OFFICE, body: { title: 'Nursery-A: field trip permission slips', body: 'Our visit to the fire station is on Friday 4 December. Please return the signed permission slip with your child by Wednesday 2 December.', audience: 'DIVISIONS', divisionIds: [div('Nursery-A').id], expiresOn: dayFromToday(18) } },
      { by: PRINCIPAL, body: { title: 'Fees reminder for Term 1', body: 'If Term 1 fees are still pending, please clear them at the school office between 9 am and 1 pm. Part payments are accepted.', audience: 'ALL', expiresOn: dayFromToday(10) } },
    ];
    for (const n of notices) {
      if (have.has(n.body.title)) {
        skipped.push(`notice "${n.body.title}" exists`);
        continue;
      }
      const ok = await attempt(`notice ${n.body.title}`, () => as(n.by).post('/notices', n.body));
      if (ok) count('notices');
    }

    // Calendar: about ten events over the next six weeks.
    const events = await admin.get(`/calendar?from=${dayFromToday(0)}&to=${dayFromToday(60)}`);
    const haveEv = new Set((events as Json[]).map((e) => e.title));
    const ev = (title: string, offset: number, extra: Json = {}): Json => ({
      title,
      category: 'EVENT',
      startsOn: dayFromToday(offset),
      audience: 'ALL',
      ...extra,
    });
    const list: Json[] = [
      ev('Science exhibition', 2, { description: 'Class projects on display in the hall. Parents are welcome from 11 am.', startTime: '09:30', endTime: '13:00', announce: true }),
      ev('Sports Day practice', 3, { endsOn: dayFromToday(4), description: 'Practice for the races and the march past.', startTime: '14:00', endTime: '15:30' }),
      ev('Fancy dress: my favourite fruit', 12, { description: 'Nursery children come dressed as their favourite fruit.', audience: 'CLASSES', classIds: [classIdOf('Nursery')], startTime: '10:00', endTime: '11:30', announce: true }),
      ev('Staff training day', 15, { category: 'MEETING', audience: 'STAFF', description: 'Child safety refresher and first aid.', startTime: '15:30', endTime: '17:00' }),
      ev('Founders Day holiday', 19, { category: 'HOLIDAY', description: 'The school is closed.', announce: true }),
      ev('Parent-teacher meeting: Term 1', 20, { category: 'MEETING', description: 'Meet the class teachers and see the Term 1 progress.', startTime: '10:00', endTime: '13:00', announce: true }),
      ev('Junior KG-A class picnic', 25, { audience: 'DIVISIONS', divisionIds: [div('Junior KG-A').id], description: 'A short walk to the park next door, with snacks from home.', startTime: '09:30', endTime: '12:00' }),
      ev('Term 1 examinations', 29, { category: 'EXAM', endsOn: dayFromToday(33), description: 'Timetable is on the notice board. Exams start at 9 am.', startTime: '09:00', endTime: '11:30', announce: true }),
      ev('Inter-house sports day', 34, { description: 'Races, relay and march past. Parents invited.', startTime: '08:30', endTime: '12:30', announce: true }),
      ev('Winter concert', 40, { description: 'Songs and a short play by the senior classes.', startTime: '17:00', endTime: '19:00' }),
    ];
    for (const e of list) {
      if (haveEv.has(e.title)) {
        skipped.push(`event "${e.title}" exists`);
        continue;
      }
      const ok = await attempt(`event ${e.title}`, () => as(OFFICE).post('/calendar', e));
      if (ok) count('calendar events');
    }
  },
});

// ---- 6. student leave -------------------------------------------------------------------------------

SECTIONS.push({
  name: 'student-leave',
  async run() {
    const admin = as(PRINCIPAL);
    const plans: { login: string; from: number; to?: number; half?: boolean; reason: string; decide?: { by: string; approve: boolean; note?: string } }[] = [
      { login: 'ds0002', from: 3, to: 4, reason: 'Family wedding in Pune' },
      { login: 'ds0005', from: 5, half: true, reason: 'Dentist appointment in the morning' },
      { login: 'ds0003', from: 2, reason: 'Fever, the doctor advised rest', decide: { by: T1, approve: true, note: 'Get well soon.' } },
      { login: 'ds0004', from: 8, to: 9, reason: 'Cousin\'s birthday trip', decide: { by: T1, approve: false, note: 'Unit Test 1 is on those days. Please send him unless he is unwell.' } },
      { login: 'ds0031', from: 4, reason: 'Cold and cough' },
    ];
    const r = await admin.get('/student-leave?pageSize=100');
    const have = new Set((r.items as Json[]).map((x) => `${x.student.id}|${x.fromDate}`));
    for (const p of plans) {
      const st = await studentByLogin(p.login);
      const from = dayFromToday(p.from);
      if (have.has(`${st.id}|${from}`)) {
        skipped.push(`leave request for ${p.login} on ${from} exists`);
        continue;
      }
      const made = await attempt(`leave request ${p.login}`, () =>
        as(p.login).post('/student-leave', {
          studentId: st.id,
          fromDate: from,
          toDate: p.to ? dayFromToday(p.to) : from,
          halfDay: p.half ?? false,
          reason: p.reason,
        }),
      );
      if (!made) continue;
      count('student leave requests');
      if (p.decide) {
        const ok = await attempt(`decide leave ${p.login}`, () =>
          as(p.decide!.by).post(`/student-leave/${made.id}/decision`, { approve: p.decide!.approve, note: p.decide!.note }),
        );
        if (ok) count(p.decide.approve ? 'student leave approved' : 'student leave refused');
      }
    }
  },
});

// ---- 7. staff leave ---------------------------------------------------------------------------------

SECTIONS.push({
  name: 'staff-leave',
  async run() {
    const admin = as(PRINCIPAL);
    let types = (await admin.get('/leave/types')) as Json[];
    const wanted = [
      { name: 'Casual leave', days: 12, carryForwardDays: 3 },
      { name: 'Sick leave', days: 10, carryForwardDays: 2 },
    ];
    for (const w of wanted) {
      if (!types.some((t) => t.name === w.name)) {
        const ok = await attempt(`leave type ${w.name}`, () => admin.post('/leave/types', { name: w.name, carryForwardDays: w.carryForwardDays }));
        if (ok) count('leave kinds');
      }
    }
    types = (await admin.get('/leave/types')) as Json[];
    const ent = await admin.get('/leave/entitlements');
    const have = new Set((ent.items as Json[]).map((i) => i.leaveTypeId ?? i.leaveType?.id));
    const missing = wanted.filter((w) => {
      const t = types.find((x) => x.name === w.name);
      return t && !have.has(t.id);
    });
    if (missing.length) {
      const items = [
        ...(ent.items as Json[]).filter((i) => !i.staffTypeId && !i.staffType).map((i) => ({ leaveTypeId: i.leaveTypeId ?? i.leaveType?.id, days: Number(i.days) })),
        ...missing.map((w) => ({ leaveTypeId: types.find((x) => x.name === w.name)!.id, days: w.days })),
      ];
      const ok = await attempt('leave allowances', () => admin.put('/leave/entitlements', { academicYearId: ctx.yearId, items }));
      if (ok) count('leave allowances', missing.length);
    } else {
      skipped.push('leave allowances exist');
    }
    const casual = types.find((t) => t.name === 'Casual leave')?.id;
    const sick = types.find((t) => t.name === 'Sick leave')?.id;
    if (!casual || !sick) throw new Error('leave kinds are missing');

    const list = await admin.get('/leave/requests?pageSize=100');
    const haveReason = new Set((list.items as Json[]).map((x) => x.reason));
    const aditi = 'aditi.rao@demo.school';
    const staffId = (email: string) => ctx.staff.get(email)!.id;
    const jobs: { reason: string; run: () => Promise<Json> }[] = [
      {
        reason: 'Sister\'s wedding in Hyderabad',
        run: () => as(T1).post('/leave/requests', { leaveTypeId: casual, startsOn: dayFromToday(10), endsOn: dayFromToday(11), reason: 'Sister\'s wedding in Hyderabad' }),
      },
      {
        reason: 'Fever and rest on the doctor\'s advice',
        run: () => admin.post('/leave/requests', { leaveTypeId: sick, startsOn: dayFromToday(-3), reason: 'Fever and rest on the doctor\'s advice', staffId: staffId(T1) }),
      },
      {
        reason: 'Family function (applied, then withdrawn)',
        run: async () => {
          const r = await as(T1).post('/leave/requests', { leaveTypeId: casual, startsOn: dayFromToday(25), reason: 'Family function (applied, then withdrawn)' });
          await as(T1).post(`/leave/requests/${r.id}/cancel`, { note: 'Plans changed' });
          return r;
        },
      },
      {
        reason: 'Parent\'s medical check-up',
        run: () => as(aditi).post('/leave/requests', { leaveTypeId: casual, startsOn: dayFromToday(15), reason: 'Parent\'s medical check-up' }),
      },
      {
        reason: 'Viral fever, doctor\'s note attached at school',
        run: async () => {
          const r = await as(aditi).post('/leave/requests', { leaveTypeId: sick, startsOn: dayFromToday(2), reason: 'Viral fever, doctor\'s note attached at school' });
          await admin.post(`/leave/requests/${r.id}/decision`, { decision: 'APPROVED', note: 'Approved. Take rest.' });
          return r;
        },
      },
    ];
    for (const j of jobs) {
      if (haveReason.has(j.reason)) {
        skipped.push(`staff leave "${j.reason}" exists`);
        continue;
      }
      const ok = await attempt(`staff leave ${j.reason}`, j.run);
      if (ok) count('staff leave requests');
    }
  },
});

// ---- 8. messages ------------------------------------------------------------------------------------

SECTIONS.push({
  name: 'messages',
  async run() {
    const admin = as(PRINCIPAL);
    const teacherUser = async (student: string, email: string): Promise<string | null> => {
      const c = await as(student).get('/messages/contacts?as=family&pageSize=50');
      const wantedName = ctx.staff.get(email)?.name;
      const hit = (c.items as Json[]).find((i) => i.teacherName === wantedName);
      return hit?.teacherUserId ?? ctx.staff.get(email)?.userId ?? null;
    };
    const subjectsOf = async (login: string) => {
      const r = await as(login).get('/messages?pageSize=100');
      return new Map((r.items as Json[]).map((c) => [c.subject as string, c]));
    };
    const png = await tinyPng(77);

    // [student login, teacher email, subject, family message, what happens next]
    const plans = [
      { id: 'A', student: 'ds0002', teacher: T1, subject: 'Question about the trace homework', body: 'Good morning Ma\'am, should Yusuf trace the letters in pencil or with a crayon?', reply: 'Good morning! A soft pencil please. He can colour the letters afterwards if he likes.', read: true },
      { id: 'B', student: 'ds0005', teacher: SEEMA, subject: 'Hindi notebook', body: 'Ma\'am, Vivaan forgot his Hindi notebook at school on Friday. Can he collect it on Monday?', reply: 'Yes, I have kept it in the staff room. He can take it from me in the morning.', read: false },
      { id: 'C', student: 'ds0003', teacher: T1, subject: 'Absent last Friday', body: 'Diya had a fever on Friday and could not come. Could you please share what was taught?', read: false },
      { id: 'D', student: 'ds0005', teacher: T1, subject: 'Photo of my drawing', body: 'Here is the picture Vivaan drew for the family tree homework.', image: true, reply: 'Lovely drawing! I will put it on the board.', read: true },
      { id: 'E', student: 'ds0004', teacher: T1, subject: 'Uniform size', body: 'Rayan needs a bigger uniform. Where can we exchange it?', close: 'Handled at the school office.', read: false },
    ];
    for (const p of plans) {
      const mine = await subjectsOf(p.student);
      if (mine.has(p.subject)) {
        skipped.push(`conversation "${p.subject}" exists`);
        continue;
      }
      const tuid = await teacherUser(p.student, p.teacher);
      if (!tuid) {
        refused.push(`conversation ${p.id}: no teacher user for ${p.teacher}`);
        continue;
      }
      const st = as(p.student);
      let fileIds: string[] | undefined;
      if (p.image) {
        const fid = await attempt('message image', () => st.upload('message-attachment', png, 'drawing.png', 'image/png'));
        if (fid) fileIds = [fid];
      }
      const started = await attempt(`conversation ${p.id}`, () =>
        st.post('/messages', { teacherUserId: tuid, subject: p.subject, body: p.body, ...(fileIds ? { fileIds } : {}) }),
      );
      if (!started) continue;
      const cid = started.conversation.id as string;
      count('conversations');
      count('messages', 1);
      if (p.reply) {
        await attempt(`reply ${p.id}`, async () => {
          const t = as(p.teacher);
          await t.get(`/messages/${cid}`);
          await t.post(`/messages/${cid}/messages`, { body: p.reply });
        });
        count('messages', 1);
      }
      if (p.read) await attempt(`read ${p.id}`, async () => {
        await st.get(`/messages/${cid}`);
        await st.post(`/messages/${cid}/read`);
      });
      if (p.close) {
        const ok = await attempt(`close ${p.id}`, () => admin.post(`/messages/${cid}/close`, { reason: p.close }));
        if (ok) count('conversations closed');
      }
    }

    // A teacher starts one: the family has it unread.
    const subject = 'Please sign the reading log';
    const mine = await subjectsOf('ds0006');
    if (mine.has(subject)) {
      skipped.push(`conversation "${subject}" exists`);
    } else {
      const st = await studentByLogin('ds0006');
      const ok = await attempt('teacher-started conversation', () =>
        as(T1).post('/messages', { studentId: st.id, subject, body: 'Hello! Please sign the reading log in Ayaan\'s bag every evening this week.' }),
      );
      if (ok) {
        count('conversations');
        count('messages', 1);
      }
    }
  },
});

// ---- 9. fees ----------------------------------------------------------------------------------------

SECTIONS.push({
  name: 'fees',
  async run() {
    const acc = as(ACCOUNTS);
    for (const [login, amount] of [['ds0005', '6000.00'], ['ds0002', '4000.00']] as const) {
      const st = await studentByLogin(login);
      const ledger = await acc.get(`/students/${st.id}/fees`);
      const paid = Number(ledger.totals?.paid ?? 0);
      const overdue = (ledger.invoices as Json[]).some((i) => (i.instalments as Json[]).some((n) => n.overdue && Number(n.pending) > 0));
      if (paid > 0) {
        skipped.push(`${login} already has a payment (${ledger.totals.paid} paid)`);
      } else {
        const ok = await attempt(`payment for ${login}`, () =>
          acc.post(`/students/${st.id}/payments`, { amount, mode: 'CASH', paidOn: dayFromToday(-3), note: 'Part payment of Term 1 (demo)' }),
        );
        if (ok) count('part payments');
      }
      if (!overdue) refused.push(`${login} has no overdue instalment (nothing to add through the API)`);
    }
  },
});

// ---------------------------------------------------------------- run

async function main() {
  log(`Demo app data -> ${API}`);
  await discover();
  log(`Year ${ctx.yearName}: ${ctx.divisions.length} divisions, ${ctx.staff.size} staff logins`);
  for (const s of SECTIONS) {
    if (ONLY && !ONLY.includes(s.name)) continue;
    log(`\n== ${s.name}`);
    try {
      await s.run();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      refused.push(`section ${s.name} -> ${m}`);
      log(`   ! section stopped: ${m}`);
    }
  }
  log('\n== Summary');
  for (const [k, v] of Object.entries(created)) log(`   created  ${k.padEnd(28)} ${v}`);
  for (const s of skipped) log(`   skipped  ${s}`);
  for (const r of refused) log(`   REFUSED  ${r}`);
  if (!ONLY) await totals().catch((e) => log(`   (totals not available: ${e instanceof Error ? e.message : e})`));
  printLogins();
}

/** What the school now holds, read back from the API (not only what this run created). */
async function totals() {
  const p = as(PRINCIPAL);
  const pages = async (path: string) => {
    const out: Json[] = [];
    for (let page = 1; ; page++) {
      const r = await p.get(`${path}${path.includes('?') ? '&' : '?'}pageSize=100&page=${page}`);
      out.push(...(r.items as Json[]));
      if (page * r.pageSize >= r.total) break;
    }
    return out;
  };
  const homework = await pages('/homework?status=all');
  let handIns = 0;
  let marked = 0;
  for (const h of homework) {
    if (!h.handIn) continue;
    const r = await p.get(`/homework/${h.id}/hand-ins`);
    handIns += r.counts.handedIn;
    marked += r.counts.marked;
  }
  const tests = await pages('/assessments?status=all');
  let marks = 0;
  for (const t of tests) {
    const d = await p.get(`/assessments/${t.id}`);
    marks += (d.students as Json[]).filter((s) => s.marks !== null || s.absent).length;
  }
  const published = tests.filter((t) => t.publishedAt || t.published).length;
  const notices = await pages('/notices?status=all');
  const events = await p.get('/calendar?from=2026-11-01&to=2027-03-31');
  const sl = await p.get('/student-leave?pageSize=1');
  const staffLeave = await p.get('/leave/requests?pageSize=1');
  const convs = await p.get('/messages?all=true&pageSize=1');
  let entries = 0;
  for (const d of ctx.divisions) {
    const v = await p.get(`/timetable/divisions/${d.id}?weekOf=${iso(addDays(TODAY, 1))}`);
    entries += (v.cells as Json[]).length;
  }
  log('\n== Totals now in the school');
  const rows: [string, string | number][] = [
    ['homework', homework.length],
    ['hand-ins (all homework)', handIns],
    ['hand-ins marked', marked],
    ['tests', tests.length],
    ['tests published', published],
    ['marks entered', marks],
    ['notices', notices.length],
    ['calendar events (Nov to Mar)', (events as Json[]).length],
    ['student leave requests', `${sl.total}  ${JSON.stringify(sl.counts)}`],
    ['staff leave requests', staffLeave.total],
    ['conversations', convs.total],
    ['timetable lessons (one week)', entries],
  ];
  for (const [k, v] of rows) log(`   ${k.padEnd(30)} ${v}`);
}

function printLogins() {
  log(`
== Ready-to-use demo logins (password ${PASSWORD})
   Students (sign in with the admission number):
     ds0002 Yusuf   Nursery-A  handed in 2 pieces, one marked; leave request waiting; message thread with the class teacher
     ds0005 Vivaan  Nursery-A  one piece sent back to redo; fees part-paid with an overdue instalment; unread Hindi reply
     ds0003 Diya    Nursery-A  approved leave next Tuesday; a message waiting for the teacher
     ds0004 Rayan   Nursery-A  refused leave request; closed message thread
     ds0006 Ayaan   Nursery-A  an unread message from the class teacher
     ds0031 Reyansh Junior KG-A  marked work, leave request waiting
     ds0034 Tanish  Junior KG-B  marked and waiting hand-ins
   Teachers:
     teacher@demo.school         Farzana, class teacher of Nursery-A (English, Mathematics, EVS): homework to mark, tests, unread family message
     seema.tiwari@demo.school    Hindi in every division
     sunita.deshpande@demo.school  class teacher of Junior KG-A
     anwar.hussain@demo.school   class teacher of Junior KG-B
     mohammed.rafiq@demo.school  class teacher of Std. I-A
     principal@demo.school       administrator: timetable, daily changes, attendance for any day, messages (read only)
     office@demo.school          notices and calendar`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
