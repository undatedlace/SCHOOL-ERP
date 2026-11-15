import { useLocalSearchParams } from 'expo-router';
import { HomeworkFormScreen } from '@/features/teacher/homework/HomeworkFormScreen';

export default function TeacherEditHomework() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <HomeworkFormScreen editId={String(id)} />;
}
