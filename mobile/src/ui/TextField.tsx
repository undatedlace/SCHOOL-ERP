import { forwardRef, useState, type ElementRef } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { MAX_FONT_SCALE, MIN_TOUCH, fontFamily, radius, spacing, useTheme } from '@/theme';
import { Icon } from './Icon';
import { Text } from './Text';

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | null;
  hint?: string;
  /** A password box: hidden, with a show/hide button. */
  secure?: boolean;
}

export type TextInputHandle = ElementRef<typeof TextInput>;

/** A labelled text box. The label is always visible (no placeholder-only fields). */
export const TextField = forwardRef<TextInputHandle, TextFieldProps>(function TextField(
  { label, error, hint, secure = false, onFocus, onBlur, ...input },
  ref,
) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const hidden = secure && !revealed;

  return (
    <View style={styles.wrap}>
      <Text variant="smallStrong" tone="default">
        {label}
      </Text>
      <View
        style={[
          styles.box,
          {
            backgroundColor: colors.card,
            borderColor: error ? colors.bad : focused ? colors.ring : colors.borderStrong,
            borderWidth: focused || error ? 2 : 1,
          },
        ]}
      >
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={hint}
          placeholderTextColor={colors.faint}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          selectionColor={colors.primary}
          secureTextEntry={hidden}
          autoCapitalize="none"
          autoCorrect={false}
          {...input}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, { color: colors.foreground, fontFamily: fontFamily.body }]}
        />
        {secure ? (
          <Pressable
            onPress={() => setRevealed((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            hitSlop={8}
            style={styles.eye}
          >
            <Icon name={revealed ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
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
});

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    minHeight: 50,
    paddingHorizontal: spacing.md,
  },
  input: { flex: 1, fontSize: 16, minHeight: MIN_TOUCH, paddingVertical: spacing.sm },
  eye: { minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
});
