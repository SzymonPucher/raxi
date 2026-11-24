export const DEFAULT_GOOGLE_CLIENT_ID =
  '869604397100-4c37t9il1hub0ke4p0on2hhlsbhbgj9i.apps.googleusercontent.com';

export const AUTHORIZED_RESTRICTED_EMAILS = [
  'sajmontube@gmail.com',
  'matisawa20@gmail.com',
] as const;

export const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
export const RESTRICTED_AUTH_STORAGE_KEY = 'raxi.restrictedAuth.v1';

export type RestrictedAuthStatus = 'signed_out' | 'authorized' | 'unauthorized';

export interface RestrictedAuthState {
  status: RestrictedAuthStatus;
  email: string | null;
  name: string | null;
  expiresAt: number | null;
  configured: boolean;
  error: string | null;
}

export type ParsedGoogleTokenResult =
  | {
      ok: true;
      email: string;
      name: string | null;
      expiresAt: number;
    }
  | {
      ok: false;
      reason: string;
    };

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleIdConfiguration {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
}

interface GoogleRenderButtonOptions {
  type?: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  width?: number;
}

interface GoogleAccountsIdApi {
  initialize(config: GoogleIdConfiguration): void;
  renderButton(parent: HTMLElement, options: GoogleRenderButtonOptions): void;
  disableAutoSelect?: () => void;
}

interface WindowWithGoogle extends Window {
  google?: {
    accounts?: {
      id?: GoogleAccountsIdApi;
    };
  };
}

export interface RestrictedAuthOptions {
  clientId?: string;
  storage?: StorageLike | null;
  now?: () => number;
  loadGis?: () => Promise<GoogleAccountsIdApi>;
}

const VALID_GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
const AUTHORIZED_EMAIL_SET = new Set<string>(
  AUTHORIZED_RESTRICTED_EMAILS.map((email) => email.trim().toLowerCase())
);

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isAuthorizedRestrictedEmail(email: string | null | undefined): boolean {
  if (typeof email !== 'string') return false;
  const normalized = normalizeEmail(email);
  return normalized.length > 0 && AUTHORIZED_EMAIL_SET.has(normalized);
}

