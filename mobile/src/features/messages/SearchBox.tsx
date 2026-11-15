import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { MAX_FONT_SCALE, MIN_TOUCH, fontFamily, radius, spacing, useTheme } from '@/theme';
import { Icon } from '@/ui';

/** The value, but only after it has stopped changing for `delayMs`. */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return settled;
}

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  label?: string;
}

/** A compact search box with a clear button. */
export function SearchBox({ value, onChangeText, placeholder = 'Search messages', label = 'Search messages' }: Props) {
  const { colors } = useTheme();
  return (
    <View style={[styles.box, { backgroundColor: colors.card, borderColor: colors.borderStrong }]}>
      <Icon name="search" size={18} color={colors.mutedForeground} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        accessibilityLabel={label}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        selectionColor={colors.primary}
        style={[styles.input, { color: colors.foreground, fontFamily: fontFamily.body }]}
        testID="message-search"
      />
      {value ? (
        <Pressable
          onPress={() => onChangeText('')}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={8}
          style={styles.clear}
        >
          <Icon name="close-circle" size={20} color={colors.faint} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: MIN_TOUCH,
    paddingHorizontal: spacing.md,
  },
  input: { flex: 1, fontSize: 16, minHeight: MIN_TOUCH, paddingVertical: spacing.xs },
  clear: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});
