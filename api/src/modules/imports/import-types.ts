import type ExcelJS from 'exceljs';
import type { AuthContext } from '../../common/auth-context.js';
import type { ImportKind } from '../../generated/prisma/enums.js';
import type { RowValues } from './workbook.js';

/** How a kind appears in the address: /api/imports/admissions/template. */
export const KIND_BY_SLUG: Record<string, ImportKind> = {
  admissions: 'ADMISSIONS',
  fees: 'FEES',
  'student-attendance': 'STUDENT_ATTENDANCE',
  'staff-attendance': 'STAFF_ATTENDANCE',
};

export const SLUG_BY_KIND = Object.fromEntries(
  Object.entries(KIND_BY_SLUG).map(([slug, kind]) => [kind, slug]),
) as Record<ImportKind, string>;

export interface RowOutcome {
  status: 'IMPORTED' | 'FAILED';
  message?: string;
  /** What was made, so the screen can link to it. */
  ref?: { type: 'application' | 'student'; id: string };
}

/** One row of an uploaded file, after checking. Stored in the batch as JSON. */
export interface CheckedRow {
  sheet: string;
  rowNumber: number;
  /** Who or what the row is about, for people: "Aarav Shah (form 12)". */
  label: string;
  /** Exactly what the row said, to hand it back in the "rows to fix" file. */
  values: RowValues;
  errors: string[];
  warnings: string[];
  /** Nothing to do: the app already holds exactly this. */
  unchanged?: boolean;
  /** What the import needs to act on the row, already checked and converted. */
  data?: unknown;
  outcome?: RowOutcome;
}

export interface CheckResult {
  /** What the file was made for, kept with the batch (and used to rebuild the template). */
  params: Record<string, unknown>;
  rows: CheckedRow[];
}

export interface Template {
  fileName: string;
  workbook: ExcelJS.Workbook;
}

/**
 * One kind of import. The service handles everything shared (the batch, permissions, the file,
 * running once only); a handler knows its own template, checks and how to write a row.
 */
export interface ImportHandler {
  kind: ImportKind;
  /** Needed, all of them, to download the template, upload and import. */
  permissions: string[];
  /** The template comes filled in with rows from the app (a register), rather than empty. */
  prefilled?: boolean;
  /** Builds the template. `input` comes from the query string or from a stored batch's params. */
  template(
    auth: AuthContext,
    input: Record<string, unknown>,
  ): Promise<Template>;
  check(
    auth: AuthContext,
    workbook: ExcelJS.Workbook,
    params: Record<string, unknown>,
  ): Promise<CheckResult>;
  /**
   * Imports the rows that passed the check (no errors, not unchanged), setting `outcome` on each.
   * A row that fails must not stop the others.
   */
  run(
    auth: AuthContext,
    batch: { id: string; params: Record<string, unknown> },
    rows: CheckedRow[],
  ): Promise<void>;
}

export const IMPORT_HANDLERS = Symbol('IMPORT_HANDLERS');

/** The error text of anything thrown while writing a row, as a person should read it. */
export function messageOf(error: unknown): string {
  if (error && typeof error === 'object') {
    const e = error as {
      getResponse?: () => unknown;
      message?: string;
      code?: string;
    };
    if (typeof e.getResponse === 'function') {
      const r = e.getResponse();
      if (typeof r === 'string') return r;
      if (r && typeof r === 'object' && 'message' in r) {
        const m = (r as { message: unknown }).message;
        return Array.isArray(m) ? m.join('; ') : String(m);
      }
    }
    if (e.code === 'P2002')
      return 'This clashes with something already saved (a number used twice?)';
    if (e.message) return e.message;
  }
  return 'Could not be imported';
}
