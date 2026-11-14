import { Pressable, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { radius, spacing, useTheme } from '@/theme';

interface CardProps extends ViewProps {
  /** Padding inside the card. Default: lg. Use 0 for lists that run edge to edge. */
  padding?: number;
  tone?: 'default' | 'soft' | 'amber' | 'flat';
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** A rounded white card with a hairline edge and a soft lift (as on the web). */
export function Card({
  padding = spacing.lg,
  tone = 'default',
  onPress,
  style,
  children,
  ...props
}: CardProps) {
  const { colors, scheme } = useTheme();
  const background =
    tone === 'soft' ? colors.primarySoft : tone === 'amber' ? colors.amberSoft : colors.card;
  const base: ViewStyle = {
    backgroundColor: background,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tone === 'default' ? colors.border : 'transparent',
    padding,
    ...(tone === 'default'
      ? {
          shadowColor: colors.shadow,
          shadowOpacity: scheme === 'dark' ? 0.4 : 0.06,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 3 },
          elevation: scheme === 'dark' ? 0 : 2,
        }
      : null),
  };
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [base, pressed && { opacity: 0.85 }, style]}
        {...props}
      >
        {children}
      </Pressable>
    );
  }
  return (
    <View style={[base, style]} {...props}>
      {children}
    </View>
  );
}
