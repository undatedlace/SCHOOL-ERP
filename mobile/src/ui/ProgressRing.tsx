import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '@/theme';
import { Text } from './Text';

interface ProgressRingProps {
  /** 0 to 100. */
  value: number;
  size?: number;
  strokeWidth?: number;
  /** The big text in the middle. Default: the value as a percentage. */
  centerLabel?: string;
  /** A small line under it ("attendance"). */
  caption?: string;
  tone?: 'primary' | 'good' | 'warn' | 'bad';
  /** What a screen reader says. Default: built from the caption and the value. */
  accessibilityLabel?: string;
}

/** A ring showing a percentage, with the number written in the middle. */
export function ProgressRing({
  value,
  size = 120,
  strokeWidth = 12,
  centerLabel,
  caption,
  tone = 'primary',
  accessibilityLabel,
}: ProgressRingProps) {
  const { colors } = useTheme();
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const color = { primary: colors.primary, good: colors.goodFill, warn: colors.amber, bad: colors.badFill }[tone];
  const rounded = Math.round(clamped);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? `${caption ?? 'Progress'}: ${rounded} percent`}
      accessibilityValue={{ min: 0, max: 100, now: rounded }}
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.accent} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        <Text variant="title" maxFontSizeMultiplier={1.2} style={{ fontSize: Math.round(size * 0.22), lineHeight: Math.round(size * 0.28) }}>
          {centerLabel ?? `${rounded}%`}
        </Text>
        {caption ? (
          <Text variant="caption" tone="muted" maxFontSizeMultiplier={1.2}>
            {caption}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
