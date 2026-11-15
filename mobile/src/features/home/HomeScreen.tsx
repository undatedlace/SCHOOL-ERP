import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuth } from '@/auth';
import { useMyStudent } from '@/features/mystudent/useMyStudent';
import { useNow } from '@/features/timetable/useNow';
import { todayIST } from '@/lib/dates';
import { Screen } from '@/ui';
import { AttendanceCard, EventsCard, FeesCard, HeroCard, HomeworkCard, NoticesCard, ResultsCard, TimelineCard } from './HomeCards';

/** The family Home tab: greeting, today's timetable, and a card for each thing worth a glance. */
export function HomeScreen() {
  const { active } = useAuth();
  const queryClient = useQueryClient();
  const now = useNow();
  const today = todayIST(now);
  const student = useMyStudent();
  const [refreshing, setRefreshing] = useState(false);

  const firstName = (student.data?.firstName ?? active?.fullName.split(' ')[0] ?? '').trim();
  const current = student.data?.current;
  const classLabel = current ? `${current.class.name} · ${current.division.name}` : active?.subtitle ?? null;

  const refresh = async () => {
    setRefreshing(true);
    try {
      // Every card on screen asks again on its own; one failing does not hold up the others.
      await queryClient.refetchQueries({ type: 'active' });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Screen onRefresh={() => void refresh()} refreshing={refreshing}>
      <HeroCard today={today} now={now} firstName={firstName} classLabel={classLabel} />
      <TimelineCard today={today} now={now} />
      <AttendanceCard today={today} />
      <FeesCard />
      <HomeworkCard today={today} />
      <ResultsCard />
      <NoticesCard />
      <EventsCard today={today} />
    </Screen>
  );
}
