import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, errorMessage, isApiError, useApiQuery } from '@/api';
import { invalidatePrefix } from '@/features/family-student/invalidate';
import { useUnsavedGuard } from '@/features/teacher/attendance/useUnsavedGuard';
import { formatDay } from '@/lib/dates';
import { spacing, useTheme } from '@/theme';
import { Badge, Button, Card, EmptyState, ErrorState, Icon, Screen, Skeleton, Text } from '@/ui';
import type { TextInputHandle } from '@/ui';
import { DistributionCard } from './DistributionCard';
import { MarksEntryRow } from './MarksEntryRow';
import {
  canPublish,
  changesOf,
  distributionOf,
  draftsFrom,
  editRow,
  entriesFromDrafts,
  kindLabel,
  liveStats,
  markText,
  maxOf,
  nextStudentId,
  problemsOf,
  undoLast,
  unsavedCount,
  type Drafts,
  type Edit,
  type TestDetail,
} from './marksLogic';

interface Loaded {
  id: string;
  /** What is saved on the server, as of when the screen loaded it (or last saved). */
  detail: TestDetail;
  drafts: Drafts;
  history: Edit[];
}

/** What to say when a save is refused: a plain line for a test that is not yours, the API's own words otherwise. */
export function marksErrorMessage(e: unknown): string {
  if (isApiError(e) && e.status === 404) return 'This test is not yours, or it no longer exists.';
  return errorMessage(e);
}

const fresh = (id: string, detail: TestDetail): Loaded => ({ id, detail, drafts: draftsFrom(detail.students), history: [] });

