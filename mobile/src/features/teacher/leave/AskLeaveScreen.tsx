import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { api, errorMessage, useApiQuery } from '@/api';
import { DateField } from '@/features/absence/DateField';
import { FilterChips } from '@/features/family-student/FilterChips';
import { invalidatePrefix } from '@/features/family-student/invalidate';
import { MultilineField } from '@/features/messages/MultilineField';
import type { CalendarEvent } from '@/features/calendar/types';
import { addDays, todayIST } from '@/lib/dates';
import { spacing, useTheme } from '@/theme';
import { Button, EmptyState, ErrorState, Icon, Screen, Skeleton, Text } from '@/ui';
import {
  DAYS_AHEAD,
  MAX_LEAVE_SPAN_DAYS,
  REASON_MAX,
  balanceWarning,
  daysText,
  effectiveEnd,
  emptyLeaveDraft,
  hasErrors,
  holidayDays,
  overlapProblem,
  previewLeave,
  previewSentence,
  requestBody,
  validateLeave,
  type LeaveBalance,
  type LeaveDraft,
  type LeaveErrors,
  type LeaveKind,
  type LeavePage,
} from './staffLeaveLogic';

/** Ask for leave: kind, first day, an optional last day, half day for a single day, and a reason. */
export function AskLeaveScreen() {
  const router = useRouter();
  const client = useQueryClient();
  const { colors } = useTheme();
  const today = todayIST();
  const types = useApiQuery<LeaveKind[]>('/leave/types', { staleTime: 5 * 60_000 });
  const balance = useApiQuery<LeaveBalance>('/leave/balance');
  // Waiting and approved leave, for the "already asked" check before sending.
  const requests = useApiQuery<LeavePage>('/leave/requests', { query: { page: 1, pageSize: 100 } });

  const [draft, setDraft] = useState<LeaveDraft>(emptyLeaveDraft);
  const [errors, setErrors] = useState<LeaveErrors>({});
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const end = draft.startsOn ? effectiveEnd(draft) : '';
  const validRange = draft.startsOn !== '' && end >= draft.startsOn && addDays(draft.startsOn, MAX_LEAVE_SPAN_DAYS) >= end;
  // School holidays are not leave days, so the count is only right once they are known.
  const calendar = useApiQuery<CalendarEvent[]>('/calendar', {
    query: { from: draft.startsOn, to: end },
    enabled: validRange,
    staleTime: 60_000,
  });
  const holidays = useMemo(() => holidayDays(calendar.data ?? [], draft.startsOn, end), [calendar.data, draft.startsOn, end]);

  const preview = draft.startsOn ? previewLeave(draft.startsOn, end, draft.halfDay, holidays) : null;
  const row = balance.data?.balances.find((b) => b.leaveType.id === draft.leaveTypeId);
  const existing = requests.data?.items ?? [];
  const overlap = draft.startsOn && preview && !preview.problem ? overlapProblem(existing, draft.startsOn, end) : null;
  const warning = preview && !preview.problem ? balanceWarning(row, preview.days) : null;
  const singleDay = draft.endsOn === '' || draft.endsOn === draft.startsOn;

  const patch = (change: Partial<LeaveDraft>) => {
    setDraft((d) => {
      const next = { ...d, ...change };
      // Moving the first day past the last day clears the last day.
      if (next.endsOn && next.startsOn && next.endsOn < next.startsOn) next.endsOn = '';
      if (next.endsOn && next.endsOn !== next.startsOn) next.halfDay = false;
      return next;
    });
    if (tried) setErrors({});
  };

  const submit = async () => {
    setTried(true);
    setFailure(null);
    const found = validateLeave(draft, today, existing, holidays);
    setErrors(found);
    if (hasErrors(found)) return;
    setSaving(true);
    try {
      await api.post('/leave/requests', requestBody(draft));
      await invalidatePrefix(client, '/leave');
      await invalidatePrefix(client, '/calendar');
      router.back();
    } catch (e) {
      // The school may know something this phone does not (a holiday, a rule): its words are shown as they are.
      setFailure(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (types.isLoading || balance.isLoading) {
    return (
      <Screen>
        <Skeleton height={44} />
        <Skeleton height={50} />
        <Skeleton height={50} />
      </Screen>
    );
  }
  if (types.isError && !types.data) {
    return (
      <Screen>
        <ErrorState message={errorMessage(types.error)} onRetry={() => void types.refetch()} retrying={types.isRefetching} />
      </Screen>
    );
  }
  const kinds = (types.data ?? []).filter((t) => t.active);
  if (kinds.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon="airplane-outline"
          title="No kinds of leave yet"
          description="The school sets up the kinds of leave before the year starts. Ask the office if you need leave now."
        />
      </Screen>
    );
  }

  const previewBad = preview?.problem || overlap;
  return (
    <Screen keyboard>
      <View style={styles.block}>
        <Text variant="smallStrong">Kind of leave</Text>
        <FilterChips
          accessibilityLabel="Kind of leave"
          chips={kinds.map((k) => ({ value: k.id, label: k.name }))}
          value={draft.leaveTypeId}
          onChange={(leaveTypeId) => patch({ leaveTypeId })}
        />
        {row ? (
          <Text variant="small" tone="muted" testID="kind-balance">
            {row.remaining === null ? `${row.leaveType.name}: no yearly limit.` : `${row.leaveType.name}: ${daysText(row.remaining)} left this year.`}
          </Text>
        ) : null}
        {errors.leaveTypeId ? (
          <Text variant="small" tone="bad" accessibilityLiveRegion="polite">
            {errors.leaveTypeId}
          </Text>
        ) : null}
      </View>

      <DateField
        label="First day"
        value={draft.startsOn || null}
        onChange={(startsOn) => patch({ startsOn })}
        min={today}
        max={addDays(today, DAYS_AHEAD)}
        error={errors.startsOn}
        footnote="Sundays and school holidays are not counted as leave."
        testID="leave-from"
      />
      {draft.startsOn ? (
        <View style={styles.block}>
          <DateField
            label="Last day (optional)"
            value={draft.endsOn || null}
            onChange={(endsOn) => patch({ endsOn })}
            min={draft.startsOn}
            max={addDays(draft.startsOn, MAX_LEAVE_SPAN_DAYS)}
            placeholder="Same as the first day"
            error={errors.endsOn}
            footnote="Leave it empty for a single day."
            testID="leave-to"
          />
          {draft.endsOn ? (
            <Button title="Just one day" variant="ghost" size="sm" fullWidth={false} onPress={() => patch({ endsOn: '' })} testID="leave-one-day" />
          ) : null}
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
          value={draft.halfDay && singleDay}
          onValueChange={(halfDay) => patch({ halfDay })}
          disabled={!singleDay}
          trackColor={{ true: colors.primary, false: colors.borderStrong }}
          accessibilityLabel="Half day"
          testID="leave-half"
        />
      </View>

      {preview ? (
        <View
          style={[styles.preview, { backgroundColor: previewBad ? colors.badSoft : warning ? colors.warnSoft : colors.primarySoft }]}
          accessibilityLiveRegion="polite"
          testID="leave-preview"
        >
          <Icon
            name={previewBad || warning ? 'alert-circle-outline' : 'information-circle-outline'}
            size={20}
            color={previewBad ? colors.bad : warning ? colors.warn : colors.primary}
          />
          <View style={styles.flex}>
            <Text variant="smallStrong" tone={previewBad ? 'bad' : warning ? 'warn' : 'primary'}>
              {calendar.isLoading && validRange ? 'Counting leave days...' : (overlap ?? previewSentence(preview))}
            </Text>
            {warning && !previewBad ? (
              <Text variant="small" tone="warn">
                {warning}. The school may still refuse it.
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      <MultilineField
        label="Reason"
        value={draft.reason}
        onChangeText={(reason) => patch({ reason })}
        maxLength={REASON_MAX}
        autoCapitalize="sentences"
        autoCorrect
        placeholder="For example: Family function"
        hint={`${draft.reason.length} of ${REASON_MAX} characters`}
        error={errors.reason}
        minHeight={100}
        testID="leave-reason"
      />

      {failure ? (
        <Text variant="small" tone="bad" accessibilityLiveRegion="polite" testID="leave-failure">
          {failure}
        </Text>
      ) : null}
      <Button title="Send the request" icon="send-outline" loading={saving} onPress={() => void submit()} testID="leave-send" />
      <Text variant="caption" tone="muted">
        An administrator approves or refuses it, and you are told here. Waiting leave counts against your balance until it is answered.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  block: { gap: spacing.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56 },
  preview: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: 12 },
});
