import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Switch, View } from 'react-native';
import { api } from '@/api';
import { errorMessage } from '@/api/errors';
import { useApiQuery } from '@/api/hooks';
import { invalidateApiPaths } from '@/features/messages/hooks';
import { MultilineField } from '@/features/messages/MultilineField';
import { formatDateTime, todayIST } from '@/lib/dates';
import { spacing, useTheme } from '@/theme';
import { Badge, Button, Card, EmptyState, ErrorState, Icon, Screen, SectionHeader, Skeleton, Text } from '@/ui';
import { DateField } from './DateField';
import {
  firstDayRange,
  lastDayRange,
  MAX_REASON,
  previewSentence,
  rangeLabel,
  STATUS_LABEL,
  STATUS_TONE,
  type LeaveList,
  type LeavePreview,
  type StudentLeave,
} from './logic';

/** Tell the class teacher the child will be away, and see what happened to earlier requests. */
export function ReportAbsenceScreen() {
  const { colors } = useTheme();
  const client = useQueryClient();
  const today = todayIST();
  const firstRange = firstDayRange(today);

  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [half, setHalf] = useState(false);
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentNote, setSentNote] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const lastDay = to ?? from;
  const preview = useApiQuery<LeavePreview>('/student-leave/preview', {
    query: { fromDate: from, toDate: lastDay, halfDay: half },
    enabled: Boolean(from && lastDay),
    staleTime: 0,
  });
  const list = useApiQuery<LeaveList>('/student-leave', { query: { page: 1, pageSize: 50 }, refetchInterval: 60_000 });
  const { refetch } = list;

  const sentence = preview.data ? previewSentence(preview.data) : null;
  const singleDay = !to || to === from;

  const pickFrom = (day: string) => {
    setFrom(day);
    setSentNote(null);
    if (to && to < day) setTo(null);
  };
  const pickTo = (day: string) => {
    setTo(day === from ? null : day);
    setSentNote(null);
    if (day !== from) setHalf(false);
  };

  const refresh = useCallback(() => invalidateApiPaths(client, ['/student-leave']), [client]);

  const submit = async () => {
    setTried(true);
    setError(null);
    if (!from || !reason.trim()) return;
    setSending(true);
    try {
      const made = await api.post<StudentLeave>('/student-leave', {
        fromDate: from,
        toDate: lastDay,
        halfDay: half && singleDay,
        reason: reason.trim(),
      });
      setSentNote(`Sent to the class teacher: ${rangeLabel(made.fromDate, made.toDate, made.halfDay)}.`);
      setFrom(null);
      setTo(null);
      setHalf(false);
      setReason('');
      setTried(false);
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const withdraw = (item: StudentLeave) => {
    Alert.alert('Withdraw this request?', `${rangeLabel(item.fromDate, item.toDate, item.halfDay)} will be cancelled.`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Withdraw',
        style: 'destructive',
        onPress: () => {
          api
            .post<StudentLeave>(`/student-leave/${item.id}/withdraw`)
            .then(() => refresh())
            .catch((e: unknown) => Alert.alert('Could not withdraw', errorMessage(e)));
        },
      },
    ]);
  };

  const items = list.data?.items ?? [];

  return (
    <Screen
      keyboard
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void refetch().finally(() => setRefreshing(false));
      }}
    >
      <Text variant="small" tone="muted">
        Tell the class teacher your child will be away. The teacher approves or declines it, and you are told here.
      </Text>

      <Card style={styles.form}>
        <DateField
          label="First day"
          value={from}
          onChange={pickFrom}
          min={firstRange.min}
          max={firstRange.max}
          error={tried && !from ? 'Choose the first day.' : null}
          testID="from-day"
        />
        {from ? (
          <View style={styles.lastRow}>
            <View style={styles.flex}>
              <DateField
                label="Last day (if more than one day)"
                value={to}
                onChange={pickTo}
                min={lastDayRange(from).min}
                max={lastDayRange(from).max}
                placeholder="Same as the first day"
                testID="to-day"
              />
            </View>
          </View>
        ) : null}
        <View style={styles.switchRow}>
          <View style={styles.flex}>
            <Text variant="bodyStrong">Half day</Text>
            <Text variant="small" tone="muted">
              {singleDay ? 'Only part of the day.' : 'Only for a single day.'}
            </Text>
          </View>
          <Switch
            value={half && singleDay}
            onValueChange={setHalf}
            disabled={!singleDay}
            trackColor={{ true: colors.primary, false: colors.borderStrong }}
            accessibilityLabel="Half day"
            testID="half-day"
          />
        </View>

        {from ? (
          <View
            style={[
              styles.preview,
              { backgroundColor: sentence && !sentence.ok ? colors.badSoft : colors.primarySoft },
            ]}
            accessibilityLiveRegion="polite"
            testID="leave-preview"
          >
            <Icon
              name={sentence && !sentence.ok ? 'alert-circle-outline' : 'information-circle-outline'}
              size={20}
              color={sentence && !sentence.ok ? colors.bad : colors.primary}
            />
            <Text variant="smallStrong" tone={sentence && !sentence.ok ? 'bad' : 'primary'} style={styles.flex}>
              {preview.isLoading ? 'Counting school days...' : (sentence?.text ?? 'Could not count the days yet.')}
            </Text>
          </View>
        ) : null}

        <MultilineField
          label="Reason"
          value={reason}
          onChangeText={setReason}
          maxLength={MAX_REASON}
          autoCapitalize="sentences"
          autoCorrect
          placeholder="For example: Fever, doctor's visit"
          hint={`${reason.length} of ${MAX_REASON} characters`}
          error={tried && !reason.trim() ? 'Write a short reason.' : null}
          minHeight={100}
          testID="leave-reason"
        />

        {error ? (
          <Text variant="small" tone="bad" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        {sentNote ? (
          <View style={[styles.preview, { backgroundColor: colors.goodSoft }]} accessibilityLiveRegion="polite">
            <Icon name="checkmark-circle" size={20} color={colors.good} />
            <Text variant="smallStrong" tone="good" style={styles.flex}>
              {sentNote}
            </Text>
          </View>
        ) : null}
        <Button
          title="Send request"
          icon="send"
          loading={sending}
          disabled={Boolean(preview.data?.problem)}
          onPress={() => void submit()}
          testID="send-leave"
        />
      </Card>

      <SectionHeader title="Your requests" />
      {list.isLoading ? (
        <Card style={styles.gap}>
          <Skeleton height={56} />
          <Skeleton height={56} />
        </Card>
      ) : list.error && !list.data ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => void refetch()} retrying={list.isFetching} />
      ) : items.length === 0 ? (
        <EmptyState icon="medkit-outline" title="No requests yet" description="Requests you send will appear here with their status." />
      ) : (
        <View style={styles.gap}>
          {items.map((item) => (
            <LeaveCard key={item.id} item={item} onWithdraw={() => withdraw(item)} />
          ))}
        </View>
      )}
    </Screen>
  );
}

