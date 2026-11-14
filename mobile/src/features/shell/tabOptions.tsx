import type { BottomTabNavigationOptions } from 'expo-router/js-tabs';
import { MIN_TOUCH, fontFamily, type Theme } from '@/theme';
import { Icon, type IconName } from '@/ui';
import { AppHeader, type RoleBase } from './AppHeader';

export interface TabDef {
  title: string;
  icon: IconName;
  iconFocused: IconName;
}

/**
 * Options shared by both bottom tab bars. A layout lists its tabs in one map and passes
 * `screenOptions={({ route }) => tabScreenOptions(route.name, TABS, 'family', theme)}`.
 */
export function tabScreenOptions(
  routeName: string,
  defs: Record<string, TabDef>,
  base: RoleBase,
  theme: Theme,
): BottomTabNavigationOptions {
  const { colors } = theme;
  const def = defs[routeName];
  return {
    title: def?.title ?? routeName,
    header: () => <AppHeader base={base} />,
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.mutedForeground,
    tabBarLabelStyle: { fontFamily: fontFamily.bodySemi, fontSize: 11 },
    tabBarStyle: {
      backgroundColor: colors.card,
      borderTopColor: colors.border,
      minHeight: MIN_TOUCH + 12,
    },
    tabBarIcon: ({ focused, color, size }) => (
      <Icon name={def ? (focused ? def.iconFocused : def.icon) : 'ellipse'} size={size} color={typeof color === 'string' ? color : undefined} />
    ),
    sceneStyle: { backgroundColor: colors.background },
  };
}
