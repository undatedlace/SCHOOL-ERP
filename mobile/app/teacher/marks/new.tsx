import { useLocalSearchParams } from 'expo-router';
import { NewTestScreen } from '@/features/teacher/marks/NewTestScreen';

export default function TeacherNewTest() {
  const { divisionId } = useLocalSearchParams<{ divisionId?: string }>();
  return <NewTestScreen divisionId={typeof divisionId === 'string' ? divisionId : undefined} />;
}
