import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api, errorMessage } from '@/api';
import { invalidatePrefix } from '@/features/family-student/invalidate';
import { usePagedList, type PageOf } from '@/features/paging/usePagedList';
import { timeAgo } from '@/lib/dates';
import { spacing, useTheme } from '@/theme';
import { Badge, Button, Card, EmptyState, ErrorState, Icon, Screen, SegmentedControl, Skeleton, Text, type IconName } from '@/ui';
import { linkToRoute, notificationsRoute, type RouteBase } from './link-to-route';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

interface NotificationPage extends PageOf<NotificationItem> {
  unread: number;
}

/** A picture for the kind of message, from the start of its type ("homework.assigned"). */
export function iconForType(type: string): IconName {
  const kind = type.split('.')[0] ?? '';
  switch (kind) {
    case 'homework':
      return 'book-outline';
    case 'fees':
    case 'fee':
      return 'wallet-outline';
    case 'messages':
    case 'message':
      return 'chatbubbles-outline';
    case 'assessment':
    case 'results':
      return 'ribbon-outline';
    case 'notice':
    case 'notices':
      return 'megaphone-outline';
    case 'calendar':
      return 'calendar-outline';
    case 'leave':
    case 'student_leave':
      return 'medkit-outline';
    case 'timetable':
      return 'time-outline';
    default:
      return 'notifications-outline';
  }
}

type Filter = 'all' | 'unread';

/** The inbox: everything the school has told this account. Opening one marks it read and goes to its screen. */
export function NotificationsScreen({ base = 'family' }: { base?: RouteBase }) {
  const router = useRouter();
  const { colors } = useTheme();
  const client = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');
  const [problem, setProblem] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const list = usePagedList<NotificationItem, NotificationPage>('/notifications', filter === 'unread' ? { unread: true } : {}, 20);
  const unread = list.last?.unread ?? 0;

  const open = async (n: NotificationItem) => {
    setProblem(null);
    const route = linkToRoute(n.link, base);
    if (!n.read) {
      try {
        await api.post(`/notifications/${n.id}/read`);
        void invalidatePrefix(client, '/notifications');
      } catch (e) {
        setProblem(errorMessage(e));
      }
    }
    if (route !== notificationsRoute(base)) router.push(route);
  };

  const markAll = async () => {
    setMarkingAll(true);
    setProblem(null);
    try {
      await api.post('/notifications/read-all');
      await invalidatePrefix(client, '/notifications');
    } catch (e) {
      setProblem(errorMessage(e));
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <Screen onRefresh={() => void list.refetch()} refreshing={list.isRefetching && !list.isLoading && !list.isFetchingNextPage}>
      <SegmentedControl
        accessibilityLabel="Show"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All' },
          { value: 'unread', label: 'Unread', count: unread },
        ]}
      />
      {unread > 0 ? (
        <Button
          title="Mark all as read"
          icon="checkmark-done-outline"
          variant="ghost"
          size="sm"
          fullWidth={false}
          onPress={() => void markAll()}
          loading={markingAll}
          testID="mark-all-read"
        />
      ) : null}
      {problem ? (
        <Text variant="small" tone="bad" accessibilityLiveRegion="polite">
          {problem}
        </Text>
      ) : null}

      {list.isLoading ? (
        <View style={styles.list}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={84} rounded={22} />
          ))}
        </View>
      ) : list.isError ? (
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} retrying={list.isRefetching} />
      ) : list.items.length === 0 ? (
        <EmptyState
          icon="notifications-off-outline"
          title={filter === 'unread' ? 'All caught up' : 'No notifications yet'}
          description={filter === 'unread' ? 'You have read everything.' : 'Messages from the school will show up here.'}
        />
      ) : (
        <View style={styles.list}>
          {list.items.map((n) => (
            <Card
              key={n.id}
              onPress={() => void open(n)}
              accessibilityLabel={`${n.read ? '' : 'Unread. '}${n.title}. ${timeAgo(n.createdAt)}`}
              style={[styles.card, !n.read && { backgroundColor: colors.primarySoft }]}
              testID={`notification-${n.id}`}
            >
              <View style={[styles.icon, { backgroundColor: n.read ? colors.accent : colors.card }]}>
                <Icon name={iconForType(n.type)} size={20} color={colors.primary} />
              </View>
              <View style={styles.text}>
                <Text variant={n.read ? 'body' : 'bodyStrong'} numberOfLines={2}>
                  {n.title}
                </Text>
                {n.body ? (
                  <Text variant="small" tone="muted" numberOfLines={2}>
                    {n.body}
                  </Text>
                ) : null}
                <View style={styles.foot}>
                  <Text variant="caption" tone="muted">
                    {timeAgo(n.createdAt)}
                  </Text>
                  {!n.read ? <Badge label="New" tone="primary" /> : null}
                </View>
              </View>
            </Card>
          ))}
          {list.hasNextPage ? (
            <Button
              title="Show more"
              variant="ghost"
              onPress={() => void list.fetchNextPage()}
              loading={list.isFetchingNextPage}
              testID="notifications-more"
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
  foot: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
});
