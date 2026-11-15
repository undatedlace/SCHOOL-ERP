import { useLocalSearchParams } from 'expo-router';
import { NoticeFormScreen } from '@/features/teacher/notices/NoticeFormScreen';

export default function TeacherEditNotice() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <NoticeFormScreen editId={String(id)} />;
}
