import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { api, errorMessage, isApiError, useApiQuery } from '@/api';
import { DateField } from '@/features/absence/DateField';
import { FilterChips } from '@/features/family-student/FilterChips';
import { invalidatePrefix } from '@/features/family-student/invalidate';
import { MultilineField } from '@/features/messages/MultilineField';
import { addDays, todayIST } from '@/lib/dates';
import { MIN_TOUCH, spacing, useTheme } from '@/theme';
import { Button, Card, EmptyState, ErrorState, Icon, Screen, Skeleton, Text, TextField } from '@/ui';
import {
  AUDIENCE_LABEL,
  BODY_MAX,
  TITLE_MAX,
  audienceChoices,
  createBody,
  draftFromNotice,
  emptyNoticeDraft,
  hasErrors,
  toggleId,
  updateBody,
  validateNotice,
  type Audiences,
  type NoticeAudience,
  type NoticeDraft,
  type NoticeErrors,
  type StaffNotice,
} from './noticesLogic';

/** Write a new notice, or change one of mine (when `editId` is given). */
export function NoticeFormScreen({ editId }: { editId?: string }) {
  const editing = Boolean(editId);
  const existing = useApiQuery<StaffNotice>(`/notices/${editId ?? 'none'}`, { enabled: editing });
  const audiences = useApiQuery<Audiences>('/notices/audiences', { staleTime: 5 * 60_000, enabled: !editing });
  if (editing ? existing.isLoading : audiences.isLoading) {
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
        <ErrorState message={errorMessage(existing.error)} onRetry={() => void existing.refetch()} retrying={existing.isRefetching} />
      </Screen>
    );
  }
  if (!editing && audiences.isError && !audiences.data) {
    return (
      <Screen>
        <ErrorState message={errorMessage(audiences.error)} onRetry={() => void audiences.refetch()} retrying={audiences.isRefetching} />
      </Screen>
    );
  }
  if (!editing && audiences.data && audienceChoices(audiences.data).includes('DIVISIONS') && audiences.data.divisions.length === 0 && !audiences.data.canAddressAnyone) {
    return (
      <Screen>
        <EmptyState
          icon="school-outline"
          title="No classes to write to"
          description="You can write a notice once the school makes you a class teacher or a subject teacher this year."
        />
      </Screen>
    );
  }
  return <NoticeForm notice={existing.data ?? null} audiences={audiences.data ?? null} />;
}

