import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { api, errorMessage, isApiError, useApiQuery } from '@/api';
import { invalidatePrefix } from '@/features/family-student/invalidate';
import { formatDay } from '@/lib/dates';
import { spacing, useTheme } from '@/theme';
import { Badge, Button, Card, ErrorState, Icon, Screen, Skeleton, Text } from '@/ui';
import { audienceSummary, type StaffNotice } from './noticesLogic';

/** One notice as plain text, with Edit and Remove for the ones I may change. */
export function TeacherNoticeDetailScreen({ id }: { id: string }) {
  const router = useRouter();
  const client = useQueryClient();
  const { colors } = useTheme();
  const query = useApiQuery<StaffNotice>(`/notices/${id}`);
  const [removing, setRemoving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  if (query.isLoading) {
    return (
      <Screen>
        <Skeleton height={28} width="80%" />
        <Skeleton height={160} rounded={22} />
      </Screen>
    );
  }
  if (query.isError || !query.data) {
    const missing = isApiError(query.error) && query.error.status === 404;
    return (
      <Screen>
        <ErrorState
          title={missing ? 'Notice not found' : undefined}
          message={missing ? 'This notice is no longer showing.' : errorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isRefetching}
        />
      </Screen>
    );
  }

  const n = query.data;
  const remove = () =>
    Alert.alert('Remove this notice?', 'It stops showing for everyone. The school keeps a record of it.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setRemoving(true);
          setFailure(null);
          try {
            await api.delete(`/notices/${n.id}`);
            await invalidatePrefix(client, '/notices');
            router.back();
          } catch (e) {
            setFailure(errorMessage(e));
          } finally {
            setRemoving(false);
          }
        },
      },
    ]);

  return (
    <Screen onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <View style={styles.head}>
        <View style={styles.tags}>
          <Badge label="Notice" tone="amber" />
          {n.expired ? <Badge label="Past its last day" tone="warn" /> : null}
        </View>
        <Text variant="title" accessibilityRole="header">
          {n.title}
        </Text>
        <Meta icon="person-outline" text={`${n.createdBy.fullName} · ${formatDay(n.createdAt, 'long')}`} />
        <Meta icon="people-outline" text={`For ${audienceSummary(n)}`} />
        {n.expiresOn ? <Meta icon="time-outline" text={`${n.expired ? 'Was shown until' : 'Shown until'} ${formatDay(n.expiresOn)}`} /> : null}
      </View>
      <Card>
        <Text variant="body" selectable>
          {n.body}
        </Text>
      </Card>

      {n.canChange ? (
        <View style={[styles.actions, { borderTopColor: colors.border }]}>
          <Button title="Edit" icon="create-outline" variant="secondary" fullWidth={false} style={styles.flex} onPress={() => router.push(`/teacher/notices/edit/${n.id}`)} testID="notice-edit" />
          <Button title="Remove" icon="trash-outline" variant="danger" fullWidth={false} style={styles.flex} loading={removing} onPress={remove} testID="notice-remove" />
        </View>
      ) : null}
      {failure ? (
        <Text variant="small" tone="bad" accessibilityLiveRegion="polite" testID="notice-remove-error">
          {failure}
        </Text>
      ) : null}
    </Screen>
  );
}

function Meta({ icon, text }: { icon: 'person-outline' | 'people-outline' | 'time-outline'; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.meta}>
      <Icon name={icon} size={16} color={colors.mutedForeground} />
      <Text variant="small" tone="muted" style={styles.flex}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { gap: spacing.sm },
  tags: { flexDirection: 'row', gap: spacing.xs },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  actions: { flexDirection: 'row', gap: spacing.md, paddingTop: spacing.md },
});
