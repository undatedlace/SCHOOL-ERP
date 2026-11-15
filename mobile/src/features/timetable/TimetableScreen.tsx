import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { errorMessage } from '@/api';
import { addDays, formatDay, minutesNowIST, startOfWeek, todayIST } from '@/lib/dates';
import { MIN_TOUCH, radius, spacing, useTheme } from '@/theme';
import { Badge, Card, EmptyState, ErrorState, Icon, Screen, SegmentedControl, Skeleton, Text } from '@/ui';
import { Timeline, noSchoolText } from './Timeline';
import { planDay, schoolIsOver } from './dayPlan';
import { useNow } from './useNow';
import { useClassWeek } from './useTimetable';

type Mode = 'day' | 'week';

const MODES = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
] as const;

const WEEKDAY_LETTERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "9 – 14 Nov 2026" for the week that starts on this Monday. */
function weekTitle(monday: string): string {
  const saturday = addDays(monday, 5);
  const [, m1] = monday.split('-');
  const [, m2] = saturday.split('-');
  const first = formatDay(monday, 'dayMonth');
  const last = formatDay(saturday, 'medium');
  return m1 === m2 ? `${first.split(' ')[0]} – ${last}` : `${first} – ${last}`;
}

/** The Timetable tab: a Day or Week view of the class timetable, with the live now line on today. */
export function TimetableScreen() {
  const now = useNow();
  const today = todayIST(now);
  const nowMin = minutesNowIST(now);
  const [mode, setMode] = useState<Mode>('day');
  const [date, setDate] = useState<string | null>(null);
  const selected = date ?? today;
  const monday = startOfWeek(selected);
  const { week, isLoading, isError, error, noClass, refetch, isFetching } = useClassWeek(monday);

  return (
    <Screen onRefresh={() => void refetch()} refreshing={isFetching && !isLoading}>
      <SegmentedControl accessibilityLabel="Timetable view" options={MODES} value={mode} onChange={setMode} />

      {mode === 'day' ? (
        <DayControls monday={monday} selected={selected} today={today} onSelect={setDate} />
      ) : (
        <WeekControls monday={monday} today={today} onSelect={setDate} />
      )}

      {isLoading ? (
        <TimetableSkeleton />
      ) : isError && !week ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} retrying={isFetching} />
      ) : noClass ? (
        <EmptyState icon="school-outline" title="No class this year" description="Your timetable will show here once you are in a class." />
      ) : week && !week.schedule ? (
        <EmptyState
          icon="calendar-outline"
          title="No timetable yet"
          description="The school has not set up the timetable for your class."
        />
      ) : mode === 'day' ? (
        <DayView week={week ?? null} date={selected} today={today} nowMin={nowMin} />
      ) : (
        <WeekView week={week ?? null} monday={monday} today={today} nowMin={nowMin} />
      )}
    </Screen>
  );
}

