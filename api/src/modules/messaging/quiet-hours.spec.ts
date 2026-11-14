import { DEFAULT_QUIET, quietPushAt } from './quiet-hours.js';

// India time is UTC+5:30. 2026-11-16 is a Monday; 2026-11-15 a Sunday.
const ist = (iso: string) => new Date(`${iso}+05:30`);

describe('quietPushAt', () => {
  it('is null during school hours', () => {
    expect(quietPushAt(ist('2026-11-16T10:00:00'), DEFAULT_QUIET)).toBeNull();
    expect(quietPushAt(ist('2026-11-16T07:00:00'), DEFAULT_QUIET)).toBeNull();
    expect(quietPushAt(ist('2026-11-16T18:59:00'), DEFAULT_QUIET)).toBeNull();
  });

  it('holds an evening message until the next morning', () => {
    const at = quietPushAt(ist('2026-11-16T20:30:00'), DEFAULT_QUIET);
    expect(at).toEqual(ist('2026-11-17T07:00:00'));
  });

  it('holds an early-morning message until 7 am the same day', () => {
    const at = quietPushAt(ist('2026-11-17T05:15:00'), DEFAULT_QUIET);
    expect(at).toEqual(ist('2026-11-17T07:00:00'));
  });

  it('holds all of Sunday until Monday morning', () => {
    expect(quietPushAt(ist('2026-11-15T11:00:00'), DEFAULT_QUIET)).toEqual(
      ist('2026-11-16T07:00:00'),
    );
    // Saturday night runs on through Sunday.
    expect(quietPushAt(ist('2026-11-14T21:00:00'), DEFAULT_QUIET)).toEqual(
      ist('2026-11-16T07:00:00'),
    );
  });

  it('lets Sunday through when Sundays are not quiet', () => {
    const q = { ...DEFAULT_QUIET, sundays: false };
    expect(quietPushAt(ist('2026-11-15T11:00:00'), q)).toBeNull();
    expect(quietPushAt(ist('2026-11-14T21:00:00'), q)).toEqual(
      ist('2026-11-15T07:00:00'),
    );
  });

  it('handles a daytime quiet window and equal times', () => {
    const lunch = { start: '12:00', end: '14:00', sundays: false };
    expect(quietPushAt(ist('2026-11-16T12:30:00'), lunch)).toEqual(
      ist('2026-11-16T14:00:00'),
    );
    expect(quietPushAt(ist('2026-11-16T15:00:00'), lunch)).toBeNull();
    const never = { start: '08:00', end: '08:00', sundays: false };
    expect(quietPushAt(ist('2026-11-16T23:00:00'), never)).toBeNull();
  });

  it('falls back to the defaults for a malformed setting', () => {
    const bad = { start: 'late', end: '25:00', sundays: false };
    expect(quietPushAt(ist('2026-11-16T20:00:00'), bad)).toEqual(
      ist('2026-11-17T07:00:00'),
    );
  });
});
