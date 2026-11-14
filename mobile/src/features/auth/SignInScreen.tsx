import { View } from 'react-native';
import { spacing } from '@/theme';
import { Screen } from '@/ui';
import { AuthHero } from './AuthHero';
import { SignInForm } from './SignInForm';

/** The sign-in page. Also used, in a sheet-like modal, to add another account. */
export function SignInScreen({ adding = false }: { adding?: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <AuthHero
        title={adding ? 'Add an account' : 'School ERP'}
        subtitle={
          adding
            ? 'Sign in with another student ID. You can switch between accounts with one tap.'
            : 'Sign in with the student ID and password the school gave you.'
        }
      />
      <Screen keyboard safeBottom padding={spacing.xl} contentStyle={{ paddingTop: spacing.xl }}>
        <SignInForm />
      </Screen>
    </View>
  );
}
