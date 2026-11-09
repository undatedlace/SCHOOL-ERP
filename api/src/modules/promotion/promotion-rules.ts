export interface NextClass {
  divisions: { id: string; name: string }[];
}

export interface Suggestion {
  action: 'PROMOTE' | 'LEFT';
  divisionId: string | null;
}

/**
 * What to suggest for a student of a division. With a higher class: move up, to the division
 * of the same name (A to A) when there is one, otherwise left for the office to choose. In the
 * last class there is nowhere to go, so the suggestion is that the student leaves.
 */
export function suggestion(
  next: NextClass | null,
  divisionName: string,
): Suggestion {
  if (!next) return { action: 'LEFT', divisionId: null };
  const sameName = next.divisions.find((d) => d.name === divisionName);
  return { action: 'PROMOTE', divisionId: sameName?.id ?? null };
}
