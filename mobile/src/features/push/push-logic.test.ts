import { createHandledSet, registrationDecision, registrationOrder } from './decision';
import { routeStackForLink } from './linkToRoute';
import { parsePushData } from './payload';
import { syncRegistrations, type SyncDeps } from './sync';
import { handleNotificationTap, type TapDeps } from './tap';

const ID = '3f6c1d0e-1111-4a2b-9c3d-123456789abc';
const TOKEN = 'ExponentPushToken[abc123]';

describe('parsePushData', () => {
  it('reads the notification id and link', () => {
    expect(parsePushData({ notificationId: ID, link: '/portal/messages/' + ID })).toEqual({
      notificationId: ID,
      link: '/portal/messages/' + ID,
      userId: null,
    });
  });
  it('ignores anything else in the data, and keeps a user id only when it looks like one', () => {
    const p = parsePushData({ notificationId: ID, link: '/portal/homework', userId: ID, title: 'Maya scored 12', amount: 5 });
    expect(p).toEqual({ notificationId: ID, link: '/portal/homework', userId: ID });
    expect(Object.keys(p!)).toEqual(['notificationId', 'link', 'userId']);
  });
  it('drops values that are not safe or not text', () => {
    expect(parsePushData({ notificationId: 5, link: '//evil.example/x' })).toBeNull();
    expect(parsePushData({ notificationId: ID, link: 'https://evil.example' })).toEqual({
      notificationId: ID,
      link: null,
      userId: null,
    });
    expect(parsePushData({ notificationId: '../etc', link: '/portal/fees' })).toEqual({
      notificationId: null,
      link: '/portal/fees',
      userId: null,
    });
  });
  it('returns null for empty or odd data', () => {
    expect(parsePushData(null)).toBeNull();
    expect(parsePushData(undefined)).toBeNull();
    expect(parsePushData('text')).toBeNull();
    expect(parsePushData([])).toBeNull();
    expect(parsePushData({})).toBeNull();
  });
});

describe('routeStackForLink', () => {
  it('opens a message thread over the inbox', () => {
    expect(routeStackForLink('/portal/messages/' + ID, 'family')).toEqual(['/family/messages', '/family/messages/' + ID]);
  });
  it('maps the family pages', () => {
    expect(routeStackForLink('/portal/absence', 'family')).toEqual(['/family/report-absence']);
    expect(routeStackForLink('/portal/homework', 'family')).toEqual(['/family/homework']);
    expect(routeStackForLink('/portal/results', 'family')).toEqual(['/family/results']);
    expect(routeStackForLink('/portal/messages', 'family')).toEqual(['/family/messages']);
    expect(routeStackForLink('/portal', 'family')).toEqual(['/family']);
    expect(routeStackForLink('/portal/fees?tab=receipts', 'family')).toEqual(['/family/fees']);
  });
  it('falls back to the notifications list for anything unknown or unsafe', () => {
    expect(routeStackForLink(null, 'family')).toEqual(['/family/notifications']);
    expect(routeStackForLink('/portal/unknown-page', 'family')).toEqual(['/family/notifications']);
    expect(routeStackForLink('/app/messages/' + ID, 'family')).toEqual(['/family/notifications']);
    expect(routeStackForLink('/portal/messages/../../x', 'family')).toEqual(['/family/messages']);
    expect(routeStackForLink('/portal/messages/' + ID + '/extra', 'family')).toEqual(['/family/messages']);
  });
  it('maps teacher links to what the phone app has', () => {
    expect(routeStackForLink('/app/homework', 'teacher')).toEqual(['/teacher/homework']);
    expect(routeStackForLink('/app/my-leave', 'teacher')).toEqual(['/teacher/my-leave']);
    expect(routeStackForLink('/app/messages/' + ID, 'teacher')).toEqual(['/teacher/messages']);
    expect(routeStackForLink('/app/student-leave', 'teacher')).toEqual(['/teacher/notifications']);
    expect(routeStackForLink('/portal/fees', 'teacher')).toEqual(['/teacher/notifications']);
  });
  it('opens nothing for an account the app has no screens for', () => {
    expect(routeStackForLink('/portal/fees', 'other')).toEqual([]);
  });
});

describe('registrationDecision', () => {
  const record = { deviceId: 'd1', pushToken: TOKEN };
  const owner = { accountId: 'a', pushToken: TOKEN };

  it('does nothing without a token', () => {
    expect(registrationDecision({ pushToken: null, accountId: 'a', isActive: true, record: null, owner: null })).toBe('no-token');
  });
  it('registers an account that has no record, or a record for another token', () => {
    expect(registrationDecision({ pushToken: TOKEN, accountId: 'a', isActive: true, record: null, owner: null })).toBe('register');
    expect(
      registrationDecision({ pushToken: TOKEN, accountId: 'a', isActive: false, record: { deviceId: 'd', pushToken: 'ExponentPushToken[old]' }, owner }),
    ).toBe('register');
  });
  it('registers once per account and token', () => {
    expect(registrationDecision({ pushToken: TOKEN, accountId: 'a', isActive: true, record, owner })).toBe('already-registered');
    expect(registrationDecision({ pushToken: TOKEN, accountId: 'b', isActive: false, record, owner })).toBe('already-registered');
  });
  it('registers the account on screen again when the token sits under another account', () => {
    expect(
      registrationDecision({ pushToken: TOKEN, accountId: 'b', isActive: true, record, owner: { accountId: 'a', pushToken: TOKEN } }),
    ).toBe('register');
  });
});

