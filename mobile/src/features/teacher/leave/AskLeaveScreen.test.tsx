import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AskLeaveScreen } from './AskLeaveScreen';

const mockBack = jest.fn();
const mockPost = jest.fn();
const mockQueries: Record<string, unknown> = {};

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: mockBack }) }));
jest.mock('@/api', () => ({
  ...jest.requireActual('@/api/errors'),
  api: { post: (...args: unknown[]) => mockPost(...args) },
  useApiQuery: (path: string) => {
    const data = mockQueries[path];
    return { data, isLoading: false, isFetching: false, isError: false, isRefetching: false, error: null, refetch: jest.fn() };
  },
}));
// A Monday, so no test depends on the day it runs.
jest.mock('@/lib/dates', () => ({ ...jest.requireActual('@/lib/dates'), todayIST: () => '2026-11-16' }));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const Providers = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    <SafeAreaProvider initialMetrics={metrics}>{children}</SafeAreaProvider>
  </QueryClientProvider>
);

const row = (id: string, name: string, remaining: number | null, entitled = 12) => ({
  leaveType: { id, name, unlimited: remaining === null },
  entitled,
  carriedOver: 0,
  taken: 0,
  upcoming: 0,
  pending: 0,
  remaining,
});

beforeEach(() => {
  mockBack.mockReset();
  mockPost.mockReset().mockResolvedValue({ id: 'r1' });
  mockQueries['/leave/types'] = [
    { id: 'cl', name: 'Casual leave', unlimited: false, active: true, carryForwardDays: 0 },
    { id: 'sl', name: 'Sick leave', unlimited: false, active: true, carryForwardDays: 0 },
  ];
  mockQueries['/leave/balance'] = {
    staff: { id: 's', name: 'Farzana Sultana' },
    academicYear: { id: 'y', name: '2026-27' },
    balances: [row('cl', 'Casual leave', 10), row('sl', 'Sick leave', 8, 8)],
  };
  mockQueries['/leave/requests'] = {
    items: [{ id: 'old', leaveType: { id: 'cl', name: 'Casual leave' }, startsOn: '2026-11-30', endsOn: '2026-11-30', halfDay: false, days: 1, reason: 'x', status: 'PENDING', decisionNote: null, createdAt: '', mine: true }],
    total: 1,
    page: 1,
    pageSize: 100,
  };
  mockQueries['/calendar'] = [];
});

async function pickDay(boxId: string, day: string) {
  await fireEvent.press(screen.getByTestId(boxId));
  await fireEvent.press(screen.getByTestId(`day-${day}`));
}

