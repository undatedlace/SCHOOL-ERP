const mockPost = jest.fn();
const mockDel = jest.fn();
jest.mock('@/api/client', () => ({ api: { post: (...a: unknown[]) => mockPost(...a), delete: (...a: unknown[]) => mockDel(...a) } }));

import { forgetDevice, readDevice, readOwner, registerDevice, unregisterDevice } from './devices';

const TOKEN = 'ExponentPushToken[abc123]';

beforeEach(() => {
  mockPost.mockReset();
  mockDel.mockReset();
});

describe('registerDevice', () => {
  it('posts the token with that account\'s own session token and keeps the device id', async () => {
    mockPost.mockResolvedValue({ id: 'dev-1' });
    const record = await registerDevice({ accountId: 'a', sessionToken: 'sess-a', pushToken: TOKEN, platform: 'IOS', appVersion: '0.1.0' });
    expect(mockPost).toHaveBeenCalledWith(
      '/devices',
      { pushToken: TOKEN, platform: 'IOS', appVersion: '0.1.0' },
      { token: 'sess-a' },
    );
    expect(record).toEqual({ deviceId: 'dev-1', pushToken: TOKEN });
    expect(await readDevice('a')).toEqual(record);
    expect(await readOwner()).toEqual({ accountId: 'a', pushToken: TOKEN });
  });
});

describe('unregisterDevice', () => {
  it('deletes the device on the server, then forgets it here', async () => {
    mockPost.mockResolvedValue({ id: 'dev-1' });
    await registerDevice({ accountId: 'a', sessionToken: 'sess-a', pushToken: TOKEN, platform: 'ANDROID', appVersion: '1' });
    mockDel.mockResolvedValue(undefined);
    await unregisterDevice('a', 'sess-a');
    expect(mockDel).toHaveBeenCalledWith('/devices/dev-1', { token: 'sess-a' });
    expect(await readDevice('a')).toBeNull();
    expect(await readOwner()).toBeNull();
  });
  it('forgets it even when the server cannot be reached', async () => {
    mockPost.mockResolvedValue({ id: 'dev-1' });
    await registerDevice({ accountId: 'a', sessionToken: 'sess-a', pushToken: TOKEN, platform: 'IOS', appVersion: '1' });
    mockDel.mockRejectedValue(new Error('offline'));
    await expect(unregisterDevice('a', 'sess-a')).resolves.toBeUndefined();
    expect(await readDevice('a')).toBeNull();
  });
  it('does not call the server for an account that was never registered', async () => {
    await unregisterDevice('nobody', 'sess');
    expect(mockDel).not.toHaveBeenCalled();
  });
  it('leaves the owner alone when another account holds the token', async () => {
    mockPost.mockResolvedValue({ id: 'dev-1' });
    await registerDevice({ accountId: 'a', sessionToken: 'sa', pushToken: TOKEN, platform: 'IOS', appVersion: '1' });
    await registerDevice({ accountId: 'b', sessionToken: 'sb', pushToken: TOKEN, platform: 'IOS', appVersion: '1' });
    await forgetDevice('a');
    expect(await readOwner()).toEqual({ accountId: 'b', pushToken: TOKEN });
  });
});
