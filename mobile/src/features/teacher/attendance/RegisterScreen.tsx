import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { api, errorMessage, isApiError, useApiQuery } from '@/api';
import { DateField } from '@/features/absence/DateField';
import { FilterChips } from '@/features/family-student/FilterChips';
import { invalidatePrefix } from '@/features/family-student/invalidate';
import { addDays, formatDay, todayIST } from '@/lib/dates';
import { spacing, useTheme } from '@/theme';
import { Badge, Button, Card, EmptyState, ErrorState, Icon, Screen, SegmentedControl, Skeleton, Text } from '@/ui';
import { ReportView } from './ReportView';
import { StudentMarkRow } from './StudentMarkRow';
import {
  changesOf,
  countsOf,
  dayChipLabel,
  divisionLabel,
  draftsFrom,
  editableDays,
  flaggedText,
  isEditableDay,
  isSunday,
  markEveryonePresent,
  setNote,
  setStatus,
  TEACHER_EDIT_DAYS,
  type AttendanceStatus,
  type Drafts,
  type Roster,
} from './rosterLogic';
import { useMyDivisions } from './useAttendanceData';
import { useUnsavedGuard } from './useUnsavedGuard';

type View_ = 'register' | 'report';

interface Loaded {
  key: string;
  /** What is saved, as of when the screen loaded it (or last saved). */
  roster: Roster;
  drafts: Drafts;
}

/** What to say when a save is refused: the API's own words for dates, a plain line for a division that is not yours. */
export function saveErrorMessage(e: unknown): string {
  if (isApiError(e) && e.status === 404) return 'This class is not one you teach, or it no longer exists.';
  return errorMessage(e);
}

