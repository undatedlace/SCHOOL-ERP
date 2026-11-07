export interface GuardianSuggestion {
  fullName: string;
  relationship: 'FATHER' | 'MOTHER' | 'GUARDIAN';
  mobile?: string;
  email?: string;
  occupation?: string;
  isPrimary: boolean;
}

const text = (answers: Record<string, unknown>, id: string): string => {
  const v = answers[id];
  return typeof v === 'string' ? v.trim() : '';
};

/** "+91 98765-43210" becomes "+919876543210". Anything that is not a phone number becomes empty. */
export function cleanMobile(raw: string): string {
  const compact = raw.replace(/[\s()-]/g, '');
  return /^\+?[0-9]{10,15}$/.test(compact) ? compact : '';
}

/**
 * A starting point for the guardians, read from the usual answers on the school's
 * admission form. These are only suggestions: the office checks and corrects them
 * when admitting, and a school that has renamed its fields simply gets fewer of them.
 */
export function suggestGuardians(
  answers: Record<string, unknown>,
): GuardianSuggestion[] {
  const familyMobile = cleanMobile(text(answers, 'familyMobile'));
  const out: Omit<GuardianSuggestion, 'isPrimary'>[] = [];

  const father = text(answers, 'fatherFullName');
  if (father) {
    out.push({
      fullName: father,
      relationship: 'FATHER',
      ...(familyMobile ? { mobile: familyMobile } : {}),
      ...(text(answers, 'fatherEmail')
        ? { email: text(answers, 'fatherEmail').toLowerCase() }
        : {}),
      ...(text(answers, 'fatherOccupation')
        ? { occupation: text(answers, 'fatherOccupation') }
        : {}),
    });
  }

  const mother = text(answers, 'motherFullName');
  if (mother) {
    out.push({
      fullName: mother,
      relationship: 'MOTHER',
      ...(familyMobile ? { mobile: familyMobile } : {}),
      ...(text(answers, 'motherOccupation')
        ? { occupation: text(answers, 'motherOccupation') }
        : {}),
    });
  }

  const guardian = [
    'guardianFirstName',
    'guardianMiddleName',
    'guardianLastName',
  ]
    .map((id) => text(answers, id))
    .filter(Boolean)
    .join(' ');
  if (guardian) {
    const mobile = cleanMobile(text(answers, 'guardianMobile'));
    out.push({
      fullName: guardian,
      relationship: 'GUARDIAN',
      ...(mobile ? { mobile } : {}),
      ...(text(answers, 'guardianEmail')
        ? { email: text(answers, 'guardianEmail').toLowerCase() }
        : {}),
      ...(text(answers, 'guardianOccupation')
        ? { occupation: text(answers, 'guardianOccupation') }
        : {}),
    });
  }

  return out.map((g, i) => ({ ...g, isPrimary: i === 0 }));
}
