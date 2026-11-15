import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { formatDay, todayIST, weekdayOf } from '@/lib/dates';
import { MIN_TOUCH, radius, spacing, useTheme } from '@/theme';
import { Icon, Sheet, Text } from '@/ui';
import { monthCells, shiftMonth } from './logic';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const HEADINGS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface Props {
  label: string;
  /** "YYYY-MM-DD", or null when nothing is chosen. */
  value: string | null;
  onChange: (day: string) => void;
  /** The first and last day that can be chosen. */
  min: string;
  max: string;
  placeholder?: string;
  error?: string | null;
  testID?: string;
}

/** A labelled date box that opens a month calendar in a sheet. No packages: built from the UI kit. */
export function DateField({ label, value, onChange, min, max, placeholder = 'Choose a day', error, testID }: Props) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.wrap}>
      <Text variant="smallStrong" tone="default">
        {label}
      </Text>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ? formatDay(value, 'weekday') : 'not chosen'}. Tap to choose`}
        testID={testID}
        style={[
          styles.box,
          { backgroundColor: colors.card, borderColor: error ? colors.bad : colors.borderStrong, borderWidth: error ? 2 : 1 },
        ]}
      >
        <Icon name="calendar-outline" size={20} color={colors.primary} />
        <Text variant="body" tone={value ? 'strong' : 'faint'} style={styles.value}>
          {value ? formatDay(value, 'weekday') : placeholder}
        </Text>
        <Icon name="chevron-down" size={18} color={colors.faint} />
      </Pressable>
      {error ? (
        <Text variant="small" tone="bad" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        <MonthPicker
          value={value}
          min={min}
          max={max}
          onPick={(day) => {
            onChange(day);
            setOpen(false);
          }}
        />
      </Sheet>
    </View>
  );
}

function MonthPicker({
  value,
  min,
  max,
  onPick,
}: {
  value: string | null;
  min: string;
  max: string;
  onPick: (day: string) => void;
}) {
  const { colors } = useTheme();
  const today = todayIST();
  const start = value ?? min;
  const [view, setView] = useState({ year: Number(start.slice(0, 4)), month: Number(start.slice(5, 7)) });

  useEffect(() => {
    const anchor = value ?? min;
    setView({ year: Number(anchor.slice(0, 4)), month: Number(anchor.slice(5, 7)) });
  }, [value, min]);

  const minIndex = Number(min.slice(0, 4)) * 12 + Number(min.slice(5, 7));
  const maxIndex = Number(max.slice(0, 4)) * 12 + Number(max.slice(5, 7));
  const viewIndex = view.year * 12 + view.month;
  const weeks = monthCells(view.year, view.month);

  return (
    <View style={styles.picker}>
      <View style={styles.monthRow}>
        <Pressable
          onPress={() => setView((v) => shiftMonth(v.year, v.month, -1))}
          disabled={viewIndex <= minIndex}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          style={[styles.nav, { opacity: viewIndex <= minIndex ? 0.3 : 1 }]}
        >
          <Icon name="chevron-back" size={22} color={colors.primary} />
        </Pressable>
        <Text variant="subheading" style={styles.monthTitle} accessibilityLiveRegion="polite">
          {MONTHS[view.month - 1]} {view.year}
        </Text>
        <Pressable
          onPress={() => setView((v) => shiftMonth(v.year, v.month, 1))}
          disabled={viewIndex >= maxIndex}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          style={[styles.nav, { opacity: viewIndex >= maxIndex ? 0.3 : 1 }]}
        >
          <Icon name="chevron-forward" size={22} color={colors.primary} />
        </Pressable>
      </View>
      <View style={styles.week}>
        {HEADINGS.map((h) => (
          <View key={h} style={styles.cell}>
            <Text variant="caption" tone="muted">
              {h}
            </Text>
          </View>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={styles.week}>
          {week.map((day, di) => {
            if (!day) return <View key={di} style={styles.cell} />;
            const disabled = day < min || day > max;
            const selected = day === value;
            const sunday = weekdayOf(day) === 0;
            return (
              <View key={day} style={styles.cell}>
                <Pressable
                  onPress={() => onPick(day)}
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityLabel={`${formatDay(day, 'weekday')}${day === today ? ', today' : ''}${sunday ? ', Sunday, not counted' : ''}`}
                  accessibilityState={{ disabled, selected }}
                  testID={`day-${day}`}
                  style={[
                    styles.day,
                    selected && { backgroundColor: colors.primary },
                    !selected && day === today && { borderColor: colors.primary, borderWidth: 1.5 },
                  ]}
                >
                  <Text
                    variant="smallStrong"
                    style={{
                      color: selected
                        ? colors.primaryForeground
                        : disabled
                          ? colors.faint
                          : sunday
                            ? colors.mutedForeground
                            : colors.foreground,
                    }}
                  >
                    {Number(day.slice(8, 10))}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}
      <Text variant="caption" tone="muted">
        Sundays and school holidays are not counted as days away.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 50,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  value: { flex: 1 },
  picker: { gap: spacing.xs },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  monthTitle: { flex: 1, textAlign: 'center' },
  nav: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  week: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: MIN_TOUCH },
  day: {
    width: MIN_TOUCH - 2,
    height: MIN_TOUCH - 2,
    borderRadius: (MIN_TOUCH - 2) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
