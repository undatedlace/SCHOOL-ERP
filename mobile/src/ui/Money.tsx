import { formatPaise, formatRupees, parsePaise, type FormatMoneyOptions } from '@/lib/money';
import { Text, type TextProps } from './Text';

interface MoneyProps extends Omit<TextProps, 'children'>, FormatMoneyOptions {
  /** Rupees as the API sends them: "1500.00". */
  amount?: string | null;
  /** Or whole paise: 150000. */
  paise?: number | string | null;
}

/** Rupees with Indian digit grouping: ₹1,23,456.50. No floating-point maths. */
export function Money({ amount, paise, fixed, plain, ...text }: MoneyProps) {
  const fromPaise = paise !== undefined && paise !== null ? parsePaise(paise) : null;
  const label =
    fromPaise !== null
      ? formatPaise(fromPaise, { fixed, plain })
      : formatRupees(amount, { fixed, plain });
  return <Text {...text}>{label}</Text>;
}
