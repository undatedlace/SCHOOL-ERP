import { dueText, endOfWeek, feesSummary, homeworkDueThisWeek, isToDo, upcomingEvents, type CalendarEvent, type HomeworkItem } from './homeLogic';

const hw = (id: string, dueOn: string | null, status?: 'SUBMITTED' | 'REVIEWED' | 'REDO'): HomeworkItem => ({
  id,
  title: `HW ${id}`,
  subject: null,
  dueOn,
  overdue: false,
  children: [{ studentId: 's', submission: status ? { status } : null }],
});

const TODAY = '2026-11-12'; // a Thursday; the week ends on Sunday 15 Nov

describe('homework due this week', () => {
  it('ends the week on Sunday', () => {
    expect(endOfWeek(TODAY)).toBe('2026-11-15');
    expect(endOfWeek('2026-11-15')).toBe('2026-11-15');
  });

  it('keeps work still to do that is due today to Sunday, soonest first', () => {
    const list = homeworkDueThisWeek(
      [
        hw('late', '2026-11-14'),
        hw('today', '2026-11-12'),
        hw('next-week', '2026-11-16'),
        hw('past', '2026-11-11'),
        hw('none', null),
        hw('done', '2026-11-13', 'SUBMITTED'),
        hw('marked', '2026-11-13', 'REVIEWED'),
        hw('redo', '2026-11-13', 'REDO'),
      ],
      TODAY,
    );
    expect(list.map((h) => h.id)).toEqual(['today', 'redo', 'late']);
  });

  it('counts sent-back work as to do, and handed-in work as not', () => {
    expect(isToDo(hw('a', TODAY, 'REDO'))).toBe(true);
    expect(isToDo(hw('b', TODAY, 'SUBMITTED'))).toBe(false);
    expect(isToDo(hw('c', TODAY))).toBe(true);
  });

  it('words the due day', () => {
    expect(dueText('2026-11-12', TODAY)).toBe('Due today');
    expect(dueText('2026-11-13', TODAY)).toBe('Due tomorrow');
    expect(dueText('2026-11-14', TODAY)).toBe('Due Sat, 14 Nov');
    expect(dueText(null, TODAY)).toBe('No due day');
  });
});

describe('feesSummary', () => {
  const ledger = {
    totals: { gross: '30000.00', concessions: '0.00', paid: '10000.00', pending: '20000.00' },
    invoices: [
      {
        instalments: [
          { pending: '0.00', overdue: false, dueDate: '2026-04-10' },
          { pending: '5000.50', overdue: true, dueDate: '2026-09-10' },
          { pending: '7500.00', overdue: true, dueDate: '2026-07-10' },
          { pending: '7499.50', overdue: false, dueDate: '2027-01-10' },
        ],
      },
    ],
  };

  it('adds up what is owed and what is overdue in paise, and finds the oldest overdue day', () => {
    expect(feesSummary(ledger)).toEqual({ pendingPaise: 2_000_000, overduePaise: 1_250_050, oldestOverdueOn: '2026-07-10' });
  });

  it('is zero when nothing is owed', () => {
    expect(feesSummary({ totals: { gross: '0.00', concessions: '0.00', paid: '0.00', pending: '0.00' }, invoices: [] })).toEqual({
      pendingPaise: 0,
      overduePaise: 0,
      oldestOverdueOn: null,
    });
  });
});

describe('upcomingEvents', () => {
  const ev = (id: string, startsOn: string, endsOn: string, startTime: string | null = null): CalendarEvent => ({
    id,
    title: id,
    category: 'EVENT',
    startsOn,
    endsOn,
    startTime,
    endTime: null,
  });

  it('drops events that have ended and orders by the first day left, then time', () => {
    const list = upcomingEvents(
      [ev('over', '2026-11-01', '2026-11-11'), ev('later', '2026-11-20', '2026-11-20'), ev('running', '2026-11-10', '2026-11-13'), ev('pm', '2026-11-14', '2026-11-14', '14:00'), ev('am', '2026-11-14', '2026-11-14', '09:00')],
      TODAY,
      3,
    );
    expect(list.map((e) => e.id)).toEqual(['running', 'am', 'pm']);
  });
});
