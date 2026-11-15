import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAuth } from '@/auth';
import { MIN_TOUCH, radius, spacing, useTheme } from '@/theme';
import { Button, Icon, Sheet, Text } from '@/ui';
import { AccountAvatar } from './AccountAvatar';

interface AccountSheetProps {
  visible: boolean;
  onClose: () => void;
}

/** The saved accounts on this phone. One tap switches; "Add another account" signs in a sibling. */
export function AccountSheet({ visible, onClose }: AccountSheetProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const { accounts, active, switchAccount } = useAuth();

  return (
    <Sheet visible={visible} onClose={onClose} title="Accounts on this phone">
      {accounts.map((account) => {
        const isActive = account.id === active?.id;
        return (
          <Pressable
            key={account.id}
            onPress={() => {
              onClose();
              void switchAccount(account.id);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`${account.fullName}, ${account.roleLabel}${isActive ? ', signed in now' : ''}`}
            style={[
              styles.row,
              { backgroundColor: isActive ? colors.primarySoft : colors.muted, borderColor: isActive ? colors.primary : 'transparent' },
            ]}
          >
            <AccountAvatar account={account} size={44} isActive={isActive} />
            <View style={styles.text}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {account.fullName}
              </Text>
              <Text variant="small" tone="muted" numberOfLines={1}>
                {[account.roleLabel, account.subtitle].filter(Boolean).join(' · ')}
              </Text>
            </View>
            {isActive ? <Icon name="checkmark-circle" size={24} color={colors.primary} /> : null}
          </Pressable>
        );
      })}
      <Button
        title="Add another account"
        icon="person-add-outline"
        variant="ghost"
        onPress={() => {
          onClose();
          router.push('/add-account');
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: MIN_TOUCH + 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1.5,
  },
  text: { flex: 1 },
});
