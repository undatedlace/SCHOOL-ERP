import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NewTestScreen } from './NewTestScreen';

const mockReplace = jest.fn();
const mockPost = jest.fn();
const mockQueries: Record<string, unknown> = {};

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }) }));
jest.mock('@/api', () => ({
  ...jest.requireActual('@/api/errors'),
  api: { post: (...args: unknown[]) => mockPost(...args) },
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
  mockPost.mockReset().mockResolvedValue({ id: 'new-test' });
  mockQueries['/assessments/options'] = {
    divisions: [
      { id: 'dn', label: 'Nursery-A', subjectIds: ['maths', 'eng'] },
      { id: 'dj', label: 'Junior KG-A', subjectIds: ['hindi'] },
    ],
    subjects: [
      { id: 'maths', name: 'Mathematics' },
      { id: 'eng', name: 'English' },
      { id: 'hindi', name: 'Hindi' },
    ],
  };
});

describe('NewTestScreen', () => {
  it('says what is missing and sends nothing', async () => {
    await render(<NewTestScreen />, { wrapper: Providers });
    await fireEvent.press(screen.getByTestId('test-save'));
    expect(screen.getByText('Choose a class')).toBeTruthy();
    expect(screen.getByText('Type the most a student can score')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('offers only the subjects taught in the chosen class', async () => {
    await render(<NewTestScreen />, { wrapper: Providers });
    expect(screen.getByText('Choose a class first.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Junior KG-A'));
    expect(screen.queryByLabelText('Mathematics')).toBeNull();
    // A class with one subject has it chosen already.
    expect(screen.getByLabelText('Hindi').props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(screen.getByLabelText('Nursery-A'));
    expect(screen.getByLabelText('Mathematics')).toBeTruthy();
    expect(screen.queryByLabelText('Hindi')).toBeNull();
  });

  it('opens with the class from a shortcut, sets the test and goes to the marks', async () => {
    await render(<NewTestScreen divisionId="dn" />, { wrapper: Providers });
    expect(screen.getByLabelText('Nursery-A').props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.changeText(screen.getByTestId('test-name'), ' Unit Test 1 ');
    await fireEvent.press(screen.getByLabelText('Mathematics'));
    await fireEvent.press(screen.getByLabelText('Mock test'));
    await fireEvent.changeText(screen.getByTestId('test-max'), '25,5');
    await fireEvent.press(screen.getByTestId('test-save'));
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost).toHaveBeenCalledWith('/assessments', {
      name: 'Unit Test 1',
      kind: 'MOCK',
      divisionId: 'dn',
      subjectId: 'maths',
      maxMarks: 25.5,
      conductedOn: '2026-11-16',
    });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/teacher/marks/new-test'));
  });

  it('shows the API\'s message when the test is refused', async () => {
    const { ApiError } = jest.requireActual('@/api/errors');
    mockPost.mockRejectedValue(new ApiError(403, 'forbidden', 'You can set tests only for the subjects and divisions you teach'));
    await render(<NewTestScreen divisionId="dn" />, { wrapper: Providers });
    await fireEvent.changeText(screen.getByTestId('test-name'), 'Quiz');
    await fireEvent.press(screen.getByLabelText('English'));
    await fireEvent.changeText(screen.getByTestId('test-max'), '10');
    await fireEvent.press(screen.getByTestId('test-save'));
    await waitFor(() => expect(screen.getByTestId('test-failure').props.children).toBe('You can set tests only for the subjects and divisions you teach'));
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