/** The register for one division on one day, and the report for it. */
export function RegisterScreen({ divisionId: initialDivision, date: initialDate }: { divisionId: string; date: string }) {
  const { colors } = useTheme();
  const client = useQueryClient();
  const today = todayIST();
  const divisions = useMyDivisions();
  const [divisionId, setDivisionId] = useState(initialDivision);
  const [date, setDate] = useState(initialDate);
  const [view, setView] = useState<View_>('register');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const key = `${divisionId}|${date}`;
  const rosterQuery = useApiQuery<Roster>(`/attendance/divisions/${divisionId}`, { query: { date }, staleTime: 0 });
  const roster = rosterQuery.data;

  // Start from what the API says whenever the division or day changes; never overwrite choices
  // that are being made (a background refresh does not touch them).
  const startedKey = useRef<string | null>(null);
  useEffect(() => {
    if (!roster || roster.division.id !== divisionId || roster.date !== date) return;
    if (startedKey.current === key) return;
    startedKey.current = key;
    setLoaded({ key, roster, drafts: draftsFrom(roster) });
    setSaveError(null);
    setSavedAt(null);
  }, [roster, divisionId, date, key]);

  const state = loaded?.key === key ? loaded : null;
  const entries = useMemo(() => (state ? changesOf(state.roster, state.drafts) : []), [state]);
  const counts = useMemo(() => (state ? countsOf(state.roster, state.drafts) : null), [state]);
  const dirty = entries.length > 0;
  useUnsavedGuard(dirty);

  const change = (fn: (d: Drafts) => Drafts) =>
    setLoaded((l) => (l && l.key === key ? { ...l, drafts: fn(l.drafts) } : l));
  const onStatus = useCallback((studentId: string, status: AttendanceStatus) => {
    setSavedAt(null);
    setLoaded((l) => (l ? { ...l, drafts: setStatus(l.drafts, studentId, status) } : l));
  }, []);
  const onNote = useCallback((studentId: string, note: string) => {
    setSavedAt(null);
    setLoaded((l) => (l ? { ...l, drafts: setNote(l.drafts, studentId, note) } : l));
  }, []);

  /** Switching class or day drops the marks on screen, so ask first when some are not saved. */
  const switchTo = (apply: () => void) => {
    if (!dirty) {
      apply();
      return;
    }
    Alert.alert('Switch without saving?', 'The marks you chose have not been saved.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Switch', style: 'destructive', onPress: apply },
    ]);
  };

  const reload = async () => {
    const result = await rosterQuery.refetch();
    if (result.data) setLoaded({ key, roster: result.data, drafts: draftsFrom(result.data) });
  };
  const onRefresh = () => {
    if (!dirty) {
      void reload();
      return;
    }
    Alert.alert('Reload and lose your changes?', 'The marks you chose have not been saved.', [
      { text: 'Keep them', style: 'cancel' },
      { text: 'Reload', style: 'destructive', onPress: () => void reload() },
    ]);
  };

  const save = async () => {
    if (!state || !dirty) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await api.put<Roster>(`/attendance/divisions/${divisionId}`, { date, entries });
      setLoaded({ key, roster: result, drafts: draftsFrom(result) });
      setSavedAt(new Date().toISOString());
      void invalidatePrefix(client, '/attendance');
    } catch (e) {
      setSaveError(saveErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const mine = divisions.data ?? [];
  const current = mine.find((d) => d.id === divisionId);
  const title = state ? divisionLabel(state.roster.division) : current ? divisionLabel(current) : 'Register';
  const editable = state?.roster.canMark === true;
  const chipDays = editableDays(today);
  const older = date < chipDays[chipDays.length - 1]!;

  return (
    <Screen keyboard onRefresh={onRefresh} refreshing={rosterQuery.isRefetching && !rosterQuery.isLoading}>
      <View style={styles.titleRow}>
        <View style={styles.flex}>
          <Text variant="title" accessibilityRole="header">
            {title}
          </Text>
          <Text variant="small" tone="muted">
            {formatDay(date, 'weekday')}
            {isSunday(date) ? ' · Sunday' : ''}
          </Text>
        </View>
        {state ? (
          <Badge
            label={state.roster.marked ? 'Register taken' : 'Not taken yet'}
            tone={state.roster.marked ? 'good' : 'amber'}
          />
        ) : null}
      </View>

      {mine.length > 1 ? (
        <FilterChips
          accessibilityLabel="Class"
          chips={mine.map((d) => ({ value: d.id, label: divisionLabel(d) }))}
          value={divisionId}
          onChange={(id) => switchTo(() => setDivisionId(id))}
        />
      ) : null}

      <SegmentedControl<View_>
        accessibilityLabel="Register or report"
        value={view}
        onChange={setView}
        options={[
          { value: 'register', label: 'Register' },
          { value: 'report', label: 'Report' },
        ]}
      />

      {view === 'report' ? (
        <ReportView divisionId={divisionId} today={today} />
      ) : (
        <>
          <FilterChips
            accessibilityLabel="Day"
            chips={chipDays.map((d) => ({ value: d, label: dayChipLabel(d, today) }))}
            value={older ? '' : date}
            onChange={(d) => switchTo(() => setDate(d))}
          />
          <DateField
            label="Look at an earlier day"
            value={older ? date : null}
            onChange={(d) => switchTo(() => setDate(d))}
            min={addDays(today, -365)}
            max={addDays(today, -(TEACHER_EDIT_DAYS + 1))}
            placeholder="Choose an earlier day"
            footnote={`You can change today and the ${TEACHER_EDIT_DAYS} days before it. Earlier days are for looking at; the school admin changes them.`}
            testID="earlier-day"
          />

          {rosterQuery.isLoading || (rosterQuery.isFetching && !state) ? (
            <Card style={styles.gap}>
              <Skeleton height={20} width="40%" />
              <Skeleton height={80} />
              <Skeleton height={80} />
            </Card>
          ) : rosterQuery.isError && !state ? (
            <ErrorState message={saveErrorMessage(rosterQuery.error)} onRetry={() => void rosterQuery.refetch()} retrying={rosterQuery.isFetching} />
          ) : state && counts ? (
            <>
              {!editable ? (
                <View style={[styles.banner, { backgroundColor: colors.accent, borderColor: colors.border }]} accessibilityRole="alert" testID="read-only">
                  <Icon name="lock-closed" size={18} color={colors.mutedForeground} />
                  <Text variant="small" tone="muted" style={styles.flex}>
                    {!isEditableDay(date, today)
                      ? `You can look at this day but not change it. Teachers change today and the ${TEACHER_EDIT_DAYS} days before it.`
                      : 'You can look at this class but not change its register.'}
                  </Text>
                </View>
              ) : null}

              <Card style={styles.countsCard} accessibilityLabel={`Present ${counts.present}, absent ${counts.absent}, late ${counts.late}, leave ${counts.onLeave}, not marked ${counts.unmarked}`}>
                <View style={styles.counts}>
                  <Count label="Present" value={counts.present} />
                  <Count label="Absent" value={counts.absent} tone="bad" />
                  <Count label="Late" value={counts.late} tone="amber" />
                  <Count label="Leave" value={counts.onLeave} tone="info" />
                  <Count label="Not marked" value={counts.unmarked} tone="muted" />
                </View>
                {flaggedText(counts) ? (
                  <Text variant="caption" tone="muted">
                    {flaggedText(counts)} of {counts.total}
                  </Text>
                ) : null}
              </Card>

              {editable ? (
                <Button
                  title="Mark everyone present"
                  icon="checkmark-done-outline"
                  variant="secondary"
                  onPress={() => {
                    setSavedAt(null);
                    change((d) => markEveryonePresent(state.roster, d));
                  }}
                  testID="mark-all-present"
                />
              ) : null}

              {state.roster.students.length === 0 ? (
                <EmptyState
                  icon="people-outline"
                  title="No students on this day"
                  description="Nobody was enrolled in this class on this day."
                />
              ) : (
                <Card padding={0} style={styles.list}>
                  {state.roster.students.map((s) => (
                    <StudentMarkRow
                      key={s.studentId}
                      student={s}
                      status={state.drafts[s.studentId]?.status ?? null}
                      note={state.drafts[s.studentId]?.note ?? ''}
                      editable={editable}
                      onStatus={onStatus}
                      onNote={onNote}
                    />
                  ))}
                </Card>
              )}

              {state.roster.marked && state.roster.markedBy ? (
                <Text variant="caption" tone="muted">
                  Last saved by {state.roster.markedBy}.
                </Text>
              ) : null}

              {editable ? (
                <View style={styles.saveArea}>
                  {saveError ? (
                    <Text variant="small" tone="bad" accessibilityLiveRegion="polite" testID="save-error">
                      {saveError}
                    </Text>
                  ) : null}
                  {savedAt && !dirty ? (
                    <Text variant="small" tone="good" accessibilityLiveRegion="polite">
                      Saved.
                    </Text>
                  ) : null}
                  {counts.unmarked > 0 && dirty ? (
                    <Text variant="caption" tone="muted">
                      {counts.unmarked} not marked yet. Only the students you marked are saved.
                    </Text>
                  ) : null}
                  <Button
                    title={dirty ? `Save attendance (${entries.length})` : 'Save attendance'}
                    icon="save-outline"
                    loading={saving}
                    disabled={!dirty}
                    onPress={() => void save()}
                    testID="save-attendance"
                  />
                </View>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function Count({ label, value, tone = 'strong' }: { label: string; value: number; tone?: 'strong' | 'bad' | 'amber' | 'info' | 'muted' }) {
  return (
    <View style={styles.count} accessible={false}>
      <Text variant="heading" tone={tone}>
        {value}
      </Text>
      <Text variant="caption" tone="muted" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: 12, borderWidth: 1 },
  countsCard: { gap: spacing.xs },
  counts: { flexDirection: 'row', justifyContent: 'space-between' },
  count: { alignItems: 'center', flex: 1 },
  list: { overflow: 'hidden' },
  saveArea: { gap: spacing.sm },
});
