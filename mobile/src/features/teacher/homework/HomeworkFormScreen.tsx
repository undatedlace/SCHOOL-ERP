import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { api, errorMessage, useApiQuery } from '@/api';
import { DateField } from '@/features/absence/DateField';
import { invalidatePrefix } from '@/features/family-student/invalidate';
import { FilterChips } from '@/features/family-student/FilterChips';
import { AttachmentPicker } from '@/features/files/AttachmentPicker';
import { useAttachments } from '@/features/files/useAttachments';
import { MultilineField } from '@/features/messages/MultilineField';
import { sizeText } from '@/features/homework/HomeworkFileRow';
import { addDays, todayIST } from '@/lib/dates';
import { MIN_TOUCH, radius, spacing, useTheme } from '@/theme';
import { Button, Card, ErrorState, Icon, Screen, Skeleton, Text, TextField } from '@/ui';
import { AudiencePicker } from './AudiencePicker';
import {
  ATTACHMENT_PURPOSE,
  INSTRUCTIONS_MAX,
  MAX_FILES,
  TITLE_MAX,
  createBody,
  draftFrom,
  emptyDraft,
  hasErrors,
  updateBody,
  validateDraft,
  type Draft,
  type DraftErrors,
} from './homeworkLogic';
import type { TeacherHomework } from './types';

interface Subject {
  id: string;
  name: string;
}

/** Set new homework, or change one (when `editId` is given). */
export function HomeworkFormScreen({ editId }: { editId?: string }) {
  const editing = Boolean(editId);
  const existing = useApiQuery<TeacherHomework>(`/homework/${editId ?? 'none'}`, { enabled: editing });
  if (editing && existing.isLoading) {
    return (
      <Screen>
        <Skeleton height={48} />
        <Skeleton height={140} rounded={22} />
      </Screen>
    );
  }
  if (editing && (existing.isError || !existing.data)) {
    return (
      <Screen>
        <ErrorState message={existing.error?.message} onRetry={() => void existing.refetch()} retrying={existing.isRefetching} />
      </Screen>
    );
  }
  return <HomeworkForm homework={existing.data ?? null} />;
}

