import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api, errorMessage } from '@/api';
import { DateField } from '@/features/absence/DateField';
import { FilterChips } from '@/features/family-student/FilterChips';
import { invalidatePrefix } from '@/features/family-student/invalidate';
import { addDays, todayIST } from '@/lib/dates';
import { spacing } from '@/theme';
import { Button, EmptyState, ErrorState, Screen, Skeleton, Text, TextField } from '@/ui';
import {
  KINDS,
  NAME_MAX,
  createBody,
  emptyTestDraft,
  hasErrors,
  subjectsFor,
  validateTest,
  type TestDetail,
  type TestDraft,
  type TestErrors,
} from './marksLogic';
import { useTestOptions } from './useMarks';

/** Set a new test for a class and subject the teacher teaches. */
export function NewTestScreen({ divisionId: initialDivision }: { divisionId?: string }) {
  const router = useRouter();
  const client = useQueryClient();
  const today = todayIST();
  const options = useTestOptions();
  const [draft, setDraft] = useState<TestDraft>(() => ({ ...emptyTestDraft(today), divisionId: initialDivision ?? '' }));
  const [errors, setErrors] = useState<TestErrors>({});
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const divisions = options.data?.divisions ?? [];
  const patch = (change: Partial<TestDraft>) => setDraft((d) => ({ ...d, ...change }));

  // A teacher with one class does not have to choose it; a class from a shortcut that is not theirs is dropped.
  useEffect(() => {
    if (!options.data) return;
    const valid = options.data.divisions.some((d) => d.id === draft.divisionId);
    if (!valid) {
      const only = options.data.divisions.length === 1 ? options.data.divisions[0]!.id : '';
      if (only !== draft.divisionId) setDraft((d) => ({ ...d, divisionId: only, subjectId: '' }));
    }
  }, [options.data, draft.divisionId]);

  const subjects = subjectsFor(options.data, draft.divisionId);
  // A subject that the new class does not offer is cleared; a class with one subject chooses it.
  useEffect(() => {
    if (!draft.divisionId) return;
    if (draft.subjectId && !subjects.some((s) => s.id === draft.subjectId)) setDraft((d) => ({ ...d, subjectId: '' }));
    else if (!draft.subjectId && subjects.length === 1) setDraft((d) => ({ ...d, subjectId: subjects[0]!.id }));
  }, [draft.divisionId, draft.subjectId, subjects]);

  useEffect(() => {
    if (tried) setErrors(validateTest(draft, options.data, today));
  }, [draft, tried, options.data, today]);

  const save = async () => {
    setTried(true);
    setFailure(null);
    const found = validateTest(draft, options.data, today);
    setErrors(found);
    if (hasErrors(found)) return;
    setSaving(true);
    try {
      const created = await api.post<TestDetail>('/assessments', createBody(draft));
      await invalidatePrefix(client, '/assessments');
      router.replace(`/teacher/marks/${created.id}`);
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (options.isLoading) {
    return (
      <Screen>
        <Skeleton height={48} />
        <Skeleton height={48} />
        <Skeleton height={48} />
      </Screen>
    );
  }
  if (options.isError && !options.data) {
    return (
      <Screen>
        <ErrorState message={errorMessage(options.error)} onRetry={() => void options.refetch()} retrying={options.isRefetching} />
      </Screen>
    );
  }
  if (divisions.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon="school-outline"
          title="No classes to set a test for"
          description="You can set tests once the school makes you a class teacher or a subject teacher this year."
        />
      </Screen>
    );
  }

  return (
    <Screen keyboard>
      <TextField
        label="Name of the test"
        value={draft.name}
        onChangeText={(name) => patch({ name })}
        maxLength={NAME_MAX}
        autoCapitalize="sentences"
        autoCorrect
        placeholder="For example: Unit Test 1"
        error={errors.name}
        testID="test-name"
      />

      <View style={styles.block}>
        <Text variant="smallStrong">Kind of test</Text>
        <FilterChips
          accessibilityLabel="Kind of test"
          chips={KINDS.map((k) => ({ value: k.value, label: k.label }))}
          value={draft.kind}
          onChange={(kind) => patch({ kind: kind as TestDraft['kind'] })}
        />
      </View>

      <View style={styles.block}>
        <Text variant="smallStrong">Class</Text>
        <FilterChips
          accessibilityLabel="Class"
          chips={divisions.map((d) => ({ value: d.id, label: d.label }))}
          value={draft.divisionId}
          onChange={(divisionId) => patch({ divisionId })}
        />
        {errors.divisionId ? (
          <Text variant="small" tone="bad" accessibilityLiveRegion="polite">
            {errors.divisionId}
          </Text>
        ) : null}
      </View>

      <View style={styles.block}>
        <Text variant="smallStrong">Subject</Text>
        {draft.divisionId ? (
          <FilterChips
            accessibilityLabel="Subject"
            chips={subjects.map((s) => ({ value: s.id, label: s.name }))}
            value={draft.subjectId}
            onChange={(subjectId) => patch({ subjectId })}
          />
        ) : (
          <Text variant="small" tone="muted">
            Choose a class first.
          </Text>
        )}
        {errors.subjectId ? (
          <Text variant="small" tone="bad" accessibilityLiveRegion="polite">
            {errors.subjectId}
          </Text>
        ) : null}
      </View>

      <DateField
        label="Day of the test"
        value={draft.conductedOn || null}
        onChange={(conductedOn) => patch({ conductedOn })}
        min={addDays(today, -365)}
        max={today}
        error={errors.conductedOn}
        footnote="The day the test was held. It cannot be a future day."
        testID="test-date"
      />

      <TextField
        label="Maximum marks"
        value={draft.maxMarks}
        onChangeText={(maxMarks) => patch({ maxMarks })}
        keyboardType="decimal-pad"
        maxLength={7}
        placeholder="For example: 25"
        hint="The most a student can score."
        error={errors.maxMarks}
        testID="test-max"
      />

      {failure ? (
        <Text variant="small" tone="bad" accessibilityLiveRegion="polite" testID="test-failure">
          {failure}
        </Text>
      ) : null}
      <Button title="Set the test" icon="checkmark" loading={saving} onPress={() => void save()} testID="test-save" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.sm },
});
