import { keepPreviousData } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useApiQuery } from '@/api/hooks';
import { errorMessage } from '@/api/errors';
import { spacing, useTheme } from '@/theme';
import { Button, Card, EmptyState, ErrorState, Icon, Screen, SegmentedControl, Skeleton, Text } from '@/ui';
import { ConversationRow } from './ConversationRow';
import { useMessagesUnread } from './hooks';
import { SearchBox, useDebounced } from './SearchBox';
import type { Conversation, Page } from './types';

type Filter = 'all' | 'unread';
const PAGE = 30;

/** The Messages tab: the family's conversations with teachers, unread first. */
export function InboxScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(PAGE);
  const [refreshing, setRefreshing] = useState(false);
  const q = useDebounced(search.trim(), 300);
  const unreadCount = useMessagesUnread();

  const list = useApiQuery<Page<Conversation>>('/messages', {
    query: { page: 1, pageSize, unread: filter === 'unread' ? 'true' : undefined, q: q || undefined },
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });
  const { refetch } = list;

  // Coming back from a thread: read and unread states may have changed.
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const filtering = filter === 'unread' || q.length > 0;

  return (
    <Screen onRefresh={() => void onRefresh()} refreshing={refreshing}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text variant="title">Messages</Text>
          <Text variant="small" tone="muted">
            Write to your class teacher and subject teachers.
          </Text>
        </View>
        <Button
          title="New"
          icon="create-outline"
          size="sm"
          fullWidth={false}
          onPress={() => router.push('/family/messages/new')}
          accessibilityLabel="New message"
          testID="new-message"
        />
      </View>

      <SearchBox value={search} onChangeText={setSearch} />
      <SegmentedControl<Filter>
        accessibilityLabel="Filter conversations"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All' },
          { value: 'unread', label: 'Unread', count: unreadCount },
        ]}
      />

      {list.isLoading ? (
        <Card padding={spacing.lg} style={styles.skeletons}>
          <Skeleton height={64} />
          <Skeleton height={64} />
          <Skeleton height={64} />
        </Card>
      ) : list.error && !list.data ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => void refetch()} retrying={list.isFetching} />
      ) : items.length === 0 ? (
        filtering ? (
          <EmptyState
            icon="search-outline"
            title={filter === 'unread' && !q ? 'Nothing unread' : 'No conversations match'}
            description={filter === 'unread' && !q ? 'You are all caught up.' : 'Try another word or filter.'}
          />
        ) : (
          <EmptyState
            icon="chatbubbles-outline"
            title="No messages yet"
            description="Start a conversation with your class teacher or a subject teacher."
            actionLabel="New message"
            onAction={() => router.push('/family/messages/new')}
          />
        )
      ) : (
        <>
          <Card padding={0} style={styles.list}>
            {items.map((c, i) => (
              <ConversationRow
                key={c.id}
                conversation={c}
                showDivider={i < items.length - 1}
                onPress={() => router.push(`/family/messages/${c.id}`)}
              />
            ))}
          </Card>
          {total > items.length ? (
            <Button
              title="Show more"
              variant="ghost"
              size="sm"
              fullWidth={false}
              loading={list.isFetching}
              onPress={() => setPageSize((n) => n + PAGE)}
            />
          ) : null}
        </>
      )}

      <View style={styles.note}>
        <Icon name="shield-checkmark-outline" size={16} color={colors.mutedForeground} />
        <Text variant="caption" tone="muted" style={styles.noteText}>
          The school can read messages for safety.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  headText: { flex: 1, gap: 2 },
  list: { overflow: 'hidden' },
  skeletons: { gap: spacing.md },
  note: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'center' },
  noteText: { flexShrink: 1 },
});
