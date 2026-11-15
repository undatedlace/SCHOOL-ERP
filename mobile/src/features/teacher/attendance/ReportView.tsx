import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { errorMessage, useApiQuery } from '@/api';
import { formatDay } from '@/lib/dates';
import { spacing, useTheme } from '@/theme';
import { Badge, Card, EmptyState, ErrorState, SegmentedControl, Skeleton, StatTile, Text } from '@/ui';
import { ProgressBar } from '../ProgressBar';
import {
  REPORT_RANGES,
  isLowPercent,
  lowestFirst,
  percentText,
  reportQuery,
  reportSummary,
  type DivisionReport,
  type ReportRange,
  type ReportStudent,
} from './rosterLogic';

/** Attendance of a division over a range: a list with the percentage per student, "Low" under 75%. */
export function ReportView({ divisionId, today }: { divisionId: string; today: string }) {
  const [range, setRange] = useState<ReportRange>('month');
  const report = useApiQuery<DivisionReport>(`/attendance/divisions/${divisionId}/report`, { query: reportQuery(range, today) });
  const data = report.data;
  const summary = data ? reportSummary(data) : null;

  return (
    <View style={styles.wrap}>
      <SegmentedControl<ReportRange> accessibilityLabel="Report range" value={range} onChange={setRange} options={REPORT_RANGES} />

      {report.isLoading ? (
        <Card style={styles.gap}>
          <Skeleton height={20} width="50%" />
          <Skeleton height={48} />
          <Skeleton height={48} />
        </Card>
      ) : report.isError && !data ? (
        <ErrorState message={errorMessage(report.error)} onRetry={() => void report.refetch()} retrying={report.isFetching} />
      ) : data && summary ? (
        data.daysMarked === 0 ? (
          <EmptyState
            icon="calendar-outline"
            title="No attendance taken in this time"
            description={`Nothing was marked between ${formatDay(data.from, 'dayMonth')} and ${formatDay(data.to, 'dayMonth')}.`}
          />
        ) : (
          <>
            <Text variant="caption" tone="muted">
              {formatDay(data.from, 'medium')} to {formatDay(data.to, 'medium')} · {summary.daysMarked} day{summary.daysMarked === 1 ? '' : 's'} taken
            </Text>
            <View style={styles.tiles}>
              <StatTile label="Class attendance" value={percentText(summary.percent)} tone={isLowPercent(summary.percent) ? 'bad' : 'good'} icon="stats-chart-outline" />
              <StatTile
                label="Under 75%"
                value={String(summary.low)}
                hint={summary.low === 0 ? 'Nobody is low' : 'Low attendance'}
                tone={summary.low > 0 ? 'bad' : 'default'}
                icon="alert-circle-outline"
              />
            </View>
            <Card padding={0} style={styles.list}>
              {lowestFirst(data.students).map((s, i, all) => (
                <ReportRow key={s.studentId} student={s} last={i === all.length - 1} />
              ))}
            </Card>
          </>
        )
      ) : null}
    </View>
  );
}

function ReportRow({ student: s, last }: { student: ReportStudent; last: boolean }) {
  const { colors } = useTheme();
  const low = isLowPercent(s.percent);
  const counts = `Present ${s.present} · Absent ${s.absent} · Late ${s.late} · Leave ${s.onLeave}`;
  return (
    <View
      style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
      accessible
      accessibilityLabel={`${s.name}, ${percentText(s.percent)}${low ? ', low attendance' : ''}. ${counts}`}
      testID={`report-${s.studentId}`}
    >
      <View style={styles.rowTop}>
        <Text variant="bodyStrong" numberOfLines={1} style={styles.flex}>
          {s.name}
        </Text>
        {low ? <Badge label="Low" tone="bad" /> : null}
        <Text variant="bodyStrong" tone={low ? 'bad' : 'strong'}>
          {percentText(s.percent)}
        </Text>
      </View>
      {s.percent !== null ? <ProgressBar share={s.percent / 100} label={`${s.name} ${percentText(s.percent)}`} tone={low ? 'amber' : 'good'} /> : null}
      <Text variant="caption" tone="muted">
        {counts}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  gap: { gap: spacing.md },
  flex: { flex: 1 },
  tiles: { flexDirection: 'row', gap: spacing.md },
  list: { overflow: 'hidden' },
  row: { gap: spacing.xs, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
