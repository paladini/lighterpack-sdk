import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LighterPackHttpClient } from '../../src/http-client.js';
import { ApiError, LighterPackAuthError } from '../../src/errors.js';

function jsonResponse(body: unknown, init: { status?: number; setCookie?: string } = {}): Response {
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  if (init.setCookie) headers.append('Set-Cookie', init.setCookie);
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

describe('LighterPackHttpClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: LighterPackHttpClient;

  beforeEach(() => {
    fetchMock = vi.fn();
    client = new LighterPackHttpClient({ baseUrl: 'https://lighterpack.test', fetchImpl: fetchMock as unknown as typeof fetch });
  });

  it('signIn posts credentials, captures the lp cookie, and returns the parsed shape', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { username: 'tester', library: '{"lists":[]}', sync_token: 5 },
        { setCookie: 'lp=abc123; Path=/; HttpOnly' },
      ),
    );

    const result = await client.signIn({ username: 'tester', password: 'hunter2' });

    expect(result).toEqual({ username: 'tester', library: '{"lists":[]}', syncToken: 5 });
    expect(client.isAuthenticated()).toBe(true);
    expect(client.getUsername()).toBe('tester');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://lighterpack.test/signin');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ username: 'tester', password: 'hunter2' });
  });

  it('signIn with bad credentials throws LighterPackAuthError and does not authenticate', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Invalid username and/or password.' }, { status: 404 }));

    await expect(client.signIn({ username: 'tester', password: 'wrong' })).rejects.toThrow(LighterPackAuthError);
    expect(client.isAuthenticated()).toBe(false);
  });

  it('register behaves like signIn on success', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ username: 'newuser', library: '{}', sync_token: 0 }, { setCookie: 'lp=zzz; Path=/' }),
    );
    const result = await client.register({ username: 'newuser', email: 'a@b.com', password: 'hunter22' });
    expect(result.username).toBe('newuser');
    expect(client.isAuthenticated()).toBe(true);
  });

  it('saveLibrary refuses to run before signIn', async () => {
    await expect(client.saveLibrary({ syncToken: 1, data: '{}' })).rejects.toThrow(LighterPackAuthError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  async function signIn() {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ username: 'tester', library: '{}', sync_token: 1 }, { setCookie: 'lp=abc123; Path=/' }),
    );
    await client.signIn({ username: 'tester', password: 'hunter2' });
    fetchMock.mockClear();
  }

  it('saveLibrary sends the cookie, the cached username, and returns the new sync token', async () => {
    await signIn();
    fetchMock.mockResolvedValue(jsonResponse({ message: 'success', sync_token: 2 }));

    const result = await client.saveLibrary({ syncToken: 1, data: '{"lists":[]}' });
    expect(result).toEqual({ syncToken: 2 });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://lighterpack.test/saveLibrary');
    expect(init.headers.Cookie).toBe('lp=abc123');
    expect(JSON.parse(init.body)).toEqual({ sync_token: 1, username: 'tester', data: '{"lists":[]}' });
  });

  it('saveLibrary surfaces a stale sync_token conflict as a 400 ApiError', async () => {
    await signIn();
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Your list is out of date - please refresh your browser.' }, { status: 400 }));

    const err = await client.saveLibrary({ syncToken: 1, data: '{}' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(400);
  });

  it('uploadImage sends a multipart form with the auth cookie', async () => {
    await signIn();
    fetchMock.mockResolvedValue(jsonResponse({ imageUrl: '/userimages/abc.webp' }));

    const result = await client.uploadImage({ buffer: Buffer.from('fake-image-bytes'), filename: 'tent.jpg', mimeType: 'image/jpeg' });
    expect(result).toEqual({ imageUrl: '/userimages/abc.webp' });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.headers.Cookie).toBe('lp=abc123');
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('generateExternalId returns the minted slug', async () => {
    await signIn();
    fetchMock.mockResolvedValue(jsonResponse({ externalId: 'ab12cd' }));
    const result = await client.generateExternalId();
    expect(result).toEqual({ externalId: 'ab12cd' });
  });
});
