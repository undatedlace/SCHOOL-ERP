/**
 * Reading what people type into Excel. Pure functions, no database, so they are easy to test.
 *
 * A cell can hold text, a number, a date, true/false, a formula (we use its result), rich text
 * or a hyperlink. Everything here turns that into one plain value, or says plainly what is wrong.
 */

import { isIsoDate } from '../attendance/attendance-rules.js';

/** What a cell holds once the Excel wrapping is taken off. Stored in the batch and written back. */
export type Plain = string | number | boolean | null;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): Parsed<T> => ({ ok: true, value });
const fail = <T>(error: string): Parsed<T> => ({ ok: false, error });

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

/**
 * The plain value of an exceljs cell value. Dates become "YYYY-MM-DD" (Excel dates have no
 * time zone; exceljs reads them as midnight UTC). Blank text becomes null.
 */
export function plain(value: unknown): Plain {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : value.toISOString().slice(0, 10);
  }
  if (typeof value === 'string') {
    const t = value.trim();
    return t === '' ? null : t;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (isObj(value)) {
    if ('result' in value) return plain(value.result); // a formula
    if (Array.isArray(value.richText)) {
      return plain(
        (value.richText as { text?: string }[])
          .map((r) => r.text ?? '')
          .join(''),
      );
    }
    if ('text' in value) return plain(value.text); // a hyperlink
    if ('error' in value) return null; // #N/A and friends
  }
  return null;
}

/** A cell with nothing in it (or a column the file does not have). */
export const isBlank = (v: Plain | undefined): v is null | undefined | '' =>
  v === null || v === undefined || v === '';

/** The value as text, the way a person would read it (12 not "12.0"). */
export function asText(v: Plain | undefined): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v).trim();
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/** Excel counts days from 30 December 1899 (with its famous 1900 leap-year bug built in). */
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const iso = (y: number, m: number, d: number) =>
  `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** A two-digit year as a full one: 24 is 2024, 98 is 1998. */
const fullYear = (y: number) => (y >= 100 ? y : y <= 69 ? 2000 + y : 1900 + y);

/**
 * A date as "YYYY-MM-DD". Accepts an Excel date, an Excel day number, "2025-06-01", and the
 * Indian way of writing a date: day first ("01/06/2025", "1-6-25", "1.6.2025", "1 Jun 2025").
 * Never month first: 03/04/2025 is the 3rd of April.
 */
export function parseDate(
  v: Plain | undefined,
  label: string,
): Parsed<string | null> {
  if (isBlank(v)) return ok(null);
  if (typeof v === 'number') {
    if (!Number.isInteger(v) || v < 1 || v > 2958465)
      return fail(`${label}: "${v}" is not a date`);
    return ok(
      new Date(EXCEL_EPOCH_MS + v * 86400000).toISOString().slice(0, 10),
    );
  }
  if (typeof v !== 'string')
    return fail(`${label}: "${asText(v)}" is not a date`);
  const t = v.trim();

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  let out: string | null = null;
  if (m) out = iso(+m[1], +m[2], +m[3]);
  if (!out) {
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
    if (m) out = iso(fullYear(+m[3]), +m[2], +m[1]);
  }
  if (!out) {
    m = /^(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s,-]+(\d{2}|\d{4})$/.exec(t);
    const month = m ? MONTHS[m[2].slice(0, 3).toLowerCase()] : undefined;
    if (m && month) out = iso(fullYear(+m[3]), month, +m[1]);
  }
  if (!out || !isIsoDate(out))
    return fail(`${label}: "${t}" is not a date (write it as DD/MM/YYYY)`);
  return ok(out);
}

// ---------------------------------------------------------------------------
// Numbers, money, yes/no, phones, choices
// ---------------------------------------------------------------------------

export function parseNumber(
  v: Plain | undefined,
  label: string,
): Parsed<number | null> {
  if (isBlank(v)) return ok(null);
  if (typeof v === 'number') return ok(v);
  const t = asText(v).replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(t))
    return fail(`${label}: "${asText(v)}" is not a number`);
  return ok(Number(t));
}

/**
 * Rupees as text with at most two decimals ("1500.50"), for the fee ledger, which works in
 * whole paise and never in floating point. "₹ 1,500" and 1500 are both fine; 1500.555 is not.
 */
export function parseMoney(
  v: Plain | undefined,
  label: string,
): Parsed<string | null> {
  if (isBlank(v)) return ok(null);
  let text: string;
  if (typeof v === 'number') {
    if (v < 0) return fail(`${label} cannot be negative`);
    // Excel keeps 15 significant digits, so 1500.5 arrives as 1500.5, not 1500.4999.
    const paise = Math.round(v * 100);
    if (Math.abs(v * 100 - paise) > 1e-6)
      return fail(`${label}: use at most two decimals`);
    text = `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, '0')}`;
  } else {
    text = asText(v)
      .replace(/[₹,\s]/g, '')
      .replace(/^Rs\.?/i, '');
  }
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!m) return fail(`${label}: "${asText(v)}" is not an amount in rupees`);
  if (m[1]) return fail(`${label} cannot be negative`);
  return ok(`${m[2]}.${(m[3] ?? '').padEnd(2, '0')}`);
}

const YES = new Set(['yes', 'y', 'true', '1', 'ha', 'haan']);
const NO = new Set(['no', 'n', 'false', '0', 'nahi']);

export function parseYesNo(
  v: Plain | undefined,
  label: string,
): Parsed<boolean | null> {
  if (isBlank(v)) return ok(null);
  if (typeof v === 'boolean') return ok(v);
  const t = asText(v).toLowerCase();
  if (YES.has(t)) return ok(true);
  if (NO.has(t)) return ok(false);
  return fail(`${label}: write Yes or No`);
}

/**
 * A mobile number as the app stores it ("+919876543210" or "9876543210"). Excel often turns a
 * phone number into a number, which is fine; spaces, dashes and brackets are dropped.
 */
export function parseMobile(
  v: Plain | undefined,
  label: string,
): Parsed<string | null> {
  if (isBlank(v)) return ok(null);
  const raw = typeof v === 'number' ? String(Math.trunc(v)) : asText(v);
  const compact = raw.replace(/[\s()-]/g, '');
  if (!/^\+?[0-9]{10,15}$/.test(compact))
    return fail(`${label}: "${raw}" is not a mobile number`);
  return ok(compact);
}

export interface Choice {
  value: string;
  label: string;
}

/** Normalises for matching: case, extra spaces and the dash people type between class and division. */
export const matchKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/[\s–—-]+/g, ' ')
    .trim();

/** One of a list of choices, by its label or its stored value, ignoring case and spacing. */
export function parseChoice(
  v: Plain | undefined,
  choices: Choice[],
  label: string,
): Parsed<string | null> {
  if (isBlank(v)) return ok(null);
  const key = matchKey(asText(v));
  const hit =
    choices.find((c) => matchKey(c.label) === key) ??
    choices.find((c) => matchKey(c.value) === key);
  if (!hit) {
    const shown = choices
      .slice(0, 6)
      .map((c) => c.label)
      .join(', ');
    return fail(
      `${label}: "${asText(v)}" is not one of the choices (${shown}${choices.length > 6 ? ' …' : ''})`,
    );
  }
  return ok(hit.value);
}

/** Text with a length limit. Numbers typed into a text column (a form number, a pin code) are kept as typed. */
export function parseText(
  v: Plain | undefined,
  label: string,
  max = 500,
): Parsed<string | null> {
  if (isBlank(v)) return ok(null);
  const t = asText(v);
  if (t.length > max) return fail(`${label} must be at most ${max} characters`);
  return ok(t);
}
