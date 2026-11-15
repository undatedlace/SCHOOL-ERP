import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { errorMessage, useApiQuery } from '@/api';
import { FilterChips } from '@/features/family-student/FilterChips';
import { SearchBox, useDebounced } from '@/features/messages/SearchBox';
import { usePagedList } from '@/features/paging/usePagedList';
import { spacing } from '@/theme';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, ListRow, Screen, SegmentedControl, Skeleton, Text } from '@/ui';
import { classLine, classOfDivision, listQuery, type ClassWithDivisions, type StudentPage, type StudentListItem } from './studentsLogic';

type Status = 'ACTIVE' | 'LEFT';

/** Every student in the school, read only: search, narrow by class and division, open a profile. */
export function StudentsScreen({ divisionId: initialDivision }: { divisionId?: string }) {
  const router = useRouter();
  const classes = useApiQuery<ClassWithDivisions[]>('/classes', { staleTime: 10 * 60_000 });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<Status>('ACTIVE');
  const [classChoice, setClassChoice] = useState<string | null>(null);
  const [divisionId, setDivisionId] = useState(initialDivision ?? 'all');
  const q = useDebounced(search, 300);

  const all = classes.data ?? [];
  // A shortcut from a class card opens with that class chosen; later taps override it.
  const classId = classChoice ?? classOfDivision(all, initialDivision);
  const chosenClass = all.find((c) => c.id === classId);
  const effDivision = chosenClass?.divisions.some((d) => d.id === divisionId) ? divisionId : 'all';

  const list = usePagedList<StudentListItem, StudentPage>('/students', listQuery({ search: q, classId, divisionId: effDivision, status }), 20);
  const filtered = classId !== 'all' || effDivision !== 'all' || q.trim().length >= 2;

  return (
    <Screen onRefresh={() => void list.refetch()} refreshing={list.isRefetching && !list.isLoading && !list.isFetchingNextPage}>
      <View style={styles.head}>
        <Text variant="title">Students</Text>
        <Text variant="small" tone="muted">
          {list.isLoading ? 'Looking...' : `${list.total} ${list.total === 1 ? 'student' : 'students'}${filtered ? ' match' : ''}. You can look at every student; only the school office changes records.`}
        </Text>
      </View>

      <SearchBox value={search} onChangeText={setSearch} placeholder="Name, student ID or parent" label="Search students" />
      <SegmentedControl<Status>
        accessibilityLabel="Students"
        value={status}
        onChange={setStatus}
        options={[
          { value: 'ACTIVE', label: 'Current' },
          { value: 'LEFT', label: 'Left school' },
        ]}
      />
      {all.length > 1 ? (
        <FilterChips
          accessibilityLabel="Filter by class"
          chips={[{ value: 'all', label: 'All classes' }, ...all.map((c) => ({ value: c.id, label: c.name }))]}
          value={classId}
          onChange={(id) => {
            setClassChoice(id);
            setDivisionId('all');
          }}
        />
      ) : null}
      {chosenClass && chosenClass.divisions.length > 1 ? (
        <FilterChips
          accessibilityLabel="Filter by division"
          chips={[{ value: 'all', label: `All of ${chosenClass.name}` }, ...chosenClass.divisions.map((d) => ({ value: d.id, label: `${chosenClass.name}-${d.name}` }))]}
          value={effDivision}
          onChange={setDivisionId}
        />
      ) : null}

      {list.isLoading ? (
        <Card style={styles.skeletons}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={44} />
          ))}
        </Card>
      ) : list.isError && list.items.length === 0 ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => void list.refetch()} retrying={list.isRefetching} />
      ) : list.items.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="No students found"
          description={filtered ? 'Try a different name, class or division.' : status === 'LEFT' ? 'Nobody has left this school yet.' : 'No students yet.'}
        />
      ) : (
        <View style={styles.gap}>
          <Card padding={0} style={styles.list}>
            {list.items.map((s, i) => (
              <ListRow
                key={s.id}
                title={s.fullName}
                subtitle={`${classLine(s)} · ${s.admissionNo}`}
                leading={<Avatar name={s.fullName} size={44} />}
                trailing={s.status === 'LEFT' ? <Badge label="Left" tone="neutral" /> : undefined}
                showDivider={i < list.items.length - 1}
                onPress={() => router.push(`/teacher/students/${s.id}`)}
                testID={`student-${s.id}`}
              />
            ))}
          </Card>
          {list.hasNextPage ? (
            <Button title="Show more" variant="ghost" onPress={() => void list.fetchNextPage()} loading={list.isFetchingNextPage} testID="students-more" />
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: 2 },
  gap: { gap: spacing.md },
  list: { overflow: 'hidden' },
  skeletons: { gap: spacing.md },
});
