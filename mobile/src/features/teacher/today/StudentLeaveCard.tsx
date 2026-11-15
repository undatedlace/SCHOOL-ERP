import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Modal, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, errorMessage, useApiQuery } from '@/api';
import { daysLabel, rangeLabel, type LeaveList, type StudentLeave } from '@/features/absence/logic';
import { invalidatePrefix } from '@/features/family-student/invalidate';
import { Section } from '@/features/home/HomeShell';
import { timeAgo } from '@/lib/dates';
import { MIN_TOUCH, radius, spacing, useTheme } from '@/theme';
import { Avatar, Badge, Button, Icon, Text, TextField } from '@/ui';
import { DECISION_NOTE_MAX, classLine, decisionBody, decisionProblem, waitingForMe } from '../leave/studentLeaveLogic';

const SHOWN = 3;

/** Student leave waiting for this teacher (their own class): approve, or refuse with a reason. */
export function StudentLeaveCard() {
  const client = useQueryClient();
  const list = useApiQuery<LeaveList>('/student-leave', { query: { status: 'PENDING', page: 1, pageSize: 50 } });
  const waiting = list.data ? waitingForMe(list.data.items) : [];
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refusing, setRefusing] = useState<StudentLeave | null>(null);

  const decide = async (request: StudentLeave, approve: boolean, note = '') => {
    setBusy(request.id);
    setError(null);
    try {
      await api.post(`/student-leave/${request.id}/decision`, decisionBody(approve, note));
      // The register pre-selects approved leave, so the rosters are out of date too.
      await Promise.all([invalidatePrefix(client, '/student-leave'), invalidatePrefix(client, '/attendance')]);
      setRefusing(null);
    } catch (e) {
      setError(errorMessage(e));
      // Someone else may have decided it; show the list as it is now.
      void invalidatePrefix(client, '/student-leave');
    } finally {
      setBusy(null);
    }
  };

  const approve = (request: StudentLeave) =>
    Alert.alert(
      `Approve leave for ${request.student.name}?`,
      `${rangeLabel(request.fromDate, request.toDate, request.halfDay)}. The family is told, and the register shows Leave for those days.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', onPress: () => void decide(request, true) },
      ],
    );

  const shown = all ? waiting : waiting.slice(0, SHOWN);

  return (
    <>
      <Section
        title="Leave waiting for you"
        isLoading={list.isLoading}
        isError={list.isError && !list.data}
        error={list.error}
        onRetry={() => void list.refetch()}
        retrying={list.isFetching}
        lines={3}
        padding={0}
      >
        {waiting.length === 0 ? (
          <View style={{ padding: spacing.lg }}>
            <Text variant="small" tone="muted">
              No student leave is waiting for you.
            </Text>
          </View>
        ) : (
          <View>
            <View style={[styles.count, { paddingHorizontal: spacing.lg, paddingTop: spacing.lg }]}>
              <Badge label={`${waiting.length} waiting`} tone="amber" />
            </View>
            {shown.map((r, i) => (
              <LeaveRow
                key={r.id}
                request={r}
                busy={busy === r.id}
                disabled={busy !== null}
                last={i === shown.length - 1}
                onApprove={() => approve(r)}
                onRefuse={() => {
                  setError(null);
                  setRefusing(r);
                }}
              />
            ))}
            {waiting.length > SHOWN ? (
              <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
                <Button
                  title={all ? 'Show fewer' : `Show all ${waiting.length}`}
                  variant="ghost"
                  size="sm"
                  fullWidth={false}
                  onPress={() => setAll((v) => !v)}
                />
              </View>
            ) : null}
            {error && !refusing ? (
              <Text variant="small" tone="bad" style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }} accessibilityLiveRegion="polite">
                {error}
              </Text>
            ) : null}
          </View>
        )}
      </Section>
      {refusing ? (
        <RefuseSheet
          key={refusing.id}
          request={refusing}
          busy={busy === refusing.id}
          error={error}
          onClose={() => setRefusing(null)}
          onRefuse={(note) => void decide(refusing, false, note)}
        />
      ) : null}
    </>
  );
}

function LeaveRow({
  request: r,
  busy,
  disabled,
  last,
  onApprove,
  onRefuse,
}: {
  request: StudentLeave;
  busy: boolean;
  disabled: boolean;
  last: boolean;
  onApprove: () => void;
  onRefuse: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]} testID={`leave-${r.id}`}>
      <View style={styles.rowTop}>
        <Avatar name={r.student.name} size={40} />
        <View style={styles.flex}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {r.student.name}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {classLine(r.student)} · asked {timeAgo(r.createdAt)}
          </Text>
        </View>
      </View>
      <Text variant="smallStrong">
        {rangeLabel(r.fromDate, r.toDate, r.halfDay)} · {daysLabel(r.days)}
      </Text>
      <Text variant="small" tone="muted" numberOfLines={3}>
        {r.reason}
      </Text>
      <View style={styles.buttons}>
        <Button
          title="Approve"
          icon="checkmark"
          size="sm"
          fullWidth={false}
          style={styles.flex}
          loading={busy}
          disabled={disabled}
          onPress={onApprove}
          testID={`approve-${r.id}`}
        />
        <Button
          title="Not approve"
          icon="close"
          variant="secondary"
          size="sm"
          fullWidth={false}
          style={styles.flex}
          disabled={disabled}
          onPress={onRefuse}
          testID={`refuse-${r.id}`}
        />
      </View>
    </View>
  );
}

function RefuseSheet({
  request,
  busy,
  error,
  onClose,
  onRefuse,
}: {
  request: StudentLeave;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onRefuse: (note: string) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const problem = tried ? decisionProblem(false, note) : null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.sheetRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={[styles.handle, { backgroundColor: colors.borderStrong }]} />
          <View style={styles.sheetHeader}>
            <Text variant="heading" style={styles.flex} numberOfLines={2}>
              Not approve leave for {request.student.name}
            </Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={styles.close} hitSlop={6}>
              <Icon name="close" size={24} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetBody} showsVerticalScrollIndicator={false}>
            <Text variant="small" tone="muted">
              {rangeLabel(request.fromDate, request.toDate, request.halfDay)}. The family sees your reason.
            </Text>
            <TextField
              label="Why is it not approved?"
              value={note}
              onChangeText={setNote}
              multiline
              maxLength={DECISION_NOTE_MAX}
              autoCapitalize="sentences"
              autoCorrect
              error={problem}
              testID="refuse-note"
            />
            {error ? (
              <Text variant="small" tone="bad" accessibilityLiveRegion="polite">
                {error}
              </Text>
            ) : null}
            <Button
              title="Send decision"
              icon="send"
              loading={busy}
              onPress={() => {
                setTried(true);
                if (!decisionProblem(false, note)) onRefuse(note);
              }}
              testID="refuse-send"
            />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  count: { flexDirection: 'row' },
  row: { gap: spacing.sm, padding: spacing.lg },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  buttons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '90%',
    borderTopLeftRadius: radius.xl + 4,
    borderTopRightRadius: radius.xl + 4,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: spacing.sm },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', minHeight: MIN_TOUCH },
  close: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center', marginRight: -spacing.sm },
  sheetBody: { gap: spacing.md, paddingBottom: spacing.sm },
});
