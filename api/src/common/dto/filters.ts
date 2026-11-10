import { Transform } from 'class-transformer';

/** "true" / "false" in a query string become booleans; anything else is left out. */
export const queryBool = () =>
  Transform(({ value }: { value: unknown }) =>
    value === 'true' || value === true
      ? true
      : value === 'false' || value === false
        ? false
        : undefined,
  );

/** A calendar date like 2026-11-10, as used by the "from" and "to" filters. */
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const DATE_MESSAGE = 'Use a date like 2026-11-10';
