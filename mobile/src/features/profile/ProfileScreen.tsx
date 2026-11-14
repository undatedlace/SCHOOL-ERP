import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Switch, View } from 'react-native';
import { getApiBaseUrl } from '@/api/config';
import { useAuth } from '@/auth';
import { ChangePasswordForm } from '@/features/auth/ChangePasswordForm';
import { useAppInfo } from '@/features/auth/useAppInfo';
import { AccountAvatar } from '@/features/shell/AccountAvatar';
import { confirmSignOut } from '@/features/shell/MoreList';
import { spacing, useTheme, useThemePreference, type ThemePreference } from '@/theme';
import { Badge, Button, Card, ListRow, Screen, SectionHeader, SegmentedControl, Sheet, Text } from '@/ui';

const THEME_OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

/** Profile and settings. The same screen for family and teacher accounts. */
export function ProfileScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { active, accounts, switchAccount, signOut, biometricEnabled, setBiometric } = useAuth();
  const { preference, setPreference } = useThemePreference();
  const { data: info } = useAppInfo();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);

  if (!active) return null;
  const version = Constants.expoConfig?.version ?? '0.0.0';

  const toggleLock = async (on: boolean) => {
    setLockBusy(true);
    try {
      const result = await setBiometric(on);
      if (result === 'no_hardware') {
        Alert.alert('Not available', 'This phone cannot check a face or fingerprint.');
      } else if (result === 'not_enrolled') {
        Alert.alert('Set up a screen lock first', 'Add a face, fingerprint or passcode in your phone settings, then try again.');
      }
    } finally {
      setLockBusy(false);
    }
  };

  return (
    <Screen>
      <Card style={styles.who}>
        <AccountAvatar account={active} size={72} />
        <Text variant="title" align="center">
          {active.fullName}
        </Text>
        <View style={styles.badges}>
          <Badge label={active.roleLabel} tone="primary" />
          {active.subtitle ? <Badge label={active.subtitle} tone="neutral" /> : null}
        </View>
      </Card>

      <SectionHeader title="Appearance" />
      <Card style={{ gap: spacing.md }}>
        <SegmentedControl
          accessibilityLabel="Theme"
          options={THEME_OPTIONS}
          value={preference}
          onChange={(v) => setPreference(v as ThemePreference)}
        />
        <Text variant="small" tone="muted">
          System follows your phone's light or dark setting.
        </Text>
      </Card>

      <SectionHeader title="Security" />
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <ListRow
          title="Lock the app"
          subtitle="Ask for your face, fingerprint or passcode when the app opens"
          icon="finger-print-outline"
          chevron={false}
          showDivider
          trailing={
            <Switch
              value={biometricEnabled}
              disabled={lockBusy}
              onValueChange={(on) => void toggleLock(on)}
              trackColor={{ true: colors.primary, false: colors.borderStrong }}
              accessibilityLabel="Lock the app"
            />
          }
        />
        <ListRow title="Change password" icon="key-outline" onPress={() => setPasswordOpen(true)} />
      </Card>

      <SectionHeader title="Accounts on this phone" />
      <Card padding={0} style={{ overflow: 'hidden' }}>
        {accounts.map((account) => {
          const isActive = account.id === active.id;
          return (
            <ListRow
              key={account.id}
              title={account.fullName}
              subtitle={[account.roleLabel, account.subtitle].filter(Boolean).join(' · ')}
              leading={<AccountAvatar account={account} size={40} isActive={isActive} />}
              chevron={false}
              showDivider
              trailing={isActive ? <Badge label="Signed in" tone="good" /> : undefined}
              onPress={isActive ? undefined : () => void switchAccount(account.id)}
            />
          );
        })}
        <ListRow title="Add another account" icon="person-add-outline" onPress={() => router.push('/add-account')} />
      </Card>

      <SectionHeader title="About" />
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <ListRow title="App version" icon="information-circle-outline" chevron={false} trailing={version} showDivider />
        <ListRow
          title="Server"
          icon="server-outline"
          chevron={false}
          trailing={
            info?.environmentLabel ? <Badge label={info.environmentLabel} tone="amber" /> : hostOf(getApiBaseUrl())
          }
        />
      </Card>

      <Button
        title="Sign out"
        variant="danger"
        icon="log-out-outline"
        onPress={() => confirmSignOut(active.fullName, () => signOut())}
      />

      <Sheet visible={passwordOpen} onClose={() => setPasswordOpen(false)} title="Change password">
        <ChangePasswordForm onDone={() => {
          setPasswordOpen(false);
          Alert.alert('Password changed', 'Use the new password the next time you sign in.');
        }} />
      </Sheet>
    </Screen>
  );
}

function hostOf(url: string): string {
  const m = /^https?:\/\/([^/]+)/.exec(url);
  return m?.[1] ?? '–';
}

const styles = StyleSheet.create({
  who: { alignItems: 'center', gap: spacing.sm },
  badges: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
});
