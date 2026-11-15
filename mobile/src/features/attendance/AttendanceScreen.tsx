import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { errorMessage } from '@/api';
import { formatDay, todayIST } from '@/lib/dates';
import { MIN_TOUCH, radius, spacing, useTheme } from '@/theme';
import { Badge, Card, EmptyState, ErrorState, Icon, ListRow, Screen, SectionHeader, SegmentedControl, Skeleton, Text, type BadgeTone } from '@/ui';
import { AttendanceSummary } from './AttendanceSummary';
import { GridLegend, MonthGrid } from './MonthGrid';
import {
  monthOf,
  notPresent,
  rangeDays,
  recordsIn,
  shiftMonth,
  STATUS_MARK,
  summarise,
  tally,
  type AttendanceStatus,
  type RangeKey,
} from './attendanceLogic';
import { useAttendance } from './useAttendance';

const RANGES = [
  { value: 'year', label: 'This year' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
] as const;

const CAPTION: Record<RangeKey, string> = { year: 'this year', thisMonth: 'this month', lastMonth: 'last month' };

const TONE: Record<AttendanceStatus, BadgeTone> = { PRESENT: 'good', ABSENT: 'bad', LATE: 'warn', ON_LEAVE: 'info' };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthTitle = (month: string) => `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;

/** Attendance for the signed-in student: ring, counts, a month grid, and the days not present. */
export function AttendanceScreen() {
  const today = todayIST();
  const { data, isLoading, isError, error, isFetching, noStudent, refetch } = useAttendance(today);
  const [range, setRange] = useState<RangeKey>('year');
  const [browsed, setBrowsed] = useState<string | null>(null);

  const yearStart = data?.from ?? today;
  const { from, to } = rangeDays(range, today, yearStart);
  const inRange = data ? recordsIn(data.records, from, to) : [];
  const summary = summarise(tally(inRange));
  const gridMonth = range === 'year' ? browsed ?? monthOf(today) : monthOf(from);
  const canGoBack = range === 'year' && gridMonth > monthOf(yearStart);
  const canGoForward = range === 'year' && gridMonth < monthOf(today);
  const absences = notPresent(inRange);

  const choose = (key: RangeKey) => {
    setRange(key);
    setBrowsed(null);
  };

  return (
    <Screen onRefresh={() => void refetch()} refreshing={isFetching && !isLoading}>
      {isLoading ? (
        <AttendanceSkeleton />
      ) : isError && !data ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} retrying={isFetching} />
      ) : noStudent ? (
        <EmptyState icon="school-outline" title="No student found" description="Attendance shows here once the school links a student to this account." />
      ) : !data || data.summary.markedDays === 0 ? (
        <EmptyState
          icon="checkmark-done-outline"
          title="No attendance marked yet"
          description="Your teacher has not marked attendance this year. It will show here once they do."
        />
      ) : (
        <>
          <SegmentedControl accessibilityLabel="Attendance range" options={RANGES} value={range} onChange={choose} />

          <Card style={{ gap: spacing.md }}>
            <AttendanceSummary summary={summary} caption={CAPTION[range]} />
            <Text variant="caption" tone="muted">
              {formatDay(from, 'dayMonth')} to {formatDay(to, 'medium')}
              {summary.markedDays === 0 ? ' · no days marked in this range' : ` · ${summary.markedDays} days marked`}
            </Text>
          </Card>

          <Card style={{ gap: spacing.md }}>
            <View style={styles.monthHead}>
              {range === 'year' ? <ArrowButton icon="chevron-back" label="Previous month" disabled={!canGoBack} onPress={() => setBrowsed(shiftMonth(gridMonth, -1))} /> : null}
              <Text variant="heading" align="center" style={styles.flex} accessibilityLiveRegion="polite">
                {monthTitle(gridMonth)}
              </Text>
              {range === 'year' ? <ArrowButton icon="chevron-forward" label="Next month" disabled={!canGoForward} onPress={() => setBrowsed(shiftMonth(gridMonth, 1))} /> : null}
            </View>
            <MonthGrid month={gridMonth} records={data.records} today={today} />
            <GridLegend />
          </Card>

          <SectionHeader title="Days not present" />
          {absences.length === 0 ? (
            <Card>
              <Text variant="small" tone="muted">
                {summary.markedDays === 0 ? 'No days marked in this range.' : 'You were present on every marked day in this range.'}
              </Text>
            </Card>
          ) : (
            <Card padding={0} style={{ overflow: 'hidden' }}>
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
        </>
      )}
    </Screen>
  );
}

function ArrowButton({ icon, label, disabled, onPress }: { icon: 'chevron-back' | 'chevron-forward'; label: string; disabled: boolean; onPress: () => void }) {
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

function AttendanceSkeleton() {
  return (
    <>
      <Skeleton height={48} rounded={radius.pill} />
      <Card style={{ flexDirection: 'row', gap: spacing.lg, alignItems: 'center' }}>
        <Skeleton width={128} height={128} rounded={64} />
        <View style={{ flex: 1, gap: spacing.md }}>
          <Skeleton height={14} />
          <Skeleton height={14} />
          <Skeleton height={14} />
        </View>
      </Card>
      <Card>
        <Skeleton height={260} />
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  monthHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH },
  arrow: { width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: MIN_TOUCH / 2, alignItems: 'center', justifyContent: 'center' },
});
