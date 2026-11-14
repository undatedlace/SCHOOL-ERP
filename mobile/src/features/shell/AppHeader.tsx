import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/auth';
import { TestStrip } from '@/features/auth/TestStrip';
import { useUnreadCount } from '@/features/notifications/useUnreadCount';
import { MIN_TOUCH, radius, spacing, useTheme } from '@/theme';
import { Icon, Text } from '@/ui';
import { AccountAvatar } from './AccountAvatar';
import { AccountSheet } from './AccountSheet';

export type RoleBase = 'family' | 'teacher';

/**
 * The bar above every tab: the account pill on the left (tap to switch account) and the
 * notifications bell, with the real unread count, on the right.
 */
export function AppHeader({ base }: { base: RoleBase }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { active } = useAuth();
  const unread = useUnreadCount();
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!active) return null;
  const first = active.fullName.split(' ')[0] ?? active.fullName;

  return (
    <View style={{ backgroundColor: colors.background, paddingTop: insets.top }}>
      <TestStrip />
      <View style={styles.row}>
        <Pressable
          onPress={() => setSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`${active.fullName}. Switch account`}
          style={[styles.pill, { backgroundColor: colors.card, borderColor: colors.border }]}
          testID="account-pill"
        >
          <AccountAvatar account={active} size={32} />
          <Text variant="smallStrong" numberOfLines={1} style={styles.pillName}>
            {first}
          </Text>
          <Icon name="chevron-down" size={16} color={colors.mutedForeground} />
        </Pressable>

        <Pressable
          onPress={() => router.push(`/${base}/notifications`)}
          accessibilityRole="button"
          accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
          style={[styles.bell, { backgroundColor: colors.card, borderColor: colors.border }]}
          testID="notifications-bell"
        >
          <Icon name="notifications-outline" size={22} color={colors.foreground2} />
          {unread > 0 ? (
            <View style={[styles.count, { backgroundColor: colors.badFill }]}>
              <Text variant="caption" maxFontSizeMultiplier={1.1} style={styles.countText}>
                {unread > 99 ? '99+' : String(unread)}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>
      <AccountSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH,
    maxWidth: '70%',
    paddingLeft: spacing.sm,
    paddingRight: spacing.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillName: { flexShrink: 1 },
  bell: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: MIN_TOUCH / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  count: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { color: '#ffffff', fontSize: 11, lineHeight: 14, fontFamily: 'Figtree_700Bold' },
});
