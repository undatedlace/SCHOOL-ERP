import * as SecureStore from 'expo-secure-store';
import { roleKindFromMe, roleLabelFromMe } from './roles';
import {
  ACCOUNTS_KEY,
  ACTIVE_KEY,
  getActiveId,
  getToken,
  loadAccounts,
  removeAccount,
  saveAccount,
  setActiveId,
  setToken,
  tokenKey,
  updateAccount,
} from './storage';
import type { Account } from './types';

const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;

const diya: Account = { id: 'u-diya', fullName: 'Diya Iyer', kind: 'family', roleLabel: 'Student', photoFileId: null, subtitle: null };
const arjun: Account = { id: 'u-arjun', fullName: 'Arjun Iyer', kind: 'family', roleLabel: 'Student', photoFileId: 'f1', subtitle: 'Std. 2 · A' };

describe('saved accounts', () => {
  it('starts empty', async () => {
    expect(await loadAccounts()).toEqual([]);
  });

  it('keeps several accounts, each token under its own key', async () => {
    await saveAccount(diya, 'token-diya');
    await saveAccount(arjun, 'token-arjun');
    expect((await loadAccounts()).map((a) => a.id)).toEqual(['u-diya', 'u-arjun']);
    expect(await getToken('u-diya')).toBe('token-diya');
    expect(await getToken('u-arjun')).toBe('token-arjun');
    expect(store.has(tokenKey('u-diya'))).toBe(true);
  });

  it('never puts a token in the account list', async () => {
    await saveAccount(diya, 'token-diya');
    expect(store.get(ACCOUNTS_KEY)).not.toContain('token-diya');
  });

  it('signing in again replaces the saved account and its token', async () => {
    await saveAccount(diya, 'old');
    await saveAccount({ ...diya, fullName: 'Diya N. Iyer' }, 'new');
    const accounts = await loadAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0]!.fullName).toBe('Diya N. Iyer');
    expect(await getToken('u-diya')).toBe('new');
  });

  it('removing an account deletes its token and entry, and leaves the others', async () => {
    await saveAccount(diya, 'token-diya');
    await saveAccount(arjun, 'token-arjun');
    await setActiveId('u-diya');
    const left = await removeAccount('u-diya');
    expect(left.map((a) => a.id)).toEqual(['u-arjun']);
    expect(await getToken('u-diya')).toBeNull();
    expect(await getToken('u-arjun')).toBe('token-arjun');
    expect(store.has(ACTIVE_KEY)).toBe(false); // the active pointer went with it
  });

  it('removing a different account leaves the active pointer alone', async () => {
    await saveAccount(diya, 't1');
    await saveAccount(arjun, 't2');
    await setActiveId('u-diya');
    await removeAccount('u-arjun');
    expect(await getActiveId()).toBe('u-diya');
  });

  it('updates details (photo, class) without touching the token', async () => {
    await saveAccount(diya, 'token-diya');
    await updateAccount({ ...diya, photoFileId: 'f9', subtitle: 'Nursery · A' });
    expect((await loadAccounts())[0]).toMatchObject({ photoFileId: 'f9', subtitle: 'Nursery · A' });
    expect(await getToken('u-diya')).toBe('token-diya');
    await updateAccount({ ...arjun }); // not saved: ignored
    expect(await loadAccounts()).toHaveLength(1);
  });

  it('replaces a token after a password change', async () => {
    await saveAccount(diya, 'before');
    await setToken('u-diya', 'after');
    expect(await getToken('u-diya')).toBe('after');
  });

  it('survives two saves at once without losing one', async () => {
    await Promise.all([saveAccount(diya, 'a'), saveAccount(arjun, 'b')]);
    expect(await loadAccounts()).toHaveLength(2);
  });

  it('ignores a damaged list instead of crashing', async () => {
    store.set(ACCOUNTS_KEY, '{not json');
    expect(await loadAccounts()).toEqual([]);
    store.set(ACCOUNTS_KEY, JSON.stringify([{ id: 'x' }, diya]));
    expect((await loadAccounts()).map((a) => a.id)).toEqual(['u-diya']);
  });

  it('asks the phone to keep tokens on this device only', async () => {
    await saveAccount(diya, 'token-diya');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      tokenKey('u-diya'),
      'token-diya',
      expect.objectContaining({ keychainAccessible: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY' }),
    );
  });
});

describe('role kind', () => {
  const me = (roles: string[], permissions: string[] = []) => ({ roles, permissions });

  it('gives a student or parent the family tabs', () => {
    expect(roleKindFromMe(me(['STUDENT'], ['students.read']))).toBe('family');
    expect(roleKindFromMe(me(['PARENT']))).toBe('family');
  });
  it('gives anyone who can mark attendance or enter marks the teacher tabs', () => {
    expect(roleKindFromMe(me(['TEACHER'], ['attendance.mark']))).toBe('teacher');
    expect(roleKindFromMe(me(['STAFF'], ['marks.enter']))).toBe('teacher');
  });
  it('sends every other staff account to the web app', () => {
    expect(roleKindFromMe(me(['ACCOUNTANT'], ['fees.read_all']))).toBe('other');
    expect(roleKindFromMe(me(['OFFICE_STAFF'], ['students.manage']))).toBe('other');
    expect(roleKindFromMe(me([], []))).toBe('other');
  });
  it('names the role for the account switcher', () => {
    expect(roleLabelFromMe(me(['STUDENT']), 'family')).toBe('Student');
    expect(roleLabelFromMe(me(['TEACHER']), 'teacher')).toBe('Teacher');
    expect(roleLabelFromMe(me(['OFFICE_STAFF']), 'other')).toBe('Office Staff');
  });
});
