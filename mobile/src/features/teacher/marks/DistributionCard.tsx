import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { spacing, useTheme } from '@/theme';
import { Card, Text } from '@/ui';
import { distributionSentence, markText, type Distribution, type ScoredStudent } from './marksLogic';

const BAR_HEIGHT = 16;

/** One band's bar. Drawn with react-native-svg; the count is written beside it, never only drawn. */
function BandBar({ share, low }: { share: number; low: boolean }) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.floor(e.nativeEvent.layout.width));
  const filled = width > 0 && share > 0 ? Math.max(6, Math.round(width * share)) : 0;
  return (
    <View style={styles.bar} onLayout={onLayout}>
      {width > 0 ? (
        <Svg width={width} height={BAR_HEIGHT} importantForAccessibility="no-hide-descendants">
          <Rect x={0} y={0} width={width} height={BAR_HEIGHT} rx={6} fill={colors.accent} />
          {filled > 0 ? <Rect x={0} y={0} width={filled} height={BAR_HEIGHT} rx={6} fill={low ? colors.badFill : colors.primary} /> : null}
        </Svg>
      ) : null}
    </View>
  );
}

function Names({ title, students, max }: { title: string; students: readonly ScoredStudent[]; max: number }) {
  if (students.length === 0) return null;
  return (
    <View style={styles.names}>
      <Text variant="smallStrong">{title}</Text>
      {students.map((s) => (
        <View key={s.studentId} style={styles.nameRow}>
          <Text variant="small" style={styles.flex} numberOfLines={1}>
            {s.name}
          </Text>
          <Text variant="smallStrong">
            {markText(s.marks)} / {markText(max)}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * How the class did: students per band as bars with the number beside each, who is missing, and
 * the three lowest and highest. The picture is hidden from screen readers, which get the same
 * numbers as a plain list instead.
 */
export function DistributionCard({ distribution, max, unsaved }: { distribution: Distribution; max: number; unsaved: boolean }) {
  const { colors } = useTheme();
  const d = distribution;
  const nobody = d.scored === 0;

  return (
    <Card style={styles.card} testID="distribution-card">
      <Text variant="heading" accessibilityRole="header">
        How the class did
      </Text>
      {unsaved ? (
        <Text variant="caption" tone="muted">
          Includes marks you have not saved yet.
        </Text>
      ) : null}

      {nobody ? (
        <Text variant="small" tone="muted">
          Enter some marks and the spread of the class shows here.
        </Text>
      ) : (
        <View style={styles.bands} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {d.bands.map((b) => (
            <View key={b.key} style={styles.bandRow} testID={`band-${b.from}`}>
              <Text variant="small" tone="muted" style={styles.bandLabel} numberOfLines={1}>
                {b.label}
              </Text>
              <BandBar share={d.peak > 0 ? b.count / d.peak : 0} low={b.from === 0} />
              <Text variant="smallStrong" style={styles.count}>
                {b.count}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* The same numbers as text, for screen readers. */}
      <View style={styles.srOnly} accessible accessibilityRole="text" accessibilityLabel={distributionSentence(d)} testID="distribution-list">
        {d.bands.map((b) => (
          <Text key={b.key} accessibilityRole="text">{`${b.label}: ${b.count} ${b.count === 1 ? 'student' : 'students'}`}</Text>
        ))}
      </View>

      <View style={[styles.missing, { borderTopColor: colors.border }]}>
        <Text variant="smallStrong">Missing: {d.missing}</Text>
        <Text variant="small" tone="muted">
          {d.missing === 0 ? 'Everyone has a mark.' : `${d.notEntered} not entered, ${d.absent} absent`}
        </Text>
      </View>

      <Names title="Three lowest" students={d.lowest} max={max} />
      <Names title="Three highest" students={d.highest} max={max} />
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { gap: spacing.md },
  bands: { gap: spacing.sm },
  bandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bandLabel: { width: 104 },
  bar: { flex: 1, height: BAR_HEIGHT },
  count: { width: 28, textAlign: 'right' },
  srOnly: { position: 'absolute', width: 1, height: 1, overflow: 'hidden' },
  missing: { gap: 2, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
  names: { gap: spacing.xs },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