export function decodeJwtPayload(credential: string): Record<string, unknown> | null {
  if (typeof credential !== 'string') return null;
  const parts = credential.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (base64.length % 4)) % 4;
    const padded = base64 + '='.repeat(padLen);

    const binary = decodeBase64ToBinaryString(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const jsonText =
      typeof TextDecoder !== 'undefined'
        ? new TextDecoder('utf-8').decode(bytes)
        : decodeURIComponent(
            Array.from(bytes, (b) => `%${b.toString(16).padStart(2, '0')}`).join('')
          );

    const parsed: unknown = JSON.parse(jsonText);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function decodeBase64ToBinaryString(base64: string): string {
  if (typeof atob === 'function') {
    return atob(base64);
  }
  const bufCtor = (globalThis as { Buffer?: { from(input: string, enc: string): { toString(enc: string): string } } })
    .Buffer;
  if (bufCtor) {
    return bufCtor.from(base64, 'base64').toString('latin1');
  }
  throw new Error('Base64 decoding is unavailable');
}

export function parseGoogleIdToken(
  credential: string,
  expectedClientId: string,
  nowMs: number = Date.now()
): ParsedGoogleTokenResult {
  const payload = decodeJwtPayload(credential);
  if (!payload) {
    return { ok: false, reason: 'Invalid Google credential token.' };
  }

  const iss = typeof payload.iss === 'string' ? payload.iss : '';
  if (!VALID_GOOGLE_ISSUERS.has(iss)) {
    return { ok: false, reason: 'Credential was not issued by Google.' };
  }

  const aud = typeof payload.aud === 'string' ? payload.aud : '';
  if (expectedClientId && aud !== expectedClientId) {
    return { ok: false, reason: 'Google credential audience mismatch.' };
  }

  const exp = typeof payload.exp === 'number' ? payload.exp : Number.NaN;
  if (!Number.isFinite(exp)) {
    return { ok: false, reason: 'Google credential is missing an expiration time.' };
  }
  const expiresAt = exp * 1000;
  if (expiresAt <= nowMs) {
    return { ok: false, reason: 'Google sign-in session has expired. Please sign in again.' };
  }

  const rawEmail = typeof payload.email === 'string' ? payload.email : '';
  const email = normalizeEmail(rawEmail);
  if (!email) {
    return { ok: false, reason: 'Google account did not return an email address.' };
  }

  if (payload.email_verified !== true) {
    return { ok: false, reason: 'Google email address must be verified.' };
  }

  const name = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : null;
  return {
    ok: true,
    email,
    name,
    expiresAt,
  };
}

let gisLoadPromise: Promise<GoogleAccountsIdApi> | null = null;

function defaultLoadGis(): Promise<GoogleAccountsIdApi> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Google Sign-In requires a browser environment.'));
  }

  const win = window as WindowWithGoogle;
  if (win.google?.accounts?.id) {
    return Promise.resolve(win.google.accounts.id);
  }

  if (gisLoadPromise) {
    return gisLoadPromise;
  }

  gisLoadPromise = new Promise<GoogleAccountsIdApi>((resolve, reject) => {
    const finish = (): void => {
      const api = win.google?.accounts?.id;
      if (api) {
        resolve(api);
      } else {
        gisLoadPromise = null;
        reject(new Error('Google Sign-In loaded without identity API.'));
      }
    };

    const fail = (): void => {
      gisLoadPromise = null;
      reject(new Error('Could not load Google Sign-In. Check your connection and try again.'));
    };

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT_URL}"]`);
    if (existing) {
      if (existing.dataset.raxiLoaded === 'true') {
        finish();
        return;
      }
      if (existing.dataset.raxiFailed === 'true') {
        existing.remove();
      } else {
        existing.addEventListener('load', finish, { once: true });
        existing.addEventListener('error', fail, { once: true });
        return;
      }
    }

    const script = document.createElement('script');
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.addEventListener(
      'load',
      () => {
        script.dataset.raxiLoaded = 'true';
        finish();
      },
      { once: true }
    );
    script.addEventListener(
      'error',
      () => {
        script.dataset.raxiFailed = 'true';
        fail();
      },
      { once: true }
    );
    document.head.appendChild(script);
  });

  return gisLoadPromise;
}

function getDefaultClientId(): string {
  const envId =
    typeof import.meta !== 'undefined' && import.meta.env
      ? import.meta.env.VITE_GOOGLE_CLIENT_ID
      : undefined;
  if (typeof envId === 'string' && envId.trim().length > 0) {
    return envId.trim();
  }
  return DEFAULT_GOOGLE_CLIENT_ID;
}

function getDefaultStorage(): StorageLike | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

export class RestrictedAuthManager {
  public readonly clientId: string;
  private readonly storage: StorageLike | null;
  private readonly now: () => number;
  private readonly loadGis: () => Promise<GoogleAccountsIdApi>;
  private readonly listeners = new Set<(state: RestrictedAuthState) => void>();
  private state: RestrictedAuthState;

  constructor(options: RestrictedAuthOptions = {}) {
    this.clientId = (options.clientId ?? getDefaultClientId()).trim();
    this.storage = options.storage === undefined ? getDefaultStorage() : options.storage;
    this.now = options.now ?? (() => Date.now());
    this.loadGis = options.loadGis ?? defaultLoadGis;
    this.state = this.createSignedOutState(null);
    this.restoreSession();
  }

  private createSignedOutState(error: string | null): RestrictedAuthState {
    return {
      status: 'signed_out',
      email: null,
      name: null,
      expiresAt: null,
      configured: this.clientId.length > 0,
      error,
    };
  }

