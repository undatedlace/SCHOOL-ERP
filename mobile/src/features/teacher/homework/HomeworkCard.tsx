import { StyleSheet, View } from 'react-native';
import { spacing } from '@/theme';
import { Badge, Card, Text } from '@/ui';
import { ProgressBar } from '../ProgressBar';
import {
  audienceText,
  dueText,
  handedInText,
  isPastDue,
  markedProgressText,
  markedShare,
  type HomeworkStats,
} from './homeworkLogic';
import type { TeacherHomework } from './types';

interface Props {
  homework: TeacherHomework;
  /** Undefined while the roster loads, or when the task takes no hand-ins. */
  stats: HomeworkStats | undefined;
  today: string;
  onPress: () => void;
}

/** One task in the list: title, who it is for, due day, how much is handed in and marked. */
export function HomeworkCard({ homework: hw, stats, today, onPress }: Props) {
  const past = isPastDue(hw, today);
  const waiting = stats?.toMark ?? 0;
  const label = [
    hw.title,
    hw.subject?.name,
    audienceText(hw),
    dueText(hw.dueOn, today),
    stats ? `${handedInText(stats)}, ${waiting} to mark` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Card onPress={onPress} accessibilityLabel={label} style={styles.card} testID={`homework-${hw.id}`}>
      <View style={styles.badges}>
        {hw.subject ? <Badge label={hw.subject.name} tone="primary" /> : null}
        {waiting > 0 ? <Badge label={`${waiting} to mark`} tone="amber" /> : null}
        {stats && stats.redo > 0 ? <Badge label={`${stats.redo} sent back`} tone="warn" /> : null}
      </View>
      <Text variant="bodyStrong" numberOfLines={2}>
        {hw.title}
      </Text>
      <Text variant="small" tone="muted" numberOfLines={1}>
        {audienceText(hw)}
      </Text>
      <Text variant="small" tone={past ? 'bad' : 'muted'}>
        {dueText(hw.dueOn, today)}
      </Text>
      {hw.handIn ? (
        stats ? (
          <View style={styles.progress}>
            <ProgressBar share={stats.students === 0 ? 0 : stats.handedIn / stats.students} label={handedInText(stats)} />
            <View style={styles.progressText}>
              <Text variant="caption" tone="muted">
                {handedInText(stats)}
              </Text>
              {stats.handedIn > 0 ? (
                <Text variant="caption" tone={waiting > 0 ? 'amber' : 'good'}>
                  {markedProgressText(stats)}
                </Text>
              ) : null}
            </View>
            {stats.handedIn > 0 ? <ProgressBar share={markedShare(stats)} label={markedProgressText(stats)} tone="good" /> : null}
          </View>
        ) : (
          <Text variant="caption" tone="muted">
            Counting hand-ins...
          </Text>
        )
      ) : (
        <Text variant="caption" tone="muted">
          Students do not hand work in through the app.
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  progress: { gap: spacing.xs, marginTop: spacing.xs },
  progressText: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
});
