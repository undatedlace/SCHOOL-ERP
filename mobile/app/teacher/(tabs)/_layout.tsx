import { Tabs } from 'expo-router/js-tabs';
import { useMessagesUnread } from '@/features/messages/hooks';
import { tabScreenOptions, type TabDef } from '@/features/shell/tabOptions';
import { useTheme } from '@/theme';

/** The five teacher tabs. The key is the file name in this folder. */
const TABS: Record<string, TabDef> = {
  index: { title: 'Today', icon: 'today-outline', iconFocused: 'today' },
  attendance: { title: 'Attendance', icon: 'checkmark-done-outline', iconFocused: 'checkmark-done' },
  messages: { title: 'Messages', icon: 'chatbubbles-outline', iconFocused: 'chatbubbles' },
  homework: { title: 'Homework', icon: 'book-outline', iconFocused: 'book' },
  more: { title: 'More', icon: 'grid-outline', iconFocused: 'grid' },
};

export default function TeacherTabs() {
  const theme = useTheme();
  const messagesUnread = useMessagesUnread();
  return (
    <Tabs screenOptions={({ route }) => tabScreenOptions(route.name, TABS, 'teacher', theme)}>
      {/* Listed in the order the tabs appear. Files not listed here still become tabs, after these. */}
      <Tabs.Screen name="index" />
      <Tabs.Screen name="attendance" />
      <Tabs.Screen
        name="messages"
        options={{
          // Conversations with unread messages: checked every minute and when the app comes back.
          tabBarBadge: messagesUnread > 0 ? (messagesUnread > 99 ? '99+' : messagesUnread) : undefined,
          tabBarBadgeStyle: { backgroundColor: theme.colors.badFill, color: '#ffffff' },
          tabBarAccessibilityLabel: messagesUnread > 0 ? `Messages, ${messagesUnread} unread` : 'Messages',
        }}
      />
      <Tabs.Screen name="homework" />
      <Tabs.Screen name="more" />
    </Tabs>
  );
}
