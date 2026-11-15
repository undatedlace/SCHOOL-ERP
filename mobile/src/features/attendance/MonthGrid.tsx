import { StyleSheet, View } from 'react-native';
import { formatDay } from '@/lib/dates';
import { fontFamily, radius, spacing, useTheme, type ColorTokens } from '@/theme';
import { Text } from '@/ui';
import { monthGrid, STATUS_MARK, type AttendanceRecord, type AttendanceStatus } from './attendanceLogic';

const HEADS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function palette(colors: ColorTokens, status: AttendanceStatus) {
  switch (status) {
    case 'PRESENT':
      return { bg: colors.goodSoft, fg: colors.good };
    case 'ABSENT':
      return { bg: colors.badSoft, fg: colors.bad };
    case 'LATE':
      return { bg: colors.warnSoft, fg: colors.warn };
    default:
      return { bg: colors.infoSoft, fg: colors.info };
  }
}

interface MonthGridProps {
  /** "YYYY-MM" */
  month: string;
  records: readonly AttendanceRecord[];
  today: string;
}

/** One month as a calendar: each marked day shows a letter (P, A, L, Lv) and a colour. */
export function MonthGrid({ month, records, today }: MonthGridProps) {
  const { colors } = useTheme();
  const rows = monthGrid(month, records, today);
  return (
    <View style={{ gap: spacing.xs }} testID="month-grid">
      <View style={styles.row} importantForAccessibility="no-hide-descendants">
        {HEADS.map((h) => (
          <View key={h} style={styles.cellWrap}>
            <Text variant="caption" tone="faint" align="center">
              {h}
            </Text>
          </View>
        ))}
      </View>
      {rows.map((row, r) => (
        <View key={r} style={styles.row}>
          {row.map((cell, c) => {
            if (!cell.date) return <View key={c} style={styles.cellWrap} />;
            const mark = cell.status ? STATUS_MARK[cell.status] : null;
            const p = cell.status ? palette(colors, cell.status) : null;
            const label = `${formatDay(cell.date, 'weekday')}${cell.isToday ? ', today' : ''}: ${
              mark ? mark.label : cell.isSunday ? 'Sunday' : cell.isFuture ? 'not yet' : 'not marked'
            }`;
            return (
              <View key={c} style={styles.cellWrap}>
                <View
                  accessible
                  accessibilityLabel={label}
                  style={[
                    styles.cell,
                    {
                      backgroundColor: p ? p.bg : cell.isSunday ? colors.accent : 'transparent',
                      borderColor: cell.isToday ? colors.primary : 'transparent',
                    },
                  ]}
                >
                  <Text variant="caption" style={{ color: p ? p.fg : cell.isFuture ? colors.faint : colors.mutedForeground }}>
                    {cell.day}
                  </Text>
                  <Text
                    variant="smallStrong"
                    maxFontSizeMultiplier={1.2}
                    style={{ color: p ? p.fg : colors.faint, fontFamily: fontFamily.bodyBold, minHeight: 18 }}
                  >
                    {mark ? mark.letter : ''}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** The key under the grid: a letter and a word for each mark. */
export function GridLegend() {
  const { colors } = useTheme();
  return (
    <View style={styles.legend} importantForAccessibility="no-hide-descendants">
      {(Object.keys(STATUS_MARK) as AttendanceStatus[]).map((status) => {
        const p = palette(colors, status);
        return (
          <View key={status} style={styles.legendItem}>
            <View style={[styles.legendBox, { backgroundColor: p.bg }]}>
              <Text variant="caption" style={{ color: p.fg, fontFamily: fontFamily.bodyBold }}>
                {STATUS_MARK[status].letter}
              </Text>
            </View>
            <Text variant="caption" tone="muted">
              {STATUS_MARK[status].label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  cellWrap: { flex: 1, padding: 2 },
  cell: {
    aspectRatio: 1,
    minHeight: 44,
    borderRadius: radius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendBox: { minWidth: 26, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
});
