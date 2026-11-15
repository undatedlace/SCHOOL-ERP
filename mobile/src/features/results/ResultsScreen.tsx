import { View } from 'react-native';
import { errorMessage } from '@/api';
import { radius, spacing } from '@/theme';
import { Badge, Card, EmptyState, ErrorState, Screen, Skeleton, Text } from '@/ui';
import { ResultRow } from './ResultRow';
import { TrendChart } from './TrendChart';
import { averageOf, groupBySubject, trendPoints } from './resultsLogic';
import { useResults } from './useResults';

/** Published test results for the signed-in student, grouped by subject, with a trend line. */
export function ResultsScreen() {
  const { data, isLoading, isError, error, isFetching, noStudent, refetch } = useResults();
  const groups = data ? groupBySubject(data.results) : [];
  const points = data ? trendPoints(data.results) : [];
  const overall = data ? averageOf(data.results.map((r) => r.percent)) : null;

  return (
    <Screen onRefresh={() => void refetch()} refreshing={isFetching && !isLoading}>
      {isLoading ? (
        <>
          <Card>
            <Skeleton height={176} />
          </Card>
          <Card style={{ gap: spacing.md }}>
            <Skeleton height={18} width="40%" />
            <Skeleton height={56} rounded={radius.md} />
            <Skeleton height={56} rounded={radius.md} />
          </Card>
        </>
      ) : isError && !data ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} retrying={isFetching} />
      ) : noStudent ? (
        <EmptyState icon="school-outline" title="No student found" description="Results show here once the school links a student to this account." />
      ) : !data || data.results.length === 0 ? (
        <EmptyState
          icon="ribbon-outline"
          title="No results published yet"
          description="When a teacher publishes a test, your marks will show here."
        />
      ) : (
        <>
          <Card style={{ gap: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Text variant="heading">Progress across tests</Text>
                <Text variant="small" tone="muted">
                  {points.length === 0 ? 'No scored tests yet' : `${points.length} ${points.length === 1 ? 'test' : 'tests'}, oldest to newest`}
                </Text>
              </View>
              {overall !== null ? <Badge label={`Average ${overall}%`} tone="primary" /> : null}
            </View>
            {points.length > 0 ? <TrendChart points={points} /> : null}
          </Card>

          {groups.map((g) => (
            <View key={g.subject.id} style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text variant="heading" style={{ flex: 1 }}>
                  {g.subject.name}
                </Text>
                {g.averagePercent !== null ? (
                  <Text variant="smallStrong" tone="muted">
                    Average {g.averagePercent}%
                  </Text>
                ) : null}
              </View>
              <Card padding={0} style={{ overflow: 'hidden' }}>
                {g.items.map((item, i) => (
                  <ResultRow key={item.assessment.id} item={item} divider={i < g.items.length - 1} />
                ))}
              </Card>
            </View>
          ))}
        </>
      )}
    </Screen>
  );
}
