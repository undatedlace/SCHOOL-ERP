import { previewOf } from './notice-preview';

describe('previewOf', () => {
  it('returns a short message as it is, with spaces tidied', () => {
    expect(previewOf('Holiday  on\nFriday')).toBe('Holiday on Friday');
    expect(previewOf('')).toBe('');
    expect(previewOf(null)).toBe('');
  });

  it('cuts a long message at a word and adds an ellipsis', () => {
    const body = 'The first instalment of the annual fee was due this week. Parents who have not yet paid are requested to do so at the school office.';
    const out = previewOf(body, 60);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(61);
    expect(body.startsWith(out.slice(0, -1))).toBe(true);
    expect(out.slice(0, -1).endsWith(' ')).toBe(false);
  });

  it('cuts in the middle of a very long word rather than showing nothing', () => {
    expect(previewOf('x'.repeat(200), 20)).toBe(`${'x'.repeat(20)}…`);
  });
});
