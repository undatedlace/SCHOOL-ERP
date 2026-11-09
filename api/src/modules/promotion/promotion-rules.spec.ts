import { suggestion } from './promotion-rules.js';

describe('promotion suggestion', () => {
  const next = {
    divisions: [
      { id: 'a2', name: 'A' },
      { id: 'b2', name: 'B' },
    ],
  };

  it('moves up to the division with the same name', () => {
    expect(suggestion(next, 'B')).toEqual({
      action: 'PROMOTE',
      divisionId: 'b2',
    });
  });

  it('leaves the division open when the next class has no division of that name', () => {
    expect(suggestion(next, 'C')).toEqual({
      action: 'PROMOTE',
      divisionId: null,
    });
    expect(suggestion({ divisions: [] }, 'A')).toEqual({
      action: 'PROMOTE',
      divisionId: null,
    });
  });

  it('suggests leaving in the last class', () => {
    expect(suggestion(null, 'A')).toEqual({ action: 'LEFT', divisionId: null });
  });
});
