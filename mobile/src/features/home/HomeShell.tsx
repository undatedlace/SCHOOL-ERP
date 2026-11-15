import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { errorMessage, type ApiError } from '@/api';
import { spacing, useTheme } from '@/theme';
import { Button, Card, Icon, SectionHeader, Skeleton, Text } from '@/ui';

interface QueryBodyProps {
  isLoading: boolean;
  isError: boolean;
  error: ApiError | Error | null;
  onRetry: () => void;
  retrying?: boolean;
  /** Show this instead of the children (nothing to list). */
  emptyText?: string | null;
  /** How many grey lines to show while loading. */
  lines?: number;
  /** Space around the loading, error and empty states (for cards that run edge to edge). */
  inset?: number;
  children: ReactNode;
}

/** The inside of a card whose data loads on its own: grey lines, a short error with retry, or an empty line. */
export function QueryBody({ isLoading, isError, error, onRetry, retrying = false, emptyText = null, lines = 2, inset = 0, children }: QueryBodyProps) {
  const { colors } = useTheme();
  if (isLoading) {
    return (
      <View style={{ gap: spacing.sm, padding: inset }} accessibilityLabel="Loading" accessibilityRole="progressbar">
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} height={18} width={i === 0 ? '70%' : '100%'} />
        ))}
      </View>
    );
  }
  if (isError) {
    return (
      <View style={[styles.error, { padding: inset }]} accessibilityRole="alert">
        <View style={styles.errorText}>
          <Icon name="cloud-offline-outline" size={20} color={colors.bad} />
          <Text variant="small" tone="muted" style={styles.flex}>
            {errorMessage(error)}
          </Text>
        </View>
        <Button title="Try again" icon="refresh" variant="secondary" size="sm" fullWidth={false} loading={retrying} onPress={onRetry} />
      </View>
    );
  }
  if (emptyText) {
    return (
      <Text variant="small" tone="muted" style={{ padding: inset }}>
        {emptyText}
      </Text>
    );
  }
  return <>{children}</>;
}

interface SectionProps extends Omit<QueryBodyProps, 'children'> {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Make the whole card press through (the action label is then the hint). */
  children: ReactNode;
  padding?: number;
}

/** A titled card on Home that handles its own loading, error and empty states. */
export function Section({ title, actionLabel, onAction, children, padding, ...body }: SectionProps) {
  return (
    <View style={{ gap: spacing.sm }}>
      <SectionHeader title={title} actionLabel={actionLabel} onAction={onAction} />
      <Card padding={padding} style={{ gap: spacing.md }}>
        <QueryBody {...body} inset={padding === 0 ? spacing.lg : 0}>
          {children}
        </QueryBody>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  error: { gap: spacing.sm, alignItems: 'flex-start' },
  errorText: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
