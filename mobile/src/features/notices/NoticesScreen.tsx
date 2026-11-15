import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { usePagedList } from '@/features/paging/usePagedList';
import { formatDay } from '@/lib/dates';
import { spacing, useTheme } from '@/theme';
import { Button, Card, EmptyState, ErrorState, Icon, Screen, Skeleton, Text } from '@/ui';
import { previewOf } from './notice-preview';
import type { Notice } from './types';

/** Notices from the school: newest first, a short preview, and "Show more". */
export function NoticesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const list = usePagedList<Notice>('/notices', {}, 20);

  return (
    <Screen onRefresh={() => void list.refetch()} refreshing={list.isRefetching && !list.isLoading && !list.isFetchingNextPage}>
      {list.isLoading ? (
        <View style={styles.list}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={96} rounded={22} />
          ))}
        </View>
      ) : list.isError ? (
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} retrying={list.isRefetching} />
      ) : list.items.length === 0 ? (
        <EmptyState icon="megaphone-outline" title="No notices" description="Notices from the school will show up here." />
      ) : (
        <View style={styles.list}>
          {list.items.map((n) => (
            <Card
              key={n.id}
              onPress={() => router.push(`/family/notices/${n.id}`)}
              accessibilityLabel={`${n.title}, ${formatDay(new Date(n.createdAt))}`}
              style={styles.card}
            >
              <View style={[styles.icon, { backgroundColor: colors.amberSoft }]}>
                <Icon name="megaphone-outline" size={20} color={colors.amberInk} />
              </View>
              <View style={styles.text}>
                <Text variant="bodyStrong" numberOfLines={2}>
                  {n.title}
                </Text>
                <Text variant="caption" tone="muted">
                  {formatDay(new Date(n.createdAt))} · {n.createdBy.fullName}
                </Text>
                <Text variant="small" tone="muted" numberOfLines={3}>
                  {previewOf(n.body)}
                </Text>
              </View>
            </Card>
          ))}
          {list.hasNextPage ? (
            <Button
              title="Show more"
              variant="ghost"
              onPress={() => void list.fetchNextPage()}
              loading={list.isFetchingNextPage}
              testID="notices-more"
            />
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  card: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
});
