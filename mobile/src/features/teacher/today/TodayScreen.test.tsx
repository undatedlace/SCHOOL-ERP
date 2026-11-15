import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TodayScreen } from './TodayScreen';
import type { TeacherWeek } from './teacherDay';

const mockPush = jest.fn();
const mockPost = jest.fn();
const mockQueries: Record<string, unknown> = {};
const mockHomework = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }) }));
jest.mock('@/auth', () => ({
  useAuth: () => ({ active: { id: 'u', fullName: 'Farzana Sultana' } }),
  useActiveAccountId: () => 'u',
}));
jest.mock('@/api', () => ({
  ...jest.requireActual('@/api/errors'),
  api: { post: (...args: unknown[]) => mockPost(...args) },
  useApiQuery: (path: string) => {
    const data = mockQueries[path];
    return { data, isLoading: false, isFetching: false, isError: false, isRefetching: false, error: null, refetch: jest.fn() };
  },
}));
jest.mock('../homework/useTeacherHomework', () => ({ useTeacherHomework: () => mockHomework() }));
jest.mock('@/lib/dates', () => ({
  ...jest.requireActual('@/lib/dates'),
  todayIST: () => '2026-11-16',
  minutesNowIST: () => 9 * 60,
}));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const Providers = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    <SafeAreaProvider initialMetrics={metrics}>{children}</SafeAreaProvider>
  </QueryClientProvider>
);

const ME = { id: 'me', fullName: 'Farzana Sultana' };
const week = (holiday: string | null = null): TeacherWeek => ({
  academicYear: { id: 'y', name: '2026-27' },
  today: '2026-11-16',
  weekOf: '2026-11-16',
  days: [{ date: '2026-11-16', weekday: 1, name: 'Monday', holiday }],
  staff: ME,
  rows: [
    { key: 'a', kind: 'PERIOD', label: 'Period 1', startsAt: '08:45', endsAt: '09:20', days: [1] },
    { key: 'b', kind: 'PERIOD', label: 'Period 2', startsAt: '09:20', endsAt: '09:55', days: [1] },
  ],
  cells: [
    { id: '1', rowKey: 'a', slotId: 's', weekday: 1, subject: { id: 'e', name: 'English' }, staff: ME, room: 'Room 1', division: { id: 'dn', label: 'Nursery-A' } },
    { id: '2', rowKey: 'b', slotId: 's', weekday: 1, subject: { id: 'm', name: 'Maths' }, staff: ME, room: 'Room 1', division: { id: 'dn', label: 'Nursery-A' } },
  ],
  changes: [],
  periodsPerWeek: 2,
});

const leaveRequest = {
  id: 'lr1',
  student: { id: 's2', name: 'Diya Iyer', className: 'Nursery', divisionName: 'A' },
  fromDate: '2026-11-17',
  toDate: '2026-11-18',
  halfDay: false,
  days: 2,
  reason: 'Wedding in the family',
  status: 'PENDING',
  requestedBy: null,
  decidedBy: null,
  decidedAt: null,
  decisionNote: null,
  withdrawnAt: null,
  createdAt: '2026-11-15T08:00:00.000Z',
  canWithdraw: false,
  canDecide: true,
};

beforeEach(() => {
  mockPush.mockReset();
  mockPost.mockReset().mockResolvedValue({});
  for (const k of Object.keys(mockQueries)) delete mockQueries[k];
  mockQueries['/timetable/mine'] = week();
  mockQueries['/attendance/overview'] = {
    date: '2026-11-16',
    divisions: [{ id: 'dn', name: 'A', class: { id: 'c', name: 'Nursery' }, enrolled: 10, marked: 0, counts: { present: 0, absent: 0, late: 0, onLeave: 0 }, done: false }],
  };
  mockQueries['/student-leave'] = { items: [leaveRequest], total: 1, page: 1, pageSize: 50, counts: { PENDING: 1, APPROVED: 0, REFUSED: 0, WITHDRAWN: 0 } };
  mockQueries['/messages/unread-count'] = { unread: 0, unreadMessages: 0 };
  mockQueries['/messages'] = { items: [], total: 0, page: 1, pageSize: 3 };
  mockQueries['/calendar'] = [
    { id: 'e1', title: 'Staff meeting', description: null, category: 'MEETING', startsOn: '2026-11-17', endsOn: '2026-11-17', startTime: '15:30', endTime: '16:30', audience: 'STAFF' },
  ];
  mockHomework.mockReturnValue({
    items: [],
    stats: new Map(),
    rostersLoading: false,
    isLoading: false,
    isError: false,
    error: null,
    isRefetching: false,
    refetch: jest.fn(),
  });
});

