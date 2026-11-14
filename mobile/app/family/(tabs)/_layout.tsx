import { Tabs } from 'expo-router/js-tabs';
import { tabScreenOptions, type TabDef } from '@/features/shell/tabOptions';
import { useTheme } from '@/theme';

/** The five family tabs. The key is the file name in this folder. */
const TABS: Record<string, TabDef> = {
  index: { title: 'Home', icon: 'home-outline', iconFocused: 'home' },
  homework: { title: 'Homework', icon: 'book-outline', iconFocused: 'book' },
  messages: { title: 'Messages', icon: 'chatbubbles-outline', iconFocused: 'chatbubbles' },
  timetable: { title: 'Timetable', icon: 'calendar-outline', iconFocused: 'calendar' },
  more: { title: 'More', icon: 'grid-outline', iconFocused: 'grid' },
};

export default function FamilyTabs() {
  const theme = useTheme();
  return (
    <Tabs screenOptions={({ route }) => tabScreenOptions(route.name, TABS, 'family', theme)}>
      {/* Listed in the order the tabs appear. Files not listed here still become tabs, after these. */}
      <Tabs.Screen name="index" />
      <Tabs.Screen name="homework" />
      <Tabs.Screen name="messages" />
      <Tabs.Screen name="timetable" />
      <Tabs.Screen name="more" />
    </Tabs>
  );
}
