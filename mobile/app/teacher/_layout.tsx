import { Stack } from 'expo-router';
import { fontFamily, useTheme } from '@/theme';

/**
 * Teacher routes (accounts that can take attendance or enter marks). `(tabs)` holds the five
 * bottom tabs; every other file in this folder is a screen pushed on top of them with a back
 * button. To add a screen, drop a file here (see mobile/README.md); give it a title below.
 */
const TITLES: Record<string, string> = {
  'attendance/[divisionId]': 'Register',
  'homework/new': 'New homework',
  'homework/[id]': 'Homework',
  'homework/edit/[id]': 'Change homework',
  'messages/new': 'New message',
  'messages/[id]': 'Conversation',
  marks: 'Marks',
  'my-leave': 'My leave',
  'my-attendance': 'My attendance',
  students: 'Students',
  notices: 'Notices',
  notifications: 'Notifications',
  profile: 'Profile and settings',
};

export default function TeacherLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={({ route }) => ({
        title: TITLES[route.name] ?? '',
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.primary,
        headerTitleStyle: { fontFamily: fontFamily.heading, color: colors.foreground },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
      })}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
