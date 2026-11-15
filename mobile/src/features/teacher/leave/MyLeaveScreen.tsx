import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { api, errorMessage, useApiQuery } from '@/api';
import { FilterChips } from '@/features/family-student/FilterChips';
import { invalidatePrefix } from '@/features/family-student/invalidate';
import { usePagedList } from '@/features/paging/usePagedList';
import { formatDay, todayIST } from '@/lib/dates';
import { spacing, useTheme } from '@/theme';
import { Badge, Button, Card, EmptyState, ErrorState, Screen, SectionHeader, Skeleton, Text } from '@/ui';
import {
  REQUEST_FILTERS,
  STATUS_LABEL,
  STATUS_TONE,
  canWithdraw,
  daysText,
  requestDates,
  type BalanceRow,
  type LeaveBalance,
  type LeavePage,
  type LeaveRequest,
  type LeaveStatus,
} from './staffLeaveLogic';

/** My leave: what is left of each kind, my requests, and a way to ask for more. */
export function MyLeaveScreen() {
  const router = useRouter();
  const client = useQueryClient();
  const today = todayIST();
  const balance = useApiQuery<LeaveBalance>('/leave/balance');
  const [filter, setFilter] = useState<LeaveStatus | 'ALL'>('ALL');
  const list = usePagedList<LeaveRequest, LeavePage>('/leave/requests', { status: filter === 'ALL' ? undefined : filter }, 20);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const refreshing = (balance.isRefetching || list.isRefetching) && !balance.isLoading && !list.isFetchingNextPage;
  const refetch = () => {
    void balance.refetch();
    void list.refetch();
  };

  const withdraw = (r: LeaveRequest) => {
    Alert.alert('Withdraw this leave?', `${r.leaveType.name}, ${requestDates(r)}. The days go back to your balance.`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Withdraw',
        style: 'destructive',
        onPress: async () => {
          setWithdrawing(r.id);
          setFailure(null);
          try {
            await api.post(`/leave/requests/${r.id}/cancel`, {});
            await invalidatePrefix(client, '/leave');
          } catch (e) {
            setFailure(errorMessage(e));
          } finally {
            setWithdrawing(null);
          }
        },
      },
    ]);
  };

  return (
    <Screen onRefresh={refetch} refreshing={refreshing}>
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text variant="title">My leave</Text>
          <Text variant="small" tone="muted">
            {balance.data ? `Academic year ${balance.data.academicYear.name}` : 'Your balance and requests.'}
          </Text>
        </View>
        <Button title="Ask" icon="add" size="sm" fullWidth={false} onPress={() => router.push('/teacher/my-leave/new')} testID="ask-leave" />
      </View>

      <SectionHeader title="Your balance" />
      {balance.isLoading ? (
        <Card style={styles.gap}>
          <Skeleton height={22} width="50%" />
          <Skeleton height={60} />
        </Card>
      ) : balance.isError && !balance.data ? (
        <ErrorState message={errorMessage(balance.error)} onRetry={() => void balance.refetch()} retrying={balance.isRefetching} />
      ) : (balance.data?.balances.length ?? 0) === 0 ? (
        <EmptyState
          icon="airplane-outline"
          title="No leave set up yet"
          description="The school sets the kinds of leave and the days each gives before the year starts. They show here once they do."
        />
      ) : (
        <View style={styles.gap}>
          {balance.data!.balances.map((b) => (
            <BalanceCard key={b.leaveType.id} row={b} />
          ))}
        </View>
      )}

      <SectionHeader title="Your requests" />
      <FilterChips
        accessibilityLabel="Filter requests"
        chips={REQUEST_FILTERS.map((f) => ({ value: f.value, label: f.label }))}
        value={filter}
        onChange={(v) => setFilter(v as LeaveStatus | 'ALL')}
      />
      {failure ? (
        <Text variant="small" tone="bad" accessibilityLiveRegion="polite" testID="withdraw-error">
          {failure}
        </Text>
      ) : null}
      {list.isLoading ? (
        <Card style={styles.gap}>
          <Skeleton height={20} width="60%" />
          <Skeleton height={14} />
        </Card>
      ) : list.isError && list.items.length === 0 ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => void list.refetch()} retrying={list.isRefetching} />
      ) : list.items.length === 0 ? (
        <EmptyState
          icon="document-text-outline"
          title={filter === 'ALL' ? 'No requests yet' : 'No requests here'}
          description={filter === 'ALL' ? 'Ask for leave and it shows here with its answer.' : 'Try another list.'}
          actionLabel={filter === 'ALL' ? 'Ask for leave' : undefined}
          onAction={filter === 'ALL' ? () => router.push('/teacher/my-leave/new') : undefined}
        />
      ) : (
        <View style={styles.gap}>
          {list.items.map((r) => (
            <RequestCard key={r.id} request={r} today={today} busy={withdrawing === r.id} onWithdraw={() => withdraw(r)} />
          ))}
          {list.hasNextPage ? (
            <Button title="Show more" variant="ghost" onPress={() => void list.fetchNextPage()} loading={list.isFetchingNextPage} testID="leave-more" />
          ) : null}
        </View>
      )}
    </Screen>
  );
}