  private restoreSession(): void {
    if (!this.storage || !this.clientId) return;
    try {
      const raw = this.storage.getItem(RESTRICTED_AUTH_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { credential?: unknown };
      if (typeof parsed?.credential !== 'string') {
        this.clearStoredSession();
        return;
      }
      const token = parseGoogleIdToken(parsed.credential, this.clientId, this.now());
      if (!token.ok || !isAuthorizedRestrictedEmail(token.email)) {
        this.clearStoredSession();
        return;
      }
      this.state = {
        status: 'authorized',
        email: token.email,
        name: token.name,
        expiresAt: token.expiresAt,
        configured: true,
        error: null,
      };
    } catch {
      this.clearStoredSession();
    }
  }

  private saveStoredCredential(credential: string): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(RESTRICTED_AUTH_STORAGE_KEY, JSON.stringify({ credential }));
    } catch {
      // Ignore storage quota errors
    }
  }

  private clearStoredSession(): void {
    if (!this.storage) return;
    try {
      this.storage.removeItem(RESTRICTED_AUTH_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }

  private checkExpiration(): void {
    if (this.state.expiresAt !== null && this.now() >= this.state.expiresAt) {
      this.clearStoredSession();
      this.state = this.createSignedOutState(null);
      this.emit();
    }
  }

  private emit(): void {
    const snapshot = { ...this.state };
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  public getState(): RestrictedAuthState {
    this.checkExpiration();
    return { ...this.state };
  }

  public isAuthorized(): boolean {
    return this.getState().status === 'authorized';
  }

  public subscribe(listener: (state: RestrictedAuthState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public handleCredential(credential: string): RestrictedAuthState {
    if (!this.clientId) {
      this.clearStoredSession();
      this.state = this.createSignedOutState('Google Sign-In is not configured.');
      this.emit();
      return { ...this.state };
    }

    const result = parseGoogleIdToken(credential, this.clientId, this.now());
    if (!result.ok) {
      this.clearStoredSession();
      this.state = this.createSignedOutState(result.reason);
      this.emit();
      return { ...this.state };
    }

    if (isAuthorizedRestrictedEmail(result.email)) {
      this.saveStoredCredential(credential);
      this.state = {
        status: 'authorized',
        email: result.email,
        name: result.name,
        expiresAt: result.expiresAt,
        configured: true,
        error: null,
      };
    } else {
      this.clearStoredSession();
      this.state = {
        status: 'unauthorized',
        email: result.email,
        name: result.name,
        expiresAt: result.expiresAt,
        configured: true,
        error: null,
      };
    }

    this.emit();
    return { ...this.state };
  }

  public signOut(): void {
    this.clearStoredSession();
    if (typeof window !== 'undefined') {
      const win = window as WindowWithGoogle;
      try {
        win.google?.accounts?.id?.disableAutoSelect?.();
      } catch {
        // Ignore GIS cleanup errors
      }
    }
    this.state = this.createSignedOutState(null);
    this.emit();
  }

  public async mountGoogleSignInButton(container: HTMLElement): Promise<void> {
    if (!this.clientId) return;

    container.innerHTML = `<div class="restricted-hint">Loading Google Sign-In…</div>`;

    try {
      const gis = await this.loadGis();
      if (!container.isConnected) return;

      gis.initialize({
        client_id: this.clientId,
        callback: (response) => {
          if (typeof response?.credential === 'string' && response.credential.length > 0) {
            this.handleCredential(response.credential);
          } else {
            this.state = this.createSignedOutState('Google sign-in did not return a credential.');
            this.emit();
          }
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      container.innerHTML = '';
      gis.renderButton(container, {
        type: 'standard',
        theme: 'filled_black',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular',
        width: 260,
      });
    } catch (err) {
      if (!container.isConnected) return;
      const message =
        err instanceof Error ? err.message : 'Unable to initialize Google Sign-In.';
      container.innerHTML = `
        <div class="restricted-error">${escapeText(message)}</div>
        <button type="button" class="raxi-btn" id="s-google-retry" style="padding:6px 14px;font-size:14px;margin-top:8px">RETRY GOOGLE SIGN-IN</button>
      `;
      const retryBtn = container.querySelector<HTMLButtonElement>('#s-google-retry');
      if (retryBtn) {
        retryBtn.onclick = () => {
          void this.mountGoogleSignInButton(container);
        };
      }
    }
  }
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
