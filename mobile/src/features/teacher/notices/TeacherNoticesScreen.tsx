import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { errorMessage } from '@/api';
import { previewOf } from '@/features/notices/notice-preview';
import { usePagedList } from '@/features/paging/usePagedList';
import { formatDay } from '@/lib/dates';
import { spacing, useTheme } from '@/theme';
import { Badge, Button, Card, EmptyState, ErrorState, Icon, Screen, SegmentedControl, Skeleton, Text } from '@/ui';
import { LIST_TABS, audienceSummary, type NoticeList, type NoticePage, type StaffNotice } from './noticesLogic';

/** The notices I can see, and the ones I wrote, with a button to write a new one. */
export function TeacherNoticesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [tab, setTab] = useState<NoticeList>('active');
  const list = usePagedList<StaffNotice, NoticePage>('/notices', { status: tab }, 20);

  return (
    <Screen onRefresh={() => void list.refetch()} refreshing={list.isRefetching && !list.isLoading && !list.isFetchingNextPage}>
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text variant="title">Notices</Text>
          <Text variant="small" tone="muted">
            Read what the school sent, and write to the classes you teach.
          </Text>
        </View>
        <Button title="Write" icon="add" size="sm" fullWidth={false} onPress={() => router.push('/teacher/notices/new')} testID="write-notice" />
      </View>

      <SegmentedControl<NoticeList> accessibilityLabel="Notices" value={tab} onChange={setTab} options={LIST_TABS} />

      {list.isLoading ? (
        <View style={styles.list}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={96} rounded={22} />
          ))}
        </View>
      ) : list.isError && list.items.length === 0 ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => void list.refetch()} retrying={list.isRefetching} />
      ) : list.items.length === 0 ? (
        <EmptyState
          icon="megaphone-outline"
          title={tab === 'all' ? 'You have not written a notice' : 'No notices'}
          description={tab === 'all' ? 'Notices you write show here, even after their last day.' : 'Notices from the school will show up here.'}
          actionLabel={tab === 'all' ? 'Write a notice' : undefined}
          onAction={tab === 'all' ? () => router.push('/teacher/notices/new') : undefined}
        />
      ) : (
        <View style={styles.list}>
          {list.items.map((n) => (
            <Card
              key={n.id}
              onPress={() => router.push(`/teacher/notices/${n.id}`)}
              accessibilityLabel={`${n.title}, ${formatDay(n.createdAt)}, ${n.createdBy.fullName}, for ${audienceSummary(n)}${n.expired ? ', past its last day' : ''}`}
              style={styles.card}
              testID={`notice-${n.id}`}
            >
              <View style={[styles.icon, { backgroundColor: colors.amberSoft }]}>
                <Icon name="megaphone-outline" size={20} color={colors.amberInk} />
              </View>
              <View style={styles.flex}>
                <Text variant="bodyStrong" numberOfLines={2}>
                  {n.title}
                </Text>
                <Text variant="caption" tone="muted">
                  {formatDay(n.createdAt)} · {n.createdBy.fullName}
                </Text>
                <Text variant="small" tone="muted" numberOfLines={3}>
                  {previewOf(n.body)}
                </Text>
                <View style={styles.tags}>
                  <Badge label={`For ${audienceSummary(n)}`} tone="neutral" />
                  {n.expired ? <Badge label="Past its last day" tone="warn" /> : null}
                </View>
              </View>
            </Card>
          ))}
          {list.hasNextPage ? (
            <Button title="Show more" variant="ghost" onPress={() => void list.fetchNextPage()} loading={list.isFetchingNextPage} testID="notices-more" />
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  list: { gap: spacing.md },
  card: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
});
