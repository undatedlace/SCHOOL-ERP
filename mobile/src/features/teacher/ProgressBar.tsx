import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme';

/** A thin bar showing a share from 0 to 1. The share is also announced, never colour alone. */
export function ProgressBar({ share, label, tone = 'primary' }: { share: number; label: string; tone?: 'primary' | 'good' | 'amber' }) {
  const { colors } = useTheme();
  const pct = Math.round(Math.min(1, Math.max(0, share)) * 100);
  const fill = tone === 'good' ? colors.goodFill : tone === 'amber' ? colors.amber : colors.primary;
  return (
    <View
      style={[styles.track, { backgroundColor: colors.accent }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: pct }}
    >
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: fill }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
});
