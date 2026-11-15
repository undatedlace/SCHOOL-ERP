import { useLocalSearchParams } from 'expo-router';
import { HomeworkDetailScreen } from '@/features/homework/HomeworkDetailScreen';

export default function FamilyHomeworkDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <HomeworkDetailScreen id={String(id)} />;
}
