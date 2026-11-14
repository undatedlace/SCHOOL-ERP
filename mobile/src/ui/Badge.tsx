import { StyleSheet, View } from 'react-native';
import { radius, spacing, useTheme, type ColorTokens } from '@/theme';
import { Text } from './Text';

export type BadgeTone = 'neutral' | 'good' | 'warn' | 'bad' | 'info' | 'primary' | 'amber';

function palette(colors: ColorTokens, tone: BadgeTone) {
  switch (tone) {
    case 'good':
      return { bg: colors.goodSoft, fg: colors.good };
    case 'warn':
      return { bg: colors.warnSoft, fg: colors.warn };
    case 'bad':
      return { bg: colors.badSoft, fg: colors.bad };
    case 'info':
      return { bg: colors.infoSoft, fg: colors.info };
    case 'primary':
      return { bg: colors.primarySoft, fg: colors.primary };
    case 'amber':
      return { bg: colors.amberSoft, fg: colors.amberInk };
    default:
      return { bg: colors.accent, fg: colors.mutedForeground };
  }
}

interface BadgeProps {
  /** The word. Colour is never the only cue: always say what it means. */
  label: string;
  tone?: BadgeTone;
}

/** A status badge: a dot and a word. */
export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  const { colors } = useTheme();
  const { bg, fg } = palette(colors, tone);
  return (
    <View style={[styles.badge, { backgroundColor: bg }]} accessible accessibilityLabel={label}>
      <View style={[styles.dot, { backgroundColor: fg }]} />
      <Text variant="smallStrong" style={{ color: fg }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
