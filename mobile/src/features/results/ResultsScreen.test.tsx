import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MonthGrid } from '@/features/attendance/MonthGrid';
import { ResultsScreen } from './ResultsScreen';
import type { ResultItem, StudentResults } from './resultsLogic';

const mockUseResults = jest.fn();
jest.mock('./useResults', () => ({ useResults: () => mockUseResults() }));

const item = (id: string, subject: string, conductedOn: string, marks: number | null, absent = false): ResultItem => ({
  assessment: { id, name: `Test ${id}`, kind: 'UNIT', subject: { id: subject, name: subject }, conductedOn, maxMarks: 20 },
  marks,
  absent,
  remark: marks === 18 ? 'Well done' : null,
  percent: marks === null ? null : (marks / 20) * 100,
  classAverage: null,
  classHighest: null,
});

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const Providers = ({ children }: { children: ReactNode }) => <SafeAreaProvider initialMetrics={metrics}>{children}</SafeAreaProvider>;

const base = { isLoading: false, isError: false, error: null, isFetching: false, noStudent: false, refetch: jest.fn() };

describe('ResultsScreen', () => {
  it('groups tests by subject with marks, an absent badge, a remark and the trend', async () => {
    const data: StudentResults = {
      student: { id: 's', name: 'Ayaan' },
      results: [item('1', 'Maths', '2026-10-01', 15), item('2', 'English', '2026-10-05', 18), item('3', 'Maths', '2026-11-02', null, true)],
    };
    mockUseResults.mockReturnValue({ ...base, data });
    await render(<ResultsScreen />, { wrapper: Providers });
    expect(screen.getByText('English')).toBeTruthy();
    expect(screen.getByText('Maths')).toBeTruthy();
    expect(screen.getByText('Absent')).toBeTruthy();
    expect(screen.getByText('“Well done”')).toBeTruthy();
    expect(screen.getByTestId('trend-chart').props.accessibilityLabel).toContain('2 tests');
  });

  it('shows the empty state', async () => {
    mockUseResults.mockReturnValue({ ...base, data: { student: { id: 's', name: 'A' }, results: [] } });
    await render(<ResultsScreen />, { wrapper: Providers });
    expect(screen.getByText('No results published yet')).toBeTruthy();
  });

  it('shows an error with a retry', async () => {
    mockUseResults.mockReturnValue({ ...base, data: undefined, isError: true });
    await render(<ResultsScreen />, { wrapper: Providers });
    expect(screen.getByText('Try again')).toBeTruthy();
  });
});

describe('MonthGrid', () => {
  it('writes a letter on each marked day', async () => {
    await render(
      <MonthGrid
        month="2026-11"
        today="2026-11-14"
        records={[
          { date: '2026-11-02', status: 'ABSENT', note: null },
          { date: '2026-11-03', status: 'LATE', note: null },
          { date: '2026-11-04', status: 'ON_LEAVE', note: null },
          { date: '2026-11-05', status: 'PRESENT', note: null },
        ]}
      />,
    );
    expect(screen.getByLabelText('Monday, 2 November: Absent')).toBeTruthy();
    expect(screen.getByLabelText('Tuesday, 3 November: Late')).toBeTruthy();
    expect(screen.getByLabelText('Wednesday, 4 November: On leave')).toBeTruthy();
    expect(screen.getByText('Lv')).toBeTruthy();
  });
});
