import { StyleSheet, View } from 'react-native';
import { radius, spacing, useTheme } from '@/theme';
import { Button, Icon, Sheet, Text } from '@/ui';

/**
 * Shown once, before the system asks: why the app would like to send notifications. The system
 * question follows only if the person taps "Turn on".
 */
export function PrimerSheet({
  visible,
  onAccept,
  onDecline,
}: {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Sheet visible={visible} onClose={onDecline} title="Stay in the loop">
      <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
        <Icon name="notifications" size={30} color={colors.primary} />
      </View>
      <Text variant="body">
        Get a short alert when the school sends a new message, notice, homework, result or a decision on a leave request.
      </Text>
      <Text variant="small" tone="muted">
        The alert never shows names, marks or amounts, only that there is something new. You can change this any time in your phone's Settings.
      </Text>
      <Button title="Turn on notifications" icon="notifications-outline" onPress={onAccept} testID="primer-accept" />
      <Button title="Not now" variant="ghost" onPress={onDecline} testID="primer-decline" />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  icon: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    marginBottom: spacing.xs,
  },
});