describe('AskLeaveScreen', () => {
  it('shows what is left of the chosen kind', async () => {
    await render(<AskLeaveScreen />, { wrapper: Providers });
    await fireEvent.press(screen.getByLabelText('Casual leave'));
    expect(screen.getByTestId('kind-balance').props.children).toBe('Casual leave: 10 days left this year.');
    await fireEvent.press(screen.getByLabelText('Sick leave'));
    expect(screen.getByTestId('kind-balance').props.children).toBe('Sick leave: 8 days left this year.');
  });

  it('says what is missing and sends nothing', async () => {
    await render(<AskLeaveScreen />, { wrapper: Providers });
    await fireEvent.press(screen.getByTestId('leave-send'));
    expect(screen.getByText('Choose a kind of leave')).toBeTruthy();
    expect(screen.getByText('Choose the first day')).toBeTruthy();
    expect(screen.getByText('Give a reason')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('counts the days as the school does, leaving Sundays out', async () => {
    await render(<AskLeaveScreen />, { wrapper: Providers });
    await pickDay('leave-from', '2026-11-20');
    await pickDay('leave-to', '2026-11-23');
    expect(screen.getByText('3 days; a Sunday not counted')).toBeTruthy();
  });

  it('warns, but does not block, when more is asked than is left', async () => {
    await render(<AskLeaveScreen />, { wrapper: Providers });
    await fireEvent.press(screen.getByLabelText('Casual leave'));
    await pickDay('leave-from', '2026-11-17');
    await pickDay('leave-to', '2026-11-29');
    expect(screen.getByText('Only 10 days of casual leave are left, and this asks for 11 days. The school may still refuse it.')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('leave-reason'), 'Family wedding');
    await fireEvent.press(screen.getByTestId('leave-send'));
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
  });

  it('refuses to send a day that is only a Sunday, and a clash with leave already asked for', async () => {
    await render(<AskLeaveScreen />, { wrapper: Providers });
    await fireEvent.press(screen.getByLabelText('Casual leave'));
    await fireEvent.changeText(screen.getByTestId('leave-reason'), 'Rest');
    await pickDay('leave-from', '2026-11-22');
    await fireEvent.press(screen.getByTestId('leave-send'));
    expect(screen.getAllByText(/Sundays or school holidays/).length).toBeGreaterThan(0);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('only allows a half day for a single day', async () => {
    await render(<AskLeaveScreen />, { wrapper: Providers });
    await pickDay('leave-from', '2026-11-17');
    await fireEvent(screen.getByTestId('leave-half'), 'valueChange', true);
    expect(screen.getByText('Half a day')).toBeTruthy();
    await pickDay('leave-to', '2026-11-18');
    expect(screen.getByText('2 days')).toBeTruthy();
    expect(screen.getByTestId('leave-half').props.disabled).toBe(true);
  });

  it('sends a single day with a reason and goes back', async () => {
    await render(<AskLeaveScreen />, { wrapper: Providers });
    await fireEvent.press(screen.getByLabelText('Sick leave'));
    await pickDay('leave-from', '2026-11-17');
    await fireEvent.changeText(screen.getByTestId('leave-reason'), '  Fever  ');
    await fireEvent.press(screen.getByTestId('leave-send'));
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost).toHaveBeenCalledWith('/leave/requests', { leaveTypeId: 'sl', startsOn: '2026-11-17', reason: 'Fever' });
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('sends a half day', async () => {
    await render(<AskLeaveScreen />, { wrapper: Providers });
    await fireEvent.press(screen.getByLabelText('Casual leave'));
    await pickDay('leave-from', '2026-11-18');
    await fireEvent(screen.getByTestId('leave-half'), 'valueChange', true);
    await fireEvent.changeText(screen.getByTestId('leave-reason'), 'Doctor');
    await fireEvent.press(screen.getByTestId('leave-send'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/leave/requests', { leaveTypeId: 'cl', startsOn: '2026-11-18', halfDay: true, reason: 'Doctor' }));
  });

  it('shows the school\'s own message when it refuses', async () => {
    const { ApiError } = jest.requireActual('@/api/errors');
    mockPost.mockRejectedValue(new ApiError(409, 'conflict', 'There is already leave asked for or approved on some of those days'));
    await render(<AskLeaveScreen />, { wrapper: Providers });
    await fireEvent.press(screen.getByLabelText('Casual leave'));
    await pickDay('leave-from', '2026-11-25');
    await fireEvent.changeText(screen.getByTestId('leave-reason'), 'Trip');
    await fireEvent.press(screen.getByTestId('leave-send'));
    await waitFor(() => expect(screen.getByTestId('leave-failure').props.children).toBe('There is already leave asked for or approved on some of those days'));
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('warns about leave already asked for on the same days before sending', async () => {
    await render(<AskLeaveScreen />, { wrapper: Providers });
    await fireEvent.press(screen.getByLabelText('Casual leave'));
    await fireEvent.changeText(screen.getByTestId('leave-reason'), 'Trip');
    await pickDay('leave-from', '2026-11-30');
    await fireEvent.press(screen.getByTestId('leave-send'));
    expect(screen.getAllByText('There is already leave asked for or approved on some of those days').length).toBeGreaterThan(0);
    expect(mockPost).not.toHaveBeenCalled();
  });
});
