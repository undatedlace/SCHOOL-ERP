import { MoreList, type MoreItem } from '@/features/shell/MoreList';

const ITEMS: MoreItem[] = [
  { title: 'Marks', subtitle: 'Enter marks and publish results', icon: 'create-outline', href: '/teacher/marks' },
  { title: 'My leave', subtitle: 'Balance, ask and withdraw', icon: 'airplane-outline', href: '/teacher/my-leave' },
  { title: 'My attendance', subtitle: 'Your own record', icon: 'time-outline', href: '/teacher/my-attendance' },
  { title: 'Students', subtitle: 'Look up a student', icon: 'people-outline', href: '/teacher/students' },
  { title: 'Notices', subtitle: 'Notices to your classes', icon: 'megaphone-outline', href: '/teacher/notices' },
  { title: 'Notifications', subtitle: 'Everything you have been told', icon: 'notifications-outline', href: '/teacher/notifications' },
  { title: 'Profile and settings', subtitle: 'Theme, lock, password, accounts', icon: 'person-circle-outline', href: '/teacher/profile' },
];

export default function TeacherMore() {
  return <MoreList items={ITEMS} />;
}
