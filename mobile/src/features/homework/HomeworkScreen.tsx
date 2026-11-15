import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useApiQuery } from '@/api';
import { FilterChips } from '@/features/family-student/FilterChips';
import { useOwnStudent } from '@/features/family-student/useOwnStudent';
import { todayIST } from '@/lib/dates';
import { spacing, useTheme, type ColorTokens } from '@/theme';
import { Badge, Card, EmptyState, ErrorState, Icon, Screen, SegmentedControl, Skeleton, Text } from '@/ui';
import {
  countByBucket,
  dueInfo,
  entriesFor,
  sortByDue,
  statusBadge,
  subjectsOf,
  type Bucket,
  type Entry,
} from './homework-status';
import type { HomeworkPage } from './types';

const EMPTY_TEXT: Record<Bucket, { title: string; description: string }> = {
  TODO: { title: 'Nothing to do', description: 'Homework from your teachers will show up here.' },
  HANDED_IN: { title: 'Nothing waiting', description: 'Work you hand in shows here until the teacher marks it.' },
  MARKED: { title: 'Nothing marked yet', description: 'Marked work and teacher comments show here.' },
};

/** A colour for a subject, from the app's own palette, the same subject always the same. */
export function subjectTint(subjectId: string | undefined, colors: ColorTokens): string {
  const palette = [colors.primary, colors.amber, colors.info, colors.good];
  if (!subjectId) return colors.borderStrong;
  let hash = 0;
  for (const ch of subjectId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length]!;
}

/** The Homework tab: To do, Handed in and Marked, a subject filter, soonest due first. */
export function HomeworkScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const student = useOwnStudent();
  const list = useApiQuery<HomeworkPage>('/homework', { query: { status: 'all', page: 1, pageSize: 100 } });
  const [bucket, setBucket] = useState<Bucket>('TODO');
  const [subject, setSubject] = useState('all');

  const today = todayIST();
  const entries = useMemo(
    () => entriesFor(list.data?.items ?? [], student.data?.id, today),
    [list.data, student.data?.id, today],
  );
  const counts = countByBucket(entries);
  const subjects = subjectsOf(entries);
  const effectiveSubject = subjects.some((s) => s.id === subject) ? subject : 'all';
  const shown: Entry[] = sortByDue(
    entries
      .filter((e) => e.bucket === bucket && (effectiveSubject === 'all' || e.hw.subject?.id === effectiveSubject))
      .map((e) => ({ ...e, dueOn: e.hw.dueOn, createdAt: e.hw.createdAt, title: e.hw.title })),
  );

  const refreshing = list.isRefetching && !list.isLoading;

  return (
    <Screen onRefresh={() => void list.refetch()} refreshing={refreshing}>
      <Text variant="title">Homework</Text>
      <SegmentedControl
        accessibilityLabel="Homework lists"
        value={bucket}
        onChange={setBucket}
        options={[
          { value: 'TODO', label: 'To do', count: counts.TODO },
          { value: 'HANDED_IN', label: 'Handed in', count: counts.HANDED_IN },
          { value: 'MARKED', label: 'Marked', count: counts.MARKED },
        ]}
      />
      {subjects.length > 1 ? (
        <FilterChips
          accessibilityLabel="Filter by subject"
          value={effectiveSubject}
          onChange={setSubject}
          chips={[{ value: 'all', label: 'All subjects' }, ...subjects.map((s) => ({ value: s.id, label: s.name }))]}
        />
      ) : null}

      {list.isLoading ? (
        <View style={styles.list}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={92} rounded={22} />
          ))}
        </View>
      ) : list.isError ? (
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} retrying={list.isRefetching} />
      ) : shown.length === 0 ? (
        <EmptyState icon="book-outline" {...EMPTY_TEXT[bucket]} />
      ) : (
        <View style={styles.list}>
          {shown.map(({ hw, sub }) => {
            const due = dueInfo(hw.dueOn, today);
            const badge = statusBadge(hw, sub, today);
            const showDue = bucket === 'TODO' && due;
            return (
              <Card
                key={hw.id}
                padding={0}
                onPress={() => router.push(`/family/homework/${hw.id}`)}
                accessibilityLabel={`${hw.subject?.name ?? 'Homework'}, ${hw.title}. ${badge.label}`}
                style={styles.card}
              >
                <View style={[styles.bar, { backgroundColor: subjectTint(hw.subject?.id, colors) }]} />
                <View style={styles.body}>
                  <Text variant="label" tone="muted" numberOfLines={1}>
                    {(hw.subject?.name ?? 'Homework').toUpperCase()}
                  </Text>
                  <Text variant="bodyStrong" numberOfLines={2}>
                    {hw.title}
                  </Text>
                  <Text variant="small" tone="muted" numberOfLines={1}>
                    {hw.createdBy.fullName}
                  </Text>
                  <View style={styles.foot}>
                    <Badge label={badge.label} tone={badge.tone} />
                    {showDue ? (
                      <View style={styles.due}>
                        <Icon name="time-outline" size={15} color={due.overdue ? colors.bad : colors.mutedForeground} />
                        <Text variant="smallStrong" tone={due.overdue ? 'bad' : 'muted'}>
                          {due.overdue ? `Overdue, ${due.text}` : `Due ${due.text}`}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <View style={styles.chev}>
                  <Icon name="chevron-forward" size={18} color={colors.faint} />
                </View>
              </Card>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  card: { flexDirection: 'row', overflow: 'hidden', alignItems: 'stretch' },
  bar: { width: 6 },
  body: { flex: 1, padding: spacing.lg, gap: spacing.xs },
  foot: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  due: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  chev: { justifyContent: 'center', paddingRight: spacing.md },
});
