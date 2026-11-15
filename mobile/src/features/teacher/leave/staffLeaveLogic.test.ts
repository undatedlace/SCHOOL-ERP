import {
  balanceWarning,
  canWithdraw,
  daysText,
  effectiveEnd,
  emptyLeaveDraft,
  hasErrors,
  holidayDays,
  overlapProblem,
  previewLeave,
  previewSentence,
  requestBody,
  requestDates,
  startProblem,
  validateLeave,
  type BalanceRow,
  type LeaveDraft,
} from './staffLeaveLogic';

// 2026-11-15 is a Sunday; 16 Nov is a Monday.
const TODAY = '2026-11-16';

const casual: BalanceRow = {
  leaveType: { id: 'cl', name: 'Casual leave', unlimited: false },
  entitled: 12,
  carriedOver: 0,
  taken: 0,
  upcoming: 0,
  pending: 2,
  remaining: 10,
};

describe('daysText', () => {
  it('writes whole and half days', () => {
    expect(daysText(0.5)).toBe('Half a day');
    expect(daysText(1)).toBe('1 day');
    expect(daysText(2)).toBe('2 days');
    expect(daysText(1.5)).toBe('1½ days');
    expect(daysText(0)).toBe('0 days');
  });
});

describe('requestDates', () => {
  it('writes one day or a range, and marks a half day', () => {
    expect(requestDates({ startsOn: '2026-12-07', endsOn: '2026-12-07', halfDay: false })).toBe('Mon, 7 Dec');
    expect(requestDates({ startsOn: '2026-12-07', endsOn: '2026-12-09', halfDay: false })).toBe('7 Dec to 9 Dec');
    expect(requestDates({ startsOn: '2026-12-07', endsOn: '2026-12-07', halfDay: true })).toBe('Mon, 7 Dec (half day)');
  });
});

describe('previewLeave counts the way the API does', () => {
  it('counts working days and leaves out Sundays', () => {
    // Fri 20 Nov to Mon 23 Nov: Fri, Sat, (Sun), Mon.
    const p = previewLeave('2026-11-20', '2026-11-23', false);
    expect(p).toEqual({ days: 3, sundays: 1, holidays: 0, problem: null });
    expect(previewSentence(p)).toBe('3 days; a Sunday not counted');
  });

  it('leaves out school holidays too', () => {
    const p = previewLeave('2026-11-16', '2026-11-18', false, new Set(['2026-11-17']));
    expect(p).toMatchObject({ days: 2, holidays: 1 });
    expect(previewSentence(p)).toBe('2 days; 1 holiday not counted');
  });

  it('takes half a day for a single day', () => {
    expect(previewLeave('2026-11-16', '2026-11-16', true).days).toBe(0.5);
    expect(previewSentence(previewLeave('2026-11-16', '2026-11-16', true))).toBe('Half a day');
  });

  it('refuses what the API refuses, in the API\'s words', () => {
    expect(previewLeave('2026-11-17', '2026-11-16', false).problem).toBe('The last day cannot be before the first day');
    expect(previewLeave('2026-11-16', '2026-11-18', true).problem).toBe('A half day is for a single day');
    expect(previewLeave('2026-11-22', '2026-11-22', false).problem).toMatch(/Sundays or school holidays/);
    expect(previewLeave('2026-11-16', '2027-03-20', false).problem).toBe('A request can cover at most 120 days');
    expect(previewLeave('2026-11-16', '2027-03-16', false).problem).toBeNull();
  });

  it('refuses a request that is only holidays and Sundays', () => {
    const p = previewLeave('2026-11-21', '2026-11-22', false, new Set(['2026-11-21']));
    expect(p.problem).toMatch(/nothing to take leave for/);
    expect(p.days).toBe(0);
  });
});

describe('checks before sending', () => {
  it('does not let leave start in the past', () => {
    expect(startProblem('2026-11-15', TODAY)).toMatch(/past/);
    expect(startProblem(TODAY, TODAY)).toBeNull();
  });

  it('finds an overlap with waiting or approved leave only', () => {
    const requests = [
      { startsOn: '2026-12-07', endsOn: '2026-12-08', status: 'PENDING' as const },
      { startsOn: '2026-12-14', endsOn: '2026-12-14', status: 'CANCELLED' as const },
      { startsOn: '2026-12-21', endsOn: '2026-12-22', status: 'REJECTED' as const },
      { startsOn: '2026-12-28', endsOn: '2026-12-29', status: 'APPROVED' as const },
    ];
    expect(overlapProblem(requests, '2026-12-08', '2026-12-09')).toMatch(/already leave/);
    expect(overlapProblem(requests, '2026-12-29', '2026-12-30')).toMatch(/already leave/);
    expect(overlapProblem(requests, '2026-12-09', '2026-12-11')).toBeNull();
    expect(overlapProblem(requests, '2026-12-14', '2026-12-14')).toBeNull();
    expect(overlapProblem(requests, '2026-12-21', '2026-12-22')).toBeNull();
  });

  it('warns when more is asked than is left, and says so for a kind with no allowance', () => {
    expect(balanceWarning(casual, 10)).toBeNull();
    expect(balanceWarning(casual, 11)).toBe('Only 10 days of casual leave are left, and this asks for 11 days');
    expect(balanceWarning({ ...casual, remaining: 1 }, 2)).toBe('Only 1 day of casual leave is left, and this asks for 2 days');
    expect(balanceWarning({ ...casual, entitled: 0, remaining: 0 }, 1)).toBe('There is no casual leave allowance this year');
    expect(balanceWarning({ ...casual, remaining: null, leaveType: { ...casual.leaveType, unlimited: true } }, 400)).toBeNull();
    expect(balanceWarning(undefined, 5)).toBeNull();
  });

  it('lets a person withdraw waiting leave, and approved leave that has not started', () => {
    const base = { mine: true, startsOn: '2026-11-20' };
    expect(canWithdraw({ ...base, status: 'PENDING' }, TODAY)).toBe(true);
    expect(canWithdraw({ ...base, status: 'APPROVED' }, TODAY)).toBe(true);
    expect(canWithdraw({ ...base, status: 'APPROVED', startsOn: TODAY }, TODAY)).toBe(false);
    expect(canWithdraw({ ...base, status: 'APPROVED', startsOn: '2026-11-10' }, TODAY)).toBe(false);
    expect(canWithdraw({ ...base, status: 'REJECTED' }, TODAY)).toBe(false);
    expect(canWithdraw({ ...base, status: 'CANCELLED' }, TODAY)).toBe(false);
    expect(canWithdraw({ ...base, mine: false, status: 'PENDING' }, TODAY)).toBe(false);
  });
});

