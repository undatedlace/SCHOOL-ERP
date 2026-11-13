/**
 * The shape every import template shares, so one reader works for all of them:
 *
 *   - a visible "How to fill" sheet first;
 *   - data sheets where row 1 holds hidden column keys, row 2 the headings people read, and data
 *     starts on row 3 (headings can be reworded or reordered by the school and nothing breaks);
 *   - a hidden "About" sheet saying what the file was made for (kind, school, year, form version);
 *   - a hidden "Lists" sheet feeding the drop-downs.
 */

import ExcelJS from 'exceljs';
import { BadRequestException } from '@nestjs/common';
import { Plain, plain } from './cells.js';

export const KEY_ROW = 1;
export const HEADER_ROW = 2;
export const FIRST_DATA_ROW = 3;
/** Drop-downs and formats are laid down this far, so rows typed in later still get them. */
export const PREPARED_ROWS = 1000;
/** The most rows one file may carry (all data sheets together). */
export const MAX_ROWS = 2000;

const ABOUT = 'About';
const LISTS = 'Lists';
export const HOW_TO = 'How to fill';
const FORMAT = 1;

/** Colours used by every template (Excel wants ARGB). */
export const COLOURS = {
  heading: 'FF0F4C5C', // deep teal, as in the app
  headingText: 'FFFFFFFF',
  required: 'FFB45309', // amber
  given: 'FFF1F5F9', // grey: filled in by the app, do not change
  closed: 'FFE2E8F0', // a day that cannot be marked
  error: 'FFFEE2E2',
};

export interface About {
  kind: string;
  schoolId: string;
  params: Record<string, unknown>;
}

export interface Column {
  key: string;
  header: string;
  width?: number;
  /** A comment on the heading cell: what to write here. */
  note?: string;
  required?: boolean;
  /** Filled in by the app (names, admission numbers): shown grey. */
  given?: boolean;
  /** A drop-down: a reference made by `Lists.add`. */
  list?: string;
  /** How the cell should look in Excel. */
  format?: 'date' | 'text' | 'money';
}

/** Plain values by column key, one object per data row. */
export type RowValues = Record<string, Plain>;

export interface ReadRow {
  sheet: string;
  /** The row number as Excel shows it, for messages ("row 14"). */
  rowNumber: number;
  values: RowValues;
}

export interface ReadTable {
  sheet: string;
  keys: string[];
  rows: ReadRow[];
}

export function newWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'School ERP';
  wb.created = new Date();
  return wb;
}

/** The first sheet: plain sentences on how to fill the file in. */
export function addHowTo(wb: ExcelJS.Workbook, title: string, lines: string[]) {
  const ws = wb.addWorksheet(HOW_TO, {
    properties: { tabColor: { argb: COLOURS.heading } },
  });
  ws.getColumn(1).width = 110;
  const head = ws.getCell('A1');
  head.value = title;
  head.font = { bold: true, size: 14, color: { argb: COLOURS.heading } };
  lines.forEach((line, i) => {
    const cell = ws.getCell(`A${i + 3}`);
    cell.value = line;
    cell.alignment = { wrapText: true, vertical: 'top' };
    if (line.endsWith(':')) cell.font = { bold: true };
  });
  return ws;
}

export function writeAbout(wb: ExcelJS.Workbook, about: About) {
  const ws = wb.addWorksheet(ABOUT, { state: 'veryHidden' });
  ws.addRow(['format', FORMAT]);
  ws.addRow(['kind', about.kind]);
  ws.addRow(['school', about.schoolId]);
  ws.addRow(['params', JSON.stringify(about.params)]);
}

