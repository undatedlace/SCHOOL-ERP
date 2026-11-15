import { useLocalSearchParams } from 'expo-router';
import { MarksListScreen } from '@/features/teacher/marks/MarksListScreen';

/** `/teacher/marks`, optionally `?divisionId=` to open the list for one class. */
export default function TeacherMarks() {
  const { divisionId } = useLocalSearchParams<{ divisionId?: string }>();
  return <MarksListScreen divisionId={typeof divisionId === 'string' ? divisionId : undefined} />;
}
