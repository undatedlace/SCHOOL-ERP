import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RegisterScreen } from './RegisterScreen';
import type { Roster } from './rosterLogic';

const mockPut = jest.fn();
const mockQueries: Record<string, unknown> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  usePreventRemove: jest.fn(),
}));

jest.mock('@/api', () => ({
  ...jest.requireActual('@/api/errors'),
  api: { put: (...args: unknown[]) => mockPut(...args) },
  useApiQuery: (path: string) => {
    const data = mockQueries[path];
    return { data, isLoading: false, isFetching: false, isError: false, isRefetching: false, error: null, refetch: jest.fn(async () => ({ data })) };
  },
}));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const Providers = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    <SafeAreaProvider initialMetrics={metrics}>{children}</SafeAreaProvider>
  </QueryClientProvider>
);

const roster = (date: string, canMark = true): Roster => ({
  date,
  division: { id: 'd1', name: 'A', class: { id: 'c1', name: 'Nursery' } },
  canMark,
  marked: false,
  markedBy: null,
  markedAt: null,
  students: [
    { studentId: 's1', admissionNo: 'DS0001', name: 'Ayaan Khan', rollNo: 1, status: null, note: null, approvedLeave: null, suggestedStatus: null },
    { studentId: 's2', admissionNo: 'DS0002', name: 'Diya Iyer', rollNo: 2, status: null, note: null, approvedLeave: { requestId: 'r', halfDay: false }, suggestedStatus: 'ON_LEAVE' },
    { studentId: 's3', admissionNo: 'DS0003', name: 'Rayan Ansari', rollNo: 3, status: null, note: null, approvedLeave: null, suggestedStatus: null },
  ],
});

beforeEach(() => {
  mockPut.mockReset();
  mockQueries['/attendance/divisions'] = [{ id: 'd1', name: 'A', class: { id: 'c1', name: 'Nursery' }, canMark: true }];
  mockQueries['/attendance/divisions/d1'] = roster('2026-11-13');
});

describe('RegisterScreen', () => {
  it('marks the blanks present, keeps the pre-selected leave, and saves only what was marked', async () => {
    mockPut.mockImplementation(async (_path: string, body: { entries: { studentId: string; status: string }[] }) => {
      const saved = roster('2026-11-13');
      saved.marked = true;
      for (const e of body.entries) saved.students.find((s) => s.studentId === e.studentId)!.status = e.status as never;
      return saved;
    });
    await render(<RegisterScreen divisionId="d1" date="2026-11-13" />, { wrapper: Providers });

    // The leave the school approved is already chosen.
    expect(screen.getByText(/Leave approved/)).toBeTruthy();
    expect(screen.getByTestId('mark-s2-ON_LEAVE').props.accessibilityState).toMatchObject({ selected: true });

    await fireEvent.press(screen.getByTestId('mark-all-present'));
    expect(screen.getByTestId('mark-s1-PRESENT').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId('mark-s2-ON_LEAVE').props.accessibilityState).toMatchObject({ selected: true });

    await fireEvent.press(screen.getByTestId('mark-s3-ABSENT'));
    expect(screen.getByText('Save attendance (3)')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('save-attendance'));
    await waitFor(() => expect(mockPut).toHaveBeenCalled());
    expect(mockPut).toHaveBeenCalledWith('/attendance/divisions/d1', {
      date: '2026-11-13',
      entries: [
        { studentId: 's1', status: 'PRESENT' },
        { studentId: 's2', status: 'ON_LEAVE', note: 'Leave approved' },
        { studentId: 's3', status: 'ABSENT' },
      ],
    });
    await waitFor(() => expect(screen.getByText('Saved.')).toBeTruthy());
  });

  it('shows the API\'s words when a save is refused', async () => {
    const { ApiError } = jest.requireActual('@/api/errors');
    mockPut.mockRejectedValue(new ApiError(403, 'forbidden', 'Attendance older than 7 days can only be changed by the school admin', 'x'));
    await render(<RegisterScreen divisionId="d1" date="2026-11-13" />, { wrapper: Providers });
    await fireEvent.press(screen.getByTestId('mark-s1-LATE'));
    await fireEvent.press(screen.getByTestId('save-attendance'));
    await waitFor(() => expect(screen.getByTestId('save-error')).toBeTruthy());
    expect(screen.getByTestId('save-error').props.children).toMatch(/older than 7 days/);
  });

  it('is read only when the API says the day cannot be changed', async () => {
    mockQueries['/attendance/divisions/d1'] = roster('2026-11-13', false);
    await render(<RegisterScreen divisionId="d1" date="2026-11-13" />, { wrapper: Providers });
    expect(screen.getByTestId('read-only')).toBeTruthy();
    expect(screen.queryByTestId('save-attendance')).toBeNull();
    expect(screen.queryByTestId('mark-all-present')).toBeNull();
  });
});
