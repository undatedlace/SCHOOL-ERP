/**
 * Money in rupees, shown with Indian digit grouping (12,34,567.50).
 *
 * The API sends money as text with at most two decimals ("1500.00"). Amounts are turned into
 * whole **paise** (integers) by reading the text, never by floating-point arithmetic, so
 * nothing here can drift by a paisa. Same rule as the server (`api/src/modules/fees/ledger.ts`).
 */

/** A whole number of paise (100 paise = 1 rupee). Always a safe integer. */
export type Paise = number;

const DECIMAL = /^(\d{1,13})(?:\.(\d{1,2}))?$/;

/**
 * Reads a rupee amount written as text: "1500", "1,500.5", "₹ 1,23,456.50", "-250.00".
 * Returns paise, or null when the text is not a money amount (more than two decimals, letters, empty).
 */
export function parseRupees(input: string | null | undefined): Paise | null {
  if (typeof input !== 'string') return null;
  let text = input.replace(/[\s,₹]/g, '');
  if (text.startsWith('Rs.')) text = text.slice(3);
  let negative = false;
  if (text.startsWith('-') || text.startsWith('−')) {
    negative = true;
    text = text.slice(1);
  } else if (text.startsWith('+')) {
    text = text.slice(1);
  }
  const m = DECIMAL.exec(text);
  if (!m) return null;
  const rupees = Number(m[1]);
  const fraction = Number((m[2] ?? '').padEnd(2, '0'));
  const paise = rupees * 100 + fraction;
  if (!Number.isSafeInteger(paise)) return null;
  return negative && paise !== 0 ? -paise : paise;
}

/** Reads an amount already in paise, as an integer or a string of digits ("150000"). */
export function parsePaise(input: string | number | null | undefined): Paise | null {
  if (typeof input === 'number') {
    return Number.isSafeInteger(input) ? input : null;
  }
  if (typeof input === 'string' && /^-?\d{1,15}$/.test(input.trim())) {
    const n = Number(input.trim());
    return Number.isSafeInteger(n) ? n : null;
  }
  return null;
}

/** 1234567 -> "12,34,567" (last three digits, then pairs). */
export function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const head = digits.slice(0, -3);
  const tail = digits.slice(-3);
  return head.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + tail;
}

export interface FormatMoneyOptions {
  /** Always show two decimals ("₹1,500.00"). Default: paise are shown only when not zero. */
  fixed?: boolean;
  /** Leave out the rupee sign. */
  plain?: boolean;
}

/** Whole paise to text: 12345650 -> "₹1,23,456.50"; 150000 -> "₹1,500". Negative amounts get a leading minus. */
export function formatPaise(paise: Paise, options: FormatMoneyOptions = {}): string {
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const fraction = abs % 100;
  const rupees = (abs - fraction) / 100;
  let text = groupIndian(String(rupees));
  if (options.fixed || fraction !== 0) {
    text += '.' + String(fraction).padStart(2, '0');
  }
  return (negative ? '-' : '') + (options.plain ? '' : '₹') + text;
}

/** An API amount ("1500.00") to display text. Returns an en dash when it cannot be read. */
export function formatRupees(
  amount: string | null | undefined,
  options: FormatMoneyOptions = {},
): string {
  const paise = parseRupees(amount);
  return paise === null ? '–' : formatPaise(paise, options);
}

/** Paise to the text the API expects: 150050 -> "1500.50". */
export function paiseToRupeesText(paise: Paise): string {
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const fraction = abs % 100;
  return `${negative ? '-' : ''}${(abs - fraction) / 100}.${String(fraction).padStart(2, '0')}`;
}

/** Adds API amounts without touching floating point. Unreadable amounts count as zero. */
export function sumRupees(amounts: readonly (string | null | undefined)[]): Paise {
  return amounts.reduce<Paise>((total, a) => total + (parseRupees(a) ?? 0), 0);
}
