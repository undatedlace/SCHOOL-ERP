import {
  audienceChoices,
  audienceSummary,
  BODY_MAX,
  createBody,
  draftFromNotice,
  emptyNoticeDraft,
  hasErrors,
  toggleId,
  TITLE_MAX,
  updateBody,
  validateNotice,
  type StaffNotice,
} from './noticesLogic';

const TODAY = '2026-11-16';

const notice = (extra: Partial<StaffNotice> = {}): StaffNotice => ({
  id: 'n1',
  title: 'Sports day',
  body: 'Bring your sports kit.',
  audience: 'DIVISIONS',
  classes: [],
  divisions: [{ id: 'd1', label: 'Nursery-A' }],
  createdBy: { id: 'u', fullName: 'Farzana Sultana' },
  createdAt: '2026-11-14T08:00:00.000Z',
  expiresOn: '2026-11-30',
  expired: false,
  canChange: true,
  ...extra,
});

describe('audience', () => {
  it('lets a teacher write to divisions only, and the office to anyone', () => {
    expect(audienceChoices({ canAddressAnyone: false })).toEqual(['DIVISIONS']);
    expect(audienceChoices(undefined)).toEqual(['DIVISIONS']);
    expect(audienceChoices({ canAddressAnyone: true })).toEqual(['ALL', 'STAFF', 'CLASSES', 'DIVISIONS']);
  });

  it('says who a notice is for', () => {
    expect(audienceSummary(notice({ audience: 'ALL' }))).toBe('Everyone');
    expect(audienceSummary(notice({ audience: 'STAFF' }))).toBe('Staff only');
    expect(audienceSummary(notice({ audience: 'CLASSES', classes: [{ id: 'c', name: 'Nursery' }, { id: 'c2', name: 'Std 1' }] }))).toBe('Nursery, Std 1');
    expect(audienceSummary(notice({ divisions: [{ id: 'd1', label: 'Nursery-A' }, { id: 'd2', label: 'Nursery-B' }] }))).toBe('Nursery-A, Nursery-B');
  });
});

describe('validateNotice', () => {
  const good = { ...emptyNoticeDraft(), title: ' Sports day ', body: 'Bring your kit.', divisionIds: ['d1'] };

  it('asks for a title, the words and a class', () => {
    expect(validateNotice(emptyNoticeDraft(), TODAY, false)).toEqual({
      title: 'Give the notice a title',
      body: 'Write the notice',
      audience: 'Choose at least one class',
    });
  });

  it('accepts a good notice, with or without a last day', () => {
    expect(hasErrors(validateNotice(good, TODAY, false))).toBe(false);
    expect(hasErrors(validateNotice({ ...good, expiresOn: TODAY }, TODAY, false))).toBe(false);
  });

  it('refuses a last day in the past and over-long words', () => {
    expect(validateNotice({ ...good, expiresOn: '2026-11-15' }, TODAY, false).expiresOn).toMatch(/past/);
    expect(validateNotice({ ...good, title: 'x'.repeat(TITLE_MAX + 1) }, TODAY, false).title).toMatch(/under 150/);
    expect(validateNotice({ ...good, body: 'x'.repeat(BODY_MAX + 1) }, TODAY, false).body).toMatch(/under 5000/);
    expect(hasErrors(validateNotice({ ...good, body: 'x'.repeat(BODY_MAX) }, TODAY, false))).toBe(false);
  });

  it('does not ask for a class when editing, since the audience is not changed', () => {
    expect(hasErrors(validateNotice({ ...good, divisionIds: [] }, TODAY, true))).toBe(false);
  });
});

describe('bodies', () => {
  it('sends division targets for divisions and class targets for classes, never both', () => {
    const d = { ...emptyNoticeDraft(), title: ' Hi ', body: ' Text ', divisionIds: ['d1', 'd2'], classIds: ['c1'], expiresOn: '2026-12-01' };
    expect(createBody(d)).toEqual({ title: 'Hi', body: 'Text', audience: 'DIVISIONS', divisionIds: ['d1', 'd2'], expiresOn: '2026-12-01' });
    expect(createBody({ ...d, audience: 'CLASSES', expiresOn: '' })).toEqual({ title: 'Hi', body: 'Text', audience: 'CLASSES', classIds: ['c1'] });
    expect(createBody({ ...d, audience: 'ALL', expiresOn: '' })).toEqual({ title: 'Hi', body: 'Text', audience: 'ALL' });
  });

  it('sends only the words and the last day on an edit, and null to clear the last day', () => {
    const d = draftFromNotice(notice());
    expect(updateBody(d)).toEqual({ title: 'Sports day', body: 'Bring your sports kit.', expiresOn: '2026-11-30' });
    expect(updateBody({ ...d, expiresOn: '' })).toEqual({ title: 'Sports day', body: 'Bring your sports kit.', expiresOn: null });
  });
});

describe('draftFromNotice and toggleId', () => {
  it('starts an edit from the notice', () => {
    expect(draftFromNotice(notice({ expiresOn: null }))).toEqual({
      title: 'Sports day',
      body: 'Bring your sports kit.',
      audience: 'DIVISIONS',
      classIds: [],
      divisionIds: ['d1'],
      expiresOn: '',
    });
  });

  it('toggles an id in and out', () => {
    expect(toggleId(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleId(['a', 'b'], 'a')).toEqual(['b']);
  });
});
