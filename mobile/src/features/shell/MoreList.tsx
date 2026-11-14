import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { useAuth } from '@/auth';
import { Card, ListRow, Screen, Text, type IconName } from '@/ui';

export interface MoreItem {
  title: string;
  subtitle?: string;
  icon: IconName;
  href: string;
}

/** Asks "Sign out?" and, if confirmed, signs the account out (tells the server, wipes the token). */
export function confirmSignOut(name: string, signOut: () => Promise<void>) {
  Alert.alert('Sign out?', `${name} will be removed from this phone. You can sign in again any time.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
  ]);
}

/** The More tab: a list of places, then Sign out. */
export function MoreList({ items, title = 'More' }: { items: MoreItem[]; title?: string }) {
  const router = useRouter();
  const { active, signOut } = useAuth();

  return (
    <Screen>
      <Text variant="title">{title}</Text>
      <Card padding={0} style={{ overflow: 'hidden' }}>
        {items.map((item, i) => (
          <ListRow
            key={item.href}
            title={item.title}
            subtitle={item.subtitle}
            icon={item.icon}
            showDivider={i < items.length - 1}
            onPress={() => router.push(item.href)}
          />
        ))}
      </Card>
      {active ? (
        <Card padding={0} style={{ overflow: 'hidden' }}>
          <ListRow
            title="Sign out"
            subtitle={active.fullName}
            icon="log-out-outline"
            tone="danger"
            chevron={false}
            onPress={() => confirmSignOut(active.fullName, () => signOut())}
          />
        </Card>
      ) : null}
    </Screen>
  );
}
