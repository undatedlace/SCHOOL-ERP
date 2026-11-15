import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StudentProfileScreen } from './StudentProfileScreen';

const mockQueries: Record<string, unknown> = {};
const mockErrors: Record<string, { status: number }> = {};

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }) }));
jest.mock('@/api', () => {
  const errors = jest.requireActual('@/api/errors');
  return {
    ...errors,
    useApiQuery: (path: string) => {
      const failure = mockErrors[path];
      if (failure) {
        return {
          data: undefined,
          isLoading: false,
          isFetching: false,
          isError: true,
          isRefetching: false,
          error: new errors.ApiError(failure.status, 'not_found', 'Student not found'),
          refetch: jest.fn(),
        };
      }
      return { data: mockQueries[path], isLoading: false, isFetching: false, isError: false, isRefetching: false, error: null, refetch: jest.fn() };
    },
  };
});
jest.mock('@/lib/dates', () => ({ ...jest.requireActual('@/lib/dates'), todayIST: () => '2026-11-16' }));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const Providers = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    <SafeAreaProvider initialMetrics={metrics}>{children}</SafeAreaProvider>
  </QueryClientProvider>
);

const profile = {
  id: 's1',
  admissionNo: 'DS0003',
  fullName: 'Rayan Manoj Ansari',
  firstName: 'Rayan',
  fatherName: 'Manoj',
  surname: 'Ansari',
  gender: 'MALE',
  dateOfBirth: '2023-11-07T00:00:00.000Z',
  status: 'ACTIVE',
  joinedOn: '2026-04-03T00:00:00.000Z',
  leftOn: null,
  hasLogin: true,
  schoolEmail: null,
  guardians: [
    { id: 'g2', fullName: 'Lakshmi Ansari', mobile: '9867190794', email: null, occupation: 'Homemaker', relationship: 'MOTHER', isPrimary: false, hasLogin: false },
    { id: 'g1', fullName: 'Manoj Ansari', mobile: '9000000003', email: 'manoj@example.com', occupation: null, relationship: 'FATHER', isPrimary: true, hasLogin: true },
  ],
  enrollments: [
    {
      id: 'e1',
      academicYear: { id: 'y', name: '2026-27' },
      class: { id: 'c', name: 'Nursery' },
      division: { id: 'd', name: 'A' },
      startedOn: '2026-04-01T00:00:00.000Z',
      endedOn: null,
    },
  ],
};

const history = {
  studentId: 's1',
  from: '2026-04-01',
  to: '2026-11-16',
  summary: { present: 18, absent: 1, late: 1, onLeave: 0, markedDays: 20, countedDays: 20, attendedDays: 19, percent: 95 },
  records: [{ date: '2026-11-10', status: 'ABSENT', note: 'Fever' }],
};

beforeEach(() => {
  for (const k of Object.keys(mockErrors)) delete mockErrors[k];
  mockQueries['/students/s1'] = profile;
  mockQueries['/attendance/students/s1'] = history;
  mockQueries['/results/students/s1'] = {
    student: { id: 's1', name: 'Rayan Ansari' },
    results: [
      {
        assessment: { id: 'a1', name: 'Unit Test 1', kind: 'UNIT', subject: { id: 'm', name: 'Mathematics' }, conductedOn: '2026-11-05', maxMarks: 10 },
        marks: 8,
        absent: false,
        remark: null,
        percent: 80,
        classAverage: 6.5,
        classHighest: 9,
      },
    ],
  };
});

describe('StudentProfileScreen', () => {
  it('shows the details, the primary contact first, attendance and published results', async () => {
    await render(<StudentProfileScreen id="s1" />, { wrapper: Providers });
    expect(screen.getByText('Rayan Manoj Ansari')).toBeTruthy();
    expect(screen.getByText('Nursery-A · 2026-27')).toBeTruthy();
    expect(screen.getByText('Student ID DS0003')).toBeTruthy();
    expect(screen.getByText('3 years')).toBeTruthy();
    const cards = screen.getAllByTestId(/^guardian-/);
    expect(cards[0]!.props.testID).toBe('guardian-g1');
    expect(screen.getByText('Primary contact')).toBeTruthy();
    expect(screen.getByText(/Fever/)).toBeTruthy();
    expect(screen.getByText('Unit Test 1')).toBeTruthy();
    expect(screen.getByText('Mathematics')).toBeTruthy();
  });

  it('calls a guardian with one tap', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue();
    await render(<StudentProfileScreen id="s1" />, { wrapper: Providers });
    await fireEvent.press(screen.getByTestId('call-g1'));
    expect(open).toHaveBeenCalledWith('tel:9000000003');
    open.mockRestore();
  });

  it('has no scanned documents section', async () => {
    await render(<StudentProfileScreen id="s1" />, { wrapper: Providers });
    expect(screen.queryByText(/document/i)).toBeNull();
  });

  it('says quietly that attendance and results are for the classes taught when the API refuses them', async () => {
    mockErrors['/attendance/students/s1'] = { status: 404 };
    mockErrors['/results/students/s1'] = { status: 404 };
    await render(<StudentProfileScreen id="s1" />, { wrapper: Providers });
    expect(screen.getByText('Attendance is shown for the classes you teach. This student is in another class.')).toBeTruthy();
    expect(screen.getByText('Results are shown for the classes you teach. This student is in another class.')).toBeTruthy();
    // The rest of the profile is still there.
    expect(screen.getByText('Rayan Manoj Ansari')).toBeTruthy();
  });

  it('says a student who is not on the list was not found', async () => {
    mockErrors['/students/s1'] = { status: 404 };
    await render(<StudentProfileScreen id="s1" />, { wrapper: Providers });
    expect(screen.getByText('Student not found')).toBeTruthy();
  });
});
