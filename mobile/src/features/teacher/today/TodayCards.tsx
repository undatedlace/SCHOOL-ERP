import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useApiQuery } from '@/api';
import { QueryBody, Section } from '@/features/home/HomeShell';
import { CATEGORY_LABEL, upcomingEvents, type CalendarEvent } from '@/features/home/homeLogic';
import { ConversationRow } from '@/features/messages/ConversationRow';
import type { Conversation, Page, UnreadCounts } from '@/features/messages/types';
import { Timeline } from '@/features/timetable/Timeline';
import { minutesText, schoolIsOver, upNext, type DayPlan } from '@/features/timetable/dayPlan';
import { addDays, formatClock, formatDay, greeting } from '@/lib/dates';
import { radius, spacing, useTheme } from '@/theme';
import { Badge, Button, Card, ListRow, SectionHeader, Skeleton, StatTile, Text } from '@/ui';
import { ProgressBar } from '../ProgressBar';
import { awaitingMarking, dueText, markedProgressText, type QueueItem } from '../homework/homeworkLogic';
import { isMyLesson, lessonsAway, lessonsToTeach, nextLessonText, registerHref } from './teacherDay';
import type { OverviewDivision } from '../attendance/useAttendanceData';

interface Clock {
  today: string;
  nowMin: number;
}

// ---------- hero ----------

export function Hero({ firstName, today, nowMin, now, plan, loading }: Clock & { firstName: string; now: Date; plan: DayPlan | null; loading: boolean }) {
  const { colors } = useTheme();
  let label = 'Today';
  let title = '';
  let detail: string | null = null;
  if (plan) {
    const next = upNext(plan.rows, today, today, nowMin);
    const over = schoolIsOver(plan.rows, today, today, nowMin);
    if (plan.status === 'sunday' || plan.status === 'holiday') {
      title = 'No school today';
      detail = plan.status === 'holiday' ? plan.holiday : 'It is Sunday.';
    } else if (plan.status === 'no-lessons') {
      title = 'No lessons today';
      detail = 'You have no periods on your timetable today.';
    } else if (next) {
      label = next.when === 'now' ? 'Now' : 'Up next';
      title = `${next.row.divisionLabel ?? next.row.label}${next.row.subject ? ` · ${next.row.subject}` : ''}`;
      detail = `${formatClock(next.row.startsAt)} to ${formatClock(next.row.endsAt)}${next.row.room ? ` · ${next.row.room}` : ''} · ${
        next.when === 'now' ? `${minutesText(next.minutes)} left` : `in ${minutesText(next.minutes)}`
      }`;
    } else {
      title = over ? 'School is over for today' : 'No more lessons today';
    }
  }
  return (
    <View style={[styles.hero, { backgroundColor: colors.primary }]} accessibilityRole="header">
      <Text variant="caption" tone="onPrimary" style={styles.heroDate}>
        {formatDay(today, 'weekday')}
      </Text>
      <Text variant="title" tone="onPrimary" accessibilityRole="header">
        {greeting(now)}, {firstName}
      </Text>
      <View
        style={[styles.upNext, { backgroundColor: colors.card }]}
        accessible
        accessibilityLabel={`${label}: ${title}${detail ? `. ${detail}` : ''}`}
      >
        <Text variant="label" tone="muted">
          {label.toUpperCase()}
        </Text>
        {loading ? (
          <View style={{ gap: spacing.xs }}>
            <Skeleton height={20} width="50%" />
            <Skeleton height={14} width="80%" />
          </View>
        ) : (
          <>
            <Text variant="heading">{title || 'Timetable unavailable'}</Text>
            {detail ? (
              <Text variant="small" tone="muted">
                {detail}
              </Text>
            ) : title ? null : (
              <Text variant="small" tone="muted">
                Pull down to try again.
              </Text>
            )}
          </>
        )}
      </View>
    </View>
  );
}

// ---------- tiles ----------

