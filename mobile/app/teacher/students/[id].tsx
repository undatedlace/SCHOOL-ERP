import { useLocalSearchParams } from 'expo-router';
import { StudentProfileScreen } from '@/features/teacher/students/StudentProfileScreen';

export default function TeacherStudentProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <StudentProfileScreen id={String(id)} />;
}
