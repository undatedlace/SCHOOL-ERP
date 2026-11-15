import { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAX_FONT_SCALE, MIN_TOUCH, fontFamily, radius, spacing, useTheme } from '@/theme';
import { Icon, Text } from '@/ui';
import { AttachButton, AttachSheet, AttachmentTray } from './AttachmentTray';
import { MAX_BODY } from './types';
import type { useAttachments } from '@/features/files/useAttachments';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  attachments: ReturnType<typeof useAttachments>;
  sending: boolean;
  error: string | null;
  onSend: () => void;
}

/** The reply box: attach, write, send. Sits above the keyboard; the home indicator gap shows only when the keyboard is closed. */
export function Composer({ value, onChangeText, attachments, sending, error, onSend }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', () => setKeyboardOpen(true));
    const showDid = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardWillHide', () => setKeyboardOpen(false));
    const hideDid = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => {
      show.remove();
      showDid.remove();
      hide.remove();
      hideDid.remove();
    };
  }, []);

  const empty = value.trim().length === 0;
  const blocked = empty || sending || attachments.uploading || attachments.hasFailed;

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: (keyboardOpen ? 0 : insets.bottom) + spacing.sm },
      ]}
    >
      <AttachmentTray items={attachments.items} onRemove={attachments.remove} />
      {attachments.notice ? (
        <Text variant="caption" tone="bad" accessibilityLiveRegion="polite">
          {attachments.notice}
        </Text>
      ) : null}
      {attachments.hasFailed ? (
        <Text variant="caption" tone="bad">
          A file could not be uploaded. Remove it and try again.
        </Text>
      ) : null}
      {error ? (
        <Text variant="caption" tone="bad" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <View style={styles.row}>
        <AttachButton onPress={() => setSheet(true)} disabled={sending} />
        <View style={[styles.inputBox, { backgroundColor: colors.background, borderColor: colors.borderStrong }]}>
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder="Write a message"
            placeholderTextColor={colors.faint}
            accessibilityLabel="Write a message"
            multiline
            maxLength={MAX_BODY}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            selectionColor={colors.primary}
            autoCapitalize="sentences"
            style={[styles.input, { color: colors.foreground, fontFamily: fontFamily.body }]}
            testID="reply-input"
          />
        </View>
        <Pressable
          onPress={onSend}
          disabled={blocked}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{ disabled: blocked, busy: sending }}
          style={[styles.send, { backgroundColor: colors.primary, opacity: blocked ? 0.45 : 1 }]}
          testID="send-reply"
        >
          {sending ? <ActivityIndicator color={colors.primaryForeground} /> : <Icon name="send" size={20} color={colors.primaryForeground} />}
        </Pressable>
      </View>
      <AttachSheet visible={sheet} onClose={() => setSheet(false)} onPick={(s) => void attachments.add(s)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  inputBox: {
    flex: 1,
    minHeight: MIN_TOUCH,
    maxHeight: 130,
    borderRadius: radius.xl,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  input: { fontSize: 16, paddingTop: 8, paddingBottom: 8, maxHeight: 120 },
  send: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: MIN_TOUCH / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
