import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AttendanceSummary } from '@/features/attendance/AttendanceSummary';
import { rangeDays, recordsIn, summarise, tally } from '@/features/attendance/attendanceLogic';
import { useAttendance } from '@/features/attendance/useAttendance';
import { ResultRow } from '@/features/results/ResultRow';
import { useResults } from '@/features/results/useResults';
import { Timeline } from '@/features/timetable/Timeline';
import { minutesText, planDay, schoolIsOver, upNext } from '@/features/timetable/dayPlan';
import { useClassWeek } from '@/features/timetable/useTimetable';
import { formatClock, formatDay, minutesNowIST, startOfWeek, timeAgo } from '@/lib/dates';
import { radius, spacing, useTheme } from '@/theme';
import { Badge, Card, Icon, ListRow, Money, SectionHeader, Skeleton, Text } from '@/ui';
import { QueryBody, Section } from './HomeShell';
import { CATEGORY_LABEL, dueText, feesSummary, homeworkDueThisWeek, upcomingEvents } from './homeLogic';
import { useHomeEvents, useHomeFees, useHomeHomework, useHomeNotices } from './useHomeData';

interface ClockProps {
  /** Today in India, "YYYY-MM-DD". */
  today: string;
  now: Date;
}

// ---------- hero: greeting and "Up next" ----------

