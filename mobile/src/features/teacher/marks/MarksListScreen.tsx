import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useState } from 'react';
import { errorMessage } from '@/api';
import { FilterChips } from '@/features/family-student/FilterChips';
import { usePagedList } from '@/features/paging/usePagedList';
import { formatDay } from '@/lib/dates';
import { spacing } from '@/theme';
import { Badge, Button, Card, EmptyState, ErrorState, Screen, SegmentedControl, Skeleton, Text } from '@/ui';
import { STATUS_TABS, enteredText, kindLabel, markText, maxOf, subjectChoices, type StatusFilter, type TestPage, type TestSummary } from './marksLogic';
import { useTestOptions } from './useMarks';

/** My tests: filter by class, subject and whether the results are published. */
export function MarksListScreen({ divisionId: initialDivision }: { divisionId?: string }) {
  const router = useRouter();
  const options = useTestOptions();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [divisionId, setDivisionId] = useState(initialDivision ?? 'all');
  const [subjectId, setSubjectId] = useState('all');

  const divisions = options.data?.divisions ?? [];
  const subjects = subjectChoices(options.data, divisionId);
  // A subject chosen for one class may not exist in another; fall back to all.
  const effSubject = subjects.some((s) => s.id === subjectId) ? subjectId : 'all';

  const list = usePagedList<TestSummary, TestPage>(
    '/assessments',
    {
      status,
      divisionId: divisionId === 'all' ? undefined : divisionId,
      subjectId: effSubject === 'all' ? undefined : effSubject,
    },
    20,
  );
  const filtered = divisionId !== 'all' || effSubject !== 'all';
  const newHref = `/teacher/marks/new${divisionId !== 'all' ? `?divisionId=${divisionId}` : ''}`;

  return (
    <Screen onRefresh={() => void list.refetch()} refreshing={list.isRefetching && !list.isLoading && !list.isFetchingNextPage}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text variant="title">Marks</Text>
          <Text variant="small" tone="muted">
            Set a test, enter marks, and publish when you are ready.
          </Text>
        </View>
        <Button title="New test" icon="add" size="sm" fullWidth={false} onPress={() => router.push(newHref)} testID="new-test" />
      </View>

      <SegmentedControl<StatusFilter> accessibilityLabel="Show tests" value={status} onChange={setStatus} options={STATUS_TABS} />
      {divisions.length > 1 ? (
        <FilterChips
          accessibilityLabel="Filter by class"
          chips={[{ value: 'all', label: 'All classes' }, ...divisions.map((d) => ({ value: d.id, label: d.label }))]}
          value={divisionId}
          onChange={setDivisionId}
        />
      ) : null}
      {subjects.length > 1 ? (
        <FilterChips
          accessibilityLabel="Filter by subject"
          chips={[{ value: 'all', label: 'All subjects' }, ...subjects.map((s) => ({ value: s.id, label: s.name }))]}
          value={effSubject}
          onChange={setSubjectId}
        />
      ) : null}

      {list.isLoading ? (
        <Card style={styles.skeletons}>
          <Skeleton height={20} width="60%" />
          <Skeleton height={14} />
          <Skeleton height={14} width="40%" />
        </Card>
      ) : list.isError && list.items.length === 0 ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => void list.refetch()} retrying={list.isRefetching} />
      ) : list.items.length === 0 ? (
        <EmptyState
          icon="create-outline"
          title={filtered || status !== 'all' ? 'No tests match' : 'No tests yet'}
          description={
            filtered || status !== 'all'
              ? 'Try another class, subject or list.'
              : 'Set a test for a class you teach, then enter the marks.'
          }
          actionLabel={!filtered && status === 'all' ? 'Set a test' : undefined}
          onAction={!filtered && status === 'all' ? () => router.push(newHref) : undefined}
        />
      ) : (
        <View style={styles.list}>
          {list.items.map((t) => (
            <TestCard key={t.id} test={t} onPress={() => router.push(`/teacher/marks/${t.id}`)} />
          ))}
          {list.hasNextPage ? (
            <Button title="Show more" variant="ghost" onPress={() => void list.fetchNextPage()} loading={list.isFetchingNextPage} testID="tests-more" />
          ) : null}
        </View>
      )}
    </Screen>
  );
}

function TestCard({ test, onPress }: { test: TestSummary; onPress: () => void }) {
  const max = markText(maxOf(test));
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${test.name}, ${test.subject.name}, ${test.division.label}, ${formatDay(test.conductedOn, 'medium')}. ${enteredText(test)}. ${
        test.published ? 'Published' : 'Not published'
      }`}
      style={styles.card}
      testID={`test-${test.id}`}
    >
      <View style={styles.cardTop}>
        <Text variant="bodyStrong" numberOfLines={2} style={styles.headText}>
          {test.name}
        </Text>
        <Badge label={test.published ? 'Published' : 'Not published'} tone={test.published ? 'good' : 'amber'} />
      </View>
      <Text variant="small" tone="muted">
        {test.subject.name} · {test.division.label} · {kindLabel(test.kind)}
      </Text>
      <Text variant="small" tone="muted">
        {formatDay(test.conductedOn, 'medium')} · out of {max}
      </Text>
      <Text variant="smallStrong" tone={test.entered === 0 ? 'warn' : test.entered < test.students ? 'info' : 'good'}>
        {enteredText(test)}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  headText: { flex: 1, gap: 2 },
  skeletons: { gap: spacing.md },
  list: { gap: spacing.md },
  card: { gap: spacing.xs },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
