import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useTheme } from '@/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

interface IconProps {
  name: IconName;
  size?: number;
  /** A colour token name from the theme, or any colour string. */
  color?: string;
}

/** Decorative by default (screen readers skip it); put the meaning in a label next to it. */
export function Icon({ name, size = 22, color }: IconProps) {
  const { colors } = useTheme();
  return (
    <Ionicons
      name={name}
      size={size}
      color={color ?? colors.foreground2}
      accessible={false}
      importantForAccessibility="no"
    />
  );
}
