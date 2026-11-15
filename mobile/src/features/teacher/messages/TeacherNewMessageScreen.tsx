import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { api, errorMessage, useApiQuery } from '@/api';
import { FilterChips } from '@/features/family-student/FilterChips';
import { useAttachments } from '@/features/files/useAttachments';
import { AttachButton, AttachSheet, AttachmentTray } from '@/features/messages/AttachmentTray';
import { useRefreshMessages } from '@/features/messages/hooks';
import { MultilineField } from '@/features/messages/MultilineField';
import { SearchBox, useDebounced } from '@/features/messages/SearchBox';
import { MAX_BODY, MAX_FILES, MAX_SUBJECT, type SendResult } from '@/features/messages/types';
import { MIN_TOUCH, spacing, useTheme } from '@/theme';
import { Avatar, Button, Card, EmptyState, ErrorState, Icon, Screen, SectionHeader, Skeleton, Text, TextField } from '@/ui';
import { useMyDivisions } from '../attendance/useAttendanceData';
import { divisionLabel } from '../attendance/rosterLogic';
import { studentLine, type StudentContact, type StudentContacts } from './types';

/** Pick a student of a division you teach, write a subject and a first message, send. */
export function TeacherNewMessageScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const refresh = useRefreshMessages();
  const divisions = useMyDivisions();
  const attachments = useAttachments('message-attachment', MAX_FILES);

  const [search, setSearch] = useState('');
  const [divisionId, setDivisionId] = useState('all');
  const [picked, setPicked] = useState<StudentContact | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sheet, setSheet] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [triedSend, setTriedSend] = useState(false);

  const q = useDebounced(search.trim(), 300);
  const contacts = useApiQuery<StudentContacts>('/messages/contacts', {
    query: { as: 'teacher', q: q || undefined, divisionId: divisionId === 'all' ? undefined : divisionId, pageSize: 50 },
  });
  const items = contacts.data?.items ?? [];
  const total = contacts.data?.total ?? 0;

  const subjectError = triedSend && !subject.trim() ? 'Write what this is about.' : null;
  const bodyError = triedSend && !body.trim() ? 'Write your message.' : null;
  const studentError = triedSend && !picked ? 'Choose a student.' : null;

  const send = async () => {
    setTriedSend(true);
    setError(null);
    if (!picked || !subject.trim() || !body.trim() || attachments.uploading) return;
    setSending(true);
    try {
      const result = await api.post<SendResult>('/messages', {
        studentId: picked.studentId,
        subject: subject.trim(),
        body: body.trim(),
        ...(attachments.fileIds.length ? { fileIds: attachments.fileIds } : {}),
      });
      await refresh();
      router.replace(`/teacher/messages/${result.conversation.id}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const chips = [{ value: 'all', label: 'All classes' }, ...(divisions.data ?? []).map((d) => ({ value: d.id, label: divisionLabel(d) }))];

  return (
    <Screen keyboard>
      <Text variant="small" tone="muted">
        You write to the family of one student about one subject. The student's login is the family's login.
      </Text>

      <SectionHeader title="Which student is it about?" />
      <SearchBox value={search} onChangeText={setSearch} />
      {chips.length > 2 ? (
        <FilterChips accessibilityLabel="Filter by class" chips={chips} value={divisionId} onChange={setDivisionId} />
      ) : null}

      {contacts.isLoading ? (
        <Card style={styles.gap}>
          <Skeleton height={52} />
          <Skeleton height={52} />
        </Card>
      ) : contacts.isError && !contacts.data ? (
        <ErrorState message={errorMessage(contacts.error)} onRetry={() => void contacts.refetch()} retrying={contacts.isFetching} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title={q ? 'No student matches' : 'No students to write about'}
          description={q ? 'Try another name or admission number.' : 'Students appear here once you are assigned to a class this year.'}
        />
      ) : (
        <>
          <Card padding={0} style={styles.list}>
            {items.map((s, i) => {
              const selected = picked?.studentId === s.studentId;
              return (
                <Pressable
                  key={s.studentId}
                  onPress={() => setPicked(s)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${s.name}, ${studentLine(s)}`}
                  testID={`contact-${s.studentId}`}
                  style={({ pressed }) => [
                    styles.contact,
                    i < items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                    (pressed || selected) && { backgroundColor: colors.primarySoft },
                  ]}
                >
                  <Avatar name={s.name} size={44} />
                  <View style={styles.contactText}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {s.name}
                    </Text>
                    <Text variant="small" tone="muted" numberOfLines={1}>
                      {studentLine(s)}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.radio,
                      { borderColor: selected ? colors.primary : colors.borderStrong, backgroundColor: selected ? colors.primary : 'transparent' },
                    ]}
                  >
                    {selected ? <Icon name="checkmark" size={14} color={colors.primaryForeground} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </Card>
          {total > items.length ? (
            <Text variant="caption" tone="muted">
              Showing {items.length} of {total}. Search to find the others.
            </Text>
          ) : null}
        </>
      )}
      {studentError ? (
        <Text variant="small" tone="bad" accessibilityLiveRegion="polite">
          {studentError}
        </Text>
      ) : null}

      <TextField
        label="Subject"
        value={subject}
        onChangeText={setSubject}
        maxLength={MAX_SUBJECT}
        autoCapitalize="sentences"
        autoCorrect
        placeholder="For example: Homework not handed in"
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
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  attachRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: MIN_TOUCH },
  attachHint: { flex: 1 },
});
