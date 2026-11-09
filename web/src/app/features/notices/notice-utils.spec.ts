import { audienceText, toggle } from './notice-utils';

describe('notice utils', () => {
  it('describes who a notice goes to', () => {
    const base = { classes: [], divisions: [] };
    expect(audienceText({ ...base, audience: 'ALL' })).toBe('Everyone');
    expect(audienceText({ ...base, audience: 'STAFF' })).toBe('Staff only');
    expect(
      audienceText({
        audience: 'CLASSES',
        classes: [
          { id: '1', name: 'Std 1' },
          { id: '2', name: 'Std 2' },
        ],
        divisions: [],
      }),
    ).toBe('Std 1, Std 2');
    expect(
      audienceText({
        audience: 'DIVISIONS',
        classes: [],
        divisions: [{ id: 'd', label: 'Std 1-A' }],
      }),
    ).toBe('Std 1-A');
  });

  it('toggles without changing the original', () => {
    const ids = ['a'];
    expect(toggle(ids, 'b')).toEqual(['a', 'b']);
    expect(toggle(ids, 'a')).toEqual([]);
    expect(ids).toEqual(['a']);
  });
});
