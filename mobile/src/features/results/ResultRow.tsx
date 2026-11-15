import { StyleSheet, View } from 'react-native';
import { formatDay } from '@/lib/dates';
import { spacing, useTheme } from '@/theme';
import { Badge, Text } from '@/ui';
import { KIND_LABEL, markText, type ResultItem } from './resultsLogic';

/** One test: its name, kind and date on the left; marks, percentage or "Absent" on the right. */
export function ResultRow({ item, showSubject = false, divider = false }: { item: ResultItem; showSubject?: boolean; divider?: boolean }) {
  const { colors } = useTheme();
  const a = item.assessment;
  const scored = !item.absent && item.marks !== null;
  const meta = [showSubject ? a.subject.name : null, KIND_LABEL[a.kind], formatDay(a.conductedOn, 'medium')].filter(Boolean).join(' · ');
  const label = [
    `${a.subject.name}, ${a.name}`,
    KIND_LABEL[a.kind],
    formatDay(a.conductedOn, 'medium'),
    item.absent ? 'Absent' : scored ? `${markText(item.marks!)} out of ${markText(a.maxMarks)}, ${item.percent} percent` : 'No marks yet',
    item.remark ? `Remark: ${item.remark}` : null,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <View
      accessible
      accessibilityLabel={label}
      style={[styles.row, divider && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
    >
      <View style={styles.main}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {a.name}
        </Text>
        <Text variant="small" tone="muted" numberOfLines={2}>
          {meta}
        </Text>
        {item.remark ? (
          <Text variant="small" tone="default" style={styles.remark}>
            “{item.remark}”
          </Text>
        ) : null}
      </View>
      <View style={styles.score}>
        {item.absent ? (
          <Badge label="Absent" tone="warn" />
        ) : scored ? (
          <>
            <Text variant="heading" tone="strong">
              {markText(item.marks!)}
              <Text variant="small" tone="muted">
                {' '}
                / {markText(a.maxMarks)}
              </Text>
            </Text>
            <Text variant="smallStrong" tone="primary">
              {item.percent}%
            </Text>
          </>
        ) : (
          <Text variant="small" tone="muted">
            –
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  main: { flex: 1, gap: 2 },
  remark: { marginTop: spacing.xs, fontStyle: 'italic' },
  score: { alignItems: 'flex-end', gap: 2, minWidth: 64 },
});