/** What the file says it was made for, or a clear refusal if it is not one of our templates. */
export function readAbout(wb: ExcelJS.Workbook): About {
  const ws = wb.getWorksheet(ABOUT);
  const notOurs = new BadRequestException(
    'This is not an import template from this app. Download the template, fill it in and upload that file.',
  );
  if (!ws) throw notOurs;
  const map = new Map<string, Plain>();
  ws.eachRow((row) => {
    map.set(String(plain(row.getCell(1).value)), plain(row.getCell(2).value));
  });
  if (map.get('format') !== FORMAT) throw notOurs;
  const kind = map.get('kind');
  const schoolId = map.get('school');
  const rawParams = map.get('params');
  if (typeof kind !== 'string' || typeof schoolId !== 'string') throw notOurs;
  let params: Record<string, unknown> = {};
  try {
    params = JSON.parse(String(rawParams ?? '{}')) as Record<string, unknown>;
  } catch {
    throw notOurs;
  }
  return { kind, schoolId, params };
}

/** The hidden sheet behind the drop-downs. Each list is one column. */
export class Lists {
  private readonly ws: ExcelJS.Worksheet;
  private next = 1;
  private readonly made = new Map<string, string>();

  constructor(wb: ExcelJS.Workbook) {
    this.ws = wb.addWorksheet(LISTS, { state: 'veryHidden' });
  }

  /** Adds a list (once per name) and returns the reference a drop-down points at. */
  add(name: string, values: string[]): string | undefined {
    if (values.length === 0) return undefined;
    const known = this.made.get(name);
    if (known) return known;
    const col = this.ws.getColumn(this.next++);
    col.values = [name, ...values];
    const letter = col.letter;
    const ref = `${LISTS}!$${letter}$2:$${letter}$${values.length + 1}`;
    this.made.set(name, ref);
    return ref;
  }
}

type RangeValidations = {
  dataValidations: { add(range: string, v: ExcelJS.DataValidation): void };
};

/**
 * A data sheet: hidden keys in row 1, headings in row 2, then the given rows. Drop-downs,
 * date formats and grey "given" columns are laid down to `PREPARED_ROWS` so new rows get them too.
 */
export function addTable(
  wb: ExcelJS.Workbook,
  name: string,
  columns: Column[],
  rows: RowValues[],
  opts: { prepared?: number; freezeColumns?: number } = {},
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name, {
    views: [
      {
        state: 'frozen',
        ySplit: HEADER_ROW,
        xSplit: opts.freezeColumns ?? 0,
      },
    ],
  });
  const keyRow = ws.getRow(KEY_ROW);
  const headRow = ws.getRow(HEADER_ROW);
  keyRow.hidden = true;
  headRow.height = 32;
  const last =
    FIRST_DATA_ROW - 1 + Math.max(opts.prepared ?? PREPARED_ROWS, rows.length);

  columns.forEach((c, i) => {
    const n = i + 1;
    const col = ws.getColumn(n);
    col.width = c.width ?? Math.min(Math.max(c.header.length + 4, 12), 40);
    keyRow.getCell(n).value = c.key;
    const head = headRow.getCell(n);
    head.value = c.required ? `${c.header} *` : c.header;
    head.font = { bold: true, color: { argb: COLOURS.headingText } };
    head.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: c.given ? 'FF475569' : COLOURS.heading },
    };
    head.alignment = { wrapText: true, vertical: 'middle' };
    if (c.note) head.note = c.note;

    const letter = col.letter;
    const range = `${letter}${FIRST_DATA_ROW}:${letter}${last}`;
    if (c.list) {
      // exceljs supports ranges here, though its type definitions leave the property out.
      (ws as unknown as RangeValidations).dataValidations.add(range, {
        type: 'list',
        allowBlank: true,
        formulae: [c.list],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: c.header,
        error: 'Choose one of the options in the list.',
      });
    }
    if (c.format === 'date') col.numFmt = 'dd/mm/yyyy';
    if (c.format === 'text') col.numFmt = '@';
    if (c.format === 'money') col.numFmt = '#,##0.00';
  });

  rows.forEach((values, i) => {
    const row = ws.getRow(FIRST_DATA_ROW + i);
    columns.forEach((c, j) => {
      const v = values[c.key];
      const cell = row.getCell(j + 1);
      if (v !== undefined && v !== null) {
        cell.value =
          c.format === 'date' &&
          typeof v === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(v)
            ? new Date(`${v}T00:00:00.000Z`)
            : v;
      }
      if (c.given) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: COLOURS.given },
        };
      }
    });
  });
  return ws;
}

