import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NoticeFormScreen } from './NoticeFormScreen';

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockPost = jest.fn();
const mockPatch = jest.fn();
const mockQueries: Record<string, unknown> = {};

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: mockBack }) }));
jest.mock('@/api', () => ({
  ...jest.requireActual('@/api/errors'),
  api: { post: (...args: unknown[]) => mockPost(...args), patch: (...args: unknown[]) => mockPatch(...args) },
  useApiQuery: (path: string) => {
    const data = mockQueries[path];
    return { data, isLoading: false, isFetching: false, isError: false, isRefetching: false, error: null, refetch: jest.fn() };
  },
}));
jest.mock('@/lib/dates', () => ({ ...jest.requireActual('@/lib/dates'), todayIST: () => '2026-11-16' }));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const Providers = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    <SafeAreaProvider initialMetrics={metrics}>{children}</SafeAreaProvider>
  </QueryClientProvider>
);

beforeEach(() => {
  mockReplace.mockReset();
  mockBack.mockReset();
  mockPost.mockReset().mockResolvedValue({ id: 'n-new' });
  mockPatch.mockReset().mockResolvedValue({});
  mockQueries['/notices/audiences'] = {
    canAddressAnyone: false,
    classes: [],
    divisions: [
      { id: 'dn', classId: 'c1', label: 'Nursery-A' },
      { id: 'dj', classId: 'c2', label: 'Junior KG-A' },
    ],
  };
  mockQueries['/notices/n1'] = {
    id: 'n1',
    title: 'Sports day',
    body: 'Bring your kit.',
    audience: 'DIVISIONS',
    classes: [],
    divisions: [{ id: 'dn', label: 'Nursery-A' }],
    createdBy: { id: 'u', fullName: 'Farzana Sultana' },
    createdAt: '2026-11-14T08:00:00.000Z',
    expiresOn: '2026-11-30',
    expired: false,
    canChange: true,
  };
});

describe('NoticeFormScreen (write)', () => {
  it('offers only the divisions the teacher teaches, as ticks, and asks for what is missing', async () => {
    await render(<NoticeFormScreen />, { wrapper: Providers });
    expect(screen.getByTestId('audience-dn')).toBeTruthy();
    expect(screen.getByTestId('audience-dj')).toBeTruthy();
    expect(screen.queryByText('Everyone')).toBeNull();
    await fireEvent.press(screen.getByTestId('notice-save'));
    expect(screen.getByText('Give the notice a title')).toBeTruthy();
    expect(screen.getByText('Write the notice')).toBeTruthy();
    expect(screen.getByText('Choose at least one class')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('sends the notice to the ticked divisions and opens it', async () => {
    await render(<NoticeFormScreen />, { wrapper: Providers });
    await fireEvent.changeText(screen.getByTestId('notice-title'), ' Art kit ');
    await fireEvent.changeText(screen.getByTestId('notice-body'), 'Bring the art kit on Monday.');
    await fireEvent.press(screen.getByTestId('audience-dn'));
    await fireEvent.press(screen.getByTestId('audience-dj'));
    await fireEvent.press(screen.getByTestId('audience-dj'));
    await fireEvent.press(screen.getByTestId('notice-save'));
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost).toHaveBeenCalledWith('/notices', {
      title: 'Art kit',
      body: 'Bring the art kit on Monday.',
      audience: 'DIVISIONS',
      divisionIds: ['dn'],
    });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/teacher/notices/n-new'));
  });

  it('shows the API\'s message when the notice is refused', async () => {
    const { ApiError } = jest.requireActual('@/api/errors');
    mockPost.mockRejectedValue(new ApiError(403, 'forbidden', 'You can only send notices to divisions you teach'));
    await render(<NoticeFormScreen />, { wrapper: Providers });
    await fireEvent.changeText(screen.getByTestId('notice-title'), 'Hello');
    await fireEvent.changeText(screen.getByTestId('notice-body'), 'World');
    await fireEvent.press(screen.getByTestId('audience-dn'));
    await fireEvent.press(screen.getByTestId('notice-save'));
    await waitFor(() => expect(screen.getByTestId('notice-failure').props.children).toBe('You can only write to the classes you teach.'));
  });
});

describe('NoticeFormScreen (change)', () => {
  it('starts from the notice, keeps the audience, and sends the words and the last day', async () => {
    await render(<NoticeFormScreen editId="n1" />, { wrapper: Providers });
    expect(screen.getByTestId('notice-title').props.value).toBe('Sports day');
    expect(screen.getByText(/cannot be changed after it is sent/)).toBeTruthy();
    expect(screen.queryByTestId('audience-dn')).toBeNull();

    await fireEvent.changeText(screen.getByTestId('notice-title'), 'Sports day moved');
    await fireEvent.press(screen.getByTestId('notice-no-expiry'));
    await fireEvent.press(screen.getByTestId('notice-save'));
    await waitFor(() => expect(mockPatch).toHaveBeenCalled());
    expect(mockPatch).toHaveBeenCalledWith('/notices/n1', { title: 'Sports day moved', body: 'Bring your kit.', expiresOn: null });
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });
});
