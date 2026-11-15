import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useApiQuery } from '@/api';
import { formatDay, todayIST } from '@/lib/dates';
import { MIN_TOUCH, radius, spacing, useTheme, type ColorTokens } from '@/theme';
import { Badge, Card, EmptyState, ErrorState, Icon, Screen, SegmentedControl, Skeleton, Text } from '@/ui';
import {
  addMonths,
  categoriesByDay,
  CATEGORY_LABEL,
  CATEGORY_TONE,
  dateSpanText,
  eventsOnDay,
  firstOfMonth,
  gridRange,
  groupByStartDay,
  lastOfMonth,
  monthOf,
  monthTitle,
  monthWeeks,
  timeText,
  WEEKDAY_LETTERS,
  WEEKDAY_NAMES,
  type YearMonth,
} from './calendar-rules';
import type { CalendarCategory, CalendarEvent } from './types';

function dotColor(colors: ColorTokens, category: CalendarCategory): string {
  switch (category) {
    case 'HOLIDAY':
      return colors.good;
    case 'EXAM':
      return colors.warn;
    case 'MEETING':
      return colors.info;
    default:
      return colors.primary;
  }
}

/** The school calendar: a month grid with dots on days that have something, and an agenda below. */
export function CalendarScreen() {
  const { colors } = useTheme();
  const today = todayIST();
  const [month, setMonth] = useState<YearMonth>(monthOf(today));
  const [selected, setSelected] = useState(today);
  const [agenda, setAgenda] = useState<'day' | 'month'>('day');

  const range = useMemo(() => gridRange(month), [month]);
  const weeks = useMemo(() => monthWeeks(month), [month]);
  const query = useApiQuery<CalendarEvent[]>('/calendar', { query: range, staleTime: 60_000 });
  const events = query.data ?? [];
  const dots = useMemo(() => categoriesByDay(events, range.from, range.to), [events, range]);

  const goTo = (next: YearMonth) => {
    setMonth(next);
    const first = firstOfMonth(next);
    setSelected(monthOf(today).year === next.year && monthOf(today).month === next.month ? today : first);
  };

  const monthFirst = firstOfMonth(month);
  const monthLast = lastOfMonth(month);
  const dayEvents = eventsOnDay(events, selected);
  const monthGroups = groupByStartDay(events, monthFirst, monthLast);

  return (
    <Screen onRefresh={() => void query.refetch()} refreshing={query.isRefetching && !query.isLoading}>
      <Card style={styles.card} testID="calendar-card">
        <View style={styles.nav}>
          <NavButton icon="chevron-back" label="Previous month" onPress={() => goTo(addMonths(month, -1))} />
          <View style={styles.navTitle}>
            <Text variant="heading" align="center" accessibilityLiveRegion="polite">
              {monthTitle(month)}
            </Text>
          </View>
          <NavButton icon="chevron-forward" label="Next month" onPress={() => goTo(addMonths(month, 1))} />
        </View>
        {monthFirst.slice(0, 7) !== today.slice(0, 7) ? (
          <Pressable onPress={() => goTo(monthOf(today))} accessibilityRole="button" style={styles.todayLink}>
            <Text variant="smallStrong" tone="primary">
              Back to today
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.week} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {WEEKDAY_LETTERS.map((letter, i) => (
            <Text key={WEEKDAY_NAMES[i]} variant="caption" tone="muted" align="center" style={styles.cell}>
              {letter}
            </Text>
          ))}
        </View>
        {weeks.map((week) => (
          <View key={week[0]} style={styles.week}>
            {week.map((day) => {
              const inMonth = day >= monthFirst && day <= monthLast;
              const isToday = day === today;
              const isSelected = day === selected;
              const kinds = dots.get(day) ?? [];
              const count = events.filter((e) => e.startsOn <= day && day <= e.endsOn).length;
              return (
                <Pressable
                  key={day}
                  onPress={() => {
                    setSelected(day);
                    if (!inMonth) setMonth(monthOf(day));
                    setAgenda('day');
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${formatDay(day, 'weekday')}${isToday ? ', today' : ''}${count ? `, ${count} ${count === 1 ? 'event' : 'events'}` : ''}`}
                  style={styles.cell}
                  testID={`day-${day}`}
                >
                  <View
                    style={[
                      styles.day,
                      isSelected && { backgroundColor: colors.primary },
                      !isSelected && isToday && { borderWidth: 1.5, borderColor: colors.primary },
                    ]}
                  >
                    <Text
                      variant="smallStrong"
                      style={{
                        color: isSelected ? colors.primaryForeground : inMonth ? colors.foreground : colors.faint,
                      }}
                    >
                      {Number(day.slice(8, 10))}
                    </Text>
                  </View>
                  <View style={styles.dots}>
                    {kinds.slice(0, 3).map((k) => (
                      <View key={k} style={[styles.dot, { backgroundColor: dotColor(colors, k) }]} />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
        <View style={styles.legend}>
          {(Object.keys(CATEGORY_LABEL) as CalendarCategory[]).map((k) => (
            <View key={k} style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: dotColor(colors, k) }]} />
              <Text variant="caption" tone="muted">
                {CATEGORY_LABEL[k]}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      <SegmentedControl
        accessibilityLabel="Agenda"
        value={agenda}
        onChange={setAgenda}
        options={[
          { value: 'day', label: formatDay(selected, 'dayMonth') },
          { value: 'month', label: `All of ${monthTitle(month).split(' ')[0]}` },
        ]}
      />

      {query.isLoading ? (
        <View style={styles.list}>
          <Skeleton height={72} rounded={22} />
          <Skeleton height={72} rounded={22} />
        </View>
      ) : query.isError ? (
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} retrying={query.isRefetching} />
      ) : agenda === 'day' ? (
        dayEvents.length === 0 ? (
          <EmptyState icon="calendar-clear-outline" title="Nothing on this day" description={formatDay(selected, 'weekday')} />
        ) : (
          <View style={styles.list}>
            <Text variant="subheading">{formatDay(selected, 'weekday')}</Text>
            {dayEvents.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </View>
        )
      ) : monthGroups.length === 0 ? (
        <EmptyState icon="calendar-clear-outline" title="Nothing this month" description={monthTitle(month)} />
      ) : (
        <View style={styles.list}>
          {monthGroups.map((g) => (
            <View key={g.day} style={styles.list}>
              <Text variant="subheading">{formatDay(g.day, 'weekday')}</Text>
              {g.events.map((e) => (
                <EventCard key={e.id} event={e} />
              ))}
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

function NavButton({ icon, label, onPress }: { icon: 'chevron-back' | 'chevron-forward'; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.navButton, { backgroundColor: colors.accent }]}
    >
      <Icon name={icon} size={20} color={colors.foreground2} />
    </Pressable>
  );
}

function EventCard({ event: e }: { event: CalendarEvent }) {
  const { colors } = useTheme();
  return (
    <Card style={styles.event} testID={`event-${e.id}`}>
      <View style={[styles.eventBar, { backgroundColor: dotColor(colors, e.category) }]} />
      <View style={styles.eventBody}>
        <Badge label={CATEGORY_LABEL[e.category]} tone={CATEGORY_TONE[e.category]} />
        <Text variant="bodyStrong">{e.title}</Text>
        <Text variant="small" tone="muted">
          {timeText(e)}
          {e.startsOn !== e.endsOn ? ` · ${dateSpanText(e)}` : ''}
        </Text>
        {e.description ? (
          <Text variant="small" tone="muted">
            {e.description}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs },
  nav: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  navTitle: { flex: 1 },
  navButton: { width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  todayLink: { alignSelf: 'center', minHeight: MIN_TOUCH - 8, justifyContent: 'center' },
  week: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', minHeight: MIN_TOUCH + 6, paddingVertical: 2 },
  day: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 3, height: 6, marginTop: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.lg, marginTop: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  list: { gap: spacing.md },
  event: { flexDirection: 'row', gap: spacing.md, padding: 0, overflow: 'hidden' },
  eventBar: { width: 6 },
  eventBody: { flex: 1, gap: spacing.xs, padding: spacing.lg },
});
