import { StyleSheet, View } from 'react-native';
import { useApiQuery } from '@/api';
import { formatDay } from '@/lib/dates';
import { spacing, useTheme } from '@/theme';
import { Badge, Card, ErrorState, Icon, Screen, Skeleton, Text } from '@/ui';
import type { Notice } from './types';

/** One notice, as plain text exactly as the school wrote it. */
export function NoticeDetailScreen({ id }: { id: string }) {
  const { colors } = useTheme();
  const query = useApiQuery<Notice>(`/notices/${id}`);

  if (query.isLoading) {
    return (
      <Screen>
        <Skeleton height={28} width="80%" />
        <Skeleton height={160} rounded={22} />
      </Screen>
    );
  }
  if (query.isError || !query.data) {
    return (
      <Screen>
        <ErrorState
          title={query.error?.status === 404 ? 'Notice not found' : undefined}
          message={query.error?.status === 404 ? 'This notice is no longer showing.' : query.error?.message}
          onRetry={() => void query.refetch()}
          retrying={query.isRefetching}
        />
      </Screen>
    );
  }

  const n = query.data;
  return (
    <Screen onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <View style={styles.head}>
        <Badge label="Notice" tone="amber" />
        <Text variant="title">{n.title}</Text>
        <View style={styles.meta}>
          <Icon name="person-outline" size={16} color={colors.mutedForeground} />
          <Text variant="small" tone="muted">
            {n.createdBy.fullName} · {formatDay(new Date(n.createdAt), 'long')}
          </Text>
        </View>
        {n.expiresOn ? (
          <View style={styles.meta}>
            <Icon name="time-outline" size={16} color={colors.mutedForeground} />
            <Text variant="small" tone="muted">
              Shown until {formatDay(n.expiresOn)}
            </Text>
          </View>
        ) : null}
      </View>
      <Card>
        <Text variant="body" selectable>
          {n.body}
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: spacing.sm },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
});
