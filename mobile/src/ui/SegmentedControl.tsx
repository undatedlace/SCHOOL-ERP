import { Pressable, StyleSheet, View } from 'react-native';
import { MIN_TOUCH, radius, spacing, useTheme } from '@/theme';
import { Text } from './Text';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** A count shown next to the label ("To do 3"). */
  count?: number;
}

interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
}

/** Equal-width tabs in a pill, for switching a list between views (To do, Handed in, Marked). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: SegmentedControlProps<T>) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[styles.track, { backgroundColor: colors.accent }]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.count !== undefined ? `${option.label}, ${option.count}` : option.label}
            onPress={() => onChange(option.value)}
            style={[
              styles.segment,
              selected && { backgroundColor: colors.card, shadowColor: colors.shadow, shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
            ]}
          >
            <Text variant="smallStrong" tone={selected ? 'primary' : 'muted'} numberOfLines={1}>
              {option.label}
              {option.count !== undefined ? `  ${option.count}` : ''}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', padding: 4, borderRadius: radius.pill },
  segment: {
    flex: 1,
    minHeight: MIN_TOUCH - 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
  },
});
