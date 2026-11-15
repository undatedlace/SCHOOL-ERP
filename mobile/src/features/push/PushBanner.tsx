import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MIN_TOUCH, radius, spacing, useTheme } from '@/theme';
import { Icon, Text } from '@/ui';

export interface BannerContent {
  key: string;
  title: string;
  body: string;
}

const SHOW_MS = 6000;

/**
 * A small banner at the top for a push that arrives while the app is open (the system alert is
 * switched off for this case). Tap to open what it is about; it goes away by itself.
 */
export function PushBanner({
  banner,
  onOpen,
  onDismiss,
}: {
  banner: BannerContent | null;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(onDismiss, SHOW_MS);
    return () => clearTimeout(t);
  }, [banner, onDismiss]);

  if (!banner) return null;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + spacing.sm }]}>
      <View
        accessibilityLiveRegion="polite"
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.shadow }]}
      >
        <Pressable
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel={`${banner.title}. ${banner.body} Tap to open.`}
          style={styles.main}
          testID="push-banner"
        >
          <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
            <Icon name="notifications" size={20} color={colors.primary} />
          </View>
          <View style={styles.text}>
            <Text variant="smallStrong" numberOfLines={1}>
              {banner.title}
            </Text>
            <Text variant="small" tone="muted" numberOfLines={2}>
              {banner.body}
            </Text>
          </View>
        </Pressable>
        <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={8} style={styles.close}>
          <Icon name="close" size={20} color={colors.mutedForeground} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, zIndex: 50 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, minHeight: MIN_TOUCH + 12 },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
  close: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
});