function DayControls({
  monday,
  selected,
  today,
  onSelect,
}: {
  monday: string;
  selected: string;
  today: string;
  onSelect: (day: string | null) => void;
}) {
  const { colors } = useTheme();
  const pick = (day: string) => onSelect(day === today ? null : day);
  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.dayNav}>
        <RoundButton icon="chevron-back" label="Previous day" onPress={() => pick(addDays(selected, -1))} />
        <View style={styles.dayTitle} accessibilityLiveRegion="polite">
          <Text variant="heading" align="center" numberOfLines={1} adjustsFontSizeToFit>
            {formatDay(selected, 'weekday')}
          </Text>
          {selected === today ? (
            <Badge label="Today" tone="primary" />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go to today"
              onPress={() => onSelect(null)}
              hitSlop={8}
              style={styles.todayLink}
            >
              <Text variant="smallStrong" tone="primary">
                Back to today
              </Text>
            </Pressable>
          )}
        </View>
        <RoundButton icon="chevron-forward" label="Next day" onPress={() => pick(addDays(selected, 1))} />
      </View>

      <View style={styles.strip} accessibilityRole="tablist" accessibilityLabel="Choose a day">
        {WEEKDAY_LETTERS.map((name, i) => {
          const day = addDays(monday, i);
          const isSelected = day === selected;
          const isToday = day === today;
          return (
            <Pressable
              key={day}
              accessibilityRole="tab"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${formatDay(day, 'weekday')}${isToday ? ', today' : ''}`}
              onPress={() => pick(day)}
              style={[
                styles.stripDay,
                {
                  backgroundColor: isSelected ? colors.primary : colors.card,
                  borderColor: isSelected ? colors.primary : colors.border,
                },
              ]}
            >
              <Text variant="caption" style={{ color: isSelected ? colors.primaryForeground : colors.mutedForeground }}>
                {name}
              </Text>
              <Text variant="bodyStrong" style={{ color: isSelected ? colors.primaryForeground : colors.foreground }}>
                {Number(day.slice(8))}
              </Text>
              <View style={[styles.todayDot, { backgroundColor: isToday ? (isSelected ? colors.primaryForeground : colors.amber) : 'transparent' }]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function WeekControls({ monday, today, onSelect }: { monday: string; today: string; onSelect: (day: string | null) => void }) {
  const thisMonday = startOfWeek(today);
  const go = (to: string) => onSelect(to === thisMonday ? null : to);
  return (
    <View style={styles.dayNav}>
      <RoundButton icon="chevron-back" label="Previous week" onPress={() => go(addDays(monday, -7))} />
      <View style={styles.dayTitle} accessibilityLiveRegion="polite">
        <Text variant="heading" align="center" numberOfLines={1} adjustsFontSizeToFit>
          {weekTitle(monday)}
        </Text>
        {monday === thisMonday ? (
          <Badge label="This week" tone="primary" />
        ) : (
          <Pressable accessibilityRole="button" onPress={() => onSelect(null)} hitSlop={8} style={styles.todayLink}>
            <Text variant="smallStrong" tone="primary">
              Back to this week
            </Text>
          </Pressable>
        )}
      </View>
      <RoundButton icon="chevron-forward" label="Next week" onPress={() => go(addDays(monday, 7))} />
    </View>
  );
}

function RoundButton({ icon, label, onPress }: { icon: 'chevron-back' | 'chevron-forward'; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.round,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && { backgroundColor: colors.accent },
      ]}
    >
      <Icon name={icon} size={22} color={colors.primary} />
    </Pressable>
  );
}

function DayView({ week, date, today, nowMin }: { week: Parameters<typeof planDay>[0]; date: string; today: string; nowMin: number }) {
  const { colors } = useTheme();
  const plan = planDay(week, date);
  const over = schoolIsOver(plan.rows, date, today, nowMin);
  return (
    <Card>
      {plan.status === 'school' ? (
        <View style={{ gap: spacing.md }}>
          {over ? (
            <View style={styles.over} accessible accessibilityLabel="School is over for today">
              <Icon name="checkmark-done" size={18} color={colors.good} />
              <Text variant="smallStrong" tone="good">
                School is over for today
              </Text>
            </View>
          ) : null}
          <Timeline plan={plan} today={today} nowMin={nowMin} />
        </View>
      ) : (
        <Timeline plan={plan} today={today} nowMin={nowMin} />
      )}
    </Card>
  );
}

function WeekView({ week, monday, today, nowMin }: { week: Parameters<typeof planDay>[0]; monday: string; today: string; nowMin: number }) {
  const { colors } = useTheme();
  const days = [0, 1, 2, 3, 4, 5].map((i) => addDays(monday, i));
  return (
    <View style={{ gap: spacing.md }}>
      {days.map((day) => {
        const plan = planDay(week, day);
        const isToday = day === today;
        return (
          <Card
            key={day}
            padding={spacing.md}
            style={[{ gap: spacing.sm }, isToday && { borderColor: colors.primary, borderWidth: 2 }]}
            accessibilityLabel={`${formatDay(day, 'weekday')}${isToday ? ', today' : ''}`}
          >
            <View style={styles.weekHead}>
              <Text variant="subheading" style={styles.flex}>
                {formatDay(day, 'short')}
              </Text>
              {isToday ? <Badge label="Today" tone="primary" /> : null}
              {plan.status === 'holiday' ? <Badge label={plan.holiday ?? 'Holiday'} tone="amber" /> : null}
              {plan.status === 'no-lessons' ? <Badge label="No lessons" tone="neutral" /> : null}
            </View>
            {plan.status === 'school' ? (
              <Timeline plan={plan} today={today} nowMin={nowMin} compact />
            ) : (
              <Text variant="small" tone="muted">
                {noSchoolText(plan).detail}
              </Text>
            )}
          </Card>
        );
      })}
    </View>
  );
}

function TimetableSkeleton() {
  return (
    <Card style={{ gap: spacing.md }}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={{ flexDirection: 'row', gap: spacing.md }}>
          <Skeleton width={56} height={36} />
          <Skeleton height={64} rounded={radius.lg} style={{ flex: 1 }} />
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  dayNav: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dayTitle: { flex: 1, alignItems: 'center', gap: spacing.xs },
  todayLink: { minHeight: 28, justifyContent: 'center' },
  round: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: MIN_TOUCH / 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  strip: { flexDirection: 'row', gap: spacing.xs },
  stripDay: {
    flex: 1,
    minHeight: 62,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  todayDot: { width: 5, height: 5, borderRadius: 3 },
  weekHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  over: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
