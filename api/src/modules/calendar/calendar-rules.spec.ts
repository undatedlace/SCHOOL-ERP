import {
  announcementBody,
  daysBetween,
  timingProblem,
} from './calendar-rules.js';

const base = {
  startsOn: '2026-12-05',
  endsOn: '2026-12-05',
  startTime: null,
  endTime: null,
};

describe('daysBetween', () => {
  it('counts both ends', () => {
    expect(daysBetween('2026-12-05', '2026-12-05')).toBe(1);
    expect(daysBetween('2026-12-05', '2026-12-07')).toBe(3);
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(4);
  });
});

describe('timingProblem', () => {
  it('accepts a one-day event and a timed one', () => {
    expect(timingProblem(base)).toBeNull();
    expect(
      timingProblem({ ...base, startTime: '09:00', endTime: '11:30' }),
    ).toBeNull();
  });
  it('refuses an end before the start', () => {
    expect(timingProblem({ ...base, endsOn: '2026-12-04' })).toMatch(
      /last day/,
    );
    expect(
      timingProblem({ ...base, startTime: '11:00', endTime: '09:00' }),
    ).toMatch(/end time/);
  });
  it('allows an earlier end time on a later day', () => {
    expect(
      timingProblem({
        ...base,
        endsOn: '2026-12-06',
        startTime: '20:00',
        endTime: '08:00',
      }),
    ).toBeNull();
  });
  it('needs a start time when there is an end time', () => {
    expect(timingProblem({ ...base, endTime: '10:00' })).toMatch(/start time/);
  });
  it('refuses very long events', () => {
    expect(timingProblem({ ...base, endsOn: '2027-03-01' })).toMatch(/at most/);
  });
});

describe('announcementBody', () => {
  it('states the date, time and description', () => {
    expect(
      announcementBody({
        ...base,
        startTime: '10:00',
        endTime: '12:00',
        description: 'Bring ID cards',
      }),
    ).toBe('When: 2026-12-05 at 10:00-12:00\n\nBring ID cards');
    expect(
      announcementBody({
        ...base,
        endsOn: '2026-12-07',
        description: null,
      }),
    ).toBe('When: 2026-12-05 to 2026-12-07');
  });
});
