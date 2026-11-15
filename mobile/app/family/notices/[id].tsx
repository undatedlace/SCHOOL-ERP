import { useLocalSearchParams } from 'expo-router';
import { NoticeDetailScreen } from '@/features/notices/NoticeDetailScreen';

export default function FamilyNoticeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <NoticeDetailScreen id={String(id)} />;
}
