import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StudentsScreen } from './StudentsScreen';

const mockPush = jest.fn();
const mockPaged = jest.fn();
const mockQueries: Record<string, unknown> = {};

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }) }));
jest.mock('@/api', () => ({
  ...jest.requireActual('@/api/errors'),
  useApiQuery: (path: string) => {
    const data = mockQueries[path];
    return { data, isLoading: false, isFetching: false, isError: false, isRefetching: false, error: null, refetch: jest.fn() };
  },
}));
jest.mock('@/features/paging/usePagedList', () => ({
  usePagedList: (path: string, query: Record<string, string>) => {
    mockPaged(path, query);
    return {
      items: [
        {
          id: 's1',
          admissionNo: 'DS0002',
          fullName: 'Diya Nadeem Iyer',
          firstName: 'Diya',
          surname: 'Iyer',
          gender: 'FEMALE',
          dateOfBirth: '2023-08-02T00:00:00.000Z',
          status: 'ACTIVE',
          photoFileId: null,
          current: { academicYear: { id: 'y', name: '2026-27' }, class: { id: 'c-n', name: 'Nursery' }, division: { id: 'd-na', name: 'A' } },
        },
      ],
      total: 1,
      isLoading: false,
      isError: false,
      error: null,
      isRefetching: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      refetch: jest.fn(),
      fetchNextPage: jest.fn(),
    };
  },
}));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const Providers = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    <SafeAreaProvider initialMetrics={metrics}>{children}</SafeAreaProvider>
  </QueryClientProvider>
);

beforeEach(() => {
  mockPush.mockReset();
  mockPaged.mockReset();
  mockQueries['/classes'] = [
    { id: 'c-n', name: 'Nursery', divisions: [{ id: 'd-na', name: 'A' }, { id: 'd-nb', name: 'B' }] },
    { id: 'c-1', name: 'Std 1', divisions: [{ id: 'd-1a', name: 'A' }] },
  ];
});

describe('StudentsScreen', () => {
  it('lists current students of the whole school and opens a profile on tap', async () => {
    await render(<StudentsScreen />, { wrapper: Providers });
    expect(mockPaged).toHaveBeenLastCalledWith('/students', { status: 'ACTIVE' });
    expect(screen.getByText('Nursery-A · DS0002')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('student-s1'));
    expect(mockPush).toHaveBeenCalledWith('/teacher/students/s1');
  });

  it('opens narrowed to one division when a class card sends one', async () => {
    await render(<StudentsScreen divisionId="d-nb" />, { wrapper: Providers });
    expect(mockPaged).toHaveBeenLastCalledWith('/students', { status: 'ACTIVE', divisionId: 'd-nb' });
    expect(screen.getByLabelText('Nursery-B').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByLabelText('Nursery').props.accessibilityState).toMatchObject({ selected: true });
  });

  it('narrows by class, then division, and clears the division when the class changes', async () => {
    await render(<StudentsScreen />, { wrapper: Providers });
    await fireEvent.press(screen.getByLabelText('Nursery'));
    expect(mockPaged).toHaveBeenLastCalledWith('/students', { status: 'ACTIVE', classId: 'c-n' });
    await fireEvent.press(screen.getByLabelText('Nursery-B'));
    expect(mockPaged).toHaveBeenLastCalledWith('/students', { status: 'ACTIVE', divisionId: 'd-nb' });
    await fireEvent.press(screen.getByLabelText('Std 1'));
    expect(mockPaged).toHaveBeenLastCalledWith('/students', { status: 'ACTIVE', classId: 'c-1' });
  });

  it('shows students who have left on request', async () => {
    await render(<StudentsScreen />, { wrapper: Providers });
    await fireEvent.press(screen.getByText('Left school'));
    expect(mockPaged).toHaveBeenLastCalledWith('/students', { status: 'LEFT' });
  });
});
