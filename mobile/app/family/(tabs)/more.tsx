import { MoreList, type MoreItem } from '@/features/shell/MoreList';

const ITEMS: MoreItem[] = [
  { title: 'Fees', subtitle: 'Dues, payments and receipts', icon: 'wallet-outline', href: '/family/fees' },
  { title: 'Results', subtitle: 'Published test results', icon: 'ribbon-outline', href: '/family/results' },
  { title: 'Attendance', subtitle: 'Days present and absent', icon: 'checkmark-done-outline', href: '/family/attendance' },
  { title: 'Notices', subtitle: 'From the school', icon: 'megaphone-outline', href: '/family/notices' },
  { title: 'Calendar', subtitle: 'Events, holidays and exams', icon: 'calendar-number-outline', href: '/family/calendar' },
  { title: 'Report absence', subtitle: 'Tell the class teacher', icon: 'medkit-outline', href: '/family/report-absence' },
  { title: 'Notifications', subtitle: 'Everything you have been told', icon: 'notifications-outline', href: '/family/notifications' },
  { title: 'Profile and settings', subtitle: 'Theme, lock, password, accounts', icon: 'person-circle-outline', href: '/family/profile' },
];

export default function FamilyMore() {
  return <MoreList items={ITEMS} />;
}