export function HeroCard({ today, now, firstName, classLabel }: ClockProps & { firstName: string; classLabel: string | null }) {
  const { colors } = useTheme();
  const week = useClassWeek(startOfWeek(today));
  const nowMin = minutesNowIST(now);
  const plan = planDay(week.week, today);
  const next = upNext(plan.rows, today, today, nowMin);
  const over = schoolIsOver(plan.rows, today, today, nowMin);

  let panel: { label: string; title: string; detail: string | null };
  if (week.isLoading) {
    panel = { label: 'Up next', title: '', detail: null };
  } else if (week.isError && !week.week) {
    panel = { label: 'Up next', title: 'Timetable unavailable', detail: 'Pull down to try again.' };
  } else if (plan.status === 'sunday' || plan.status === 'holiday') {
    panel = { label: 'Today', title: 'No school today', detail: plan.status === 'holiday' ? plan.holiday : 'Enjoy your Sunday.' };
  } else if (plan.status === 'no-lessons') {
    panel = { label: 'Today', title: 'No lessons today', detail: week.noClass ? 'You are not in a class this year.' : null };
  } else if (next) {
    const where = [next.row.teacher, next.row.room].filter(Boolean).join(' · ');
    panel = {
      label: next.when === 'now' ? 'Now' : 'Up next',
      title: next.row.subject ?? next.row.label,
      detail: `${formatClock(next.row.startsAt)} to ${formatClock(next.row.endsAt)}${where ? ` · ${where}` : ''}${
        next.when === 'now' ? ` · ${minutesText(next.minutes)} left` : ` · in ${minutesText(next.minutes)}`
      }`,
    };
  } else {
    panel = { label: 'Today', title: over ? 'School is over for today' : 'No more lessons today', detail: null };
  }

  return (
    <View style={[styles.hero, { backgroundColor: colors.primary }]} accessibilityRole="header">
      <Text variant="caption" tone="onPrimary" style={styles.heroDate}>
        {formatDay(today, 'weekday')}
        {classLabel ? ` · ${classLabel}` : ''}
      </Text>
      <Text variant="title" tone="onPrimary" accessibilityRole="header">
        {greetingFor(now)}, {firstName}
      </Text>
      <View style={[styles.upNext, { backgroundColor: colors.card }]} accessible accessibilityLabel={`${panel.label}: ${panel.title}${panel.detail ? `. ${panel.detail}` : ''}`}>
        <Text variant="label" tone="muted">
          {panel.label.toUpperCase()}
        </Text>
        {week.isLoading ? (
          <View style={{ gap: spacing.xs }}>
            <Skeleton height={20} width="50%" />
            <Skeleton height={14} width="80%" />
          </View>
        ) : (
          <>
            <Text variant="heading">{panel.title}</Text>
            {panel.detail ? (
              <Text variant="small" tone="muted">
                {panel.detail}
              </Text>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

function greetingFor(now: Date): string {
  const hour = Math.floor(minutesNowIST(now) / 60);
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

// ---------- today's timeline ----------

export function TimelineCard({ today, now }: ClockProps) {
  const router = useRouter();
  const week = useClassWeek(startOfWeek(today));
  const plan = planDay(week.week, today);
  return (
    <View style={{ gap: spacing.sm }}>
      <SectionHeader title="Today's timetable" actionLabel="See the week" onAction={() => router.push('/family/timetable')} />
      <Card style={{ gap: spacing.md }}>
        <QueryBody
          isLoading={week.isLoading}
          isError={week.isError && !week.week}
          error={week.error}
          onRetry={() => void week.refetch()}
          retrying={week.isFetching}
          lines={4}
          emptyText={week.noClass ? 'You are not in a class this year.' : week.week && !week.week.schedule ? 'The school has not set up the timetable yet.' : null}
        >
          <Timeline plan={plan} today={today} nowMin={minutesNowIST(now)} />
        </QueryBody>
      </Card>
    </View>
  );
}

// ---------- attendance ----------

export function AttendanceCard({ today }: { today: string }) {
  const router = useRouter();
  const att = useAttendance(today);
  const { from, to } = rangeDays('year', today, att.data?.from ?? today);
  const summary = att.data ? summarise(tally(recordsIn(att.data.records, from, to))) : null;
  return (
    <View style={{ gap: spacing.sm }}>
      <SectionHeader title="Attendance" actionLabel="Details" onAction={() => router.push('/family/attendance')} />
      <Card style={{ gap: spacing.md }} onPress={() => router.push('/family/attendance')} accessibilityLabel="Attendance this year. Open details">
        <QueryBody
          isLoading={att.isLoading}
          isError={att.isError && !att.data}
          error={att.error}
          onRetry={() => void att.refetch()}
          retrying={att.isFetching}
          lines={3}
          emptyText={att.noStudent ? 'No student is linked to this account.' : summary && summary.markedDays === 0 ? 'No attendance has been marked this year yet.' : null}
        >
          {summary ? <AttendanceSummary summary={summary} caption="this year" size={108} /> : null}
        </QueryBody>
      </Card>
    </View>
  );
}

// ---------- fees ----------

export function FeesCard() {
  const router = useRouter();
  const { colors } = useTheme();
  const fees = useHomeFees();
  const summary = fees.data ? feesSummary(fees.data) : null;
  return (
    <View style={{ gap: spacing.sm }}>
      <SectionHeader title="Fees" actionLabel="Details" onAction={() => router.push('/family/fees')} />
      <Card style={{ gap: spacing.sm }} onPress={() => router.push('/family/fees')} accessibilityLabel="Fees. Open details">
        <QueryBody isLoading={fees.isLoading} isError={fees.isError && !fees.data} error={fees.error} onRetry={() => void fees.refetch()} retrying={fees.isFetching} lines={2}>
          {summary ? (
            summary.pendingPaise === 0 ? (
              <View style={styles.row}>
                <Icon name="checkmark-circle" size={24} color={colors.goodFill} />
                <Text variant="bodyStrong" tone="good">
                  Nothing owed
                </Text>
              </View>
            ) : (
              <>
                <Text variant="label" tone="muted">
                  OWED
                </Text>
                <Money paise={summary.pendingPaise} variant="display" tone={summary.overduePaise > 0 ? 'bad' : 'strong'} />
                {summary.overduePaise > 0 ? (
                  <View style={styles.row}>
                    <Badge label="Overdue" tone="bad" />
                    <Money paise={summary.overduePaise} variant="smallStrong" tone="bad" />
                    {summary.oldestOverdueOn ? (
                      <Text variant="caption" tone="muted">
                        since {formatDay(summary.oldestOverdueOn, 'dayMonth')}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
                <Text variant="small" tone="muted">
                  Pay at the school office.
                </Text>
              </>
            )
          ) : null}
        </QueryBody>
      </Card>
    </View>
  );
}

// ---------- homework ----------

export function HomeworkCard({ today }: { today: string }) {
  const router = useRouter();
  const hw = useHomeHomework();
  const due = hw.data ? homeworkDueThisWeek(hw.data, today) : [];
  return (
    <Section
      title="Homework due this week"
      actionLabel="See all"
      onAction={() => router.push('/family/homework')}
      isLoading={hw.isLoading}
      isError={hw.isError && !hw.data}
      error={hw.error}
      onRetry={() => void hw.refetch()}
      retrying={hw.isFetching}
      lines={3}
      padding={0}
      emptyText={null}
    >
      {due.length === 0 ? (
        <View style={{ padding: spacing.lg }}>
          <Text variant="small" tone="muted">
            Nothing due this week. Enjoy!
          </Text>
        </View>
      ) : (
        <View>
          <View style={[styles.count, { paddingHorizontal: spacing.lg, paddingTop: spacing.lg }]}>
            <Badge label={`${due.length} to do`} tone="amber" />
          </View>
          {due.slice(0, 3).map((h, i) => (
            <ListRow
              key={h.id}
              title={h.title}
              subtitle={[h.subject?.name, dueText(h.dueOn, today)].filter(Boolean).join(' · ')}
              icon="book-outline"
              onPress={() => router.push('/family/homework')}
              showDivider={i < Math.min(due.length, 3) - 1}
            />
          ))}
        </View>
      )}
    </Section>
  );
}

// ---------- results ----------

export function ResultsCard() {
  const router = useRouter();
  const results = useResults();
  const latest = results.data ? [...results.data.results].sort((a, b) => (a.assessment.conductedOn < b.assessment.conductedOn ? 1 : -1)).slice(0, 3) : [];
  return (
    <Section
      title="Latest results"
      actionLabel="See all"
      onAction={() => router.push('/family/results')}
      isLoading={results.isLoading}
      isError={results.isError && !results.data}
      error={results.error}
      onRetry={() => void results.refetch()}
      retrying={results.isFetching}
      lines={3}
      padding={0}
      emptyText={null}
    >
      {latest.length === 0 ? (
        <View style={{ padding: spacing.lg }}>
          <Text variant="small" tone="muted">
            No results published yet.
          </Text>
        </View>
      ) : (
        <View>
          {latest.map((item, i) => (
            <ResultRow key={item.assessment.id} item={item} showSubject divider={i < latest.length - 1} />
          ))}
        </View>
      )}
    </Section>
  );
}

// ---------- notices ----------

export function NoticesCard() {
  const router = useRouter();
  const notices = useHomeNotices();
  const items = notices.data ?? [];
  return (
    <Section
      title="Notices"
      actionLabel="See all"
      onAction={() => router.push('/family/notices')}
      isLoading={notices.isLoading}
      isError={notices.isError && !notices.data}
      error={notices.error}
      onRetry={() => void notices.refetch()}
      retrying={notices.isFetching}
      lines={3}
      padding={0}
    >
      {items.length === 0 ? (
        <View style={{ padding: spacing.lg }}>
          <Text variant="small" tone="muted">
            No notices right now.
          </Text>
        </View>
      ) : (
        <View>
          {items.map((n, i) => (
            <ListRow
              key={n.id}
              title={n.title}
              subtitle={`${timeAgo(n.createdAt)} · ${n.body.replace(/\s+/g, ' ').slice(0, 70)}`}
              icon="megaphone-outline"
              onPress={() => router.push('/family/notices')}
              showDivider={i < items.length - 1}
            />
          ))}
        </View>
      )}
    </Section>
  );
}

// ---------- events ----------

export function EventsCard({ today }: { today: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const events = useHomeEvents(today);
  const next = events.data ? upcomingEvents(events.data, today, 3) : [];
  return (
    <Section
      title="Coming up"
      actionLabel="Calendar"
      onAction={() => router.push('/family/calendar')}
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
                onPress={() => router.push('/family/calendar')}
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
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  count: { flexDirection: 'row' },
  dateTile: { width: 44, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
