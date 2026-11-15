import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { errorMessage } from '@/api';
import { FilterChips, type Chip } from '@/features/family-student/FilterChips';
import { todayIST } from '@/lib/dates';
import { spacing } from '@/theme';
import { Button, Card, EmptyState, ErrorState, Screen, SegmentedControl, Skeleton, Text } from '@/ui';
import { HomeworkCard } from './HomeworkCard';
import { TABS, awaitingMarking, markingQueue, tabCounts, visibleItems, type Tab } from './homeworkLogic';
import type { TeacherHomework } from './types';
import { useTeacherHomework } from './useTeacherHomework';

const EMPTY: Record<Tab, { title: string; description: string }> = {
  ALL: { title: 'No homework yet', description: 'Set homework for your classes and it will show up here.' },
  TO_MARK: { title: 'Nothing to mark', description: 'Work students hand in waits here until you mark it.' },
  OPEN: { title: 'Nothing open', description: 'Homework that is still being collected shows here.' },
  MARKED: { title: 'Nothing finished yet', description: 'Homework whose day has passed and is fully marked shows here.' },
};

function divisionChips(items: readonly TeacherHomework[]): Chip[] {
  const seen = new Map<string, string>();
  for (const hw of items) for (const d of hw.divisions) seen.set(d.id, d.label);
  return [...seen.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
}

function subjectChips(items: readonly TeacherHomework[]): Chip[] {
  const seen = new Map<string, string>();
  for (const hw of items) if (hw.subject) seen.set(hw.subject.id, hw.subject.name);
  return [...seen.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
}

/** The teacher's Homework tab: All, To mark, Open and Marked, filters, and the tasks themselves. */
export function TeacherHomeworkScreen() {
  const router = useRouter();
  const today = todayIST();
  const { items, stats, isLoading, isError, error, isRefetching, refetch, list } = useTeacherHomework();
  const [tab, setTab] = useState<Tab | null>(null);
  const [divisionId, setDivisionId] = useState('all');
  const [subjectId, setSubjectId] = useState('all');

  const divisions = useMemo(() => divisionChips(items), [items]);
  const subjects = useMemo(() => subjectChips(items), [items]);
  const effDivision = divisions.some((d) => d.value === divisionId) ? divisionId : 'all';
  const effSubject = subjects.some((s) => s.value === subjectId) ? subjectId : 'all';

  const counts = tabCounts(items, stats, { divisionId: effDivision, subjectId: effSubject }, today);
  // Open on "To mark" when there is work waiting; otherwise on everything.
  const effTab: Tab = tab ?? (counts.TO_MARK > 0 ? 'TO_MARK' : 'ALL');
  const shown = visibleItems(items, stats, { tab: effTab, divisionId: effDivision, subjectId: effSubject }, today);
  const waiting = awaitingMarking(markingQueue(items, stats));
  const filtered = effDivision !== 'all' || effSubject !== 'all';

  return (
    <Screen onRefresh={() => void refetch()} refreshing={isRefetching && !isLoading}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text variant="title">Homework</Text>
          <Text variant="small" tone="muted">
            {waiting > 0 ? `${waiting} piece${waiting === 1 ? '' : 's'} of work waiting for you.` : 'Set homework and mark what is handed in.'}
          </Text>
        </View>
        <Button
          title="New"
          icon="add"
          size="sm"
          fullWidth={false}
          onPress={() => router.push('/teacher/homework/new')}
          accessibilityLabel="Set new homework"
          testID="new-homework"
        />
      </View>

      <SegmentedControl<Tab>
        accessibilityLabel="Homework lists"
        value={effTab}
        onChange={setTab}
        options={TABS.map((t) => ({ value: t.value, label: t.label, count: counts[t.value] }))}
      />
      {divisions.length > 1 ? (
        <FilterChips
          accessibilityLabel="Filter by class"
          chips={[{ value: 'all', label: 'All classes' }, ...divisions]}
          value={effDivision}
          onChange={setDivisionId}
        />
      ) : null}
      {subjects.length > 1 ? (
        <FilterChips
          accessibilityLabel="Filter by subject"
          chips={[{ value: 'all', label: 'All subjects' }, ...subjects]}
          value={effSubject}
          onChange={setSubjectId}
        />
      ) : null}

      {isLoading ? (
        <Card style={styles.skeletons}>
          <Skeleton height={20} width="60%" />
          <Skeleton height={14} />
          <Skeleton height={6} />
        </Card>
      ) : isError && !list.data ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} retrying={isRefetching} />
      ) : shown.length === 0 ? (
        <EmptyState
          icon="book-outline"
          title={filtered && effTab === 'ALL' ? 'No homework matches' : EMPTY[effTab].title}
          description={filtered ? 'Try another class or subject.' : EMPTY[effTab].description}
          actionLabel={effTab === 'ALL' && !filtered ? 'Set homework' : undefined}
          onAction={effTab === 'ALL' && !filtered ? () => router.push('/teacher/homework/new') : undefined}
        />
      ) : (
        <View style={styles.list}>
          {shown.map((hw) => (
            <HomeworkCard
              key={hw.id}
              homework={hw}
              stats={stats.get(hw.id)}
              today={today}
              onPress={() => router.push(`/teacher/homework/${hw.id}`)}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  headText: { flex: 1, gap: 2 },
  skeletons: { gap: spacing.md },
  list: { gap: spacing.md },
});
