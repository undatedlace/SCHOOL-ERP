import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ReviewSheet } from './ReviewSheet';
import { TeacherHomeworkScreen } from './TeacherHomeworkScreen';
import type { HomeworkStats } from './homeworkLogic';
import type { HandInEntry, TeacherHomework } from './types';

const mockPush = jest.fn();
const mockPut = jest.fn();
const mockHook = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }) }));
jest.mock('@/api', () => ({
  ...jest.requireActual('@/api/errors'),
  api: { put: (...args: unknown[]) => mockPut(...args), url: (p: string) => `http://x${p}`, authHeaders: () => ({}) },
}));
jest.mock('./useTeacherHomework', () => ({ useTeacherHomework: () => mockHook() }));
// The 2026-11-15 day the screen believes it is.
jest.mock('@/lib/dates', () => ({ ...jest.requireActual('@/lib/dates'), todayIST: () => '2026-11-15' }));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const Providers = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    <SafeAreaProvider initialMetrics={metrics}>{children}</SafeAreaProvider>
  </QueryClientProvider>
);

const hw = (id: string, over: Partial<TeacherHomework> = {}): TeacherHomework => ({
  id,
  title: `Task ${id}`,
  instructions: 'Do it',
  subject: { id: 'eng', name: 'English' },
  dueOn: '2026-11-20',
  overdue: false,
  createdBy: { id: 'u', fullName: 'T' },
  createdAt: '2026-11-10T08:00:00.000Z',
  handIn: true,
  maxMarks: '10',
  attachments: [],
  children: [],
  forChildren: [],
  divisions: [{ id: 'd1', label: 'Nursery-A' }],
  students: [],
  canChange: true,
  ...over,
});
const stats = (over: Partial<HomeworkStats>): HomeworkStats => ({ students: 24, handedIn: 0, toMark: 0, marked: 0, redo: 0, ...over });

const hookValue = (items: TeacherHomework[], map: Map<string, HomeworkStats>) => ({
  list: { data: { items } },
  items,
  stats: map,
  rostersLoading: false,
  isLoading: false,
  isError: false,
  error: null,
  isRefetching: false,
  refetch: jest.fn(),
});

describe('TeacherHomeworkScreen', () => {
  it('opens on To mark when work is waiting, with a count on every tab, and shows the progress', async () => {
    const items = [hw('a'), hw('b', { title: 'Old task', dueOn: '2026-11-10' }), hw('c', { dueOn: '2026-11-01' })];
    const map = new Map([
      ['a', stats({ handedIn: 24, toMark: 9, marked: 15 })],
      ['b', stats({ handedIn: 5, marked: 5 })],
      ['c', stats({ handedIn: 3, marked: 3 })],
    ]);
    mockHook.mockReturnValue(hookValue(items, map));
    await render(<TeacherHomeworkScreen />, { wrapper: Providers });

    expect(screen.getByLabelText('To mark, 1')).toBeTruthy();
    expect(screen.getByLabelText('Marked, 2')).toBeTruthy();
    expect(screen.getByLabelText('All, 3')).toBeTruthy();
    // On To mark: only the task with work waiting.
    expect(screen.getByText('Task a')).toBeTruthy();
    expect(screen.queryByText('Old task')).toBeNull();
    expect(screen.getAllByText('24 of 24 handed in').length).toBeGreaterThan(0);
    expect(screen.getAllByText('15 of 24 marked').length).toBeGreaterThan(0);
    expect(screen.getByText('9 to mark')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Marked, 2'));
    expect(screen.getByText('Old task')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('homework-b'));
    expect(mockPush).toHaveBeenCalledWith('/teacher/homework/b');
  });

  it('offers to set homework when there is none', async () => {
    mockHook.mockReturnValue(hookValue([], new Map()));
    await render(<TeacherHomeworkScreen />, { wrapper: Providers });
    expect(screen.getByText('No homework yet')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('new-homework'));
    expect(mockPush).toHaveBeenCalledWith('/teacher/homework/new');
  });
});

describe('ReviewSheet', () => {
  const entry: HandInEntry = {
    studentId: 's1',
    name: 'Diya Iyer',
    admissionNo: 'DS0002',
    division: 'Nursery-A',
    submission: {
      id: 'sub',
      studentId: 's1',
      status: 'SUBMITTED',
      note: 'Here it is',
      submittedAt: '2026-11-14T08:00:00.000Z',
      late: true,
      files: [],
      marks: null,
      feedback: null,
      reviewedAt: null,
    },
  };
  const render_ = () =>
    render(<ReviewSheet visible onClose={jest.fn()} homeworkId="h1" homeworkTitle="Draw a tree" maxMarks="10" entry={entry} />, {
      wrapper: Providers,
    });

  beforeEach(() => mockPut.mockReset().mockResolvedValue({}));

  it('shows the note and the late flag, and marks with marks and a comment', async () => {
    await render_();
    expect(screen.getByText('Here it is')).toBeTruthy();
    expect(screen.getByText('Late')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('review-marks'), '8.5');
    await fireEvent.changeText(screen.getByTestId('review-feedback'), 'Lovely colours');
    await fireEvent.press(screen.getByTestId('review-mark'));
    await waitFor(() => expect(mockPut).toHaveBeenCalled());
    expect(mockPut).toHaveBeenCalledWith('/homework/h1/students/s1/review', { status: 'REVIEWED', marks: 8.5, feedback: 'Lovely colours' });
  });

  it('will not mark above the maximum, and will not send back without a comment', async () => {
    await render_();
    await fireEvent.changeText(screen.getByTestId('review-marks'), '11');
    await fireEvent.press(screen.getByTestId('review-mark'));
    expect(screen.getByText('Marks cannot be more than 10.')).toBeTruthy();
    expect(mockPut).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('review-redo'));
    expect(screen.getByText('Say what should be done again.')).toBeTruthy();
    expect(mockPut).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByTestId('review-feedback'), 'Add the trunk');
    await fireEvent.press(screen.getByTestId('review-redo'));
    await waitFor(() => expect(mockPut).toHaveBeenCalled());
    expect(mockPut).toHaveBeenCalledWith('/homework/h1/students/s1/review', { status: 'REDO', feedback: 'Add the trunk' });
  });
});
