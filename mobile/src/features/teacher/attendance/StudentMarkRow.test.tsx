import { fireEvent, render, screen } from '@testing-library/react-native';
import { StudentMarkRow } from './StudentMarkRow';
import type { RosterStudent } from './rosterLogic';

const student = (over: Partial<RosterStudent> = {}): RosterStudent => ({
  studentId: 's1',
  admissionNo: 'DS0001',
  name: 'Ayaan Khan',
  rollNo: 1,
  status: null,
  note: null,
  approvedLeave: null,
  suggestedStatus: null,
  ...over,
});

describe('StudentMarkRow', () => {
  it('shows a word on each of the four buttons and reports the choice', async () => {
    const onStatus = jest.fn();
    await render(<StudentMarkRow student={student()} status={null} note="" editable onStatus={onStatus} onNote={jest.fn()} />);
    for (const word of ['Present', 'Absent', 'Late', 'Leave']) expect(screen.getByText(word)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('mark-s1-ABSENT'));
    expect(onStatus).toHaveBeenCalledWith('s1', 'ABSENT');
  });

  it('says which button is chosen', async () => {
    await render(<StudentMarkRow student={student()} status="LATE" note="" editable onStatus={jest.fn()} onNote={jest.fn()} />);
    expect(screen.getByTestId('mark-s1-LATE').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId('mark-s1-PRESENT').props.accessibilityState).toMatchObject({ selected: false });
  });

  it('explains pre-selected leave until it is saved', async () => {
    const s = student({ approvedLeave: { requestId: 'r', halfDay: true }, suggestedStatus: 'ON_LEAVE' });
    await render(<StudentMarkRow student={s} status="ON_LEAVE" note="Leave approved" editable onStatus={jest.fn()} onNote={jest.fn()} />);
    expect(screen.getByText(/Leave approved \(half day\)/)).toBeTruthy();
    expect(screen.getByText(/set to Leave until you save/)).toBeTruthy();
    expect(screen.getByDisplayValue('Leave approved')).toBeTruthy();
  });

  it('cannot be changed when the day is read only', async () => {
    const onStatus = jest.fn();
    await render(<StudentMarkRow student={student({ status: 'ABSENT', note: 'Fever' })} status="ABSENT" note="Fever" editable={false} onStatus={onStatus} onNote={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('mark-s1-PRESENT'));
    expect(onStatus).not.toHaveBeenCalled();
    expect(screen.getByText('Note: Fever')).toBeTruthy();
  });
});
