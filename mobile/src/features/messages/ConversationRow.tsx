import { Pressable, StyleSheet, View } from 'react-native';
import { radius, spacing, useTheme } from '@/theme';
import { Avatar, Icon, Text } from '@/ui';
import { inboxTimeLabel, previewLine, readOnlyTag, teacherLine } from './format';
import type { Conversation } from './types';

interface Props {
  conversation: Conversation;
  onPress: () => void;
  showDivider?: boolean;
}

/** One conversation in the inbox: avatar, teacher, subject, last line, time and unread count. */
export function ConversationRow({ conversation: c, onPress, showDivider = false }: Props) {
  const { colors } = useTheme();
  const unread = c.unreadCount > 0;
  const tag = readOnlyTag(c);
  const preview = previewLine(c);
  const time = inboxTimeLabel(c.lastMessageAt);

  const label = [
    c.teacher.name,
    c.subject,
    unread ? `${c.unreadCount} unread` : null,
    tag,
    preview,
    time,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={`conversation-${c.id}`}
      style={({ pressed }) => [
        styles.row,
        showDivider && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
        pressed && { backgroundColor: colors.accent },
      ]}
    >
      <Avatar name={c.teacher.name} size={48} />
      <View style={styles.body}>
        <View style={styles.top}>
          <Text variant={unread ? 'bodyStrong' : 'body'} numberOfLines={1} style={styles.name}>
            {c.teacher.name}
          </Text>
          <Text variant="caption" tone={unread ? 'primary' : 'muted'}>
            {time}
          </Text>
        </View>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {teacherLine(c.teacher)}
        </Text>
        <Text variant={unread ? 'smallStrong' : 'small'} tone="strong" numberOfLines={1}>
          {c.subject}
        </Text>
        <View style={styles.bottom}>
          <Text variant="small" tone="muted" numberOfLines={1} style={styles.preview}>
            {preview}
          </Text>
          {tag ? (
            <View style={[styles.tag, { backgroundColor: colors.accent }]}>
              <Icon name="lock-closed" size={11} color={colors.mutedForeground} />
              <Text variant="caption" tone="muted">
                {tag}
              </Text>
            </View>
          ) : null}
          {unread ? (
            <View style={[styles.count, { backgroundColor: colors.primary }]}>
              <Text variant="caption" maxFontSizeMultiplier={1.1} style={[styles.countText, { color: colors.primaryForeground }]}>
                {c.unreadCount > 99 ? '99+' : String(c.unreadCount)}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 76,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  body: { flex: 1, gap: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flex: 1 },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 1 },
  preview: { flex: 1 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  count: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
    minHeight: 0,
  },
  countText: { fontSize: 12, lineHeight: 16, fontFamily: 'Figtree_700Bold' },
});

