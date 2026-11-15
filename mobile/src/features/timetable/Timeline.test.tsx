import { render, screen } from '@testing-library/react-native';
import { Timeline } from './Timeline';
import { planDay } from './dayPlan';
import type { DivisionWeek } from './types';

const week: DivisionWeek = {
  today: '2026-11-10',
  weekOf: '2026-11-09',
  days: [{ date: '2026-11-10', weekday: 2, name: 'Tuesday', holiday: null }],
  division: { id: 'd', label: 'Nursery-A' },
  schedule: { id: 's', name: 'Pre-primary' },
  classTeacher: null,
  rows: [
    { key: 'p1', kind: 'PERIOD', label: 'Period 1', startsAt: '08:45', endsAt: '09:20', days: [2] },
    { key: 'p2', kind: 'PERIOD', label: 'Period 2', startsAt: '09:20', endsAt: '09:55', days: [2] },
    { key: 'brk', kind: 'BREAK', label: 'Snack break', startsAt: '09:55', endsAt: '10:15', days: [2] },
    { key: 'p3', kind: 'PERIOD', label: 'Period 3', startsAt: '10:15', endsAt: '10:50', days: [2] },
  ],
  cells: [
    { id: '1', rowKey: 'p1', weekday: 2, subject: { id: 'e', name: 'English' }, staff: { id: 't', fullName: 'Farzana' }, room: 'Room 1' },
    { id: '2', rowKey: 'p2', weekday: 2, subject: { id: 'm', name: 'Maths' }, staff: { id: 't', fullName: 'Farzana' }, room: 'Room 1' },
    { id: '3', rowKey: 'p3', weekday: 2, subject: { id: 'a', name: 'Art' }, staff: { id: 'z', fullName: 'Zoya' }, room: null },
  ],
  changes: [
    { id: 'c1', date: '2026-11-10', rowKey: 'p2', kind: 'SUBSTITUTE', substitute: { id: 'x', fullName: 'Meera' }, subject: null },
    { id: 'c2', date: '2026-11-10', rowKey: 'p3', kind: 'CANCELLED', substitute: null, subject: null },
  ],
};

const TODAY = '2026-11-10';

describe('Timeline', () => {
  it('shows the periods, a Now badge, the live line, a named substitute and a Cancelled badge', async () => {
    const plan = planDay(week, TODAY);
    await render(<Timeline plan={plan} today={TODAY} nowMin={9 * 60 + 30} />);
    expect(screen.getByText('English')).toBeTruthy();
    expect(screen.getByText('Maths')).toBeTruthy();
    expect(screen.getByText('Now')).toBeTruthy();
    expect(screen.getByText('Substitute: Meera')).toBeTruthy();
    expect(screen.getByText('Cancelled')).toBeTruthy();
    expect(screen.getByText(/Snack break/)).toBeTruthy();
    expect(screen.getByTestId('now-line')).toBeTruthy();
  });

  it('puts the live line between rows in a gap and omits it on another day', async () => {
    const plan = planDay(week, TODAY);
    const { rerender } = await render(<Timeline plan={plan} today={TODAY} nowMin={9 * 60 + 56} />);
    expect(screen.getByTestId('now-line')).toBeTruthy();
    await rerender(<Timeline plan={plan} today="2026-11-11" nowMin={9 * 60 + 30} />);
    expect(screen.queryByTestId('now-line')).toBeNull();
  });

  it('says there is no school on a Sunday and names a holiday', async () => {
    const sunday = planDay(week, '2026-11-15');
    const { rerender } = await render(<Timeline plan={sunday} today={TODAY} nowMin={600} />);
    expect(screen.getByText('No school today')).toBeTruthy();
    expect(screen.getByText('It is Sunday.')).toBeTruthy();
    const holiday = planDay({ ...week, days: [{ date: TODAY, weekday: 2, name: 'Tuesday', holiday: 'Diwali' }] }, TODAY);
    await rerender(<Timeline plan={holiday} today={TODAY} nowMin={600} />);
    expect(screen.getByText('Diwali')).toBeTruthy();
  });
});
