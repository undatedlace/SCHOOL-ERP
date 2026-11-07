import { Gender, Relationship } from '../../core/models';

export const RELATIONSHIPS: { value: Relationship; label: string }[] = [
  { value: 'FATHER', label: 'Father' },
  { value: 'MOTHER', label: 'Mother' },
  { value: 'GUARDIAN', label: 'Guardian' },
  { value: 'OTHER', label: 'Other' },
];

export const GENDERS: { value: Gender; label: string }[] = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
];

export const relationshipLabel = (r: Relationship) =>
  RELATIONSHIPS.find((x) => x.value === r)?.label ?? r;
export const genderLabel = (g: Gender) => GENDERS.find((x) => x.value === g)?.label ?? g;
