import { StyleSheet, View } from 'react-native';
import { spacing, useTheme } from '@/theme';
import { Badge, ProgressRing, Text } from '@/ui';
import { isLow, LOW_PERCENT, type Summary } from './attendanceLogic';

interface AttendanceSummaryProps {
  summary: Summary;
  /** What the ring's caption says: "this year", "this month". */
  caption: string;
  size?: number;
}

/** The ring with the percentage, and the four counts written beside it. */
export function AttendanceSummary({ summary, caption, size = 128 }: AttendanceSummaryProps) {
  const { colors } = useTheme();
  const low = isLow(summary.percent);
  const noDays = summary.percent === null;
  const rows: { label: string; value: number; color: string }[] = [
    { label: 'Present', value: summary.present, color: colors.goodFill },
    { label: 'Late', value: summary.late, color: colors.amber },
    { label: 'Absent', value: summary.absent, color: colors.badFill },
    { label: 'On leave', value: summary.onLeave, color: colors.info },
  ];
  return (
    <View style={styles.row}>
      <ProgressRing
        value={summary.percent ?? 0}
        size={size}
        strokeWidth={Math.round(size / 10)}
        tone={noDays ? 'primary' : low ? 'bad' : 'good'}
        centerLabel={noDays ? '–' : `${summary.percent}%`}
        caption={caption}
        accessibilityLabel={
          noDays ? `Attendance ${caption}: no days counted yet` : `Attendance ${caption}: ${summary.percent} percent${low ? ', low' : ''}`
        }
      />
      <View style={styles.legend}>
        {rows.map((r) => (
          <View key={r.label} style={styles.legendRow} accessible accessibilityLabel={`${r.label}: ${r.value}`}>
            <View style={[styles.key, { backgroundColor: r.color }]} />
            <Text variant="small" tone="muted" style={styles.flex}>
              {r.label}
            </Text>
            <Text variant="smallStrong" tone="strong">
              {r.value}
            </Text>
          </View>
        ))}
        {low ? (
          <View style={{ gap: spacing.xs }}>
            <Badge label="Low" tone="bad" />
            <Text variant="caption" tone="muted">
              Below {LOW_PERCENT}%
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  legend: { flex: 1, gap: spacing.sm },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  key: { width: 10, height: 10, borderRadius: 5 },
});
