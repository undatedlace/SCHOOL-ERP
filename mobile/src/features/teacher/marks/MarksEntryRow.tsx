import { memo, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { MAX_FONT_SCALE, MIN_TOUCH, fontFamily, radius, spacing, useTheme } from '@/theme';
import { Badge, Icon, Text } from '@/ui';
import type { TextInputHandle } from '@/ui';
import { REMARK_MAX, isLowMark, markText, percentText, scoreOf, type EntryDraft, type TestStudent } from './marksLogic';

interface Props {
  student: TestStudent;
  draft: EntryDraft;
  max: number;
  /** The message when the box cannot be read. */
  error?: string;
  /** The last student: the keyboard says "Done" instead of "Next". */
  isLast: boolean;
  onMarks: (studentId: string, text: string) => void;
  onAbsent: (studentId: string, absent: boolean) => void;
  onRemark: (studentId: string, text: string) => void;
  /** The keyboard's Next (or Done) key. */
  onNext: (studentId: string) => void;
  register: (studentId: string, input: TextInputHandle | null) => void;
}

/** Letters, digits and a decimal point only; nothing else can be typed in a marks box. */
export const cleanMarksText = (text: string): string => text.replace(/[^0-9.,]/g, '').slice(0, 7);

/** One student in the marks list: name, a number box, an Absent switch, an optional remark. */
function MarksEntryRowBase({ student, draft, max, error, isLast, onMarks, onAbsent, onRemark, onNext, register }: Props) {
  const { colors } = useTheme();
  const [remarkOpen, setRemarkOpen] = useState(draft.remark !== '');
  const showRemark = remarkOpen || draft.remark !== '';
  const score = scoreOf(draft, max);
  const low = score !== null && isLowMark(score, max);
  const percent = percentText(score, max);
  const hasRemark = draft.remark.trim() !== '';

  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]} testID={`row-${student.studentId}`}>
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
        {low ? <Badge label={`Low${percent ? ` · ${percent}` : ''}`} tone="bad" /> : percent ? <Text variant="smallStrong" tone="muted">{percent}</Text> : null}
      </View>

      <View style={styles.entry}>
        <View
          style={[
            styles.box,
            {
              backgroundColor: draft.absent ? colors.accent : colors.card,
              borderColor: error ? colors.bad : colors.borderStrong,
              borderWidth: error ? 2 : 1,
            },
          ]}
        >
          <TextInput
            ref={(node) => register(student.studentId, node)}
            value={draft.marks}
            onChangeText={(text) => onMarks(student.studentId, cleanMarksText(text))}
            editable={!draft.absent}
            // iOS has no Next key on the decimal pad, so it gets the keyboard that has one.
            keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'decimal-pad'}
            returnKeyType={isLast ? 'done' : 'next'}
            submitBehavior="submit"
            onSubmitEditing={() => onNext(student.studentId)}
            selectTextOnFocus
            placeholder={draft.absent ? 'Absent' : 'Marks'}
            placeholderTextColor={colors.faint}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            selectionColor={colors.primary}
            accessibilityLabel={`Marks for ${student.name}, out of ${markText(max)}`}
            accessibilityHint={draft.absent ? 'Marked absent' : isLast ? 'Press Done when finished' : 'Press Next to go to the next student'}
            testID={`marks-${student.studentId}`}
            style={[styles.input, { color: colors.foreground, fontFamily: fontFamily.bodySemi }]}
          />
          <Text variant="small" tone="muted">
            / {markText(max)}
          </Text>
        </View>

        <Pressable
          onPress={() => onAbsent(student.studentId, !draft.absent)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: draft.absent }}
          accessibilityLabel={`Absent, ${student.name}`}
          testID={`absent-${student.studentId}`}
          style={[
            styles.absent,
            {
              backgroundColor: draft.absent ? colors.warnSoft : colors.card,
              borderColor: draft.absent ? colors.warn : colors.borderStrong,
            },
          ]}
        >
          {draft.absent ? <Icon name="checkmark" size={16} color={colors.warn} /> : null}
          <Text variant="smallStrong" style={{ color: draft.absent ? colors.warn : colors.foreground }}>
            Absent
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setRemarkOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={showRemark ? `Hide remark for ${student.name}` : `Add a remark for ${student.name}`}
          style={styles.remarkButton}
          hitSlop={4}
        >
          <Icon name={hasRemark ? 'chatbox-ellipses' : 'chatbox-ellipses-outline'} size={22} color={hasRemark ? colors.primary : colors.mutedForeground} />
        </Pressable>
      </View>

      {error ? (
        <Text variant="small" tone="bad" accessibilityLiveRegion="polite" testID={`error-${student.studentId}`}>
          {error}
        </Text>
      ) : null}

      {showRemark ? (
        <TextInput
          value={draft.remark}
          onChangeText={(text) => onRemark(student.studentId, text)}
          maxLength={REMARK_MAX}
          placeholder="A short remark (optional)"
          placeholderTextColor={colors.faint}
          returnKeyType="done"
          autoCapitalize="sentences"
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          selectionColor={colors.primary}
          accessibilityLabel={`Remark for ${student.name}`}
          testID={`remark-${student.studentId}`}
          style={[styles.remark, { color: colors.foreground, borderColor: colors.borderStrong, backgroundColor: colors.card, fontFamily: fontFamily.body }]}
        />
      ) : null}
    </View>
  );
}

export const MarksEntryRow = memo(MarksEntryRowBase);

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flex: 1, gap: 1 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  box: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: MIN_TOUCH + 4,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  input: { flex: 1, fontSize: 18, minHeight: MIN_TOUCH, paddingVertical: spacing.xs },
  absent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: MIN_TOUCH + 4,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  remarkButton: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  remark: { minHeight: MIN_TOUCH, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, fontSize: 15 },
});
