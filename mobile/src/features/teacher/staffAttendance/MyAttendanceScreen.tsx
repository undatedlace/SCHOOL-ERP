import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { errorMessage, isApiError, useApiQuery } from '@/api';
import { AttendanceSummary } from '@/features/attendance/AttendanceSummary';
import { GridLegend, MonthGrid } from '@/features/attendance/MonthGrid';
import { STATUS_MARK, notPresent, type AttendanceStatus } from '@/features/attendance/attendanceLogic';
import { formatDay, todayIST } from '@/lib/dates';
import { MIN_TOUCH, spacing, useTheme } from '@/theme';
import { Badge, Card, EmptyState, ErrorState, Icon, ListRow, Screen, SectionHeader, Skeleton, Text, type BadgeTone } from '@/ui';
import { canStep, monthOf, monthRange, recordsFromAnswer, shiftMonth, summaryUpTo, upcomingLeave, type StaffAttendanceAnswer } from './staffAttendanceLogic';

const TONE: Record<AttendanceStatus, BadgeTone> = { PRESENT: 'good', ABSENT: 'bad', LATE: 'warn', ON_LEAVE: 'info' };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthTitle = (month: string) => `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;

/** My own attendance, a month at a time: a ring, a month grid with a letter and a word, and the days not present. */
export function MyAttendanceScreen() {
  const today = todayIST();
  const [month, setMonth] = useState(monthOf(today));
  const range = monthRange(month);
  const query = useApiQuery<StaffAttendanceAnswer>('/staff-attendance/me', { query: range, staleTime: 30_000 });
  const records = recordsFromAnswer(query.data);
  const summary = summaryUpTo(records, today);
  const absences = notPresent(records.filter((r) => r.date <= today));
  const later = upcomingLeave(records, today);
  const noRecord = isApiError(query.error) && query.error.status === 404;

  return (
    <Screen onRefresh={() => void query.refetch()} refreshing={query.isRefetching && !query.isLoading}>
      <View style={styles.monthHead}>
        <Arrow icon="chevron-back" label="Previous month" disabled={!canStep(month, -1, today)} onPress={() => setMonth(shiftMonth(month, -1))} />
        <Text variant="heading" align="center" style={styles.flex} accessibilityLiveRegion="polite" testID="month-title">
          {monthTitle(month)}
        </Text>
        <Arrow icon="chevron-forward" label="Next month" disabled={!canStep(month, 1, today)} onPress={() => setMonth(shiftMonth(month, 1))} />
      </View>

      {query.isLoading ? (
        <Card>
          <Skeleton height={260} />
        </Card>
      ) : noRecord ? (
        <EmptyState
          icon="person-outline"
          title="No staff record"
          description="Your attendance shows here once the school links your login to your staff record."
        />
      ) : query.isError && !query.data ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} retrying={query.isRefetching} />
      ) : (
        <>
          <Card style={styles.gap}>
            <AttendanceSummary summary={summary} caption={month === monthOf(today) ? 'this month' : 'that month'} />
            <Text variant="caption" tone="muted">
              {summary.markedDays === 0 ? 'Nothing marked in this month yet.' : `${summary.markedDays} ${summary.markedDays === 1 ? 'day' : 'days'} marked so far`}
              {later > 0 ? ` · ${later} more ${later === 1 ? 'day' : 'days'} of approved leave coming up` : ''}
            </Text>
          </Card>

          <Card style={styles.gap}>
            <MonthGrid month={month} records={records} today={today} />
            <GridLegend />
          </Card>

          <SectionHeader title="Days not present" />
          {absences.length === 0 ? (
            <Card>
              <Text variant="small" tone="muted">
                {summary.markedDays === 0 ? 'No days marked in this month.' : 'You were present on every marked day this month.'}
              </Text>
            </Card>
          ) : (
            <Card padding={0} style={styles.list}>
              {absences.map((r, i) => (
                <ListRow
                  key={r.date}
                  title={formatDay(r.date, 'weekday')}
                  subtitle={r.note ?? undefined}
                  chevron={false}
                  showDivider={i < absences.length - 1}
                  trailing={<Badge label={STATUS_MARK[r.status].label} tone={TONE[r.status]} />}
                />
              ))}
            </Card>
          )}
          <Text variant="caption" tone="muted">
            The school office marks staff attendance. If something here looks wrong, tell the office.
          </Text>
        </>
      )}
    </Screen>
  );
}

function Arrow({ icon, label, disabled, onPress }: { icon: 'chevron-back' | 'chevron-forward'; label: string; disabled: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={[styles.arrow, { backgroundColor: colors.accent, opacity: disabled ? 0.4 : 1 }]}
    >
      <Icon name={icon} size={20} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: spacing.md },
  list: { overflow: 'hidden' },
  monthHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH },
  arrow: { width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: MIN_TOUCH / 2, alignItems: 'center', justifyContent: 'center' },
});
