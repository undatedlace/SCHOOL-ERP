import { StyleSheet, View } from 'react-native';
import { radius, spacing, useTheme } from '@/theme';
import { Card } from './Card';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

interface StatTileProps {
  label: string;
  value: string;
  /** A short line under the value ("of 120 days"). */
  hint?: string;
  icon?: IconName;
  tone?: 'default' | 'good' | 'warn' | 'bad' | 'info' | 'amber';
  onPress?: () => void;
}

/** A small number tile: label, value, optional hint. */
export function StatTile({ label, value, hint, icon, tone = 'default', onPress }: StatTileProps) {
  const { colors } = useTheme();
  const accent = {
    default: { bg: colors.primarySoft, fg: colors.primary },
    good: { bg: colors.goodSoft, fg: colors.good },
    warn: { bg: colors.warnSoft, fg: colors.warn },
    bad: { bg: colors.badSoft, fg: colors.bad },
    info: { bg: colors.infoSoft, fg: colors.info },
    amber: { bg: colors.amberSoft, fg: colors.amberInk },
  }[tone];

  return (
    <Card
      onPress={onPress}
      padding={spacing.md}
      style={styles.card}
      accessibilityLabel={`${label}: ${value}${hint ? `, ${hint}` : ''}`}
    >
      <View style={styles.top}>
        {icon ? (
          <View style={[styles.icon, { backgroundColor: accent.bg }]}>
            <Icon name={icon} size={18} color={accent.fg} />
          </View>
        ) : null}
        <Text variant="caption" tone="muted" style={styles.label} numberOfLines={2}>
          {label}
        </Text>
      </View>
      <Text variant="title" style={{ color: tone === 'default' ? colors.foreground : accent.fg }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {hint ? (
        <Text variant="caption" tone="muted" numberOfLines={2}>
          {hint}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, gap: spacing.xs, minWidth: 130 },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  icon: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { flex: 1 },
});
