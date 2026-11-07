/**
 * Ages in whole months between two calendar dates ("YYYY-MM-DD"), and the
 * admission age rule. Pure functions: no dates are read from the clock here.
 */

export function ageInMonths(dobIso: string, asOfIso: string): number | null {
  const [y1, m1, d1] = dobIso.split('-').map(Number);
  const [y2, m2, d2] = asOfIso.split('-').map(Number);
  const months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  return months < 0 ? null : months;
}

/** 63 months becomes "5 years 3 months". */
export function ageText(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  return years === 0
    ? part(rest, 'month')
    : `${part(years, 'year')} ${part(rest, 'month')}`;
}

export interface Eligibility {
  /** False when there is anything for the office to look at. */
  eligible: boolean;
  /** Plain-language reasons, empty when eligible. */
  issues: string[];
  ageMonths: number | null;
  ageText: string | null;
  /** The date the age was counted on. */
  asOn: string;
}

export interface EligibilityInput {
  className: string;
  dateOfBirth: string | null;
  asOn: string;
  minAgeYears: number | null;
  admissionsOpen: boolean;
}

/**
 * Whether a child may be admitted to a class. This only advises: the office can
 * still save an application that does not meet it.
 */
export function checkEligibility(input: EligibilityInput): Eligibility {
  const issues: string[] = [];
  if (!input.admissionsOpen)
    issues.push(`Admissions are not open for ${input.className}.`);

  const months = input.dateOfBirth
    ? ageInMonths(input.dateOfBirth, input.asOn)
    : null;
  if (input.dateOfBirth && months === null) {
    issues.push('The date of birth is after the date the age is counted on.');
  } else if (
    months !== null &&
    input.minAgeYears !== null &&
    months < input.minAgeYears * 12
  ) {
    issues.push(
      `The child is ${ageText(months)} old as on ${input.asOn}, and ${input.className} needs at least ${input.minAgeYears} year${input.minAgeYears === 1 ? '' : 's'}.`,
    );
  }
  return {
    eligible: issues.length === 0,
    issues,
    ageMonths: months,
    ageText: months === null ? null : ageText(months),
    asOn: input.asOn,
  };
}
