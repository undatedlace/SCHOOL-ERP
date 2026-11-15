import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import {
  MAX_FONT_SCALE,
  typeScale,
  useTheme,
  type ColorTokens,
  type TextVariant,
} from '@/theme';

export type TextTone =
  | 'default'
  | 'strong'
  | 'muted'
  | 'faint'
  | 'primary'
  | 'onPrimary'
  | 'good'
  | 'warn'
  | 'bad'
  | 'info'
  | 'amber';

export function toneColor(colors: ColorTokens, tone: TextTone): string {
  switch (tone) {
    case 'strong':
      return colors.foreground;
    case 'muted':
      return colors.mutedForeground;
    case 'faint':
      return colors.faint;
    case 'primary':
      return colors.primary;
    case 'onPrimary':
      return colors.primaryForeground;
    case 'good':
      return colors.good;
    case 'warn':
      return colors.warn;
    case 'bad':
      return colors.bad;
    case 'info':
      return colors.info;
    case 'amber':
      return colors.amberInk;
    default:
      return colors.foreground2;
  }
}

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: TextTone;
  align?: 'left' | 'center' | 'right';
}

/**
 * The app's text. Headings are Nunito, the rest Figtree. Text grows with the phone's font size
 * setting (up to MAX_FONT_SCALE), so never give a Text a fixed height.
 */
export function Text({
  variant = 'body',
  tone = 'strong',
  align,
  style,
  maxFontSizeMultiplier = MAX_FONT_SCALE,
  ...props
}: TextProps) {
  const { colors } = useTheme();
  const isHeading =
    variant === 'display' || variant === 'title' || variant === 'heading' || variant === 'subheading';
  return (
    <RNText
      accessibilityRole={isHeading ? 'header' : props.accessibilityRole}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      {...props}
      style={[
        typeScale[variant],
        { color: toneColor(colors, tone) },
        align ? { textAlign: align } : null,
        style,
      ]}
    />
  );
}
