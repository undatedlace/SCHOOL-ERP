import { View } from 'react-native';
import { spacing, radius, useTheme } from '@/theme';
import { Badge, Card, Icon, Screen, Text, type IconName } from '@/ui';

interface ComingSoonProps {
  title: string;
  /** One sentence on what this screen is for. */
  description: string;
  icon: IconName;
  /** What will be here, as short lines. */
  willShow?: string[];
}

/**
 * A placeholder screen built from the UI kit. A feature replaces the body of its own route file
 * with the real screen and deletes the use of this component.
 */
export function ComingSoon({ title, description, icon, willShow = [] }: ComingSoonProps) {
  const { colors } = useTheme();
  return (
    <Screen>
      <Text variant="title">{title}</Text>
      <Card style={{ gap: spacing.md }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: radius.xl,
            backgroundColor: colors.primarySoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={icon} size={28} color={colors.primary} />
        </View>
        <Badge label="Coming soon" tone="amber" />
        <Text variant="body" tone="muted">
          {description}
        </Text>
        {willShow.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            {willShow.map((line) => (
              <View key={line} style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
                <Icon name="checkmark-circle-outline" size={20} color={colors.primary} />
                <Text variant="small" tone="default" style={{ flex: 1 }}>
                  {line}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </Card>
    </Screen>
  );
}
