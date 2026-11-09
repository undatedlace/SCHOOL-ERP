import { AttendanceRoster } from '../../core/models';
import { changes, draftsFrom, isLow, percentText, unmarkedCount } from './attendance-utils';

const roster = (): AttendanceRoster => ({
  date: '2026-11-08',
  academicYear: { id: 'y', name: '2026-27' },
  division: { id: 'd', name: 'A', class: { id: 'c', name: 'Std 1' } },
  canMark: true,
  marked: true,
  markedBy: 'Asha Rao',
  markedAt: null,
  counts: {} as AttendanceRoster['counts'],
  students: [
    { studentId: 'a', admissionNo: '1', name: 'A', rollNo: 1, status: 'PRESENT', note: null },
    { studentId: 'b', admissionNo: '2', name: 'B', rollNo: 2, status: 'ABSENT', note: 'Fever' },
    { studentId: 'c', admissionNo: '3', name: 'C', rollNo: 3, status: null, note: null },
  ],
});

describe('attendance utils', () => {
  it('starts from what is saved and sends nothing until something changes', () => {
    const r = roster();
    expect(changes(r, draftsFrom(r))).toEqual([]);
    expect(unmarkedCount(r, draftsFrom(r))).toBe(1);
  });

  it('sends only the students whose mark or note changed', () => {
    const r = roster();
    const d = draftsFrom(r);
    d['a'].status = 'LATE';
    d['c'].status = 'PRESENT';
    d['b'].note = ' Fever and cough ';
    expect(changes(r, d)).toEqual([
      { studentId: 'a', status: 'LATE' },
      { studentId: 'b', status: 'ABSENT', note: 'Fever and cough' },
      { studentId: 'c', status: 'PRESENT' },
    ]);
  });

  it('never sends a student with no mark', () => {
    const r = roster();
    const d = draftsFrom(r);
    d['a'].status = null;
    expect(changes(r, d)).toEqual([]);
  });

  it('shows percentages and flags low ones', () => {
    expect(percentText({ percent: 92.5 })).toBe('92.5%');
    expect(percentText({ percent: null })).toBe('-');
    expect(isLow({ percent: 74.9 })).toBe(true);
    expect(isLow({ percent: 75 })).toBe(false);
    expect(isLow({ percent: null })).toBe(false);
  });
});
