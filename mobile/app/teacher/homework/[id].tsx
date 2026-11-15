import { useLocalSearchParams } from 'expo-router';
import { TeacherHomeworkDetailScreen } from '@/features/teacher/homework/TeacherHomeworkDetailScreen';

export default function TeacherHomeworkDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TeacherHomeworkDetailScreen id={String(id)} />;
}
