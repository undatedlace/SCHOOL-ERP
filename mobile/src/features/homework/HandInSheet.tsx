import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, errorMessage } from '@/api';
import { invalidatePrefix } from '@/features/family-student/invalidate';
import { AttachmentPicker } from '@/features/files/AttachmentPicker';
import { useAttachments } from '@/features/files/useAttachments';
import { MIN_TOUCH, radius, spacing, useTheme } from '@/theme';
import { Button, Icon, Text, TextField } from '@/ui';

export const HAND_IN_PURPOSE = 'homework-submission';
export const MAX_HAND_IN_FILES = 5;

interface HandInSheetProps {
  visible: boolean;
  onClose: () => void;
  homeworkId: string;
  studentId: string;
  title: string;
  /** True when the teacher sent it back, so the words say "again". */
  again: boolean;
}

/**
 * The hand-in form: a note and up to five photos or PDFs (camera, gallery or files). Files upload
 * as they are chosen; "Hand in" then attaches them to this homework.
 */
export function HandInSheet({ visible, onClose, homeworkId, studentId, title, again }: HandInSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const client = useQueryClient();
  const attachments = useAttachments(HAND_IN_PURPOSE, MAX_HAND_IN_FILES);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = note.trim();
  const nothingToSend = trimmed === '' && attachments.fileIds.length === 0;
  const blocked = attachments.uploading || attachments.hasFailed || nothingToSend;

  const close = () => {
    if (sending) return;
    onClose();
  };

  const submit = async () => {
    setSending(true);
    setError(null);
    try {
      await api.put(`/homework/${homeworkId}/students/${studentId}/hand-in`, {
        ...(trimmed ? { note: trimmed } : {}),
        fileIds: attachments.fileIds,
      });
      await invalidatePrefix(client, '/homework');
      attachments.reset();
      setNote('');
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View
          accessibilityViewIsModal
          style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + spacing.lg }]}
        >
          <View style={[styles.handle, { backgroundColor: colors.borderStrong }]} />
          <View style={styles.header}>
            <Text variant="heading" style={styles.title} numberOfLines={2}>
              {again ? 'Hand in again' : 'Hand in your work'}
            </Text>
            <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" style={styles.close} hitSlop={6}>
              <Icon name="close" size={24} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <Text variant="small" tone="muted" numberOfLines={2}>
              {title}
            </Text>
            <TextField
              label="Note for your teacher (optional)"
              value={note}
              onChangeText={setNote}
              multiline
              maxLength={2000}
              autoCapitalize="sentences"
              autoCorrect
              testID="hand-in-note"
            />
            <Text variant="smallStrong">Photos or PDFs of your work</Text>
            <AttachmentPicker attachments={attachments} max={MAX_HAND_IN_FILES} />
            {nothingToSend ? (
              <Text variant="small" tone="muted">
                Add a note or at least one file to hand in.
              </Text>
            ) : null}
            {error ? (
              <Text variant="small" tone="bad" accessibilityLiveRegion="polite">
                {error}
              </Text>
            ) : null}
            <Button
              title={again ? 'Hand in again' : 'Hand in'}
              icon="send"
              onPress={() => void submit()}
              loading={sending}
              disabled={blocked}
              testID="hand-in-submit"
            />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '90%',
    borderTopLeftRadius: radius.xl + 4,
    borderTopRightRadius: radius.xl + 4,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: MIN_TOUCH },
  title: { flex: 1 },
  close: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center', marginRight: -spacing.sm },
  body: { gap: spacing.md, paddingBottom: spacing.sm },
});
