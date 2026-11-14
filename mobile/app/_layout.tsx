import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { queryClient } from '@/api/queryClient';
import { AuthProvider, useAuth } from '@/auth';
import { fontAssets, ThemeProvider, useTheme } from '@/theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/**
 * Which screens exist depends on who is signed in. A screen whose `guard` is false is not
 * reachable at all (not even by a link), and when the guard turns false the person is moved off it:
 * signing out lands on sign-in, a role change lands on the right tabs.
 */
function RootNavigator() {
  const theme = useTheme();
  const { status, active, checking, locked, mustChangePassword } = useAuth();

  const ready = status === 'ready' && !checking;
  const open = ready && !locked && !mustChangePassword;

  useEffect(() => {
    if (status !== 'loading' && !checking) void SplashScreen.hideAsync();
  }, [status, checking]);

  if (status === 'loading' || (status === 'ready' && checking)) return null;

  return (
    <>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.background } }}>
        <Stack.Screen name="index" />
        <Stack.Protected guard={status === 'signedOut'}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={ready && locked}>
          <Stack.Screen name="locked" />
        </Stack.Protected>
        <Stack.Protected guard={ready && !locked && mustChangePassword}>
          <Stack.Screen name="change-password" />
        </Stack.Protected>
        <Stack.Protected guard={open && active?.kind === 'family'}>
          <Stack.Screen name="family" />
        </Stack.Protected>
        <Stack.Protected guard={open && active?.kind === 'teacher'}>
          <Stack.Screen name="teacher" />
        </Stack.Protected>
        <Stack.Protected guard={open && active?.kind === 'other'}>
          <Stack.Screen name="unsupported" />
        </Stack.Protected>
        <Stack.Protected guard={open}>
          <Stack.Screen name="add-account" options={{ presentation: 'modal' }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}
