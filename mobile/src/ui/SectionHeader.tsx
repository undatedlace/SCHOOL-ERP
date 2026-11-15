import { Pressable, StyleSheet, View } from 'react-native';
import { MIN_TOUCH, spacing } from '@/theme';
import { Text } from './Text';

interface SectionHeaderProps {
  title: string;
  /** A link on the right ("See all"). */
  actionLabel?: string;
  onAction?: () => void;
}

/** A title above a group of cards or rows. */
export function SectionHeader({ title, actionLabel, onAction }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <Text variant="heading" style={styles.title}>
        {title}
      </Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={8} style={styles.action}>
          <Text variant="smallStrong" tone="primary">
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: MIN_TOUCH - 8, gap: spacing.md },
  title: { flex: 1 },
  action: { minHeight: MIN_TOUCH, justifyContent: 'center' },
});