describe('TodayScreen', () => {
  it('shows the day: lessons with a Register button, the leave waiting, and the next event', async () => {
    await render(<TodayScreen />, { wrapper: Providers });
    expect(screen.getByText('Lessons today')).toBeTruthy();
    expect(screen.getByLabelText(/^Lessons today: 2/)).toBeTruthy();
    expect(screen.getAllByText(/Nursery-A/).length).toBeGreaterThan(0);

    await fireEvent.press(screen.getByTestId('register-a'));
    expect(mockPush).toHaveBeenCalledWith('/teacher/attendance/dn?date=2026-11-16');

    expect(screen.getByText('Leave waiting for you')).toBeTruthy();
    expect(screen.getByText('Diya Iyer')).toBeTruthy();
    expect(screen.getByText('Staff meeting')).toBeTruthy();
    expect(screen.getByText('No unread messages.')).toBeTruthy();
  });

  it('asks before approving leave, then sends the decision', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.text === 'Approve')?.onPress?.();
    });
    await render(<TodayScreen />, { wrapper: Providers });
    await fireEvent.press(screen.getByTestId('approve-lr1'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/student-leave/lr1/decision', { approve: true }));
    alert.mockRestore();
  });

  it('needs a reason to refuse leave', async () => {
    await render(<TodayScreen />, { wrapper: Providers });
    await fireEvent.press(screen.getByTestId('refuse-lr1'));
    await fireEvent.press(screen.getByTestId('refuse-send'));
    expect(screen.getByText('Say why the leave is not approved.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('refuse-note'), 'Exam on those days');
    await fireEvent.press(screen.getByTestId('refuse-send'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/student-leave/lr1/decision', { approve: false, note: 'Exam on those days' }));
  });

  it('says there is no school on a holiday', async () => {
    mockQueries['/timetable/mine'] = week('Diwali');
    await render(<TodayScreen />, { wrapper: Providers });
    expect(screen.getAllByText('No school today').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Diwali').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('register-a')).toBeNull();
  });

  it('lists the marking queue, oldest due day first, and opens a task', async () => {
    const hw = (id: string, dueOn: string) => ({
      id,
      title: `Task ${id}`,
      dueOn,
      createdAt: '2026-11-10T08:00:00.000Z',
      divisions: [{ id: 'dn', label: 'Nursery-A' }],
      subject: null,
    });
    mockHomework.mockReturnValue({
      items: [hw('late', '2026-11-20'), hw('early', '2026-11-12')],
      stats: new Map([
        ['late', { students: 24, handedIn: 4, toMark: 1, marked: 3, redo: 0 }],
        ['early', { students: 24, handedIn: 24, toMark: 9, marked: 15, redo: 0 }],
      ]),
      rostersLoading: false,
      isLoading: false,
      isError: false,
      error: null,
      isRefetching: false,
      refetch: jest.fn(),
    });
    await render(<TodayScreen />, { wrapper: Providers });
    expect(screen.getByLabelText(/^Awaiting marking: 10/)).toBeTruthy();
    expect(screen.getByText('9 to mark')).toBeTruthy();
    expect(screen.getByText('15 of 24 marked')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('queue-early'));
    expect(mockPush).toHaveBeenCalledWith('/teacher/homework/early');
  });
});
