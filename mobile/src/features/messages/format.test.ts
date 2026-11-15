import { counterpart, dayLabel, groupByDay, inboxTimeLabel, mergeMessages, previewLine, readOnlyTag, teacherLine } from './format';
import type { Message } from './types';

// 14 Nov 2026, 3:00 pm India time (09:30 UTC)
const NOW = new Date('2026-11-14T09:30:00.000Z');

const msg = (id: string, createdAt: string, mine = false): Message => ({
  id,
  body: `body ${id}`,
  createdAt,
  senderIsMe: mine,
  sender: { userId: 'u', name: 'Name', side: mine ? 'family' : 'teacher' },
  files: [],
});

describe('inboxTimeLabel', () => {
  it('shows the clock time for today, in India time', () => {
    expect(inboxTimeLabel('2026-11-14T04:00:00.000Z', NOW)).toBe('9:30 am');
  });
  it('says Yesterday for the day before (India midnight, not UTC)', () => {
    // 13 Nov 23:30 IST is 18:00 UTC on 13 Nov
    expect(inboxTimeLabel('2026-11-13T18:00:00.000Z', NOW)).toBe('Yesterday');
  });
  it('uses the weekday inside a week and the date after that', () => {
    expect(inboxTimeLabel('2026-11-11T06:00:00.000Z', NOW)).toBe('Wed');
    expect(inboxTimeLabel('2026-10-30T06:00:00.000Z', NOW)).toBe('30 Oct');
  });
  it('returns an empty label for rubbish', () => {
    expect(inboxTimeLabel('nope', NOW)).toBe('');
  });
});

describe('dayLabel', () => {
  it('names today and yesterday, otherwise the weekday and date', () => {
    expect(dayLabel('2026-11-14', NOW)).toBe('Today');
    expect(dayLabel('2026-11-13', NOW)).toBe('Yesterday');
    expect(dayLabel('2026-11-10', NOW)).toBe('Tuesday, 10 November');
  });
});

describe('previewLine', () => {
  it('puts "You:" in front of my own last message', () => {
    expect(previewLine({ lastMessage: { bodyPreview: 'See you  \n then', senderIsMe: true, createdAt: '' } })).toBe(
      'You: See you then',
    );
  });
  it('shows the teacher text as it is, and handles no messages', () => {
    expect(previewLine({ lastMessage: { bodyPreview: 'Hello', senderIsMe: false, createdAt: '' } })).toBe('Hello');
    expect(previewLine({ lastMessage: null })).toBe('No messages yet');
  });
});

describe('teacherLine and readOnlyTag', () => {
  it('joins the class teacher mark and the subjects', () => {
    expect(teacherLine({ isClassTeacher: true, subjects: ['English', 'EVS'] })).toBe('Class teacher · English, EVS');
    expect(teacherLine({ isClassTeacher: false, subjects: ['Maths'] })).toBe('Maths');
    expect(teacherLine({ isClassTeacher: false, subjects: [] })).toBe('Teacher');
  });
  it('marks closed and read-only conversations', () => {
    expect(readOnlyTag({ status: 'CLOSED', canReply: false })).toBe('Closed');
    expect(readOnlyTag({ status: 'OPEN', canReply: false })).toBe('Read only');
    expect(readOnlyTag({ status: 'OPEN', canReply: true })).toBeNull();
  });
});

describe('groupByDay and mergeMessages', () => {
  it('groups oldest first under India days', () => {
    const groups = groupByDay(
      [
        msg('c', '2026-11-14T03:00:00.000Z'),
        msg('a', '2026-11-13T05:00:00.000Z'),
        msg('b', '2026-11-13T06:00:00.000Z', true),
      ],
      NOW,
    );
    expect(groups.map((g) => [g.label, g.messages.map((m) => m.id)])).toEqual([
      ['Yesterday', ['a', 'b']],
      ['Today', ['c']],
    ]);
  });
  it('joins pages without repeats', () => {
    const merged = mergeMessages(
      [msg('a', '2026-11-13T05:00:00.000Z'), msg('b', '2026-11-13T06:00:00.000Z')],
      [msg('b', '2026-11-13T06:00:00.000Z'), msg('c', '2026-11-14T03:00:00.000Z')],
    );
    expect(merged.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('counterpart', () => {
  const base = {
    student: { id: 's', name: 'Rayan Ansari', className: 'Nursery', divisionName: 'A', photoFileId: null },
    teacher: { userId: 't', name: 'Farzana Sultana', subjects: ['English'], isClassTeacher: true },
  };
  it('shows the teacher to a family', () => {
    expect(counterpart({ ...base, myRole: 'family' })).toEqual({ name: 'Farzana Sultana', line: 'Class teacher · English' });
  });
  it('shows the student and class to a teacher', () => {
    expect(counterpart({ ...base, myRole: 'teacher' })).toEqual({ name: 'Rayan Ansari', line: 'Student · Nursery-A' });
  });
  it('copes with a student whose class is unknown', () => {
    const student = { ...base.student, className: null, divisionName: null };
    expect(counterpart({ ...base, student, myRole: 'teacher' }).line).toBe('Student');
  });
});
