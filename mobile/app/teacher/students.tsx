import { useLocalSearchParams } from 'expo-router';
import { StudentsScreen } from '@/features/teacher/students/StudentsScreen';

/** `/teacher/students`, optionally `?divisionId=` to open the list for one class. */
export default function TeacherStudents() {
  const { divisionId } = useLocalSearchParams<{ divisionId?: string }>();
  return <StudentsScreen divisionId={typeof divisionId === 'string' ? divisionId : undefined} />;
}
