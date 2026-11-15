import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Keyboard, TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MarksEntryScreen } from './MarksEntryScreen';
import type { TestDetail } from './marksLogic';

const mockPut = jest.fn();
const mockPost = jest.fn();
const mockQueries: Record<string, unknown> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  usePreventRemove: jest.fn(),
}));

jest.mock('@/api', () => ({
  ...jest.requireActual('@/api/errors'),
  api: { put: (...args: unknown[]) => mockPut(...args), post: (...args: unknown[]) => mockPost(...args) },
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

const student = (id: string, name: string, roll: number, extra: Partial<TestDetail['students'][number]> = {}) => ({
  studentId: id,
  admissionNo: id.toUpperCase(),
  name,
  rollNo: roll,
  marks: null,
  absent: false,
  remark: null,
  percent: null,
  ...extra,
});

const detail = (extra: Partial<TestDetail> = {}): TestDetail => ({
  id: 't1',
  name: 'Unit Test 1',
  kind: 'UNIT',
  subject: { id: 'm', name: 'Mathematics' },
  division: { id: 'd1', label: 'Nursery-A' },
  maxMarks: 10,
  conductedOn: '2026-11-14',
  published: false,
  publishedAt: null,
  createdBy: { id: 'u', fullName: 'Farzana Sultana' },
  entered: 0,
  stats: { entered: 0, scored: 0, absent: 0, average: null, highest: null, lowest: null },
  students: [student('s1', 'Ayaan Khan', 1), student('s2', 'Diya Iyer', 2), student('s3', 'Krish Nair', 3)],
  ...extra,
});

/** The server's answer after the given rows are saved. */
function saved(rows: Record<string, Partial<TestDetail['students'][number]>>, extra: Partial<TestDetail> = {}): TestDetail {
  const base = detail(extra);
  base.students = base.students.map((s) => ({ ...s, ...rows[s.studentId] }));
  base.entered = Object.keys(rows).length;
  return base;
}

beforeEach(() => {
  mockPut.mockReset();
  mockPost.mockReset();
  mockQueries['/assessments/t1'] = detail();
});

const marksBox = (id: string) => screen.getByTestId(`marks-${id}`);

describe('MarksEntryScreen', () => {
  it('shows live entered count, average, highest and lowest as marks are typed', async () => {
    await render(<MarksEntryScreen id="t1" />, { wrapper: Providers });
    expect(screen.getByTestId('stat-entered').props.children).toBe('0/3');

    await fireEvent.changeText(marksBox('s1'), '7.5');
    await fireEvent.changeText(marksBox('s2'), '3');
    expect(screen.getByTestId('stat-entered').props.children).toBe('2/3');
    expect(screen.getByTestId('stat-average').props.children).toBe('5.3');
    expect(screen.getByTestId('stat-highest').props.children).toBe('7.5');
    expect(screen.getByTestId('stat-lowest').props.children).toBe('3');
  });

  it('flags a low mark with the word "Low", not only a colour', async () => {
    await render(<MarksEntryScreen id="t1" />, { wrapper: Providers });
    await fireEvent.changeText(marksBox('s1'), '3');
    expect(screen.getByText('Low · 30%')).toBeTruthy();
    await fireEvent.changeText(marksBox('s1'), '8');
    expect(screen.queryByText(/^Low ·/)).toBeNull();
    expect(screen.getByText('80%')).toBeTruthy();
  });

  it('refuses a mark above the maximum and does not send it', async () => {
    await render(<MarksEntryScreen id="t1" />, { wrapper: Providers });
    await fireEvent.changeText(marksBox('s1'), '11');
    expect(screen.getByTestId('error-s1').props.children).toBe('Cannot be more than 10');
    await fireEvent.press(screen.getByTestId('save-marks'));
    expect(mockPut).not.toHaveBeenCalled();
    expect(screen.getByTestId('save-error').props.children).toBe('One mark cannot be read. Fix it, then save.');
  });

  it('keeps letters out of a marks box', async () => {
    await render(<MarksEntryScreen id="t1" />, { wrapper: Providers });
    await fireEvent.changeText(marksBox('s1'), '7a.5x');
    expect(marksBox('s1').props.value).toBe('7.5');
  });

  it('moves to the next student on the Next key, skipping an absent one, and closes the keyboard after the last', async () => {
    const focus = TextInput.prototype.focus as unknown as jest.Mock;
    focus.mockClear();
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    await render(<MarksEntryScreen id="t1" />, { wrapper: Providers });

    await fireEvent.changeText(marksBox('s1'), '6');
    await fireEvent(marksBox('s1'), 'submitEditing');
    expect(focus).toHaveBeenCalledTimes(1);
    expect((focus.mock.contexts[0] as { props: { testID: string } }).props.testID).toBe('marks-s2');

    // The second student is absent, so Next from the first goes straight to the third.
    await fireEvent.press(screen.getByTestId('absent-s2'));
    focus.mockClear();
    await fireEvent(marksBox('s1'), 'submitEditing');
    expect((focus.mock.contexts[0] as { props: { testID: string } }).props.testID).toBe('marks-s3');

    expect(dismiss).not.toHaveBeenCalled();
    await fireEvent(marksBox('s3'), 'submitEditing');
    expect(dismiss).toHaveBeenCalled();
    dismiss.mockRestore();
  });

  it('puts the last change back with one tap on Undo', async () => {
    await render(<MarksEntryScreen id="t1" />, { wrapper: Providers });
    expect(screen.getByTestId('undo').props.accessibilityState).toMatchObject({ disabled: true });

    await fireEvent.changeText(marksBox('s1'), '7');
    await fireEvent.changeText(marksBox('s2'), '4');
    await fireEvent.press(screen.getByTestId('undo'));
    expect(marksBox('s2').props.value).toBe('');
    expect(marksBox('s1').props.value).toBe('7');

    await fireEvent.press(screen.getByTestId('undo'));
    expect(marksBox('s1').props.value).toBe('');
    expect(screen.getByTestId('undo').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('saves only the changed rows in one PUT, then shows what the server kept', async () => {
    mockPut.mockResolvedValue(saved({ s1: { marks: 7.5, remark: 'Good' }, s2: { absent: true } }));
    await render(<MarksEntryScreen id="t1" />, { wrapper: Providers });

    await fireEvent.changeText(marksBox('s1'), '7.5');
    await fireEvent.press(screen.getByLabelText('Add a remark for Ayaan Khan'));
    await fireEvent.changeText(screen.getByTestId('remark-s1'), 'Good');
    await fireEvent.press(screen.getByTestId('absent-s2'));
    expect(screen.getByText('Save marks (2)')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('save-marks'));
    await waitFor(() => expect(mockPut).toHaveBeenCalled());
    expect(mockPut).toHaveBeenCalledWith('/assessments/t1/marks', {
      entries: [
        { studentId: 's1', marks: 7.5, absent: false, remark: 'Good' },
        { studentId: 's2', absent: true, remark: '' },
      ],
    });
    await waitFor(() => expect(screen.getByTestId('save-notice').props.children).toBe('Saved 2 rows.'));
    expect(screen.getByText('Save marks')).toBeTruthy();
  });

  it('shows the API\'s own words when a save is refused', async () => {
    const { ApiError } = jest.requireActual('@/api/errors');
    mockPut.mockRejectedValue(new ApiError(400, 'validation', 'Marks cannot be more than 10', 'Marks cannot be more than 10'));
    await render(<MarksEntryScreen id="t1" />, { wrapper: Providers });
    await fireEvent.changeText(marksBox('s1'), '5');
    await fireEvent.press(screen.getByTestId('save-marks'));
    await waitFor(() => expect(screen.getByTestId('save-error').props.children).toBe('Marks cannot be more than 10'));
  });

  it('publishes only after something is saved, and then takes the results back with a warning first', async () => {
    mockPut.mockResolvedValue(saved({ s1: { marks: 7 } }, { stats: { entered: 1, scored: 1, absent: 0, average: 7, highest: 7, lowest: 7 } }));
    mockPost.mockResolvedValue(saved({ s1: { marks: 7 } }, { published: true, publishedAt: '2026-11-15T09:00:00.000Z', stats: { entered: 1, scored: 1, absent: 0, average: 7, highest: 7, lowest: 7 } }));
    await render(<MarksEntryScreen id="t1" />, { wrapper: Providers });

    // Nothing entered: cannot publish.
    expect(screen.getByTestId('publish').props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText('Enter at least one mark first.')).toBeTruthy();

    // Typed but not saved: still cannot publish.
    await fireEvent.changeText(marksBox('s1'), '7');
    expect(screen.getByTestId('publish').props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText('Save your changes first.')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('save-marks'));
    await waitFor(() => expect(screen.getByTestId('publish').props.accessibilityState).toMatchObject({ disabled: false }));

    await fireEvent.press(screen.getByTestId('publish'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/assessments/t1/publish'));
    await waitFor(() => expect(screen.getByTestId('published-note')).toBeTruthy());
    expect(screen.getByText(/the change is recorded in the school's audit log/)).toBeTruthy();
    expect(screen.getByTestId('unpublish')).toBeTruthy();
  });

  it('starts a published test from its saved marks, with the audit note', async () => {
    mockQueries['/assessments/t1'] = saved(
      { s1: { marks: 9.5, remark: 'Excellent' }, s2: { absent: true } },
      { published: true, publishedAt: '2026-11-15T09:00:00.000Z' },
    );
    await render(<MarksEntryScreen id="t1" />, { wrapper: Providers });
    expect(marksBox('s1').props.value).toBe('9.5');
    expect(screen.getByTestId('remark-s1').props.value).toBe('Excellent');
    expect(screen.getByTestId('absent-s2').props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByTestId('published-note')).toBeTruthy();
    expect(screen.getByText('Published')).toBeTruthy();
  });

  it('draws the distribution from what is typed, with a text list for screen readers', async () => {
    await render(<MarksEntryScreen id="t1" />, { wrapper: Providers });
    await fireEvent.changeText(marksBox('s1'), '9.5');
    await fireEvent.changeText(marksBox('s2'), '2');
    await act(async () => undefined);
    const list = screen.getByTestId('distribution-list');
    expect(list.props.accessibilityLabel).toContain('90% and above: 1');
    expect(list.props.accessibilityLabel).toContain('Below 40%: 1');
    expect(screen.getByText('Missing: 1')).toBeTruthy();
    expect(screen.getByText('Includes marks you have not saved yet.')).toBeTruthy();
    expect(screen.getByText('Three lowest')).toBeTruthy();
  });
});
