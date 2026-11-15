import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { api, errorMessage, useApiQuery } from '@/api';
import { invalidatePrefix } from '@/features/family-student/invalidate';
import { useOwnStudent } from '@/features/family-student/useOwnStudent';
import { formatDateTime, formatDay, todayIST } from '@/lib/dates';
import { spacing, useTheme } from '@/theme';
import { Badge, Button, Card, ErrorState, Icon, Screen, Skeleton, Text } from '@/ui';
import { HandInSheet } from './HandInSheet';
import { HomeworkFileRow } from './HomeworkFileRow';
import { canHandIn, canTakeBack, childSubmission, dueInfo, dueLabel, marksText, statusBadge } from './homework-status';
import type { Homework } from './types';

/** One homework: instructions, the teacher's files, and the hand-in with its state. */
export function HomeworkDetailScreen({ id }: { id: string }) {
  const { colors } = useTheme();
  const client = useQueryClient();
  const student = useOwnStudent();
  const query = useApiQuery<Homework>(`/homework/${id}`);
  const [handInOpen, setHandInOpen] = useState(false);
  const [taking, setTaking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (query.isLoading) {
    return (
      <Screen>
        <Skeleton height={28} width="70%" />
        <Skeleton height={120} rounded={22} />
        <Skeleton height={160} rounded={22} />
      </Screen>
    );
  }
  if (query.isError || !query.data) {
    return (
      <Screen>
        <ErrorState message={query.error?.message} onRetry={() => void query.refetch()} retrying={query.isRefetching} />
      </Screen>
    );
  }

  const hw = query.data;
  const today = todayIST();
  const child = hw.children.find((c) => c.studentId === student.data?.id) ?? hw.children[0] ?? null;
  const sub = childSubmission(hw, child?.studentId);
  const badge = statusBadge(hw, sub, today);
  const due = dueInfo(hw.dueOn, today);
  const marks = sub ? marksText(sub.marks, hw.maxMarks) : null;

  const takeBack = () => {
    if (!child) return;
    Alert.alert('Take back your hand-in?', 'Your teacher will not see it until you hand in again.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Take back',
        style: 'destructive',
        onPress: async () => {
          setTaking(true);
          setActionError(null);
          try {
            await api.delete(`/homework/${hw.id}/students/${child.studentId}/hand-in`);
            await invalidatePrefix(client, '/homework');
          } catch (e) {
            setActionError(errorMessage(e));
          } finally {
            setTaking(false);
          }
        },
      },
    ]);
  };

  return (
    <Screen onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <View style={styles.head}>
        <View style={styles.badges}>
          {hw.subject ? <Badge label={hw.subject.name} tone="primary" /> : null}
          <Badge label={badge.label} tone={badge.tone} />
        </View>
        <Text variant="title">{hw.title}</Text>
        <View style={styles.meta}>
          <Icon name="person-outline" size={16} color={colors.mutedForeground} />
          <Text variant="small" tone="muted">
            Set by {hw.createdBy.fullName} on {formatDay(hw.createdAt, 'dayMonth')}
          </Text>
        </View>
        <View style={styles.meta}>
          <Icon name="time-outline" size={16} color={due?.overdue && !sub ? colors.bad : colors.mutedForeground} />
          <Text variant="smallStrong" tone={due?.overdue && !sub ? 'bad' : 'muted'}>
            {dueLabel(hw.dueOn, today)}
            {hw.dueOn && due && ['Today', 'Tomorrow', 'Yesterday'].includes(due.text) ? ` (${formatDay(hw.dueOn, 'short')})` : ''}
          </Text>
        </View>
      </View>

      <Card style={styles.block}>
        <Text variant="subheading">Instructions</Text>
        <Text variant="body" selectable>
          {hw.instructions}
        </Text>
      </Card>

      {hw.attachments.length > 0 ? (
        <Card style={styles.block}>
          <Text variant="subheading">From your teacher</Text>
          {hw.attachments.map((file) => (
            <HomeworkFileRow key={file.id} homeworkId={hw.id} file={file} />
          ))}
        </Card>
      ) : null}

      <Card style={styles.block} testID="hand-in-card">
        <Text variant="subheading">Your hand-in</Text>

        {!hw.handIn ? (
          <Text variant="body" tone="muted">
            Nothing to hand in through the app. Do the work as set and show it to your teacher.
          </Text>
        ) : !sub ? (
          <Text variant="body" tone="muted">
            You have not handed this in yet.
          </Text>
        ) : (
          <View style={styles.block}>
            {sub.status === 'REDO' ? (
              <View style={[styles.callout, { backgroundColor: colors.warnSoft }]}>
                <Text variant="smallStrong" tone="warn">
                  Sent back to be done again
                </Text>
                <Text variant="small" tone="warn">
                  {sub.feedback ? sub.feedback : 'Your teacher asked you to hand it in again.'}
                </Text>
              </View>
            ) : (
              <Text variant="small" tone="muted">
                Handed in {formatDateTime(sub.submittedAt)}
                {sub.late ? ', after the due day' : ''}
              </Text>
            )}
            {sub.note ? (
              <View style={styles.block}>
                <Text variant="smallStrong">Your note</Text>
                <Text variant="body" selectable>
                  {sub.note}
                </Text>
              </View>
            ) : null}
            {sub.files.map((file) => (
              <HomeworkFileRow key={file.id} homeworkId={hw.id} file={file} />
            ))}
            {sub.status === 'REVIEWED' ? (
              <View style={[styles.callout, { backgroundColor: colors.goodSoft }]}>
                <Text variant="smallStrong" tone="good">
                  {marks ? `Marked: ${marks}` : 'Marked'}
                </Text>
                {sub.feedback ? (
                  <Text variant="small" tone="good" selectable>
                    {sub.feedback}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        )}

        {actionError ? (
          <Text variant="small" tone="bad" accessibilityLiveRegion="polite">
            {actionError}
          </Text>
        ) : null}

        {child && canHandIn(hw, sub) ? (
          <Button
            title={sub?.status === 'REDO' ? 'Hand in again' : 'Hand in'}
            icon="cloud-upload-outline"
            onPress={() => setHandInOpen(true)}
            testID="open-hand-in"
          />
        ) : null}
        {canTakeBack(sub) ? (
          <Button title="Take back" variant="ghost" icon="arrow-undo-outline" onPress={takeBack} loading={taking} testID="take-back" />
        ) : null}
        {sub?.status === 'REVIEWED' ? (
          <Text variant="caption" tone="muted">
            This has been marked, so it cannot be changed.
          </Text>
        ) : null}
      </Card>

      {child ? (
        <HandInSheet
          visible={handInOpen}
          onClose={() => setHandInOpen(false)}
          homeworkId={hw.id}
          studentId={child.studentId}
          title={hw.title}
          again={sub?.status === 'REDO'}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: spacing.sm },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  block: { gap: spacing.md },
  callout: { gap: spacing.xs, padding: spacing.md, borderRadius: 12 },
});
