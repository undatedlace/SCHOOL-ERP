import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MIN_TOUCH, radius, spacing, useTheme } from '@/theme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

interface ListRowProps {
  title: string;
  subtitle?: string;
  /** An icon in a soft square on the left. */
  icon?: IconName;
  /** Anything else on the left (an Avatar). Replaces `icon`. */
  leading?: ReactNode;
  /** Text or any element on the right. */
  trailing?: ReactNode;
  onPress?: () => void;
  /** Show a chevron on the right. Default: true when the row can be pressed. */
  chevron?: boolean;
  tone?: 'default' | 'danger';
  showDivider?: boolean;
  testID?: string;
}

/** One row of a list, at least 56 points tall. */
export function ListRow({
  title,
  subtitle,
  icon,
  leading,
  trailing,
  onPress,
  chevron,
  tone = 'default',
  showDivider = false,
  testID,
}: ListRowProps) {
  const { colors } = useTheme();
  const danger = tone === 'danger';
  const showChevron = chevron ?? Boolean(onPress);

  const content = (
    <View
      style={[
        styles.row,
        showDivider && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}
    >
      {leading ??
        (icon ? (
          <View style={[styles.icon, { backgroundColor: danger ? colors.badSoft : colors.primarySoft }]}>
            <Icon name={icon} size={20} color={danger ? colors.bad : colors.primary} />
          </View>
        ) : null)}
      <View style={styles.text}>
        <Text variant="bodyStrong" tone={danger ? 'bad' : 'strong'} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" tone="muted" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {typeof trailing === 'string' ? (
        <Text variant="small" tone="muted">
          {trailing}
        </Text>
      ) : (
        trailing
      )}
      {showChevron ? <Icon name="chevron-forward" size={18} color={colors.faint} /> : null}
    </View>
  );

  if (!onPress) return <View testID={testID}>{content}</View>;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      style={({ pressed }) => (pressed ? { backgroundColor: colors.accent } : null)}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  icon: {
    width: MIN_TOUCH - 6,
    height: MIN_TOUCH - 6,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
});