function NoticeForm({ notice, audiences }: { notice: StaffNotice | null; audiences: Audiences | null }) {
  const router = useRouter();
  const client = useQueryClient();
  const today = todayIST();
  const editing = notice !== null;
  const choices = audienceChoices(audiences ?? undefined);

  const [draft, setDraft] = useState<NoticeDraft>(() => (notice ? draftFromNotice(notice) : emptyNoticeDraft(choices[0])));
  const [errors, setErrors] = useState<NoticeErrors>({});
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const patch = (change: Partial<NoticeDraft>) => setDraft((d) => ({ ...d, ...change }));
  useEffect(() => {
    if (tried) setErrors(validateNotice(draft, today, editing));
  }, [draft, tried, today, editing]);

  const save = async () => {
    setTried(true);
    setFailure(null);
    const found = validateNotice(draft, today, editing);
    setErrors(found);
    if (hasErrors(found)) return;
    setSaving(true);
    try {
      if (notice) {
        await api.patch(`/notices/${notice.id}`, updateBody(draft));
        await invalidatePrefix(client, '/notices');
        router.back();
      } else {
        const created = await api.post<StaffNotice>('/notices', createBody(draft));
        await invalidatePrefix(client, '/notices');
        router.replace(`/teacher/notices/${created.id}`);
      }
    } catch (e) {
      setFailure(isApiError(e) && e.status === 403 ? 'You can only write to the classes you teach.' : errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen keyboard>
      <TextField
        label="Title"
        value={draft.title}
        onChangeText={(title) => patch({ title })}
        maxLength={TITLE_MAX}
        autoCapitalize="sentences"
        autoCorrect
        placeholder="For example: Sports day on Friday"
        error={errors.title}
        testID="notice-title"
      />
      <MultilineField
        label="Notice"
        value={draft.body}
        onChangeText={(body) => patch({ body })}
        maxLength={BODY_MAX}
        autoCapitalize="sentences"
        autoCorrect
        placeholder="What do you want to tell them?"
        error={errors.body}
        hint={`${draft.body.length} of ${BODY_MAX} characters. Plain text only.`}
        minHeight={160}
        testID="notice-body"
      />

      {editing ? (
        <View style={styles.block}>
          <Text variant="smallStrong">Who it is for</Text>
          <Text variant="small" tone="muted">
            {notice.audience === 'ALL' ? 'Everyone' : notice.audience === 'STAFF' ? 'Staff only' : (notice.audience === 'CLASSES' ? notice.classes.map((c) => c.name) : notice.divisions.map((d) => d.label)).join(', ')}. The people a notice goes to cannot be changed after it is sent.
          </Text>
        </View>
      ) : (
        <AudienceChooser draft={draft} audiences={audiences!} choices={choices} onChange={patch} error={errors.audience} />
      )}

      <View style={styles.block}>
        <DateField
          label="Last day to show it (optional)"
          value={draft.expiresOn || null}
          onChange={(expiresOn) => patch({ expiresOn })}
          min={today}
          max={addDays(today, 365)}
          placeholder="Show until I remove it"
          error={errors.expiresOn}
          footnote="After this day the notice disappears for readers."
          testID="notice-expires"
        />
        {draft.expiresOn ? (
          <Button title="No last day" variant="ghost" size="sm" fullWidth={false} onPress={() => patch({ expiresOn: '' })} testID="notice-no-expiry" />
        ) : null}
      </View>

      {failure ? (
        <Text variant="small" tone="bad" accessibilityLiveRegion="polite" testID="notice-failure">
          {failure}
        </Text>
      ) : null}
      <Button
        title={editing ? 'Save changes' : 'Send the notice'}
        icon={editing ? 'save-outline' : 'send-outline'}
        loading={saving}
        onPress={() => void save()}
        testID="notice-save"
      />
    </Screen>
  );
}

function AudienceChooser({
  draft,
  audiences,
  choices,
  onChange,
  error,
}: {
  draft: NoticeDraft;
  audiences: Audiences;
  choices: NoticeAudience[];
  onChange: (change: Partial<NoticeDraft>) => void;
  error?: string;
}) {
  const showClasses = draft.audience === 'CLASSES';
  const showDivisions = draft.audience === 'DIVISIONS';
  return (
    <View style={styles.block}>
      <Text variant="smallStrong">Who is it for?</Text>
      {choices.length > 1 ? (
        <FilterChips
          accessibilityLabel="Who it is for"
          chips={choices.map((c) => ({ value: c, label: AUDIENCE_LABEL[c] }))}
          value={draft.audience}
          onChange={(audience) => onChange({ audience: audience as NoticeAudience })}
        />
      ) : null}
      {showDivisions ? (
        <Card padding={0} style={styles.pickList}>
          {audiences.divisions.map((d, i, all) => (
            <Choice
              key={d.id}
              label={d.label}
              on={draft.divisionIds.includes(d.id)}
              last={i === all.length - 1}
              onPress={() => onChange({ divisionIds: toggleId(draft.divisionIds, d.id) })}
              testID={`audience-${d.id}`}
            />
          ))}
        </Card>
      ) : null}
      {showClasses ? (
        <Card padding={0} style={styles.pickList}>
          {audiences.classes.map((c, i, all) => (
            <Choice
              key={c.id}
              label={c.name}
              on={draft.classIds.includes(c.id)}
              last={i === all.length - 1}
              onPress={() => onChange({ classIds: toggleId(draft.classIds, c.id) })}
              testID={`audience-class-${c.id}`}
            />
          ))}
        </Card>
      ) : null}
      {error ? (
        <Text variant="small" tone="bad" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function Choice({ label, on, last, onPress, testID }: { label: string; on: boolean; last: boolean; onPress: () => void; testID: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [
        styles.choice,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
        (pressed || on) && { backgroundColor: colors.primarySoft },
      ]}
    >
      <Text variant="bodyStrong" style={styles.flex}>
        {label}
      </Text>
      <View style={[styles.tick, { borderColor: on ? colors.primary : colors.borderStrong, backgroundColor: on ? colors.primary : 'transparent' }]}>
        {on ? <Icon name="checkmark" size={14} color={colors.primaryForeground} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  block: { gap: spacing.sm },
  pickList: { overflow: 'hidden' },
  choice: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: MIN_TOUCH + 8, paddingHorizontal: spacing.lg },
  tick: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
