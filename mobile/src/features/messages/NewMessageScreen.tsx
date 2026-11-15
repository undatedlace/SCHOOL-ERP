import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { api } from '@/api';
import { errorMessage } from '@/api/errors';
import { useApiQuery } from '@/api/hooks';
import { MIN_TOUCH, spacing, useTheme } from '@/theme';
import { Avatar, Button, Card, EmptyState, ErrorState, Icon, Screen, SectionHeader, Skeleton, Text, TextField } from '@/ui';
import { MultilineField } from './MultilineField';
import { AttachButton, AttachSheet, AttachmentTray } from './AttachmentTray';
import { teacherLine } from './format';
import { useRefreshMessages } from './hooks';
import { MAX_BODY, MAX_FILES, MAX_SUBJECT, type FamilyContact, type FamilyContacts, type SendResult } from './types';
import { useAttachments } from '@/features/files/useAttachments';

/** Pick a teacher, write a subject and a first message, attach papers or photos, send. */
export function NewMessageScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const refresh = useRefreshMessages();
  const contacts = useApiQuery<FamilyContacts>('/messages/contacts', { query: { as: 'family', pageSize: 50 } });
  const attachments = useAttachments('message-attachment', MAX_FILES);

  const [picked, setPicked] = useState<FamilyContact | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sheet, setSheet] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [triedSend, setTriedSend] = useState(false);

  const items = contacts.data?.items ?? [];
  // A family with one student has one student in the list; with a teacher chosen the student is known.
  const selected = picked ?? (items.length === 1 ? items[0]! : null);

  const subjectError = triedSend && !subject.trim() ? 'Write what this is about.' : null;
  const bodyError = triedSend && !body.trim() ? 'Write your message.' : null;
  const teacherError = triedSend && !selected ? 'Choose a teacher.' : null;

  const send = async () => {
    setTriedSend(true);
    setError(null);
    if (!selected || !subject.trim() || !body.trim() || attachments.uploading) return;
    setSending(true);
    try {
      const result = await api.post<SendResult>('/messages', {
        studentId: selected.studentId,
        teacherUserId: selected.teacherUserId,
        subject: subject.trim(),
        body: body.trim(),
        ...(attachments.fileIds.length ? { fileIds: attachments.fileIds } : {}),
      });
      await refresh();
      router.replace(`/family/messages/${result.conversation.id}${result.deliveredQuietly ? '?quiet=1' : ''}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen keyboard>
      <Text variant="small" tone="muted">
        Messages go to one teacher about one subject. Start a new message for a different subject.
      </Text>

      <SectionHeader title="Who do you want to write to?" />
      {contacts.isLoading ? (
        <Card style={styles.gap}>
          <Skeleton height={52} />
          <Skeleton height={52} />
        </Card>
      ) : contacts.error ? (
        <ErrorState message={errorMessage(contacts.error)} onRetry={() => void contacts.refetch()} retrying={contacts.isFetching} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="No teachers to write to"
          description="Teachers appear here once the school has set up your class and its teachers."
        />
      ) : (
        <Card padding={0} style={styles.list}>
          {items.map((c, i) => {
            const isSelected = selected?.teacherUserId === c.teacherUserId && selected.studentId === c.studentId;
            return (
              <Pressable
                key={`${c.studentId}-${c.teacherUserId}`}
                onPress={() => setPicked(c)}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${c.teacherName}, ${teacherLine(c)}`}
                testID={`contact-${c.teacherUserId}`}
                style={({ pressed }) => [
                  styles.contact,
                  i < items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                  (pressed || isSelected) && { backgroundColor: colors.primarySoft },
                ]}
              >
                <Avatar name={c.teacherName} size={44} />
                <View style={styles.contactText}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {c.teacherName}
                  </Text>
                  <Text variant="small" tone="muted" numberOfLines={2}>
                    {teacherLine(c)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.radio,
                    { borderColor: isSelected ? colors.primary : colors.borderStrong, backgroundColor: isSelected ? colors.primary : 'transparent' },
                  ]}
                >
                  {isSelected ? <Icon name="checkmark" size={14} color={colors.primaryForeground} /> : null}
                </View>
              </Pressable>
            );
          })}
        </Card>
      )}
      {teacherError ? (
        <Text variant="small" tone="bad" accessibilityLiveRegion="polite">
          {teacherError}
        </Text>
      ) : null}

      <TextField
        label="Subject"
        value={subject}
        onChangeText={setSubject}
        maxLength={MAX_SUBJECT}
        autoCapitalize="sentences"
        autoCorrect
        placeholder="For example: Question about homework"
        returnKeyType="next"
        error={subjectError}
        testID="new-subject"
      />
      <MultilineField
        label="Message"
        value={body}
        onChangeText={setBody}
        maxLength={MAX_BODY}
        autoCapitalize="sentences"
        autoCorrect
        placeholder="Write your message"
        error={bodyError}
        hint={`${body.length} of ${MAX_BODY} characters`}
        minHeight={140}
        testID="new-body"
      />

      <View style={styles.attachRow}>
        <AttachButton onPress={() => setSheet(true)} disabled={sending} />
        <Text variant="small" tone="muted" style={styles.attachHint}>
          Add a photo or PDF (up to 3)
        </Text>
      </View>
      <AttachmentTray items={attachments.items} onRemove={attachments.remove} />
      {attachments.notice ? (
        <Text variant="small" tone="bad" accessibilityLiveRegion="polite">
          {attachments.notice}
        </Text>
      ) : null}
      {attachments.hasFailed ? (
        <Text variant="small" tone="bad">
          A file could not be uploaded. Remove it and try again.
        </Text>
      ) : null}

      <Text variant="caption" tone="muted">
        The school can read messages for safety.
      </Text>
      {error ? (
        <Text variant="small" tone="bad" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Button
        title={attachments.uploading ? 'Uploading files...' : 'Send message'}
        icon="send"
        loading={sending}
        disabled={attachments.uploading || attachments.hasFailed}
        onPress={() => void send()}
        testID="send-new"
      />
      <AttachSheet visible={sheet} onClose={() => setSheet(false)} onPick={(s) => void attachments.add(s)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.md },
  list: { overflow: 'hidden' },
  contact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 64,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  contactText: { flex: 1, gap: 1 },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: MIN_TOUCH },
  attachHint: { flex: 1 },
});
