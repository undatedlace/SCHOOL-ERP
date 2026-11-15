import { fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { Timeline } from '@/features/timetable/Timeline';
import { planTeacherDay, registerHref, type TeacherWeek } from './teacherDay';

const ME = { id: 'me', fullName: 'Farzana Sultana' };
const week: TeacherWeek = {
  academicYear: { id: 'y', name: '2026-27' },
  today: '2026-11-16',
  weekOf: '2026-11-16',
  days: [{ date: '2026-11-16', weekday: 1, name: 'Monday', holiday: null }],
  staff: ME,
  rows: [
    { key: 'a', kind: 'PERIOD', label: 'Period 1', startsAt: '08:45', endsAt: '09:20', days: [1] },
    { key: 'b', kind: 'PERIOD', label: 'Period 2', startsAt: '09:20', endsAt: '09:55', days: [1] },
    { key: 'c', kind: 'PERIOD', label: 'Period 3', startsAt: '09:55', endsAt: '10:30', days: [1] },
  ],
  cells: [
    { id: '1', rowKey: 'a', slotId: 's', weekday: 1, subject: { id: 'e', name: 'English' }, staff: ME, room: 'Room 1', division: { id: 'dn', label: 'Nursery-A' } },
    { id: '2', rowKey: 'b', slotId: 's', weekday: 1, subject: { id: 'v', name: 'EVS' }, staff: ME, room: 'Room 1', division: { id: 'dn', label: 'Nursery-A' } },
  ],
  changes: [
    { id: 'c1', date: '2026-11-16', rowKey: 'b', slotId: 's', kind: 'SUBSTITUTE', division: { id: 'dn', label: 'Nursery-A' }, substitute: { id: 'x', fullName: 'Ravi Kumar' }, subject: null, reason: null },
    { id: 'c2', date: '2026-11-16', rowKey: 'c', slotId: 's', kind: 'SUBSTITUTE', division: { id: 'dj', label: 'Junior KG-B' }, substitute: ME, subject: { id: 'm', name: 'Maths' }, reason: null },
  ],
  periodsPerWeek: 2,
};

describe('Timeline for a teacher', () => {
  it('names the class, marks a covered period, and puts the action on lessons', async () => {
    const plan = planTeacherDay(week, '2026-11-16');
    const onRegister = jest.fn();
    await render(
      <Timeline
        plan={plan}
        today="2026-11-16"
        nowMin={8 * 60}
        renderAction={(row) => {
          const href = registerHref(row, '2026-11-16');
          return href && !row.coveredByOther ? (
            <Pressable testID={`register-${row.key}`} onPress={() => onRegister(href)}>
              <Text>Register</Text>
            </Pressable>
          ) : null;
        }}
      />,
    );
    expect(screen.getAllByText(/Nursery-A/).length).toBeGreaterThan(0);
    expect(screen.getByText('Covering')).toBeTruthy();
    expect(screen.getByText(/Covered by: Ravi Kumar/)).toBeTruthy();

    await fireEvent.press(screen.getByTestId('register-a'));
    expect(onRegister).toHaveBeenCalledWith('/teacher/attendance/dn?date=2026-11-16');
    // The period another teacher takes has no Register button.
    expect(screen.queryByTestId('register-b')).toBeNull();
    // The period the teacher covers does.
    await fireEvent.press(screen.getByTestId('register-c'));
    expect(onRegister).toHaveBeenLastCalledWith('/teacher/attendance/dj?date=2026-11-16');
  });
});
