import { useLocalSearchParams } from 'expo-router';
import { TeacherNoticeDetailScreen } from '@/features/teacher/notices/TeacherNoticeDetailScreen';

export default function TeacherNoticeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TeacherNoticeDetailScreen id={String(id)} />;
}
