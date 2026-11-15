import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '@/auth';
import { radius, spacing, useTheme } from '@/theme';
import { Button, Icon, Text } from '@/ui';

/** The app lock. Nothing about the account is shown until the phone confirms it is the owner. */
export default function Locked() {
  const { colors } = useTheme();
  const { unlock, signOut } = useAuth();
  const [failed, setFailed] = useState(false);
  const asked = useRef(false);

  const tryUnlock = async () => {
    setFailed(false);
    const ok = await unlock().catch(() => false);
    if (!ok) setFailed(true);
  };

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    void tryUnlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
        <Icon name="lock-closed" size={36} color={colors.primary} />
      </View>
      <Text variant="title" align="center">
        School ERP is locked
      </Text>
      <Text variant="body" tone="muted" align="center">
        {failed ? 'That did not work. Try again.' : 'Confirm it is you to continue.'}
      </Text>
      <View style={styles.actions}>
        <Button title="Unlock" icon="finger-print-outline" onPress={() => void tryUnlock()} testID="unlock-button" />
        <Button title="Sign out" variant="ghost" onPress={() => void signOut()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.md },
  icon: { width: 80, height: 80, borderRadius: radius.xl + 6, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  actions: { alignSelf: 'stretch', gap: spacing.md, marginTop: spacing.lg },
});
