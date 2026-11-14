import { StyleSheet, View } from 'react-native';
import { useAuth } from '@/auth';
import { spacing } from '@/theme';
import { Button, EmptyState, Screen, Text } from '@/ui';

/** Office, accounts and other staff roles work on the web for now. */
export default function Unsupported() {
  const { active, signOut } = useAuth();
  return (
    <Screen safeTop safeBottom scroll={false}>
      <View style={styles.center}>
        <EmptyState
          icon="desktop-outline"
          title="Use the web app for your role"
          description={`${active ? active.fullName + ', your' : 'Your'} role does not have a mobile screen yet. Please open the school's web app on a computer.`}
        />
        <Text variant="small" tone="muted" align="center">
          Students, parents and teachers can use this app.
        </Text>
      </View>
      <Button title="Sign out" variant="ghost" onPress={() => void signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', gap: spacing.md },
});
