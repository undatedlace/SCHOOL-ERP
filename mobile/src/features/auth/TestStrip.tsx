import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { spacing, useTheme } from '@/theme';
import { Text } from '@/ui';
import { useAppInfo } from './useAppInfo';

/**
 * A thin amber strip on a test copy (PPE): says it is a test with sample data, and links to the
 * feedback form. Nothing shows in production, where the server sends no label.
 */
export function TestStrip() {
  const { colors } = useTheme();
  const { data } = useAppInfo();
  if (!data?.environmentLabel) return null;
  const url = data.feedbackUrl;
  return (
    <View style={[styles.strip, { backgroundColor: colors.amberSoft }]} accessibilityRole="alert">
      <Text variant="caption" style={{ color: colors.amberInk }} numberOfLines={2}>
        {data.environmentLabel}. Sample data only.
      </Text>
      {url ? (
        <Pressable
          onPress={() => void Linking.openURL(url)}
          accessibilityRole="link"
          accessibilityLabel="Send feedback"
          hitSlop={8}
        >
          <Text variant="caption" style={{ color: colors.amberInk, textDecorationLine: 'underline' }}>
            Send feedback
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: 6,
    paddingHorizontal: spacing.lg,
  },
});
