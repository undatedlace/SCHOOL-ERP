import { Linking, StyleSheet, View } from 'react-native';
import { errorMessage, isApiError, useApiQuery } from '@/api';
import { AttendanceSummary } from '@/features/attendance/AttendanceSummary';
import { STATUS_MARK, notPresent, type AttendanceHistory, type AttendanceStatus } from '@/features/attendance/attendanceLogic';
import { ResultRow } from '@/features/results/ResultRow';
import { averageOf, groupBySubject, type StudentResults } from '@/features/results/resultsLogic';
import { formatDay, todayIST } from '@/lib/dates';
import { spacing, useTheme } from '@/theme';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Icon, ListRow, Screen, SectionHeader, Skeleton, Text, type BadgeTone } from '@/ui';
import { GENDER_LABEL, RELATIONSHIP_LABEL, ageText, orderedGuardians, telHref, type StudentProfile } from './studentsLogic';

const TONE: Record<AttendanceStatus, BadgeTone> = { PRESENT: 'good', ABSENT: 'bad', LATE: 'warn', ON_LEAVE: 'info' };

/**
 * A student, read only: details, class, guardians with a call button, attendance and published
 * results. There are no scanned documents here: the API does not give them to teachers.
 */
export function StudentProfileScreen({ id }: { id: string }) {
  const today = todayIST();
  const query = useApiQuery<StudentProfile>(`/students/${id}`);

  if (query.isLoading) {
    return (
      <Screen>
        <Skeleton height={80} rounded={22} />
        <Skeleton height={160} rounded={22} />
      </Screen>
    );
  }
  if (query.isError || !query.data) {
    const missing = isApiError(query.error) && query.error.status === 404;
    return (
      <Screen>
        <ErrorState
          title={missing ? 'Student not found' : undefined}
          message={missing ? 'This student is not on the school list any more.' : errorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isRefetching}
        />
      </Screen>
    );
  }

  const s = query.data;
  const current = s.enrollments.find((e) => e.endedOn === null) ?? s.enrollments[0];
  const age = ageText(s.dateOfBirth, today);
  const guardians = orderedGuardians(s.guardians);

  return (
    <Screen onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Card style={styles.header}>
        <Avatar name={s.fullName} size={64} />
        <View style={styles.flex}>
          <Text variant="heading" accessibilityRole="header">
            {s.fullName}
          </Text>
          <Text variant="small" tone="muted">
            {current ? `${current.class.name}-${current.division.name} · ${current.academicYear.name}` : 'No class this year'}
          </Text>
          <Text variant="small" tone="muted">
            Student ID {s.admissionNo}
          </Text>
        </View>
        {s.status !== 'ACTIVE' ? <Badge label={s.status === 'LEFT' ? 'Left school' : 'Removed'} tone="neutral" /> : null}
      </Card>

      <SectionHeader title="Details" />
      <Card padding={0} style={styles.list}>
        <Detail label="Gender" value={GENDER_LABEL[s.gender]} />
        <Detail label="Date of birth" value={formatDay(s.dateOfBirth, 'long')} hint={age ?? undefined} />
        {s.fatherName ? <Detail label="Father's name" value={s.fatherName} /> : null}
        {s.joinedOn ? <Detail label="Joined" value={formatDay(s.joinedOn, 'medium')} /> : null}
        {s.leftOn ? <Detail label="Left" value={formatDay(s.leftOn, 'medium')} /> : null}
        {s.schoolEmail ? <Detail label="School e-mail" value={s.schoolEmail} last /> : <Detail label="Login" value={s.hasLogin ? 'Has a login' : 'No login yet'} last />}
      </Card>

      <SectionHeader title="Parents and guardians" />
      {guardians.length === 0 ? (
        <Card>
          <Text variant="small" tone="muted">
            No parent or guardian is recorded.
          </Text>
        </Card>
      ) : (
        <View style={styles.gap}>
          {guardians.map((g) => (
            <GuardianCard key={g.id} guardian={g} />
          ))}
        </View>
      )}

      <AttendanceSection studentId={id} />
      <ResultsSection studentId={id} />

      {s.enrollments.length > 1 ? (
        <>
          <SectionHeader title="Classes by year" />
          <Card padding={0} style={styles.list}>
            {s.enrollments.map((e, i) => (
              <ListRow
                key={e.id}
                title={`${e.class.name}-${e.division.name}`}
                subtitle={e.academicYear.name}
                chevron={false}
                showDivider={i < s.enrollments.length - 1}
              />
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function Detail({ label, value, hint, last = false }: { label: string; value: string; hint?: string; last?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}${hint ? `, ${hint}` : ''}`}
      style={[styles.detail, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
    >
      <Text variant="small" tone="muted" style={styles.detailLabel}>
        {label}
      </Text>
      <View style={styles.flex}>
        <Text variant="bodyStrong">{value}</Text>
        {hint ? (
          <Text variant="caption" tone="muted">
            {hint}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function GuardianCard({ guardian: g }: { guardian: StudentProfile['guardians'][number] }) {
  const href = telHref(g.mobile);
  return (
    <Card style={styles.guardian} testID={`guardian-${g.id}`}>
      <View style={styles.guardianTop}>
        <View style={styles.flex}>
          <Text variant="bodyStrong">{g.fullName}</Text>
          <Text variant="small" tone="muted">
            {RELATIONSHIP_LABEL[g.relationship]}
            {g.occupation ? ` · ${g.occupation}` : ''}
          </Text>
        </View>
        {g.isPrimary ? <Badge label="Primary contact" tone="primary" /> : null}
      </View>
      {g.mobile ? (
        <View style={styles.guardianTop}>
          <Text variant="body" style={styles.flex} selectable>
            {g.mobile}
          </Text>
          {href ? (
            <Button
              title="Call"
              icon="call-outline"
              size="sm"
              variant="secondary"
              fullWidth={false}
              onPress={() => void Linking.openURL(href)}
              accessibilityLabel={`Call ${g.fullName}`}
              testID={`call-${g.id}`}
            />
          ) : null}
        </View>
      ) : (
        <Text variant="small" tone="muted">
          No mobile number recorded.
        </Text>
      )}
      {g.email ? (
        <Text variant="small" tone="muted" selectable>
          {g.email}
        </Text>
      ) : null}
    </Card>
  );
}

/** What to say in place of a section the API will not give this teacher (a class they do not teach). */
function QuietNote({ icon, text }: { icon: 'lock-closed-outline'; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.quiet, { backgroundColor: colors.accent }]} testID="quiet-note">
      <Icon name={icon} size={18} color={colors.mutedForeground} />
      <Text variant="small" tone="muted" style={styles.flex}>
        {text}
      </Text>
    </View>
  );
}

const refused = (e: unknown) => isApiError(e) && (e.status === 404 || e.status === 403);

function AttendanceSection({ studentId }: { studentId: string }) {
  const today = todayIST();
  const query = useApiQuery<AttendanceHistory>(`/attendance/students/${studentId}`, { query: { to: today } });
  return (
    <>
      <SectionHeader title="Attendance" />
      {query.isLoading ? (
        <Card>
          <Skeleton height={128} />
        </Card>
      ) : refused(query.error) ? (
        <QuietNote icon="lock-closed-outline" text="Attendance is shown for the classes you teach. This student is in another class." />
      ) : query.isError && !query.data ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} retrying={query.isRefetching} />
      ) : !query.data || query.data.summary.markedDays === 0 ? (
        <Card>
          <Text variant="small" tone="muted">
            No attendance has been marked this year.
          </Text>
        </Card>
      ) : (
        <Card style={styles.gap}>
          <AttendanceSummary summary={query.data.summary} caption="this year" size={112} />
          {notPresent(query.data.records).slice(0, 5).map((r) => (
            <View key={r.date} style={styles.absentRow}>
              <Text variant="small" style={styles.flex}>
                {formatDay(r.date, 'short')}
                {r.note ? ` · ${r.note}` : ''}
              </Text>
              <Badge label={STATUS_MARK[r.status].label} tone={TONE[r.status]} />
            </View>
          ))}
        </Card>
      )}
    </>
  );
}

function ResultsSection({ studentId }: { studentId: string }) {
  const query = useApiQuery<StudentResults>(`/results/students/${studentId}`);
  const groups = query.data ? groupBySubject(query.data.results) : [];
  const overall = query.data ? averageOf(query.data.results.map((r) => r.percent)) : null;
  return (
    <>
      <SectionHeader title="Published results" />
      {query.isLoading ? (
        <Card>
          <Skeleton height={80} />
        </Card>
      ) : refused(query.error) ? (
        <QuietNote icon="lock-closed-outline" text="Results are shown for the classes you teach. This student is in another class." />
      ) : query.isError && !query.data ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} retrying={query.isRefetching} />
      ) : groups.length === 0 ? (
        <EmptyState icon="ribbon-outline" title="No results published" description="Results show here once a teacher publishes a test." />
      ) : (
        <View style={styles.gap}>
          {overall !== null ? <Badge label={`Average ${overall}%`} tone="primary" /> : null}
          {groups.map((g) => (
            <View key={g.subject.id} style={styles.gap}>
              <View style={styles.guardianTop}>
                <Text variant="subheading" style={styles.flex}>
                  {g.subject.name}
                </Text>
                {g.averagePercent !== null ? (
                  <Text variant="smallStrong" tone="muted">
                    Average {g.averagePercent}%
                  </Text>
                ) : null}
              </View>
              <Card padding={0} style={styles.list}>
                {g.items.map((item, i) => (
                  <ResultRow key={item.assessment.id} item={item} divider={i < g.items.length - 1} />
                ))}
              </Card>
            </View>
          ))}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: spacing.md },
  list: { overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  detail: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  detailLabel: { width: 108 },
  guardian: { gap: spacing.sm },
  guardianTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  quiet: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: 12 },
  absentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