function HomeworkForm({ homework }: { homework: TeacherHomework | null }) {
  const router = useRouter();
  const client = useQueryClient();
  const { colors } = useTheme();
  const editing = homework !== null;
  const today = todayIST();

  const [draft, setDraft] = useState<Draft>(() => (homework ? draftFrom(homework) : emptyDraft()));
  const [names, setNames] = useState<Record<string, string>>({});
  const [kept, setKept] = useState(() => homework?.attachments ?? []);
  const attachments = useAttachments(ATTACHMENT_PURPOSE, Math.max(0, MAX_FILES - kept.length));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const subjects = useApiQuery<Subject[]>('/subjects', { staleTime: 10 * 60_000 });

  const patch = (change: Partial<Draft>) => setDraft((d) => ({ ...d, ...change }));
  // After a first try, the messages follow what is typed.
  useEffect(() => {
    if (tried) setErrors(validateDraft(draft, today, editing));
  }, [draft, tried, today, editing]);

  const save = async () => {
    setTried(true);
    setFailure(null);
    const found = validateDraft(draft, today, editing);
    setErrors(found);
    if (hasErrors(found) || attachments.uploading || attachments.hasFailed) return;
    setSaving(true);
    try {
      const fileIds = [...kept.map((f) => f.id), ...attachments.fileIds];
      if (homework) {
        await api.patch(`/homework/${homework.id}`, updateBody(draft, fileIds));
        await invalidatePrefix(client, '/homework');
        router.back();
      } else {
        const created = await api.post<TeacherHomework>('/homework', createBody(draft, fileIds));
        await invalidatePrefix(client, '/homework');
        router.replace(`/teacher/homework/${created.id}`);
      }
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const subjectChips = [{ value: 'none', label: 'No subject' }, ...(subjects.data ?? []).map((s) => ({ value: s.id, label: s.name }))];

  return (
    <Screen keyboard>
      <TextField
        label="Title"
        value={draft.title}
        onChangeText={(title) => patch({ title })}
        maxLength={TITLE_MAX}
        autoCapitalize="sentences"
        autoCorrect
        placeholder="For example: Draw and colour a tree"
        error={errors.title}
        testID="homework-title"
      />
      <MultilineField
        label="Instructions"
        value={draft.instructions}
        onChangeText={(instructions) => patch({ instructions })}
        maxLength={INSTRUCTIONS_MAX}
        autoCapitalize="sentences"
        autoCorrect
        placeholder="What should the students do?"
        error={errors.instructions}
        hint={`${draft.instructions.length} of ${INSTRUCTIONS_MAX} characters`}
        minHeight={130}
        testID="homework-instructions"
      />

      <View style={styles.block}>
        <Text variant="smallStrong">Subject (optional)</Text>
        {subjects.isLoading ? (
          <Skeleton height={36} />
        ) : (
          <FilterChips
            accessibilityLabel="Subject"
            chips={subjectChips}
            value={draft.subjectId ?? 'none'}
            onChange={(v) => patch({ subjectId: v === 'none' ? null : v })}
          />
        )}
      </View>

      <View style={styles.block}>
        <DateField
          label="Last day to hand in (optional)"
          value={draft.dueOn}
          onChange={(dueOn) => patch({ dueOn })}
          min={editing ? addDays(today, -365) : today}
          max={addDays(today, 365)}
          placeholder="No due day"
          error={errors.dueOn}
          footnote="Choose the last day. Students can still hand in late."
          testID="homework-due"
        />
        {draft.dueOn ? (
          <Button
            title="Clear the day"
            variant="ghost"
            size="sm"
            fullWidth={false}
            onPress={() => patch({ dueOn: null })}
            testID="clear-due"
          />
        ) : null}
      </View>

      <Card style={styles.switchCard}>
        <View style={styles.switchRow}>
          <View style={styles.flex}>
            <Text variant="bodyStrong">Students hand work in through the app</Text>
            <Text variant="small" tone="muted">
              They send a note and photos or PDFs. You mark them or send them back.
            </Text>
          </View>
          <Switch
            value={draft.handIn}
            onValueChange={(handIn) => patch({ handIn })}
            trackColor={{ true: colors.primary, false: colors.borderStrong }}
            accessibilityLabel="Students hand work in through the app"
            testID="hand-in-switch"
          />
        </View>
        {draft.handIn ? (
          <TextField
            label="Marks out of (optional)"
            value={draft.maxMarks}
            onChangeText={(maxMarks) => patch({ maxMarks })}
            keyboardType="decimal-pad"
            maxLength={7}
            placeholder="For example: 10"
            error={errors.maxMarks}
            testID="homework-max-marks"
          />
        ) : errors.maxMarks ? (
          <Text variant="small" tone="bad">
            {errors.maxMarks}
          </Text>
        ) : null}
      </Card>

      {editing ? (
        <Card style={styles.switchCard}>
          <Text variant="smallStrong">Who it is for</Text>
          <Text variant="small" tone="muted">
            Who it was sent to cannot be changed. Remove it and set it again if that is wrong.
          </Text>
        </Card>
      ) : (
        <AudiencePicker
          divisionIds={draft.divisionIds}
          studentIds={draft.studentIds}
          studentNames={names}
          onDivisions={(divisionIds) => patch({ divisionIds })}
          onStudents={(studentIds, studentNames) => {
            setNames(studentNames);
            patch({ studentIds });
          }}
          error={errors.audience}
        />
      )}

      <View style={styles.block}>
        <Text variant="smallStrong">Worksheets or pictures (optional)</Text>
        {kept.map((f) => (
          <View key={f.id} style={[styles.keptRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Icon name={f.mimeType.startsWith('image/') ? 'image-outline' : 'document-text-outline'} size={20} color={colors.primary} />
            <View style={styles.flex}>
              <Text variant="smallStrong" numberOfLines={1}>
                {f.name}
              </Text>
              <Text variant="caption" tone="muted">
                {sizeText(f.sizeBytes)}
              </Text>
            </View>
            <Pressable
              onPress={() => setKept((all) => all.filter((x) => x.id !== f.id))}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${f.name}`}
              style={styles.removeFile}
              hitSlop={6}
            >
              <Icon name="close-circle" size={22} color={colors.mutedForeground} />
            </Pressable>
          </View>
        ))}
        <AttachmentPicker attachments={attachments} max={Math.max(0, MAX_FILES - kept.length)} />
      </View>

      {failure ? (
        <Text variant="small" tone="bad" accessibilityLiveRegion="polite">
          {failure}
        </Text>
      ) : null}
      <Button
        title={attachments.uploading ? 'Uploading files...' : editing ? 'Save changes' : 'Send homework'}
        icon={editing ? 'checkmark' : 'send'}
        loading={saving}
        disabled={attachments.uploading || attachments.hasFailed}
        onPress={() => void save()}
        testID="save-homework"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  block: { gap: spacing.sm },
  switchCard: { gap: spacing.md },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  keptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: MIN_TOUCH + 8,
    padding: spacing.sm,
    paddingLeft: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  removeFile: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
});
