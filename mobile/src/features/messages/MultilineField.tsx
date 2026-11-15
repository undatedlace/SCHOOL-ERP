import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { MAX_FONT_SCALE, fontFamily, radius, spacing, useTheme } from '@/theme';
import { Text } from '@/ui';

interface Props extends Omit<TextInputProps, 'style' | 'multiline'> {
  label: string;
  error?: string | null;
  hint?: string;
  /** Height of the box when empty. Default 120. */
  minHeight?: number;
}

/** A labelled, tall text box (the UI kit's TextField is one line). Same look and the same rules. */
export function MultilineField({ label, error, hint, minHeight = 120, onFocus, onBlur, ...input }: Props) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text variant="smallStrong" tone="default">
        {label}
      </Text>
      <View
        style={[
          styles.box,
          {
            minHeight,
            backgroundColor: colors.card,
            borderColor: error ? colors.bad : focused ? colors.ring : colors.borderStrong,
            borderWidth: focused || error ? 2 : 1,
          },
        ]}
      >
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={hint}
          placeholderTextColor={colors.faint}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          selectionColor={colors.primary}
          textAlignVertical="top"
          {...input}
          multiline
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, { color: colors.foreground, fontFamily: fontFamily.body, minHeight: minHeight - 24 }]}
        />
      </View>
      {error ? (
        <Text variant="small" tone="bad" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  box: { borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  input: { fontSize: 16, paddingTop: spacing.xs, paddingBottom: spacing.xs },
});
