import { StyleSheet, View } from 'react-native';
import { radius, spacing, useTheme } from '@/theme';
import { Text } from '@/ui';
import { AttachmentItem } from './AttachmentViews';
import { clockOf } from './format';
import type { Message } from './types';

/** One message: mine on the right in the primary colour, theirs on the left on a card. */
export function MessageBubble({ message, conversationId }: { message: Message; conversationId: string }) {
  const { colors } = useTheme();
  const mine = message.senderIsMe;
  return (
    <View
      style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}
      accessible={false}
      testID={`message-${message.id}`}
    >
      <View
        style={[
          styles.bubble,
          mine
            ? { backgroundColor: colors.primary, borderBottomRightRadius: radius.sm }
            : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderBottomLeftRadius: radius.sm },
        ]}
      >
        <Text
          variant="body"
          selectable
          accessibilityLabel={`${mine ? 'You' : message.sender.name}: ${message.body}`}
          style={{ color: mine ? colors.primaryForeground : colors.foreground }}
        >
          {message.body}
        </Text>
        {message.files.length > 0 ? (
          <View style={styles.files}>
            {message.files.map((f) => (
              <AttachmentItem key={f.id} conversationId={conversationId} file={f} mine={mine} />
            ))}
          </View>
        ) : null}
      </View>
      <Text variant="caption" tone="muted" style={styles.time}>
        {clockOf(message.createdAt)}
        {mine ? ' · You' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { maxWidth: '84%', gap: 2 },
  rowMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  rowTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  files: { gap: spacing.sm },
  time: { paddingHorizontal: spacing.xs },
});