function LeaveCard({ item, onWithdraw }: { item: StudentLeave; onWithdraw: () => void }) {
  const decided = item.status === 'APPROVED' || item.status === 'REFUSED';
  return (
    <Card style={styles.gap} testID={`leave-${item.id}`}>
      <View style={styles.cardTop}>
        <View style={styles.flex}>
          <Text variant="bodyStrong">{rangeLabel(item.fromDate, item.toDate, item.halfDay)}</Text>
          <Text variant="small" tone="muted">
            {item.days === 0.5 ? 'Half a school day' : `${item.days} school ${item.days === 1 ? 'day' : 'days'}`}
          </Text>
        </View>
        <Badge label={STATUS_LABEL[item.status]} tone={STATUS_TONE[item.status]} />
      </View>
      <Text variant="small" tone="default">
        {item.reason}
      </Text>
      {decided ? (
        <View style={styles.note}>
          <Text variant="smallStrong" tone="muted">
            {item.decidedBy?.name ? `${item.decidedBy.name}` : 'The school'}
            {item.decidedAt ? ` · ${formatDateTime(item.decidedAt)}` : ''}
          </Text>
          {item.decisionNote ? (
            <Text variant="small" tone="default">
              {item.decisionNote}
            </Text>
          ) : null}
        </View>
      ) : null}
      {item.canWithdraw ? (
        <Button title="Withdraw" variant="ghost" size="sm" fullWidth={false} onPress={onWithdraw} testID={`withdraw-${item.id}`} />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: spacing.md },
  form: { gap: spacing.lg },
  lastRow: { flexDirection: 'row' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48 },
  preview: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  note: { gap: 2 },
});
