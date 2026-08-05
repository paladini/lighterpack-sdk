import { ApiError, LighterPackAuthError } from './errors.js';

export interface LighterPackHttpClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface SignInResult {
  username: string;
  /** Raw JSON string as returned by the server — caller parses it. */
  library: string;
  syncToken: number;
}

interface ApiErrorBody {
  message?: string;
  errors?: { field?: string; message: string }[];
}

const AUTH_FAILURE_STATUSES = new Set([401, 404]);

/** Thin wrapper over LighterPack's raw HTTP endpoints. Most consumers want {@link LighterPackClient} instead. */
export class LighterPackHttpClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private cookie: string | null = null;
  private username: string | null = null;

  constructor(options: LighterPackHttpClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'https://lighterpack.com').replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  isAuthenticated(): boolean {
    return this.cookie !== null && this.username !== null;
  }

  getUsername(): string | null {
    return this.username;
  }

  async register(input: { username: string; email: string; password: string }): Promise<SignInResult> {
    const res = await this.post('/register', { json: input });
    return this.handleSignInLikeResponse(res);
  }

  async signIn(input: { username: string; password: string }): Promise<SignInResult> {
    const res = await this.post('/signin', { json: input });
    return this.handleSignInLikeResponse(res);
  }

  async saveLibrary(input: { syncToken: number; data: string }): Promise<{ syncToken: number }> {
    this.assertAuthenticated();
    const res = await this.post('/saveLibrary', {
      json: { sync_token: input.syncToken, username: this.username, data: input.data },
      authenticated: true,
    });
    const body = await this.parseJsonOrThrow(res);
    return { syncToken: body.sync_token as number };
  }

  async uploadImage(input: { buffer: Buffer; filename: string; mimeType: string }): Promise<{ imageUrl: string }> {
    this.assertAuthenticated();
    const form = new FormData();
    form.set('image', new Blob([input.buffer], { type: input.mimeType }), input.filename);
    const res = await this.post('/imageUpload', { form, authenticated: true });
    const body = await this.parseJsonOrThrow(res);
    return { imageUrl: body.imageUrl as string };
  }

  async generateExternalId(): Promise<{ externalId: string }> {
    this.assertAuthenticated();
    const res = await this.post('/externalId', { json: {}, authenticated: true });
    const body = await this.parseJsonOrThrow(res);
    return { externalId: body.externalId as string };
  }

  private assertAuthenticated(): void {
    if (!this.isAuthenticated()) {
      throw new LighterPackAuthError('Not signed in to LighterPack yet — call signIn() first.');
    }
  }

  private async handleSignInLikeResponse(res: Response): Promise<SignInResult> {
    this.captureCookie(res);
    const body = await this.parseJsonOrThrow(res);
    this.username = body.username as string;
    return {
      username: body.username as string,
      library: body.library as string,
      syncToken: body.sync_token as number,
    };
  }

  private captureCookie(res: Response): void {
    const setCookieHeaders = res.headers.getSetCookie();
    for (const header of setCookieHeaders) {
      const match = /^lp=([^;]+)/.exec(header);
      if (match?.[1]) this.cookie = match[1];
    }
  }

  private async post(
    path: string,
    opts: { json?: unknown; form?: FormData; authenticated?: boolean },
  ): Promise<Response> {
    const headers: Record<string, string> = {};
    if (opts.authenticated) {
      if (!this.cookie) throw new LighterPackAuthError('Not signed in to LighterPack yet — call signIn() first.');
      headers.Cookie = `lp=${this.cookie}`;
    }

    let body: string | FormData | null = null;
    if (opts.form) {
      body = opts.form;
    } else if (opts.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.json);
    }

    return this.fetchImpl(`${this.baseUrl}${path}`, { method: 'POST', headers, body });
  }

  private async parseJsonOrThrow(res: Response): Promise<Record<string, unknown>> {
    let body: ApiErrorBody | undefined;
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      body = undefined;
    }

    if (!res.ok) {
      const message = body?.message ?? body?.errors?.[0]?.message ?? `LighterPack request failed with status ${res.status}.`;
      if (AUTH_FAILURE_STATUSES.has(res.status)) {
        throw new LighterPackAuthError(message);
      }
      throw new ApiError(message, res.status, body);
    }

    return (body ?? {}) as Record<string, unknown>;
  }
}
