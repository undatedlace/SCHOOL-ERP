import { useLocalSearchParams } from 'expo-router';
import { RegisterScreen } from '@/features/teacher/attendance/RegisterScreen';
import { dateParam } from '@/features/teacher/attendance/rosterLogic';
import { todayIST } from '@/lib/dates';

export default function TeacherRegister() {
  const { divisionId, date } = useLocalSearchParams<{ divisionId: string; date?: string }>();
  return <RegisterScreen divisionId={String(divisionId)} date={dateParam(date, todayIST())} />;
}
