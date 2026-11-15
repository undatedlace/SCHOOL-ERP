import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { errorMessage } from '@/api';
import { addDays, formatClock, formatDay, minutesNowIST, startOfWeek, todayIST } from '@/lib/dates';
import { spacing, useTheme } from '@/theme';
import { Badge, Button, Card, EmptyState, ErrorState, Icon, Screen, Skeleton, Text } from '@/ui';
import { useNow } from '@/features/timetable/useNow';
import { nextLessonIn } from '../today/teacherDay';
import { useTeacherWeek } from '../today/useTeacherWeek';
import { divisionLabel, flaggedText, registerState, type DivisionOption } from './rosterLogic';
import { useMyDivisions, useOverview, type OverviewDivision } from './useAttendanceData';

/** The Attendance tab: one card for each class I teach, with today's register state and shortcuts. */
export function AttendanceScreen() {
  const router = useRouter();
  const now = useNow();
  const today = todayIST(now);
  const nowMin = minutesNowIST(now);
  const divisions = useMyDivisions();
  const overview = useOverview(today);
  const monday = startOfWeek(today);
  const week = useTeacherWeek(monday);
  // The lesson after the weekend lives in next week's timetable.
  const following = useTeacherWeek(addDays(monday, 7));

  const refreshing = (divisions.isRefetching || overview.isRefetching || week.isRefetching || following.isRefetching) && !divisions.isLoading;
  const refetch = () => {
    void divisions.refetch();
    void overview.refetch();
    void week.refetch();
    void following.refetch();
  };
  const mine = divisions.data ?? [];

  return (
    <Screen onRefresh={refetch} refreshing={refreshing}>
      <View style={styles.head}>
        <Text variant="title">Attendance</Text>
        <Text variant="small" tone="muted">
          {formatDay(today, 'weekday')}. Take the register for the classes you teach.
        </Text>
      </View>

      {divisions.isLoading ? (
        <Card style={styles.gap}>
          <Skeleton height={22} width="40%" />
          <Skeleton height={16} />
          <Skeleton height={44} />
        </Card>
      ) : divisions.isError && !divisions.data ? (
        <ErrorState message={errorMessage(divisions.error)} onRetry={() => void divisions.refetch()} retrying={divisions.isFetching} />
      ) : mine.length === 0 ? (
        <EmptyState
          icon="school-outline"
          title="No classes yet"
          description="Classes appear here once the school makes you a class teacher or a subject teacher this year."
        />
      ) : (
        <View style={styles.gap}>
          {mine.map((d) => (
            <ClassCard
              key={d.id}
              division={d}
              overview={overview.data?.divisions.find((o) => o.id === d.id)}
              overviewLoading={overview.isLoading}
              next={nextLessonIn(week.data, d.id, today, nowMin) ?? nextLessonIn(following.data, d.id, today, nowMin)}
              today={today}
              onRegister={() => router.push(`/teacher/attendance/${d.id}`)}
              onMarks={() => router.push(`/teacher/marks?divisionId=${d.id}`)}
              onStudents={() => router.push(`/teacher/students?divisionId=${d.id}`)}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

function ClassCard({
  division,
  overview,
  overviewLoading,
  next,
  today,
  onRegister,
  onMarks,
  onStudents,
}: {
  division: DivisionOption;
  overview: OverviewDivision | undefined;
  overviewLoading: boolean;
  next: ReturnType<typeof nextLessonIn>;
  today: string;
  onRegister: () => void;
  onMarks: () => void;
  onStudents: () => void;
}) {
  const { colors } = useTheme();
  const label = divisionLabel(division);
  const state = registerState(overview);
  const flagged = overview ? flaggedText({ ...overview.counts, unmarked: 0, total: overview.enrolled }) : '';
  const nextText = next
    ? `${next.date === today ? 'Today' : formatDay(next.date, 'short')}, ${formatClock(next.row.startsAt)}${next.row.subject ? ` · ${next.row.subject}` : ''}`
    : 'No more lessons this week';

  return (
    <Card style={styles.card} testID={`class-${division.id}`}>
      <View style={styles.cardTop}>
        <View style={styles.flex}>
          <Text variant="heading">{label}</Text>
          <Text variant="small" tone="muted">
            {overview ? `${overview.enrolled} student${overview.enrolled === 1 ? '' : 's'}` : overviewLoading ? 'Counting...' : 'Class size unknown'}
          </Text>
        </View>
        {overview || !overviewLoading ? (
          <Badge
            label={state === 'marked' ? 'Register taken' : state === 'partial' ? 'Partly marked' : 'Not taken yet'}
            tone={state === 'marked' ? 'good' : state === 'partial' ? 'warn' : 'amber'}
          />
        ) : null}
      </View>

      {flagged ? (
        <View style={styles.line}>
          <Icon name="alert-circle-outline" size={16} color={colors.mutedForeground} />
          <Text variant="small" tone="muted">
            Today: {flagged}
          </Text>
        </View>
      ) : null}
      <View style={styles.line}>
        <Icon name="time-outline" size={16} color={colors.mutedForeground} />
        <Text variant="small" tone="muted">
          Next lesson: {nextText}
        </Text>
      </View>

      <Button
        title={!division.canMark ? 'Look at the register' : state === 'not-marked' ? 'Take the register' : 'Open the register'}
        icon="checkmark-done-outline"
        onPress={onRegister}
        testID={`register-${division.id}`}
      />
      <View style={styles.shortcuts}>
        <Button title="Marks" icon="create-outline" variant="secondary" size="sm" fullWidth={false} style={styles.flex} onPress={onMarks} />
        <Button title="Students" icon="people-outline" variant="secondary" size="sm" fullWidth={false} style={styles.flex} onPress={onStudents} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { gap: 2 },
  gap: { gap: spacing.md },
  card: { gap: spacing.md },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  shortcuts: { flexDirection: 'row', gap: spacing.md },
});