/** Enter marks for one test: a row per student, then save, publish and see how the class did. */
export function MarksEntryScreen({ id }: { id: string }) {
  const { colors } = useTheme();
  const client = useQueryClient();
  const insets = useSafeAreaInsets();
  const query = useApiQuery<TestDetail>(`/assessments/${id}`, { staleTime: 0 });
  const [state, setState] = useState<Loaded | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Start from what the API says; a background refresh never overwrites what is being typed.
  const startedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!query.data || query.data.id !== id || startedFor.current === id) return;
    startedFor.current = id;
    setState(fresh(id, query.data));
  }, [query.data, id]);

  const current = state?.id === id ? state : null;
  const latest = useRef<Loaded | null>(null);
  latest.current = current;

  const inputs = useRef(new Map<string, TextInputHandle | null>());
  const register = useCallback((studentId: string, input: TextInputHandle | null) => {
    if (input) inputs.current.set(studentId, input);
    else inputs.current.delete(studentId);
  }, []);

  const detail = current?.detail ?? null;
  const max = detail ? maxOf(detail) : 0;
  const students = useMemo(() => detail?.students ?? [], [detail]);
  const drafts = current?.drafts ?? {};
  const problems = useMemo(() => problemsOf(drafts, max), [drafts, max]);
  const entries = useMemo(() => (current ? changesOf(students, current.drafts, max) : []), [current, students, max]);
  const unsaved = useMemo(() => (current ? unsavedCount(students, current.drafts) : 0), [current, students]);
  const stats = useMemo(() => liveStats(students, drafts, max), [students, drafts, max]);
  const distribution = useMemo(() => distributionOf(entriesFromDrafts(students, drafts, max), max), [students, drafts, max]);
  const problemCount = Object.keys(problems).length;
  useUnsavedGuard(unsaved > 0);

  const edit = useCallback(
    (studentId: string, change: Parameters<typeof editRow>[3]) => {
      setNotice(null);
      setState((l) => {
        if (!l) return l;
        const next = editRow(l.drafts, l.history, studentId, change);
        return { ...l, ...next };
      });
    },
    [],
  );
  const onMarks = useCallback((studentId: string, text: string) => edit(studentId, { marks: text }), [edit]);
  const onAbsent = useCallback((studentId: string, absent: boolean) => edit(studentId, absent ? { absent: true, marks: '' } : { absent: false }), [edit]);
  const onRemark = useCallback((studentId: string, text: string) => edit(studentId, { remark: text }), [edit]);

  /** The keyboard's Next key: on to the next student whose marks can be typed, or close the keyboard. */
  const onNext = useCallback((studentId: string) => {
    const l = latest.current;
    if (!l) return;
    const next = nextStudentId(l.detail.students, l.drafts, studentId);
    const input = next ? inputs.current.get(next) : null;
    if (input) input.focus();
    else Keyboard.dismiss();
  }, []);

  const undo = () => {
    const l = latest.current;
    if (!l) return;
    const step = undoLast(l.drafts, l.history);
    if (!step.undone) return;
    const who = l.detail.students.find((s) => s.studentId === step.undone!.studentId)?.name ?? 'the student';
    setNotice(`Put back the last change for ${who}.`);
    setState({ ...l, drafts: step.drafts, history: step.history });
  };

  const reload = async () => {
    const result = await query.refetch();
    if (result.data) setState(fresh(id, result.data));
    setFailure(null);
    setNotice(null);
  };
  const onRefresh = () => {
    if (unsaved === 0) {
      void reload();
      return;
    }
    Alert.alert('Reload and lose your changes?', 'The marks you typed have not been saved.', [
      { text: 'Keep them', style: 'cancel' },
      { text: 'Reload', style: 'destructive', onPress: () => void reload() },
    ]);
  };

  const refreshLists = () => {
    void invalidatePrefix(client, '/assessments');
    void invalidatePrefix(client, '/results');
  };

  const save = async () => {
    if (!current) return;
    setFailure(null);
    setNotice(null);
    if (problemCount > 0) {
      setFailure(problemCount === 1 ? 'One mark cannot be read. Fix it, then save.' : `${problemCount} marks cannot be read. Fix them, then save.`);
      return;
    }
    if (entries.length === 0) return;
    Keyboard.dismiss();
    setSaving(true);
    try {
      const result = await api.put<TestDetail>(`/assessments/${id}/marks`, { entries });
      setState(fresh(id, result));
      setNotice(`Saved ${entries.length} ${entries.length === 1 ? 'row' : 'rows'}.`);
      refreshLists();
    } catch (e) {
      setFailure(marksErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const runPublish = async (path: 'publish' | 'unpublish') => {
    setPublishing(true);
    setFailure(null);
    setNotice(null);
    try {
      const result = await api.post<TestDetail>(`/assessments/${id}/${path}`);
      setState((l) => (l && l.id === id ? { ...l, detail: result } : fresh(id, result)));
      setNotice(path === 'publish' ? 'Published. Families can see these results now.' : 'Taken back. Families cannot see these results.');
      refreshLists();
    } catch (e) {
      setFailure(marksErrorMessage(e));
    } finally {
      setPublishing(false);
    }
  };
  const publish = () => void runPublish('publish');
  const takeBack = () =>
    Alert.alert('Take the results back?', 'Families will no longer see them until you publish again. Marks are kept.', [
      { text: 'Keep published', style: 'cancel' },
      { text: 'Take back', style: 'destructive', onPress: () => void runPublish('unpublish') },
    ]);

  if (query.isLoading || (query.isFetching && !current && !query.isError)) {
    return (
      <Screen>
        <Skeleton height={30} width="70%" />
        <Skeleton height={80} rounded={22} />
        <Skeleton height={200} rounded={22} />
      </Screen>
    );
  }
  if (query.isError && !current) {
    return (
      <Screen>
        <ErrorState
          title={query.error.status === 404 ? 'Test not found' : undefined}
          message={marksErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isRefetching}
        />
      </Screen>
    );
  }
  if (!current || !detail) return <Screen><Skeleton height={80} rounded={22} /></Screen>;

  const published = detail.published;
  const savedEntered = detail.stats.entered;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen onRefresh={onRefresh} refreshing={query.isRefetching && !query.isLoading}>
        <View style={styles.titleRow}>
          <View style={styles.flex}>
            <Text variant="title" accessibilityRole="header">
              {detail.name}
            </Text>
            <Text variant="small" tone="muted">
              {detail.subject.name} · {detail.division.label} · {kindLabel(detail.kind)}
            </Text>
            <Text variant="small" tone="muted">
              {formatDay(detail.conductedOn, 'medium')} · out of {markText(max)}
            </Text>
          </View>
          <Badge label={published ? 'Published' : 'Not published'} tone={published ? 'good' : 'amber'} />
        </View>

        <Card
          style={styles.stats}
          accessibilityLabel={`Entered ${stats.entered} of ${students.length}. Average ${stats.average ?? 'none'}. Highest ${stats.highest ?? 'none'}. Lowest ${stats.lowest ?? 'none'}.`}
        >
          <View style={styles.statRow}>
            <Stat label="Entered" value={`${stats.entered}/${students.length}`} testID="stat-entered" />
            <Stat label="Average" value={stats.average === null ? '–' : String(stats.average)} testID="stat-average" />
            <Stat label="Highest" value={stats.highest === null ? '–' : markText(stats.highest)} testID="stat-highest" />
            <Stat label="Lowest" value={stats.lowest === null ? '–' : markText(stats.lowest)} testID="stat-lowest" />
          </View>
          {stats.absent > 0 ? (
            <Text variant="caption" tone="muted">
              {stats.absent} absent, left out of the average.
            </Text>
          ) : null}
        </Card>

        {published ? (
          <View style={[styles.banner, { backgroundColor: colors.infoSoft }]} testID="published-note">
            <Icon name="information-circle-outline" size={20} color={colors.info} />
            <Text variant="small" style={styles.flex}>
              Families can see these results. You can still change a mark: they see the new one at once, and the change is recorded in the school's audit log.
            </Text>
          </View>
        ) : null}

        {students.length === 0 ? (
          <EmptyState icon="people-outline" title="No students in this class" description="Nobody is enrolled in this class this year." />
        ) : (
          <Card padding={0} style={styles.list}>
            {students.map((s, i) => (
              <MarksEntryRow
                key={s.studentId}
                student={s}
                draft={current.drafts[s.studentId] ?? { marks: '', absent: false, remark: '' }}
                max={max}
                error={problems[s.studentId]}
                isLast={i === students.length - 1}
                onMarks={onMarks}
                onAbsent={onAbsent}
                onRemark={onRemark}
                onNext={onNext}
                register={register}
              />
            ))}
          </Card>
        )}

        <Card style={styles.publishCard}>
          <Text variant="heading">Results for families</Text>
          {published ? (
            <>
              <Text variant="small" tone="muted">
                Published{detail.publishedAt ? ` on ${formatDay(detail.publishedAt, 'medium')}` : ''}.
              </Text>
              <Button title="Take back from families" icon="arrow-undo-outline" variant="danger" loading={publishing} onPress={takeBack} testID="unpublish" />
            </>
          ) : (
            <>
              <Text variant="small" tone="muted">
                Families see nothing until you publish, and publishing needs at least one mark or an absence saved. You can still change marks afterwards: the change is recorded in the school's audit log.
              </Text>
              <Button
                title="Publish results"
                icon="send-outline"
                loading={publishing}
                disabled={!canPublish(savedEntered, unsaved)}
                onPress={publish}
                testID="publish"
              />
              {unsaved > 0 ? (
                <Text variant="caption" tone="muted">
                  Save your changes first.
                </Text>
              ) : savedEntered === 0 ? (
                <Text variant="caption" tone="muted">
                  Enter at least one mark first.
                </Text>
              ) : null}
            </>
          )}
        </Card>

        <DistributionCard distribution={distribution} max={max} unsaved={unsaved > 0} />
      </Screen>

      <View style={[styles.footer, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: spacing.sm + insets.bottom }]}>
        {failure ? (
          <Text variant="small" tone="bad" accessibilityLiveRegion="polite" testID="save-error">
            {failure}
          </Text>
        ) : notice ? (
          <Text variant="small" tone="good" accessibilityLiveRegion="polite" testID="save-notice">
            {notice}
          </Text>
        ) : problemCount > 0 ? (
          <Text variant="small" tone="bad" accessibilityLiveRegion="polite">
            {problemCount === 1 ? 'One mark cannot be read.' : `${problemCount} marks cannot be read.`}
          </Text>
        ) : null}
        <View style={styles.footerRow}>
          <Button
            title="Undo"
            icon="arrow-undo-outline"
            variant="ghost"
            fullWidth={false}
            disabled={current.history.length === 0}
            onPress={undo}
            accessibilityLabel="Undo the last change"
            testID="undo"
          />
          <Button
            title={unsaved > 0 ? `Save marks (${unsaved})` : 'Save marks'}
            icon="save-outline"
            fullWidth={false}
            style={styles.flex}
            loading={saving}
            disabled={unsaved === 0}
            onPress={() => void save()}
            testID="save-marks"
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Stat({ label, value, testID }: { label: string; value: string; testID: string }) {
  return (
    <View style={styles.stat} accessible={false}>
      <Text variant="heading" tone="strong" testID={testID}>
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
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  stats: { gap: spacing.xs },
  statRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'center', flex: 1 },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: 12 },
  list: { overflow: 'hidden' },
  publishCard: { gap: spacing.sm },
  footer: { gap: spacing.xs, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
