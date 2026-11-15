import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing } from '@/theme';
import { Icon, Text } from '@/ui';
import { TestStrip } from './TestStrip';

/** The deep teal block at the top of the sign-in screens (same teal in light and dark). */
export function AuthHero({ title, subtitle }: { title: string; subtitle: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View>
      {/* The hero is dark teal in both themes, so the clock and battery must be light. */}
      <StatusBar style="light" />
      <View style={{ paddingTop: insets.top, backgroundColor: '#0d4245' }}>
        <TestStrip />
      </View>
      <View style={styles.hero}>
        <View style={styles.logo}>
          <Icon name="school" size={30} color="#0d4245" />
        </View>
        <Text variant="display" style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <Text variant="body" style={styles.subtitle}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: '#0d4245',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl,
    borderBottomLeftRadius: radius.xl + 8,
    borderBottomRightRadius: radius.xl + 8,
    gap: spacing.sm,
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: '#f4c75a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: { color: '#ffffff' },
  subtitle: { color: '#c9e3e1' },
});
