import { Fragment, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { formatClock } from '@/lib/dates';
import { fontFamily, radius, spacing, useTheme } from '@/theme';
import { Badge, Icon, Text } from '@/ui';
import {
  minutesText,
  nowLine,
  rowStates,
  type DayPlan,
  type NowLine,
  type RowState,
  type TimelineRow,
} from './dayPlan';

interface TimelineProps {
  plan: DayPlan;
  /** Today in India, "YYYY-MM-DD". */
  today: string;
  /** Minutes since midnight in India. */
  nowMin: number;
  /** Tighter rows, for the week list. */
  compact?: boolean;
  /** Something to show under a lesson's details (the teacher's "Register" button). */
  renderAction?: (row: TimelineRow) => ReactNode;
}

const TIME_COL = 62;

/** What to say when a day has no periods. */
export function noSchoolText(plan: DayPlan): { title: string; detail: string } {
  if (plan.status === 'sunday') return { title: 'No school today', detail: 'It is Sunday.' };
  if (plan.status === 'holiday') return { title: 'No school today', detail: plan.holiday ?? 'A holiday.' };
  return { title: 'No lessons on this day', detail: 'The school has not filled in this day.' };
}

/** The periods of one day as a timeline, with a live "now" line when the day is today. */
export function Timeline({ plan, today, nowMin, compact = false, renderAction }: TimelineProps) {
  const { colors } = useTheme();
  if (plan.rows.length === 0) {
    const text = noSchoolText(plan);
    return (
      <View style={styles.none} accessible accessibilityLabel={`${text.title}. ${text.detail}`}>
        <Icon name="happy-outline" size={26} color={colors.faint} />
        <Text variant="bodyStrong">{text.title}</Text>
        <Text variant="small" tone="muted" align="center">
          {text.detail}
        </Text>
      </View>
    );
  }

  const states = rowStates(plan.rows, plan.date, today, nowMin);
  const line = nowLine(plan.rows, plan.date, today, nowMin);

  return (
    <View testID="timeline" accessibilityLabel="Timetable" style={{ gap: compact ? spacing.xs : spacing.sm }}>
      {plan.rows.map((row, i) => (
        <Fragment key={row.key}>
          {line && !line.inside && line.index === i ? <GapLine nowMin={nowMin} /> : null}
          <TimelineItem
            row={row}
            state={states[i]!}
            line={line && line.inside && line.index === i ? line : null}
            nowMin={nowMin}
            compact={compact}
            isLast={i === plan.rows.length - 1}
            renderAction={renderAction}
          />
        </Fragment>
      ))}
    </View>
  );
}

function clockOfMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return formatClock(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
}

/** The now line between two rows (a gap with no row in it). */
function GapLine({ nowMin }: { nowMin: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={styles.gap}
      accessible
      accessibilityLabel={`Now, ${clockOfMinutes(nowMin)}`}
      testID="now-line"
    >
      <View style={[styles.chip, { width: TIME_COL - 6, backgroundColor: colors.amber }]}>
        <Text variant="caption" style={{ color: colors.amberInk, fontFamily: fontFamily.bodyBold }} numberOfLines={1}>
          {clockOfMinutes(nowMin)}
        </Text>
      </View>
      <View style={[styles.rule, { backgroundColor: colors.amber }]} />
    </View>
  );
}

interface ItemProps {
  row: TimelineRow;
  state: RowState;
  /** Set when the live line falls inside this row. */
  line: NowLine | null;
  nowMin: number;
  compact: boolean;
  isLast: boolean;
  renderAction?: (row: TimelineRow) => ReactNode;
}

function rowLabel(row: TimelineRow, state: RowState): string {
  const parts = [row.label];
  if (row.kind === 'PERIOD') parts.push(row.free ? 'Free period' : row.subject ?? '');
  parts.push(`${formatClock(row.startsAt)} to ${formatClock(row.endsAt)}`);
  if (row.teacher) parts.push(row.teacher);
  if (row.room) parts.push(row.room);
  if (row.change?.kind === 'CANCELLED') parts.push('Cancelled');
  if (row.divisionLabel) parts.push(row.divisionLabel);
  if (row.covering) parts.push('Covering');
  else if (row.change?.kind === 'SUBSTITUTE') parts.push('Substitute teacher');
  if (state === 'now') parts.push('Now');
  if (state === 'next') parts.push('Up next');
  if (state === 'done') parts.push('Done');
  return parts.filter(Boolean).join(', ');
}

function TimelineItem({ row, state, line, nowMin, compact, isLast, renderAction }: ItemProps) {
  const { colors } = useTheme();
  const thin = row.kind !== 'PERIOD';
  const cancelled = row.change?.kind === 'CANCELLED';
  const covering = row.covering === true;
  const substitute = row.change?.kind === 'SUBSTITUTE' && !covering;

  const cardBackground =
    state === 'now' ? colors.primarySoft : state === 'next' ? colors.amberSoft : state === 'done' ? colors.muted : colors.card;
  const cardBorder =
    state === 'now' ? colors.primary : state === 'next' ? colors.amber : colors.border;
  const dotColor = state === 'now' ? colors.primary : state === 'next' ? colors.amber : state === 'done' ? colors.goodFill : colors.borderStrong;

  const left = (
    <View style={{ width: TIME_COL }}>
      <Text variant="smallStrong" tone={state === 'done' ? 'muted' : 'strong'}>
        {formatClock(row.startsAt)}
      </Text>
      <Text variant="caption" tone="muted">
        {formatClock(row.endsAt)}
      </Text>
    </View>
  );

  const rail = (
    <View style={styles.rail} importantForAccessibility="no-hide-descendants">
      {!isLast ? <View style={[styles.railLine, { backgroundColor: colors.border }]} /> : null}
      <View style={[styles.dot, { backgroundColor: dotColor, borderColor: colors.background }]} />
    </View>
  );

  let body: ReactNode;
  if (thin) {
    const minutes = row.endMin - row.startMin;
    body = (
      <View style={styles.thin}>
        <Icon name={row.kind === 'BREAK' ? 'cafe-outline' : 'flag-outline'} size={16} color={colors.faint} />
        <Text variant="small" tone="muted" numberOfLines={1} style={styles.flex}>
          {row.label} · {minutes} min
        </Text>
        {state === 'now' ? <Badge label="Now" tone="primary" /> : null}
      </View>
    );
  } else {
    const title = row.free ? 'Free period' : row.subject ?? row.label;
    const details = [row.divisionLabel, row.label, substitute ? null : row.teacher, row.room].filter(Boolean).join(' · ');
    const progress = state === 'now' && !cancelled ? Math.min(1, Math.max(0, (nowMin - row.startMin) / Math.max(1, row.endMin - row.startMin))) : null;
    body = (
      <View
        style={[
          styles.card,
          { backgroundColor: cardBackground, borderColor: cardBorder, padding: compact ? spacing.sm + 2 : spacing.md },
        ]}
      >
        <View style={styles.titleRow}>
          <Text
            variant="bodyStrong"
            tone={row.free || state === 'done' || cancelled ? 'muted' : 'strong'}
            style={[styles.flex, cancelled && { textDecorationLine: 'line-through' }]}
            numberOfLines={2}
          >
            {title}
          </Text>
          {cancelled ? <Badge label="Cancelled" tone="bad" /> : null}
          {covering && !cancelled ? <Badge label="Covering" tone="info" /> : null}
          {!cancelled && state === 'now' ? <Badge label="Now" tone="primary" /> : null}
          {!cancelled && state === 'next' ? <Badge label="Up next" tone="amber" /> : null}
          {!cancelled && state === 'done' ? <Icon name="checkmark-circle" size={18} color={colors.goodFill} /> : null}
        </View>
        {details ? (
          <Text variant="small" tone="muted" numberOfLines={2}>
            {details}
          </Text>
        ) : null}
        {substitute ? (
          <View style={styles.sub}>
            <Icon name="swap-horizontal" size={16} color={colors.info} />
            <Text variant="smallStrong" tone="info" numberOfLines={2} style={styles.flex}>
              {row.coveredByOther ? 'Covered by' : 'Substitute'}: {row.change?.substitute ?? row.teacher ?? 'another teacher'}
            </Text>
          </View>
        ) : null}
        {renderAction && !cancelled ? renderAction(row) : null}
        {progress !== null ? (
          <View style={{ gap: spacing.xs }}>
            <View
              style={[styles.track, { backgroundColor: colors.card }]}
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={`${row.subject ?? row.label}: ${minutesText(row.endMin - nowMin)} left`}
              accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
            >
              <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: colors.primary }]} />
            </View>
            <Text variant="caption" tone="muted">
              {minutesText(row.endMin - nowMin)} left
            </Text>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.itemWrap}>
      <View
        style={styles.item}
        accessible
        accessibilityLabel={rowLabel(row, state)}
        testID={`timeline-row-${state}`}
      >
        {left}
        {rail}
        <View style={styles.flex}>{body}</View>
      </View>
      {line ? (
        <View
          pointerEvents="none"
          testID="now-line"
          accessible
          accessibilityLabel={`Now, ${clockOfMinutes(nowMin)}`}
          style={[styles.overlay, { top: `${line.fraction * 100}%` }]}
        >
          <View style={[styles.chip, { width: TIME_COL - 6, backgroundColor: colors.amber }]}>
            <Text variant="caption" style={{ color: colors.amberInk, fontFamily: fontFamily.bodyBold }} numberOfLines={1}>
              {clockOfMinutes(nowMin)}
            </Text>
          </View>
          <View style={[styles.rule, { backgroundColor: colors.amber }]} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  none: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
  itemWrap: { position: 'relative' },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  rail: { width: 18, alignSelf: 'stretch', alignItems: 'center' },
  railLine: { position: 'absolute', top: 12, bottom: -10, width: 2, borderRadius: 1 },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 5, borderWidth: 2 },
  card: { borderRadius: radius.lg, borderWidth: 1, gap: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  thin: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 28, paddingVertical: 2 },
  sub: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  overlay: { position: 'absolute', left: 0, right: 0, height: 0, flexDirection: 'row', alignItems: 'center' },
  gap: { flexDirection: 'row', alignItems: 'center', height: 20 },
  chip: { height: 20, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  rule: { flex: 1, height: 2, borderRadius: 1, marginLeft: -2 },
});
