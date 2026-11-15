import { Stack } from 'expo-router';
import { fontFamily, useTheme } from '@/theme';

/**
 * Family routes (student and parent accounts). `(tabs)` holds the five bottom tabs; every other
 * file in this folder is a screen pushed on top of them with a back button. To add a screen,
 * drop a file here (see mobile/README.md); give it a title below if you want one.
 */
const TITLES: Record<string, string> = {
  fees: 'Fees',
  results: 'Results',
  attendance: 'Attendance',
  notices: 'Notices',
  'notices/[id]': 'Notice',
  'homework/[id]': 'Homework',
  calendar: 'Calendar',
  'report-absence': 'Report absence',
  notifications: 'Notifications',
  profile: 'Profile and settings',
};

export default function FamilyLayout() {
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
