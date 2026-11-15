import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { api, errorMessage, useApiQuery } from '@/api';
import { invalidatePrefix } from '@/features/family-student/invalidate';
import { HomeworkFileRow } from '@/features/homework/HomeworkFileRow';
import { marksText } from '@/features/homework/homework-status';
import { todayIST } from '@/lib/dates';
import { spacing } from '@/theme';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, ListRow, Screen, SectionHeader, SegmentedControl, Skeleton, Text } from '@/ui';
import { ProgressBar } from '../ProgressBar';
import {
  audienceText,
  dueText,
  handedInText,
  isPastDue,
  markedProgressText,
  markedShare,
  rosterCounts,
  rosterGroup,
  sortRoster,
  statsFromRoster,
  type RosterFilter,
} from './homeworkLogic';
import { ReviewSheet } from './ReviewSheet';
import type { HandInEntry, HandInRoster, TeacherHomework } from './types';

const FILTERS: { value: RosterFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'TO_MARK', label: 'To mark' },
  { value: 'NOT_HANDED', label: 'Missing' },
  { value: 'MARKED', label: 'Marked' },
];

/** One task: its instructions and files, and the hand-in roster with marking. */
export function TeacherHomeworkDetailScreen({ id }: { id: string }) {
  const router = useRouter();
  const client = useQueryClient();
  const query = useApiQuery<TeacherHomework>(`/homework/${id}`);
  const hw = query.data;
  const roster = useApiQuery<HandInRoster>(`/homework/${id}/hand-ins`, { enabled: hw?.handIn === true });
  const [filter, setFilter] = useState<RosterFilter | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const today = todayIST();

  const students = useMemo(() => roster.data?.students ?? [], [roster.data]);
  const counts = useMemo(() => rosterCounts(students), [students]);
  const stats = useMemo(() => (roster.data ? statsFromRoster(roster.data) : null), [roster.data]);
  const effFilter: RosterFilter = filter ?? (counts.TO_MARK > 0 ? 'TO_MARK' : 'ALL');
  const rows = useMemo(
    () =>
      sortRoster(students).filter((e) => effFilter === 'ALL' || rosterGroup(e) === effFilter || (effFilter === 'NOT_HANDED' && rosterGroup(e) === 'REDO')),
    [students, effFilter],
  );
  const current = reviewing ? students.find((s) => s.studentId === reviewing) ?? null : null;

  if (query.isLoading) {
    return (
      <Screen>
        <Skeleton height={28} width="70%" />
        <Skeleton height={120} rounded={22} />
        <Skeleton height={160} rounded={22} />
      </Screen>
    );
  }
  if (query.isError || !hw) {
    return (
      <Screen>
        <ErrorState message={query.error?.message} onRetry={() => void query.refetch()} retrying={query.isRefetching} />
      </Screen>
    );
  }

  const remove = () => {
    Alert.alert('Remove this homework?', 'Students and parents will no longer see it. It stays in the school record.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setRemoving(true);
          setActionError(null);
          try {
            await api.delete(`/homework/${id}`);
            await invalidatePrefix(client, '/homework');
            router.replace('/teacher/homework');
          } catch (e) {
            setActionError(errorMessage(e));
            setRemoving(false);
          }
        },
      },
    ]);
  };

  const refresh = async () => {
    await invalidatePrefix(client, '/homework');
  };

  return (
    <Screen onRefresh={() => void refresh()} refreshing={(query.isRefetching || roster.isRefetching) && !query.isLoading}>
      <View style={styles.head}>
        <View style={styles.badges}>
          {hw.subject ? <Badge label={hw.subject.name} tone="primary" /> : null}
          {isPastDue(hw, today) ? <Badge label="Past its day" tone="neutral" /> : null}
          {hw.handIn ? <Badge label="Hand-in on" tone="info" /> : <Badge label="No hand-in" tone="neutral" />}
        </View>
        <Text variant="title">{hw.title}</Text>
        <Text variant="small" tone="muted">
          For {audienceText(hw)} · {dueText(hw.dueOn, today)}
        </Text>
      </View>

      <Card style={styles.card}>
        <Text variant="smallStrong">Instructions</Text>
        <Text variant="body" selectable>
          {hw.instructions}
        </Text>
        {hw.attachments.length > 0 ? (
          <View style={styles.files}>
            <Text variant="smallStrong">Files you attached</Text>
            {hw.attachments.map((f) => (
              <HomeworkFileRow key={f.id} homeworkId={hw.id} file={f} />
            ))}
          </View>
        ) : null}
        {hw.maxMarks ? (
          <Text variant="small" tone="muted">
            Marked out of {marksText(hw.maxMarks, null)}.
          </Text>
        ) : null}
      </Card>

      {hw.canChange ? (
        <View style={styles.actions}>
          <Button
            title="Change"
            icon="create-outline"
            variant="secondary"
            fullWidth={false}
            style={styles.actionButton}
            onPress={() => router.push(`/teacher/homework/edit/${hw.id}`)}
            testID="edit-homework"
          />
          <Button
            title="Remove"
            icon="trash-outline"
            variant="danger"
            fullWidth={false}
            style={styles.actionButton}
            loading={removing}
            onPress={remove}
            testID="remove-homework"
          />
        </View>
      ) : null}
      {actionError ? (
        <Text variant="small" tone="bad" accessibilityLiveRegion="polite">
          {actionError}
        </Text>
      ) : null}

      <SectionHeader title="Hand-ins" />
      {!hw.handIn ? (
        <Card>
          <Text variant="small" tone="muted">
            Students do not hand work in through the app for this homework. Change it to switch hand-in on.
          </Text>
        </Card>
      ) : roster.isLoading ? (
        <Card style={styles.card}>
          <Skeleton height={18} width="60%" />
          <Skeleton height={44} />
          <Skeleton height={44} />
        </Card>
      ) : roster.isError && !roster.data ? (
        <ErrorState message={errorMessage(roster.error)} onRetry={() => void roster.refetch()} retrying={roster.isFetching} />
      ) : (
        <>
          {stats ? (
            <Card style={styles.card}>
              <View style={styles.summary}>
                <Text variant="bodyStrong">{handedInText(stats)}</Text>
                {stats.toMark > 0 ? <Badge label={`${stats.toMark} to mark`} tone="amber" /> : null}
              </View>
              <ProgressBar share={stats.students === 0 ? 0 : stats.handedIn / stats.students} label={handedInText(stats)} />
              {stats.handedIn > 0 ? (
                <>
                  <Text variant="caption" tone="muted">
                    {markedProgressText(stats)}
                    {stats.redo > 0 ? ` · ${stats.redo} sent back` : ''}
                  </Text>
                  <ProgressBar share={markedShare(stats)} label={markedProgressText(stats)} tone="good" />
                </>
              ) : null}
            </Card>
          ) : null}

          <SegmentedControl<RosterFilter>
            accessibilityLabel="Students"
            value={effFilter}
            onChange={setFilter}
            options={FILTERS.map((f) => ({
              value: f.value,
              label: f.label,
              count: f.value === 'NOT_HANDED' ? counts.NOT_HANDED + counts.REDO : counts[f.value],
            }))}
          />

          {rows.length === 0 ? (
            <EmptyState
              icon="people-outline"
              title={students.length === 0 ? 'No students yet' : 'Nobody here'}
              description={students.length === 0 ? 'No current students are in the classes this homework is for.' : 'Try another list.'}
            />
          ) : (
            <Card padding={0} style={styles.list}>
              {rows.map((e, i) => (
                <RosterRow
                  key={e.studentId}
                  entry={e}
                  maxMarks={roster.data?.maxMarks ?? hw.maxMarks}
                  past={isPastDue(hw, today)}
                  last={i === rows.length - 1}
                  onPress={e.submission ? () => setReviewing(e.studentId) : undefined}
                />
              ))}
            </Card>
          )}
        </>
      )}

      {current ? (
        <ReviewSheet
          key={current.studentId}
          visible
          onClose={() => setReviewing(null)}
          homeworkId={hw.id}
          homeworkTitle={hw.title}
          maxMarks={roster.data?.maxMarks ?? hw.maxMarks}
          entry={current}
        />
      ) : null}
    </Screen>
  );
}

