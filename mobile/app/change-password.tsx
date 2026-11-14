import { View } from 'react-native';
import { useAuth } from '@/auth';
import { AuthHero } from '@/features/auth/AuthHero';
import { ChangePasswordForm } from '@/features/auth/ChangePasswordForm';
import { spacing } from '@/theme';
import { Button, Card, Screen, Text } from '@/ui';

/**
 * Shown instead of the app while the account still has the school's temporary password.
 * The temporary password stops working 2 days after the school issues it.
 */
export default function ForcedChangePassword() {
  const { signOut, active } = useAuth();
  return (
    <View style={{ flex: 1 }}>
      <AuthHero
        title="Choose a new password"
        subtitle="The school gave you a temporary password. It stops working 2 days after it was issued, so choose your own now."
      />
      <Screen keyboard safeBottom padding={spacing.xl} contentStyle={{ paddingTop: spacing.xl }}>
        {active ? (
          <Text variant="small" tone="muted">
            Signed in as {active.fullName}
          </Text>
        ) : null}
        <Card>
          <ChangePasswordForm currentLabel="Temporary password" />
        </Card>
        <Button title="Sign out" variant="ghost" onPress={() => void signOut()} />
      </Screen>
    </View>
  );
}
