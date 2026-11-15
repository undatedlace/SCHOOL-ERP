import { addDays, daysBetween, formatClock, formatDay, istParts, todayIST } from '@/lib/dates';
import type { Conversation, ConversationTeacher, Message } from './types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n: number) => String(n).padStart(2, '0');

/** The clock time of a moment in India time, "2:30 pm". */
export function clockOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = istParts(d);
  return formatClock(`${pad(p.hour)}:${pad(p.minute)}`);
}

/**
 * The short time label on an inbox row: the time today, "Yesterday", the weekday within the
 * last week, otherwise the date.
 */
export function inboxTimeLabel(iso: string, now: Date | number = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const today = todayIST(now);
  const day = todayIST(then);
  const ago = daysBetween(day, today);
  if (ago <= 0) return clockOf(iso);
  if (ago === 1) return 'Yesterday';
  if (ago < 7) return WEEKDAYS[istParts(then).weekday]!;
  return formatDay(day, 'dayMonth');
}

/** "Today", "Yesterday", or "Saturday, 14 November". */
export function dayLabel(day: string, now: Date | number = new Date()): string {
  const today = todayIST(now);
  if (day === today) return 'Today';
  if (day === addDays(today, -1)) return 'Yesterday';
  return formatDay(day, 'weekday');
}

/** The last line of an inbox row: "You: ..." when the last message was mine. */
export function previewLine(c: Pick<Conversation, 'lastMessage'>): string {
  if (!c.lastMessage) return 'No messages yet';
  const text = c.lastMessage.bodyPreview.replace(/\s+/g, ' ').trim();
  return c.lastMessage.senderIsMe ? `You: ${text}` : text;
}

/** "Class teacher · English, EVS" */
export function teacherLine(t: Pick<ConversationTeacher, 'subjects' | 'isClassTeacher'>): string {
  const parts: string[] = [];
  if (t.isClassTeacher) parts.push('Class teacher');
  if (t.subjects.length) parts.push(t.subjects.join(', '));
  return parts.join(' · ') || 'Teacher';
}

/** The word marking a conversation nobody can reply to any more, or null. */
export function readOnlyTag(c: Pick<Conversation, 'status' | 'canReply'>): string | null {
  if (c.status === 'CLOSED') return 'Closed';
  if (!c.canReply) return 'Read only';
  return null;
}

export interface DayGroup {
  day: string;
  label: string;
  messages: Message[];
}

/** Oldest first, split under a heading for each India day. */
export function groupByDay(messages: Message[], now: Date | number = new Date()): DayGroup[] {
  const sorted = [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const groups: DayGroup[] = [];
  for (const m of sorted) {
    const day = todayIST(new Date(m.createdAt));
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.messages.push(m);
    else groups.push({ day, label: dayLabel(day, now), messages: [m] });
  }
  return groups;
}

/** Older pages joined to the newest page: no repeats, oldest first. */
export function mergeMessages(...lists: Message[][]): Message[] {
  const byId = new Map<string, Message>();
  for (const list of lists) for (const m of list) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export const isImage = (mime: string) => mime.startsWith('image/');
