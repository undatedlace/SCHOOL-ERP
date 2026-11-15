import { memo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MIN_TOUCH, radius, spacing, useTheme } from '@/theme';
import { Icon, Text, TextField } from '@/ui';
import { NOTE_MAX, STATUS_OPTIONS, type AttendanceStatus, type RosterStudent } from './rosterLogic';

interface Props {
  student: RosterStudent;
  status: AttendanceStatus | null;
  note: string;
  editable: boolean;
  onStatus: (studentId: string, status: AttendanceStatus) => void;
  onNote: (studentId: string, note: string) => void;
}

/** One student in the register: name, four big buttons (a word on each), and an optional note. */
function StudentMarkRowBase({ student, status, note, editable, onStatus, onNote }: Props) {
  const { colors } = useTheme();
  const [noteOpen, setNoteOpen] = useState(note.trim() !== '');
  const tone = {
    PRESENT: { bg: colors.goodFill, fg: '#ffffff' },
    ABSENT: { bg: colors.badFill, fg: '#ffffff' },
    LATE: { bg: colors.amber, fg: colors.amberInk },
    ON_LEAVE: { bg: colors.info, fg: '#0b1f3a' },
  } as const;
  const leave = student.approvedLeave;

  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]} testID={`student-${student.studentId}`}>
      <View style={styles.top}>
        <View style={styles.name}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {student.rollNo !== null ? `${student.rollNo}. ` : ''}
            {student.name}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {student.admissionNo}
          </Text>
        </View>
        {editable ? (
          <Pressable
            onPress={() => setNoteOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={noteOpen ? `Hide note for ${student.name}` : `Add a note for ${student.name}`}
            style={styles.noteButton}
            hitSlop={4}
          >
            <Icon name={note.trim() ? 'chatbox-ellipses' : 'chatbox-ellipses-outline'} size={22} color={note.trim() ? colors.primary : colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>

      {leave ? (
        <Text variant="caption" tone="info">
          Leave approved{leave.halfDay ? ' (half day)' : ''}
          {status === 'ON_LEAVE' && student.status === null ? ' · set to Leave until you save' : ''}
        </Text>
      ) : null}

      <View style={styles.buttons} accessibilityRole="radiogroup" accessibilityLabel={`Attendance for ${student.name}`}>
        {STATUS_OPTIONS.map((option) => {
          const selected = status === option.value;
          const t = tone[option.value];
          return (
            <Pressable
              key={option.value}
              disabled={!editable}
              onPress={() => onStatus(student.studentId, option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: !editable }}
              accessibilityLabel={`${option.label}, ${student.name}`}
              testID={`mark-${student.studentId}-${option.value}`}
              style={[
                styles.button,
                {
                  backgroundColor: selected ? t.bg : colors.card,
                  borderColor: selected ? t.bg : colors.borderStrong,
                },
                !editable && !selected && { opacity: 0.55 },
              ]}
            >
              {selected ? <Icon name="checkmark" size={14} color={t.fg} /> : null}
              <Text variant="smallStrong" numberOfLines={1} style={{ color: selected ? t.fg : colors.foreground }}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {noteOpen || (!editable && note.trim()) ? (
        editable ? (
          <TextField
            label="Note"
            value={note}
            onChangeText={(text) => onNote(student.studentId, text)}
            maxLength={NOTE_MAX}
            placeholder="For example: fever, came late by bus"
            autoCapitalize="sentences"
            autoCorrect
            testID={`note-${student.studentId}`}
          />
        ) : (
          <Text variant="small" tone="muted">
            Note: {note}
          </Text>
        )
      ) : null}
    </View>
  );
}

export const StudentMarkRow = memo(StudentMarkRowBase);

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flex: 1, gap: 1 },
  noteButton: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center', marginRight: -spacing.sm },
  buttons: { flexDirection: 'row', gap: spacing.xs },
  button: {
    flex: 1,
    minHeight: MIN_TOUCH,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 3,
    paddingHorizontal: 2,
  },
});
