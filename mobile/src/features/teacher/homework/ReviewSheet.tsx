import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, errorMessage } from '@/api';
import { invalidatePrefix } from '@/features/family-student/invalidate';
import { HomeworkFileRow } from '@/features/homework/HomeworkFileRow';
import { marksText } from '@/features/homework/homework-status';
import { formatDateTime } from '@/lib/dates';
import { MIN_TOUCH, radius, spacing, useTheme } from '@/theme';
import { Badge, Button, Icon, Text, TextField } from '@/ui';
import { FEEDBACK_MAX, reviewBody, reviewProblem, trimNumber, type ReviewAction } from './homeworkLogic';
import type { HandInEntry } from './types';

interface Props {
  visible: boolean;
  onClose: () => void;
  homeworkId: string;
  homeworkTitle: string;
  /** The task's maximum marks ("10.00"), or null when it has none. */
  maxMarks: string | null;
  entry: HandInEntry;
}

/**
 * One student's hand-in: the note and the work (photos and PDFs open through the homework), then
 * mark it (optional marks out of the maximum, and a comment) or send it back (a comment is required).
 */
export function ReviewSheet({ visible, onClose, homeworkId, homeworkTitle, maxMarks, entry }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const client = useQueryClient();
  const sub = entry.submission;
  const [marks, setMarks] = useState(sub?.marks ? trimNumber(sub.marks) : '');
  const [feedback, setFeedback] = useState(sub?.feedback ?? '');
  const [busy, setBusy] = useState<ReviewAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!sub) return null;
  const marked = sub.status === 'REVIEWED';

  const send = async (action: ReviewAction) => {
    const input = { action, marks, maxMarks, feedback };
    const problem = reviewProblem(input);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(action);
    setError(null);
    try {
      await api.put(`/homework/${homeworkId}/students/${entry.studentId}/review`, reviewBody(input));
      await invalidatePrefix(client, '/homework');
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const close = () => {
    if (busy) return;
    onClose();
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
            <View style={styles.titles}>
              <Text variant="heading" numberOfLines={1}>
                {entry.name}
              </Text>
              <Text variant="small" tone="muted" numberOfLines={1}>
                {homeworkTitle}
              </Text>
            </View>
            <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" style={styles.close} hitSlop={6}>
              <Icon name="close" size={24} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <View style={styles.badges}>
              <Badge label={`Handed in ${formatDateTime(sub.submittedAt)}`} tone="info" />
              {sub.late ? <Badge label="Late" tone="warn" /> : null}
              {marked ? <Badge label={`Marked ${marksText(sub.marks, maxMarks) ?? ''}`.trim()} tone="good" /> : null}
              {sub.status === 'REDO' ? <Badge label="Sent back" tone="warn" /> : null}
            </View>

            {sub.note ? (
              <View style={[styles.note, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Text variant="caption" tone="muted">
                  Note from {entry.name.split(' ')[0]}
                </Text>
                <Text variant="small" selectable>
                  {sub.note}
                </Text>
              </View>
            ) : null}

            {sub.files.length > 0 ? (
              <View style={styles.files}>
                <Text variant="smallStrong">Work handed in</Text>
                {sub.files.map((f) => (
                  <HomeworkFileRow key={f.id} homeworkId={homeworkId} file={f} />
                ))}
              </View>
            ) : (
              <Text variant="small" tone="muted">
                No files, only a note.
              </Text>
            )}

            {sub.status === 'REDO' ? (
              <Text variant="small" tone="muted">
                You sent this back. It comes back here when the student hands in again.
              </Text>
            ) : (
              <>
                {maxMarks !== null ? (
                  <TextField
                    label={`Marks out of ${trimNumber(maxMarks)} (optional)`}
                    value={marks}
                    onChangeText={setMarks}
                    keyboardType="decimal-pad"
                    maxLength={7}
                    testID="review-marks"
                  />
                ) : null}
                <TextField
                  label="Comment (required to send back)"
                  value={feedback}
                  onChangeText={setFeedback}
                  multiline
                  maxLength={FEEDBACK_MAX}
                  autoCapitalize="sentences"
                  autoCorrect
                  testID="review-feedback"
                />
                {error ? (
                  <Text variant="small" tone="bad" accessibilityLiveRegion="polite">
                    {error}
                  </Text>
                ) : null}
                <Button
                  title={marked ? 'Save changes' : 'Mark as done'}
                  icon="checkmark"
                  loading={busy === 'REVIEWED'}
                  disabled={busy !== null}
                  onPress={() => void send('REVIEWED')}
                  testID="review-mark"
                />
                <Button
                  title="Send back to redo"
                  icon="arrow-undo"
                  variant="secondary"
                  loading={busy === 'REDO'}
                  disabled={busy !== null}
                  onPress={() => void send('REDO')}
                  testID="review-redo"
                />
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '92%',
    borderTopLeftRadius: radius.xl + 4,
    borderTopRightRadius: radius.xl + 4,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: MIN_TOUCH },
  titles: { flex: 1 },
  close: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center', marginRight: -spacing.sm },
  body: { gap: spacing.md, paddingBottom: spacing.sm },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  note: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1, gap: 2 },
  files: { gap: spacing.sm },
});
