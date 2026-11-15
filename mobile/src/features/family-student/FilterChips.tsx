import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { MIN_TOUCH, radius, spacing, useTheme } from '@/theme';
import { Text } from '@/ui';

export interface Chip {
  value: string;
  label: string;
}

/** A sideways row of pills for narrowing a list (a subject filter). One is always chosen. */
export function FilterChips({
  chips,
  value,
  onChange,
  accessibilityLabel,
}: {
  chips: readonly Chip[];
  value: string;
  onChange: (value: string) => void;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={accessibilityLabel}
      contentContainerStyle={styles.row}
      style={styles.scroll}
    >
      {chips.map((chip) => {
        const selected = chip.value === value;
        return (
          <Pressable
            key={chip.value}
            onPress={() => onChange(chip.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={chip.label}
            style={[
              styles.chip,
              {
                backgroundColor: selected ? colors.primary : colors.card,
                borderColor: selected ? colors.primary : colors.borderStrong,
              },
            ]}
          >
            <Text variant="smallStrong" style={{ color: selected ? colors.primaryForeground : colors.foreground2 }}>
              {chip.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, marginHorizontal: -spacing.lg },
  row: { gap: spacing.sm, paddingHorizontal: spacing.lg },
  chip: {
    minHeight: MIN_TOUCH - 4,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
