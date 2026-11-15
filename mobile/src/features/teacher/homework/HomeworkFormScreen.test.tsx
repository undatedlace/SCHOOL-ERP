import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HomeworkFormScreen } from './HomeworkFormScreen';

const mockReplace = jest.fn();
const mockPost = jest.fn();
const mockQueries: Record<string, unknown> = {};

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }) }));
jest.mock('@/api', () => ({
  ...jest.requireActual('@/api/errors'),
  api: { post: (...args: unknown[]) => mockPost(...args), patch: jest.fn(), url: (p: string) => `http://x${p}`, authHeaders: () => ({}) },
  useApiQuery: (path: string) => {
    const data = mockQueries[path];
    return { data, isLoading: false, isFetching: false, isError: false, isRefetching: false, error: null, refetch: jest.fn() };
  },
}));
jest.mock('@/lib/dates', () => ({ ...jest.requireActual('@/lib/dates'), todayIST: () => '2026-11-15' }));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const Providers = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    <SafeAreaProvider initialMetrics={metrics}>{children}</SafeAreaProvider>
  </QueryClientProvider>
);

beforeEach(() => {
  mockReplace.mockReset();
  mockPost.mockReset().mockResolvedValue({ id: 'new-hw' });
  mockQueries['/subjects'] = [{ id: 'eng', name: 'English' }];
  mockQueries['/homework/audiences'] = { divisions: [{ id: 'dn', classId: 'c', label: 'Nursery-A' }] };
});

describe('HomeworkFormScreen (new homework)', () => {
  it('says what is missing before sending anything', async () => {
    await render(<HomeworkFormScreen />, { wrapper: Providers });
    await fireEvent.press(screen.getByTestId('save-homework'));
    expect(screen.getByText('Give the homework a title.')).toBeTruthy();
    expect(screen.getByText('Write what the students should do.')).toBeTruthy();
    expect(screen.getByText('Choose who it is for.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('sends the homework to a whole class with hand-in and marks, then opens it', async () => {
    await render(<HomeworkFormScreen />, { wrapper: Providers });
    await fireEvent.changeText(screen.getByTestId('homework-title'), 'Draw a tree');
    await fireEvent.changeText(screen.getByTestId('homework-instructions'), 'Use crayons.');
    await fireEvent.press(screen.getByLabelText('English'));
    await fireEvent.press(screen.getByTestId('audience-dn'));
    await fireEvent(screen.getByTestId('hand-in-switch'), 'valueChange', true);
    await fireEvent.changeText(screen.getByTestId('homework-max-marks'), '10');
    await fireEvent.press(screen.getByTestId('save-homework'));
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost).toHaveBeenCalledWith('/homework', {
      title: 'Draw a tree',
      instructions: 'Use crayons.',
      subjectId: 'eng',
      handIn: true,
      maxMarks: 10,
      divisionIds: ['dn'],
    });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/teacher/homework/new-hw'));
  });
});