/** One kind of leave: how much is left, and the rest of the numbers written out. */
export function BalanceCard({ row }: { row: BalanceRow }) {
  const { colors } = useTheme();
  const unlimited = row.remaining === null;
  const lines: { label: string; value: number }[] = [
    { label: 'Allowed', value: row.entitled },
    { label: 'Carried over', value: row.carriedOver },
    { label: 'Taken', value: row.taken },
    { label: 'Coming up', value: row.upcoming },
    { label: 'Waiting', value: row.pending },
  ];
  return (
    <Card
      style={styles.card}
      testID={`balance-${row.leaveType.id}`}
      accessible
      accessibilityLabel={
        unlimited
          ? `${row.leaveType.name}: no yearly limit. Taken ${daysText(row.taken)}.`
          : `${row.leaveType.name}: ${daysText(row.remaining!)} left. Allowed ${row.entitled}, carried over ${row.carriedOver}, taken ${row.taken}, coming up ${row.upcoming}, waiting ${row.pending}.`
      }
    >
      <View style={styles.balanceTop}>
        <Text variant="subheading" style={styles.flex}>
          {row.leaveType.name}
        </Text>
        <View style={styles.leftBox}>
          <Text variant="title" tone={unlimited ? 'muted' : row.remaining! <= 0 ? 'bad' : 'primary'}>
            {unlimited ? 'No limit' : String(row.remaining)}
          </Text>
          {unlimited ? null : (
            <Text variant="caption" tone="muted">
              left
            </Text>
          )}
        </View>
      </View>
      <View style={[styles.grid, { borderTopColor: colors.border }]}>
        {(unlimited ? lines.filter((l) => l.label !== 'Allowed' && l.label !== 'Carried over') : lines).map((l) => (
          <View key={l.label} style={styles.gridCell}>
            <Text variant="bodyStrong">{String(l.value)}</Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {l.label}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function RequestCard({ request: r, today, busy, onWithdraw }: { request: LeaveRequest; today: string; busy: boolean; onWithdraw: () => void }) {
  return (
    <Card style={styles.card} testID={`request-${r.id}`}>
      <View style={styles.balanceTop}>
        <View style={styles.flex}>
          <Text variant="bodyStrong">{r.leaveType.name}</Text>
          <Text variant="small" tone="muted">
            {requestDates(r)} · {daysText(r.days)}
          </Text>
        </View>
        <Badge label={STATUS_LABEL[r.status]} tone={STATUS_TONE[r.status]} />
      </View>
      <Text variant="small">{r.reason}</Text>
      {r.decisionNote ? (
        <Text variant="small" tone="muted">
          From the school: {r.decisionNote}
        </Text>
      ) : null}
      <Text variant="caption" tone="faint">
        Asked on {formatDay(r.createdAt, 'medium')}
      </Text>
      {canWithdraw(r, today) ? (
        <Button
          title="Withdraw"
          icon="close-circle-outline"
          variant="danger"
          size="sm"
          fullWidth={false}
          loading={busy}
          onPress={onWithdraw}
          accessibilityLabel={`Withdraw ${r.leaveType.name}, ${requestDates(r)}`}
          testID={`withdraw-${r.id}`}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  gap: { gap: spacing.md },
  card: { gap: spacing.sm },
  balanceTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  leftBox: { alignItems: 'flex-end' },
  grid: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  gridCell: { flex: 1, alignItems: 'center' },
});
