import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { errorMessage, useApiQuery } from '@/api';
import { SearchBox, useDebounced } from '@/features/messages/SearchBox';
import { MIN_TOUCH, radius, spacing, useTheme } from '@/theme';
import { Avatar, Badge, Button, Card, ErrorState, Icon, Sheet, Skeleton, Text } from '@/ui';
import type { StudentContacts } from '../messages/types';
import { toggleId } from './homeworkLogic';
import type { Audiences } from './types';

interface Props {
  divisionIds: string[];
  studentIds: string[];
  /** Names of the chosen students, so they can be shown without fetching them again. */
  studentNames: Record<string, string>;
  onDivisions: (ids: string[]) => void;
  onStudents: (ids: string[], names: Record<string, string>) => void;
  error?: string | null;
}

/** Whole divisions (a tick each) and individual students (a search sheet), as the API allows them. */
export function AudiencePicker({ divisionIds, studentIds, studentNames, onDivisions, onStudents, error }: Props) {
  const { colors } = useTheme();
  const audiences = useApiQuery<Audiences>('/homework/audiences', { staleTime: 5 * 60_000 });
  const [sheet, setSheet] = useState(false);

  return (
    <View style={styles.wrap}>
      <Text variant="smallStrong">Who is it for?</Text>
      {audiences.isLoading ? (
        <Card style={styles.gap}>
          <Skeleton height={44} />
          <Skeleton height={44} />
        </Card>
      ) : audiences.isError ? (
        <ErrorState message={errorMessage(audiences.error)} onRetry={() => void audiences.refetch()} retrying={audiences.isFetching} />
      ) : (audiences.data?.divisions.length ?? 0) === 0 ? (
        <Text variant="small" tone="muted">
          You are not assigned to a class this year, so there is nobody to set homework for.
        </Text>
      ) : (
        <Card padding={0} style={styles.list}>
          {audiences.data!.divisions.map((d, i, all) => {
            const selected = divisionIds.includes(d.id);
            return (
              <Pressable
                key={d.id}
                onPress={() => onDivisions(toggleId(divisionIds, d.id))}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`Whole class ${d.label}`}
                testID={`audience-${d.id}`}
                style={({ pressed }) => [
                  styles.row,
                  i < all.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                  (pressed || selected) && { backgroundColor: colors.primarySoft },
                ]}
              >
                <Text variant="bodyStrong" style={styles.flex}>
                  {d.label}
                </Text>
                <Text variant="small" tone="muted">
                  whole class
                </Text>
                <Tick on={selected} />
              </Pressable>
            );
          })}
        </Card>
      )}

      {studentIds.length > 0 ? (
        <View style={styles.chips}>
          {studentIds.map((id) => (
            <Pressable
              key={id}
              onPress={() => onStudents(studentIds.filter((x) => x !== id), studentNames)}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${studentNames[id] ?? 'student'}`}
              style={[styles.chip, { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}
            >
              <Text variant="smallStrong" tone="primary" numberOfLines={1}>
                {studentNames[id] ?? 'Student'}
              </Text>
              <Icon name="close" size={16} color={colors.primary} />
            </Pressable>
          ))}
        </View>
      ) : null}
      <Button
        title={studentIds.length ? 'Add or remove students' : 'Choose individual students'}
        icon="person-add-outline"
        variant="secondary"
        size="sm"
        fullWidth={false}
        onPress={() => setSheet(true)}
        testID="choose-students"
      />
      {error ? (
        <Text variant="small" tone="bad" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <StudentSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        selected={studentIds}
        names={studentNames}
        onChange={onStudents}
      />
    </View>
  );
}

function Tick({ on }: { on: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.tick,
        { borderColor: on ? colors.primary : colors.borderStrong, backgroundColor: on ? colors.primary : 'transparent' },
      ]}
    >
      {on ? <Icon name="checkmark" size={14} color={colors.primaryForeground} /> : null}
    </View>
  );
}

function StudentSheet({
  visible,
  onClose,
  selected,
  names,
  onChange,
}: {
  visible: boolean;
  onClose: () => void;
  selected: string[];
  names: Record<string, string>;
  onChange: (ids: string[], names: Record<string, string>) => void;
}) {
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 300);
  const contacts = useApiQuery<StudentContacts>('/messages/contacts', {
    query: { as: 'teacher', q: q || undefined, pageSize: 50 },
    enabled: visible,
  });
  const items = contacts.data?.items ?? [];

  return (
    <Sheet visible={visible} onClose={onClose} title="Choose students">
      <SearchBox value={search} onChangeText={setSearch} />
      {selected.length > 0 ? <Badge label={`${selected.length} chosen`} tone="primary" /> : null}
      {contacts.isLoading ? (
        <Skeleton height={48} />
      ) : contacts.isError ? (
        <ErrorState message={errorMessage(contacts.error)} onRetry={() => void contacts.refetch()} retrying={contacts.isFetching} />
      ) : items.length === 0 ? (
        <Text variant="small" tone="muted">
          No students match.
        </Text>
      ) : (
        items.map((s) => {
          const on = selected.includes(s.studentId);
          return (
            <Pressable
              key={s.studentId}
              onPress={() =>
                onChange(toggleId(selected, s.studentId), { ...names, [s.studentId]: s.name })
              }
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${s.name}, ${s.className}-${s.divisionName}`}
              testID={`student-${s.studentId}`}
              style={({ pressed }) => [styles.studentRow, (pressed || on) && { backgroundColor: colors.primarySoft }]}
            >
              <Avatar name={s.name} size={40} />
              <View style={styles.flex}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {s.name}
                </Text>
                <Text variant="caption" tone="muted">
                  {s.className}-{s.divisionName} · {s.admissionNo}
                </Text>
              </View>
              <Tick on={on} />
            </Pressable>
          );
        })
      )}
      <Button title="Done" onPress={onClose} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  flex: { flex: 1 },
  gap: { gap: spacing.md },
  list: { overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: MIN_TOUCH + 8, paddingHorizontal: spacing.lg },
  tick: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    maxWidth: '100%',
  },
  studentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: MIN_TOUCH + 8, paddingHorizontal: spacing.xs, borderRadius: radius.md },
});