describe('the form', () => {
  const good: LeaveDraft = { leaveTypeId: 'cl', startsOn: '2026-12-07', endsOn: '2026-12-08', halfDay: false, reason: 'Family function' };

  it('asks for what is missing', () => {
    const e = validateLeave(emptyLeaveDraft(), TODAY, []);
    expect(e).toMatchObject({ leaveTypeId: 'Choose a kind of leave', startsOn: 'Choose the first day', reason: 'Give a reason' });
  });

  it('accepts a good request', () => {
    expect(hasErrors(validateLeave(good, TODAY, []))).toBe(false);
  });

  it('puts the last-day problem on the last day', () => {
    const e = validateLeave({ ...good, endsOn: '2026-12-01' }, TODAY, []);
    expect(e.endsOn).toBe('The last day cannot be before the first day');
  });

  it('catches the past, a half day over several days, an overlap and a Sunday', () => {
    expect(validateLeave({ ...good, startsOn: '2026-11-10', endsOn: '' }, TODAY, []).startsOn).toMatch(/past/);
    expect(validateLeave({ ...good, halfDay: true }, TODAY, []).startsOn).toBe('A half day is for a single day');
    expect(
      validateLeave(good, TODAY, [{ startsOn: '2026-12-08', endsOn: '2026-12-08', status: 'APPROVED' }]).startsOn,
    ).toMatch(/already leave/);
    expect(validateLeave({ ...good, startsOn: '2026-11-22', endsOn: '' }, TODAY, []).startsOn).toMatch(/Sundays or school holidays/);
  });

  it('counts a school holiday as no leave day', () => {
    const e = validateLeave({ ...good, startsOn: '2026-12-07', endsOn: '' }, TODAY, [], new Set(['2026-12-07']));
    expect(e.startsOn).toMatch(/nothing to take leave for/);
  });

  it('refuses a reason that is too short or too long', () => {
    expect(validateLeave({ ...good, reason: '  a ' }, TODAY, []).reason).toBe('Give a reason');
    expect(validateLeave({ ...good, reason: 'x'.repeat(301) }, TODAY, []).reason).toMatch(/under 300/);
  });

  it('treats no last day as a single day', () => {
    expect(effectiveEnd({ startsOn: '2026-12-07', endsOn: '' })).toBe('2026-12-07');
    expect(effectiveEnd(good)).toBe('2026-12-08');
  });

  it('builds the body, leaving out the last day and half day unless used', () => {
    expect(requestBody(good)).toEqual({ leaveTypeId: 'cl', startsOn: '2026-12-07', endsOn: '2026-12-08', reason: 'Family function' });
    expect(requestBody({ ...good, endsOn: '', halfDay: true, reason: '  Doctor  ' })).toEqual({
      leaveTypeId: 'cl',
      startsOn: '2026-12-07',
      halfDay: true,
      reason: 'Doctor',
    });
    expect(requestBody({ ...good, endsOn: good.startsOn })).not.toHaveProperty('endsOn');
  });
});

describe('holidayDays', () => {
  const ev = (category: string, audience: string, startsOn: string, endsOn: string) => ({ category, audience, startsOn, endsOn });

  it('takes holidays for everyone or for staff, cut to the range', () => {
    const days = holidayDays(
      [
        ev('HOLIDAY', 'ALL', '2026-12-24', '2026-12-26'),
        ev('HOLIDAY', 'STAFF', '2026-12-30', '2026-12-30'),
        ev('HOLIDAY', 'DIVISIONS', '2026-12-10', '2026-12-10'),
        ev('EVENT', 'ALL', '2026-12-11', '2026-12-11'),
      ],
      '2026-12-25',
      '2026-12-31',
    );
    expect([...days].sort()).toEqual(['2026-12-25', '2026-12-26', '2026-12-30']);
  });
});
