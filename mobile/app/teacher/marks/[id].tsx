import { useLocalSearchParams } from 'expo-router';
import { MarksEntryScreen } from '@/features/teacher/marks/MarksEntryScreen';

export default function TeacherMarksEntry() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <MarksEntryScreen id={String(id)} />;
}
