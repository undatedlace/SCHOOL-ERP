import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert, type AlertButton } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MyLeaveScreen } from './MyLeaveScreen';
import type { LeaveRequest } from './staffLeaveLogic';

const mockPush = jest.fn();
const mockPost = jest.fn();
const mockQueries: Record<string, unknown> = {};
let mockItems: LeaveRequest[] = [];

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }) }));
jest.mock('@/api', () => ({
  ...jest.requireActual('@/api/errors'),
  api: { post: (...args: unknown[]) => mockPost(...args) },
  useApiQuery: (path: string) => {
    const data = mockQueries[path];
    return { data, isLoading: false, isFetching: false, isError: false, isRefetching: false, error: null, refetch: jest.fn() };
  },
}));
jest.mock('@/features/paging/usePagedList', () => ({
  usePagedList: () => ({
    items: mockItems,
    total: mockItems.length,
    isLoading: false,
    isError: false,
    error: null,
    isRefetching: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    refetch: jest.fn(),
    fetchNextPage: jest.fn(),
  }),
}));
jest.mock('@/lib/dates', () => ({ ...jest.requireActual('@/lib/dates'), todayIST: () => '2026-11-16' }));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const Providers = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    <SafeAreaProvider initialMetrics={metrics}>{children}</SafeAreaProvider>
  </QueryClientProvider>
);

const request = (id: string, status: LeaveRequest['status'], startsOn: string, extra: Partial<LeaveRequest> = {}): LeaveRequest => ({
  id,
  leaveType: { id: 'cl', name: 'Casual leave' },
  startsOn,
  endsOn: startsOn,
  halfDay: false,
  days: 1,
  reason: 'Family function',
  status,
  decisionNote: null,
  createdAt: '2026-11-10T08:00:00.000Z',
  mine: true,
  ...extra,
});

beforeEach(() => {
  mockPush.mockReset();
  mockPost.mockReset().mockResolvedValue({});
  mockItems = [];
  mockQueries['/leave/balance'] = {
    staff: { id: 's', name: 'Farzana Sultana' },
    academicYear: { id: 'y', name: '2026-27' },
    balances: [
      { leaveType: { id: 'cl', name: 'Casual leave', unlimited: false }, entitled: 12, carriedOver: 3, taken: 2, upcoming: 1, pending: 2, remaining: 10 },
      { leaveType: { id: 'ul', name: 'Unpaid leave', unlimited: true }, entitled: 0, carriedOver: 0, taken: 0, upcoming: 0, pending: 0, remaining: null },
    ],
  };
});

describe('MyLeaveScreen', () => {
  it('writes the balance of each kind in words', async () => {
    await render(<MyLeaveScreen />, { wrapper: Providers });
    expect(screen.getByTestId('balance-cl').props.accessibilityLabel).toBe(
      'Casual leave: 10 days left. Allowed 12, carried over 3, taken 2, coming up 1, waiting 2.',
    );
    expect(screen.getByTestId('balance-ul').props.accessibilityLabel).toBe('Unpaid leave: no yearly limit. Taken 0 days.');
    expect(screen.getByText('Carried over')).toBeTruthy();
  });

  it('opens the form from the Ask button', async () => {
    await render(<MyLeaveScreen />, { wrapper: Providers });
    await fireEvent.press(screen.getByTestId('ask-leave'));
    expect(mockPush).toHaveBeenCalledWith('/teacher/my-leave/new');
  });

  it('shows each request with its status as a word, the school\'s note, and Withdraw only where allowed', async () => {
    mockItems = [
      request('wait', 'PENDING', '2026-12-07'),
      request('soon', 'APPROVED', '2026-11-20'),
      request('past', 'APPROVED', '2026-11-10'),
      request('no', 'REJECTED', '2026-11-25', { decisionNote: 'Exams that week' }),
      request('gone', 'CANCELLED', '2026-11-26'),
    ];
    await render(<MyLeaveScreen />, { wrapper: Providers });
    expect(within(screen.getByTestId('request-wait')).getByText('Waiting')).toBeTruthy();
    expect(within(screen.getByTestId('request-soon')).getByText('Approved')).toBeTruthy();
    expect(within(screen.getByTestId('request-no')).getByText('Not approved')).toBeTruthy();
    expect(within(screen.getByTestId('request-gone')).getByText('Withdrawn')).toBeTruthy();
    expect(screen.getByText('From the school: Exams that week')).toBeTruthy();
    expect(screen.getByTestId('withdraw-wait')).toBeTruthy();
    expect(screen.getByTestId('withdraw-soon')).toBeTruthy();
    expect(screen.queryByTestId('withdraw-past')).toBeNull();
    expect(screen.queryByTestId('withdraw-no')).toBeNull();
    expect(screen.queryByTestId('withdraw-gone')).toBeNull();
  });

  it('asks before withdrawing, then withdraws', async () => {
    mockItems = [request('wait', 'PENDING', '2026-12-07')];
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<MyLeaveScreen />, { wrapper: Providers });
    await fireEvent.press(screen.getByTestId('withdraw-wait'));
    expect(alert).toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0]![2] as AlertButton[];
    await act(async () => {
      await buttons.find((b) => b.text === 'Withdraw')!.onPress!();
    });
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/leave/requests/wait/cancel', {}));
    alert.mockRestore();
  });

  it('shows the API\'s words when a withdrawal is refused', async () => {
    const { ApiError } = jest.requireActual('@/api/errors');
    mockPost.mockRejectedValue(new ApiError(400, 'validation', 'Leave that has started can only be withdrawn by an administrator'));
    mockItems = [request('soon', 'APPROVED', '2026-11-20')];
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<MyLeaveScreen />, { wrapper: Providers });
    await fireEvent.press(screen.getByTestId('withdraw-soon'));
    const buttons = alert.mock.calls[0]![2] as AlertButton[];
    await act(async () => {
      await buttons.find((b) => b.text === 'Withdraw')!.onPress!();
    });
    await waitFor(() => expect(screen.getByTestId('withdraw-error').props.children).toBe('Leave that has started can only be withdrawn by an administrator'));
    alert.mockRestore();
  });
});
