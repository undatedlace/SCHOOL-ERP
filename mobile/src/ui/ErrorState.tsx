import { StyleSheet, View } from 'react-native';
import { radius, spacing, useTheme } from '@/theme';
import { Button } from './Button';
import { Icon } from './Icon';
import { Text } from './Text';

interface ErrorStateProps {
  /** What went wrong, in plain words. */
  message?: string;
  title?: string;
  onRetry?: () => void;
  retrying?: boolean;
}

/** Something failed: say what, and offer "Try again". */
export function ErrorState({
  message = 'Please check your connection and try again.',
  title = 'Something went wrong',
  onRetry,
  retrying = false,
}: ErrorStateProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap} accessibilityRole="alert">
      <View style={[styles.icon, { backgroundColor: colors.badSoft }]}>
        <Icon name="cloud-offline-outline" size={30} color={colors.bad} />
      </View>
      <Text variant="heading" align="center">
        {title}
      </Text>
      <Text variant="body" tone="muted" align="center">
        {message}
      </Text>
      {onRetry ? (
        <Button title="Try again" onPress={onRetry} loading={retrying} variant="secondary" fullWidth={false} size="sm" icon="refresh" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl },
  icon: { width: 64, height: 64, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
});