/** Shades one cell (a closed day, an error). */
export function shade(cell: ExcelJS.Cell, argb: string) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

const SKIP = new Set([ABOUT, LISTS, HOW_TO]);

/**
 * Every data sheet as rows of plain values by column key. Completely empty rows are skipped,
 * and so are columns whose key row is blank (a column the school added for its own notes).
 */
export function readTables(wb: ExcelJS.Workbook): ReadTable[] {
  const out: ReadTable[] = [];
  wb.eachSheet((ws) => {
    if (SKIP.has(ws.name)) return;
    const keys: (string | null)[] = [];
    ws.getRow(KEY_ROW).eachCell({ includeEmpty: true }, (cell, n) => {
      const k = plain(cell.value);
      keys[n] = typeof k === 'string' ? k : null;
    });
    if (!keys.some(Boolean)) return;
    const rows: ReadRow[] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber < FIRST_DATA_ROW) return;
      const values: RowValues = {};
      let any = false;
      row.eachCell({ includeEmpty: false }, (cell, n) => {
        const key = keys[n];
        if (!key) return;
        const v = plain(cell.value);
        values[key] = v;
        if (v !== null) any = true;
      });
      if (any) rows.push({ sheet: ws.name, rowNumber, values });
    });
    out.push({
      sheet: ws.name,
      keys: keys.filter((k): k is string => !!k),
      rows,
    });
  });
  const total = out.reduce((n, t) => n + t.rows.length, 0);
  if (total > MAX_ROWS) {
    throw new BadRequestException(
      `This file has ${total} rows. Split it into files of at most ${MAX_ROWS} rows.`,
    );
  }
  return out;
}

/** Loads an uploaded file, refusing anything that is not a real .xlsx workbook. */
export async function loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  // An .xlsx file is a zip: it starts with "PK".
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new BadRequestException(
      'Upload the Excel file (.xlsx). Old .xls files and CSV are not accepted: open it in Excel and "Save as" .xlsx.',
    );
  }
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new BadRequestException(
      'This Excel file could not be opened. Is it damaged?',
    );
  }
  return wb;
}

/**
 * Writes rows back into a fresh copy of a template, replacing whatever data rows it had, with
 * an "Error" column at the end. Used for "download the rows that need fixing".
 */
export function rewriteRows(
  ws: ExcelJS.Worksheet,
  rows: { rowNumber: number; values: RowValues; problem: string }[],
  opts: { inPlace?: boolean } = {},
) {
  const keys: (string | null)[] = [];
  ws.getRow(KEY_ROW).eachCell({ includeEmpty: true }, (cell, n) => {
    const k = plain(cell.value);
    keys[n] = typeof k === 'string' ? k : null;
  });
  const errorCol = keys.length; // keys is 1-based, so length is one past the last column
  // A list template starts empty: clear it and write the rows from the top. A template filled in
  // by the app (a register, a fee sheet) keeps its rows, and the problem rows go back in place.
  if (!opts.inPlace) {
    for (let r = FIRST_DATA_ROW; r <= ws.rowCount; r++) {
      ws.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
        cell.value = null;
      });
    }
  }
  const head = ws.getRow(HEADER_ROW).getCell(errorCol);
  head.value = 'Error (delete this column or leave it: it is ignored)';
  head.font = { bold: true, color: { argb: 'FF991B1B' } };
  ws.getColumn(errorCol).width = 60;

  rows.forEach((r, i) => {
    const row = ws.getRow(opts.inPlace ? r.rowNumber : FIRST_DATA_ROW + i);
    keys.forEach((key, n) => {
      if (!key) return;
      const v = r.values[key];
      row.getCell(n).value = v ?? null;
    });
    const cell = row.getCell(errorCol);
    cell.value = r.problem;
    cell.alignment = { wrapText: true };
    shade(cell, COLOURS.error);
  });
}