function RosterRow({
  entry,
  maxMarks,
  past,
  last,
  onPress,
}: {
  entry: HandInEntry;
  maxMarks: string | null;
  past: boolean;
  last: boolean;
  onPress?: () => void;
}) {
  const sub = entry.submission;
  let badge: { label: string; tone: 'amber' | 'good' | 'warn' | 'bad' | 'neutral' };
  if (!sub) badge = { label: 'Not handed in', tone: past ? 'bad' : 'neutral' };
  else if (sub.status === 'REVIEWED') badge = { label: `Marked${marksText(sub.marks, maxMarks) ? ` ${marksText(sub.marks, maxMarks)}` : ''}`, tone: 'good' };
  else if (sub.status === 'REDO') badge = { label: 'Sent back', tone: 'warn' };
  else badge = { label: sub.late ? 'To mark, late' : 'To mark', tone: 'amber' };

  const subtitle = [entry.admissionNo, sub ? `${sub.files.length} file${sub.files.length === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ');
  return (
    <ListRow
      title={entry.name}
      subtitle={subtitle}
      leading={<Avatar name={entry.name} size={40} />}
      trailing={<Badge label={badge.label} tone={badge.tone} />}
      onPress={onPress}
      chevron={Boolean(onPress)}
      showDivider={!last}
      testID={`hand-in-${entry.studentId}`}
    />
  );
}

const styles = StyleSheet.create({
  head: { gap: spacing.xs },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  card: { gap: spacing.sm },
  files: { gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.md },
  actionButton: { flex: 1 },
  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  list: { overflow: 'hidden' },
});
