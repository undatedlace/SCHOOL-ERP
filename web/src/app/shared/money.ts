/** "31200.50" as "₹31,200.50", in the Indian digit grouping. Amounts stay text; only the display is formatted. */
export const inr = (amount: string | null | undefined): string => {
  if (amount === null || amount === undefined || amount === '') return '';
  const negative = amount.startsWith('-');
  const [whole, paise = '00'] = amount.replace('-', '').split('.');
  const grouped = new Intl.NumberFormat('en-IN').format(Number(whole));
  return `${negative ? '-' : ''}₹${grouped}.${paise.padEnd(2, '0')}`;
};

/** Is this text a valid amount (digits, at most two decimals, more than zero)? */
export const isMoney = (value: string): boolean =>
  /^\d{1,10}(\.\d{1,2})?$/.test(value) && Number(value) > 0;