export function Tiles({
  today,
  nowMin,
  plan,
  loading,
  queue,
  queueLoading,
  overview,
  overviewLoading,
}: Clock & {
  plan: DayPlan | null;
  loading: boolean;
  queue: QueueItem[];
  queueLoading: boolean;
  overview: OverviewDivision[] | undefined;
  overviewLoading: boolean;
}) {
  const router = useRouter();
  const noSchool = plan !== null && (plan.status === 'sunday' || plan.status === 'holiday');
  const lessons = plan ? lessonsToTeach(plan) : 0;
  const away = plan ? lessonsAway(plan) : 0;
  const next = plan ? upNext(plan.rows, today, today, nowMin) : null;
  const nextText = nextLessonText(next, formatClock);
  const waiting = awaitingMarking(queue);
  const absent = overview?.reduce((n, d) => n + d.counts.absent, 0) ?? 0;
  const late = overview?.reduce((n, d) => n + d.counts.late, 0) ?? 0;
  const notTaken = overview?.filter((d) => d.marked === 0).length ?? 0;

  return (
    <View style={styles.tiles}>
      <View style={styles.tileRow}>
        <StatTile
          label="Lessons today"
          value={loading ? '–' : noSchool ? '0' : String(lessons)}
          hint={loading ? undefined : noSchool ? 'No school today' : [nextText, away > 0 ? `${away} cancelled or covered` : null].filter(Boolean).join(' · ') || 'No more today'}
          icon="easel-outline"
        />
        <StatTile
          label="Awaiting marking"
          value={queueLoading ? '–' : String(waiting)}
          hint={queueLoading ? undefined : waiting === 0 ? 'Nothing waiting' : `in ${queue.length} homework${queue.length === 1 ? '' : 's'}`}
          icon="create-outline"
          tone={waiting > 0 ? 'amber' : 'default'}
          onPress={() => router.push('/teacher/homework')}
        />
      </View>
      <View style={styles.tileRow}>
        <StatTile
          label={noSchool ? 'Attendance' : 'Absent or late today'}
          value={overviewLoading ? '–' : noSchool ? '–' : String(absent + late)}
          hint={
            overviewLoading
              ? undefined
              : noSchool
                ? 'No school today'
                : overview && overview.length > 0
                  ? notTaken > 0
                    ? `${absent} absent, ${late} late · ${notTaken} of ${overview.length} register${overview.length === 1 ? '' : 's'} not taken`
                    : `${absent} absent, ${late} late · all registers taken`
                  : 'You have no classes this year'
          }
          icon="checkmark-done-outline"
          tone={!noSchool && notTaken > 0 ? 'warn' : 'default'}
          onPress={() => router.push('/teacher/attendance')}
        />
      </View>
    </View>
  );
}

// ---------- the day's lessons ----------

export function LessonsCard({
  today,
  nowMin,
  plan,
  loading,
  error,
  onRetry,
  retrying,
}: Clock & {
  plan: DayPlan | null;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  retrying: boolean;
}) {
  const router = useRouter();
  return (
    <View style={{ gap: spacing.sm }}>
      <SectionHeader title="Your lessons today" />
      <Card style={{ gap: spacing.md }}>
        <QueryBody isLoading={loading} isError={error !== null && plan === null} error={error} onRetry={onRetry} retrying={retrying} lines={4}>
          {plan ? (
            <Timeline
              plan={plan}
              today={today}
              nowMin={nowMin}
              renderAction={(row) => {
                const href = registerHref(row, today);
                if (!href || !isMyLesson(row)) return null;
                return (
                  <View style={styles.action}>
                    <Button
                      title="Register"
                      icon="checkmark-done-outline"
                      size="sm"
                      variant="secondary"
                      fullWidth={false}
                      onPress={() => router.push(href)}
                      accessibilityLabel={`Take the register for ${row.divisionLabel ?? 'this class'}`}
                      testID={`register-${row.key}`}
                    />
                  </View>
                );
              }}
            />
          ) : null}
        </QueryBody>
      </Card>
    </View>
  );
}

// ---------- the marking queue ----------

export function MarkingQueueCard({
  queue,
  today,
  isLoading,
  isError,
  error,
  onRetry,
  retrying,
}: {
  queue: QueueItem[];
  today: string;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  onRetry: () => void;
  retrying: boolean;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <Section
      title="Marking queue"
      actionLabel="Homework"
      onAction={() => router.push('/teacher/homework')}
      isLoading={isLoading}
      isError={isError}
      error={error}
      onRetry={onRetry}
      retrying={retrying}
      lines={3}
      padding={0}
    >
      {queue.length === 0 ? (
        <View style={{ padding: spacing.lg }}>
          <Text variant="small" tone="muted">
            Nothing to mark. Work students hand in appears here.
          </Text>
        </View>
      ) : (
        <View>
          {queue.slice(0, 4).map(({ homework: hw, stats }, i, list) => (
            <ListRow
              key={hw.id}
              title={hw.title}
              subtitle={[hw.divisions.map((d) => d.label).join(', '), dueText(hw.dueOn, today)].filter(Boolean).join(' · ')}
              trailing={
                <View style={styles.queueTrailing}>
                  <Badge label={`${stats.toMark} to mark`} tone="amber" />
                  <Text variant="caption" tone="muted">
                    {markedProgressText(stats)}
                  </Text>
                </View>
              }
              onPress={() => router.push(`/teacher/homework/${hw.id}`)}
              showDivider={i < list.length - 1}
              testID={`queue-${hw.id}`}
            />
          ))}
          <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.xs }}>
            {queue.length > 4 ? (
              <Text variant="caption" tone="muted">
                and {queue.length - 4} more in Homework
              </Text>
            ) : null}
            <ProgressBar
              share={queue.reduce((n, q) => n + q.stats.marked, 0) / Math.max(1, queue.reduce((n, q) => n + q.stats.handedIn, 0))}
              label="Share of handed-in work that is marked"
              tone="good"
            />
          </View>
          <View style={[styles.hairline, { backgroundColor: colors.border }]} />
          <Text variant="caption" tone="muted" style={{ padding: spacing.md, paddingHorizontal: spacing.lg }}>
            Oldest due day first. {awaitingMarking(queue)} piece{awaitingMarking(queue) === 1 ? '' : 's'} of work waiting.
          </Text>
        </View>
      )}
    </Section>
  );
}

