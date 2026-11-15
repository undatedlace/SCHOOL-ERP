import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useAuth } from '@/auth';
import { invalidatePrefix } from '@/features/family-student/invalidate';
import { useNow } from '@/features/timetable/useNow';
import { minutesNowIST, startOfWeek, todayIST } from '@/lib/dates';
import { Screen } from '@/ui';
import { useOverview } from '../attendance/useAttendanceData';
import { markingQueue } from '../homework/homeworkLogic';
import { useTeacherHomework } from '../homework/useTeacherHomework';
import { StudentLeaveCard } from './StudentLeaveCard';
import { EventsCard, Hero, LessonsCard, MarkingQueueCard, MessagesCard, Tiles } from './TodayCards';
import { planTeacherDay } from './teacherDay';
import { useTeacherWeek } from './useTeacherWeek';

/**
 * The Today tab. Every card loads and fails on its own, so one slow or failing request never
 * blanks the screen. Pull down to load them all again.
 */
export function TodayScreen() {
  const client = useQueryClient();
  const { active } = useAuth();
  const now = useNow();
  const today = todayIST(now);
  const nowMin = minutesNowIST(now);
  const [refreshing, setRefreshing] = useState(false);

  const week = useTeacherWeek(startOfWeek(today));
  const plan = useMemo(() => (week.data ? planTeacherDay(week.data, today) : null), [week.data, today]);
  const homework = useTeacherHomework();
  const queue = useMemo(() => markingQueue(homework.items, homework.stats), [homework.items, homework.stats]);
  const overview = useOverview(today);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await invalidatePrefix(client, '/');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Screen onRefresh={() => void refresh()} refreshing={refreshing}>
      <Hero
        firstName={active?.fullName.split(' ')[0] ?? ''}
        today={today}
        nowMin={nowMin}
        now={now}
        plan={plan}
        loading={week.isLoading}
      />
      <Tiles
        today={today}
        nowMin={nowMin}
        plan={plan}
        loading={week.isLoading}
        queue={queue}
        queueLoading={homework.isLoading || homework.rostersLoading}
        overview={overview.data?.divisions}
        overviewLoading={overview.isLoading}
      />
      <LessonsCard
        today={today}
        nowMin={nowMin}
        plan={plan}
        loading={week.isLoading}
        error={week.error}
        onRetry={() => void week.refetch()}
        retrying={week.isFetching}
      />
      <MarkingQueueCard
        queue={queue}
        today={today}
        isLoading={homework.isLoading || homework.rostersLoading}
        isError={homework.isError}
        error={homework.error}
        onRetry={() => void homework.refetch()}
        retrying={homework.isRefetching}
      />
      <StudentLeaveCard />
      <MessagesCard />
      <EventsCard today={today} />
    </Screen>
  );
}
