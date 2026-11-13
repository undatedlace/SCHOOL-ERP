/**
 * The monthly register both attendance templates share: people down the side, the days of the
 * month across, and a short mark in each box, the way the paper register is kept.
 */

import { BadRequestException } from '@nestjs/common';
import type ExcelJS from 'exceljs';
import {
  Status,
  addDays,
  isIsoDate,
  todayInIndia,
} from '../../attendance/attendance-rules.js';
import { Parsed, Plain, asText, isBlank } from '../cells.js';
import { COLOURS, Column, FIRST_DATA_ROW, Lists, shade } from '../workbook.js';

export const MARKS: Record<Status, string> = {
  PRESENT: 'P',
  ABSENT: 'A',
  LATE: 'L',
  ON_LEAVE: 'LV',
};

const READ: Record<string, Status> = {
  p: 'PRESENT',
  present: 'PRESENT',
  a: 'ABSENT',
  ab: 'ABSENT',
  absent: 'ABSENT',
  l: 'LATE',
  late: 'LATE',
  lv: 'ON_LEAVE',
  leave: 'ON_LEAVE',
  'on leave': 'ON_LEAVE',
};

/** A mark from a box: P, A, L or LV (also the words), any case. */
export function parseMark(
  v: Plain | undefined,
  day: string,
): Parsed<Status | null> {
  if (isBlank(v)) return { ok: true, value: null };
  const s = READ[asText(v).toLowerCase()];
  return s
    ? { ok: true, value: s }
    : {
        ok: false,
        error: `${showDay(day)}: "${asText(v)}" is not a mark (use P, A, L or LV)`,
      };
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "5 Jun" */
export const showDay = (iso: string) =>
  `${Number(iso.slice(8, 10))} ${MONTH_NAMES[Number(iso.slice(5, 7)) - 1]}`;
export const monthTitle = (month: string) =>
  `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

export const dayKey = (iso: string) => `d:${iso}`;
export const isDayKey = (key: string) => key.startsWith('d:');
export const dayOf = (key: string) => key.slice(2);
export const weekday = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).getUTCDay();

/** "2026-06" from the query, or this month in India. */
export function monthParam(raw: unknown): string {
  const month =
    typeof raw === 'string' && raw ? raw : todayInIndia().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month) || !isIsoDate(`${month}-01`))
    throw new BadRequestException('month must be YYYY-MM');
  if (`${month}-01` > todayInIndia())
    throw new BadRequestException(
      'Attendance cannot be filled in for a month that has not started',
    );
  return month;
}

/** Every day of a month, "YYYY-MM-DD". */
export function monthDays(month: string): string[] {
  const days: string[] = [];
  for (let d = `${month}-01`; d.startsWith(month); d = addDays(d, 1))
    days.push(d);
  return days;
}

/** The columns of a register: who (given) and one narrow column per day. */
export function registerColumns(
  who: Column[],
  days: string[],
  lists: Lists,
): Column[] {
  const marks = lists.add('Marks', Object.values(MARKS));
  return [
    ...who,
    ...days.map((d) => ({
      key: dayKey(d),
      header: `${Number(d.slice(8, 10))}\n${DAY_NAMES[weekday(d)]}`,
      width: 5,
      list: marks,
    })),
  ];
}

/**
 * Shades the boxes that cannot be marked (before joining, after leaving, future days) and, more
 * lightly, Sundays and school holidays, so the sheet reads like the paper register.
 */
export function shadeRegister(
  ws: ExcelJS.Worksheet,
  columns: Column[],
  rows: number,
  closed: (row: number, day: string) => boolean,
  restDays: Set<string>,
) {
  const today = todayInIndia();
  columns.forEach((c, i) => {
    if (!isDayKey(c.key)) return;
    const day = dayOf(c.key);
    const col = i + 1;
    const head = ws.getRow(2).getCell(col);
    head.alignment = {
      wrapText: true,
      horizontal: 'center',
      vertical: 'middle',
    };
    if (weekday(day) === 0 || restDays.has(day))
      head.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF64748B' },
      };
    for (let r = 0; r < rows; r++) {
      const cell = ws.getRow(FIRST_DATA_ROW + r).getCell(col);
      cell.alignment = { horizontal: 'center' };
      if (day > today || closed(r, day)) shade(cell, COLOURS.closed);
      else if (weekday(day) === 0 || restDays.has(day))
        shade(cell, COLOURS.given);
    }
  });
}