// ---------- messages ----------

export function MessagesCard() {
  const router = useRouter();
  const counts = useApiQuery<UnreadCounts>('/messages/unread-count', { refetchInterval: 60_000 });
  const unread = useApiQuery<Page<Conversation>>('/messages', { query: { page: 1, pageSize: 3, unread: 'true' }, refetchInterval: 60_000 });
  const items = unread.data?.items ?? [];
  const total = counts.data?.unread ?? unread.data?.total ?? 0;
  return (
    <Section
      title="Messages"
      actionLabel="Open"
      onAction={() => router.push('/teacher/messages')}
      isLoading={unread.isLoading}
      isError={unread.isError && !unread.data}
      error={unread.error}
      onRetry={() => void unread.refetch()}
      retrying={unread.isFetching}
      lines={2}
      padding={0}
    >
      {items.length === 0 ? (
        <View style={{ padding: spacing.lg }}>
          <Text variant="small" tone="muted">
            No unread messages.
          </Text>
        </View>
      ) : (
        <View>
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
            <Badge label={`${total} conversation${total === 1 ? '' : 's'} unread`} tone="info" />
          </View>
          {items.map((c, i) => (
            <ConversationRow key={c.id} conversation={c} showDivider={i < items.length - 1} onPress={() => router.push(`/teacher/messages/${c.id}`)} />
          ))}
        </View>
      )}
    </Section>
  );
}

// ---------- coming up ----------

export function EventsCard({ today }: { today: string }) {
  const { colors } = useTheme();
  const events = useApiQuery<CalendarEvent[]>('/calendar', { query: { from: today, to: addDays(today, 60) } });
  const next = events.data ? upcomingEvents(events.data, today, 3) : [];
  return (
    <Section
      title="Coming up"
      isLoading={events.isLoading}
      isError={events.isError && !events.data}
      error={events.error}
      onRetry={() => void events.refetch()}
      retrying={events.isFetching}
      lines={3}
      padding={0}
    >
      {next.length === 0 ? (
        <View style={{ padding: spacing.lg }}>
          <Text variant="small" tone="muted">
            Nothing in the calendar for the next two months.
          </Text>
        </View>
      ) : (
        <View>
          {next.map((e, i) => {
            const day = e.startsOn < today ? today : e.startsOn;
            const time = e.startTime ? `${formatClock(e.startTime)}${e.endTime ? ` to ${formatClock(e.endTime)}` : ''}` : 'All day';
            return (
              <ListRow
                key={e.id}
                title={e.title}
                subtitle={`${CATEGORY_LABEL[e.category]} · ${time}${e.endsOn !== e.startsOn ? ` · until ${formatDay(e.endsOn, 'dayMonth')}` : ''}`}
                leading={
                  <View style={[styles.dateTile, { backgroundColor: colors.amberSoft }]} accessible accessibilityLabel={formatDay(day, 'weekday')}>
                    <Text variant="caption" style={{ color: colors.amberInk }}>
                      {formatDay(day, 'dayMonth').split(' ')[1]}
                    </Text>
                    <Text variant="subheading" style={{ color: colors.amberInk }}>
                      {Number(day.slice(8))}
                    </Text>
                  </View>
                }
                showDivider={i < next.length - 1}
              />
            );
          })}
        </View>
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.xl, padding: spacing.lg, gap: spacing.sm },
  heroDate: { opacity: 0.85 },
  upNext: { borderRadius: radius.lg, padding: spacing.md, gap: 2, marginTop: spacing.xs },
  tiles: { gap: spacing.md },
  tileRow: { flexDirection: 'row', gap: spacing.md },
  action: { marginTop: spacing.xs, flexDirection: 'row' },
  queueTrailing: { alignItems: 'flex-end', gap: 2 },
  hairline: { height: StyleSheet.hairlineWidth },
  dateTile: { width: 44, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