describe('registrationOrder and createHandledSet', () => {
  it('puts the account on screen last', () => {
    expect(registrationOrder([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 'a').map((x) => x.id)).toEqual(['b', 'c', 'a']);
    expect(registrationOrder([{ id: 'a' }], null).map((x) => x.id)).toEqual(['a']);
  });
  it('remembers what was handled', () => {
    const set = createHandledSet(2);
    set.add('x');
    set.add('y');
    set.add('z');
    expect([set.has('x'), set.has('y'), set.has('z')]).toEqual([false, true, true]);
  });
});

describe('syncRegistrations', () => {
  function deps(records: Record<string, { deviceId: string; pushToken: string }>, owner: { accountId: string; pushToken: string } | null) {
    const calls: string[] = [];
    const d: SyncDeps = {
      readRecord: async (id) => records[id] ?? null,
      readOwner: async () => owner,
      register: async (id, token) => {
        calls.push(id);
        records[id] = { deviceId: 'dev-' + id, pushToken: token };
        owner = { accountId: id, pushToken: token };
        return records[id]!;
      },
    };
    return { d, calls };
  }

  it('registers every account, the one on screen last', async () => {
    const { d, calls } = deps({}, null);
    const r = await syncRegistrations({ accounts: [{ id: 'a' }, { id: 'b' }], activeId: 'a', pushToken: TOKEN }, d);
    expect(calls).toEqual(['b', 'a']);
    expect(r.registered).toEqual(['b', 'a']);
  });
  it('does not register again at the next start', async () => {
    const records = { a: { deviceId: 'da', pushToken: TOKEN }, b: { deviceId: 'db', pushToken: TOKEN } };
    const { d, calls } = deps(records, { accountId: 'a', pushToken: TOKEN });
    const r = await syncRegistrations({ accounts: [{ id: 'a' }, { id: 'b' }], activeId: 'a', pushToken: TOKEN }, d);
    expect(calls).toEqual([]);
    expect(r.skipped).toEqual(['b', 'a']);
  });
  it('registers the newly active account after a switch, and nobody else', async () => {
    const records = { a: { deviceId: 'da', pushToken: TOKEN }, b: { deviceId: 'db', pushToken: TOKEN } };
    const { d, calls } = deps(records, { accountId: 'a', pushToken: TOKEN });
    await syncRegistrations({ accounts: [{ id: 'a' }, { id: 'b' }], activeId: 'b', pushToken: TOKEN }, d);
    expect(calls).toEqual(['b']);
  });
  it('does nothing without a token, and one failure does not stop the others', async () => {
    const none = deps({}, null);
    expect((await syncRegistrations({ accounts: [{ id: 'a' }], activeId: 'a', pushToken: null }, none.d)).registered).toEqual([]);
    expect(none.calls).toEqual([]);

    const failing: SyncDeps = {
      readRecord: async () => null,
      readOwner: async () => null,
      register: async (id) => {
        if (id === 'b') throw new Error('offline');
        return { deviceId: 'd', pushToken: TOKEN };
      },
    };
    const r = await syncRegistrations({ accounts: [{ id: 'a' }, { id: 'b' }], activeId: 'a', pushToken: TOKEN }, failing);
    expect(r).toEqual({ registered: ['a'], skipped: [], failed: ['b'] });
  });
});

describe('handleNotificationTap', () => {
  function setup(activeId: string | null, accounts = [{ id: 'a', kind: 'family' as const }, { id: 'b', kind: 'teacher' as const }]) {
    const log: string[] = [];
    const deps: TapDeps = {
      accounts,
      activeId,
      switchAccount: async (id) => {
        log.push('switch:' + id);
      },
      markRead: async (id) => {
        log.push('read:' + id);
      },
      refreshCounts: () => log.push('refresh'),
      navigate: (stack) => log.push('go:' + stack.join('>')),
    };
    return { deps, log };
  }

  it('marks the notification read, refreshes and opens the screen', async () => {
    const { deps, log } = setup('a');
    const stack = await handleNotificationTap({ notificationId: ID, link: '/portal/messages/' + ID, userId: null }, deps);
    expect(stack).toEqual(['/family/messages', '/family/messages/' + ID]);
    expect(log).toEqual(['read:' + ID, 'refresh', 'go:/family/messages>/family/messages/' + ID]);
  });
  it('switches to the account the push belongs to when the payload names it', async () => {
    const { deps, log } = setup('a');
    await handleNotificationTap({ notificationId: ID, link: '/app/homework', userId: 'b' }, deps);
    expect(log[0]).toBe('switch:b');
    expect(log).toContain('go:/teacher/homework');
  });
  it('stays on the active account when the payload names one that is not on this phone', async () => {
    const { deps, log } = setup('a');
    await handleNotificationTap({ notificationId: null, link: '/portal/fees', userId: 'zzzzzzzz' }, deps);
    expect(log).toEqual(['refresh', 'go:/family/fees']);
  });
  it('opens nothing when nobody is signed in', async () => {
    const { deps, log } = setup(null);
    expect(await handleNotificationTap({ notificationId: ID, link: '/portal/fees', userId: null }, deps)).toEqual([]);
    expect(log).toEqual([]);
  });
  it('still opens the screen if marking read fails', async () => {
    const { deps, log } = setup('a');
    deps.markRead = async () => {
      throw new Error('offline');
    };
    await handleNotificationTap({ notificationId: ID, link: '/portal/fees', userId: null }, deps);
    expect(log).toEqual(['refresh', 'go:/family/fees']);
  });
});
