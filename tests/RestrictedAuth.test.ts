import { describe, expect, it } from 'vitest';
import {
  AUTHORIZED_RESTRICTED_EMAILS,
  DEFAULT_GOOGLE_CLIENT_ID,
  RESTRICTED_AUTH_STORAGE_KEY,
  RestrictedAuthManager,
  RestrictedAuthState,
  decodeJwtPayload,
  isAuthorizedRestrictedEmail,
  parseGoogleIdToken,
} from '../src/auth/RestrictedAuth';
import { DEFAULT_SETTINGS } from '../src/save/Storage';
import { buildRestrictedSettingsHtml, buildSettingsPanelHtml } from '../src/ui/screens/Screens';

function encodeBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function makeFakeGoogleJwt(payload: Record<string, unknown>): string {
  const header = encodeBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = encodeBase64Url(JSON.stringify(payload));
  return `${header}.${body}.fake-signature`;
}

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
}

describe('RestrictedAuth helpers', () => {
  it('authorizes only sajmontube@gmail.com and matisawa20@gmail.com (case-insensitive)', () => {
    expect(AUTHORIZED_RESTRICTED_EMAILS).toEqual([
      'sajmontube@gmail.com',
      'matisawa20@gmail.com',
    ]);
    expect(isAuthorizedRestrictedEmail('sajmontube@gmail.com')).toBe(true);
    expect(isAuthorizedRestrictedEmail('matisawa20@gmail.com')).toBe(true);
    expect(isAuthorizedRestrictedEmail('  SAJMONTUBE@GMAIL.COM ')).toBe(true);
    expect(isAuthorizedRestrictedEmail('Matisawa20@Gmail.com')).toBe(true);

    expect(isAuthorizedRestrictedEmail('other@gmail.com')).toBe(false);
    expect(isAuthorizedRestrictedEmail('sajmontube@gmail.com.evil.com')).toBe(false);
    expect(isAuthorizedRestrictedEmail('')).toBe(false);
    expect(isAuthorizedRestrictedEmail(null)).toBe(false);
    expect(isAuthorizedRestrictedEmail(undefined)).toBe(false);
  });

  it('decodes base64url JWT payloads with UTF-8 characters', () => {
    const jwt = makeFakeGoogleJwt({
      email: 'sajmontube@gmail.com',
      name: 'Szymon Łącki',
    });
    const decoded = decodeJwtPayload(jwt);
    expect(decoded).toEqual({
      email: 'sajmontube@gmail.com',
      name: 'Szymon Łącki',
    });
    expect(decodeJwtPayload('not-a-jwt')).toBeNull();
    expect(decodeJwtPayload('a.!!!.c')).toBeNull();
  });

  it('validates Google ID token issuer, audience, expiry, and email_verified', () => {
    const nowMs = 1_700_000_000_000;
    const validExp = Math.floor(nowMs / 1000) + 3600;
    const basePayload = {
      iss: 'https://accounts.google.com',
      aud: DEFAULT_GOOGLE_CLIENT_ID,
      exp: validExp,
      email: 'sajmontube@gmail.com',
      email_verified: true,
      name: 'Szymon',
    };

    const ok = parseGoogleIdToken(makeFakeGoogleJwt(basePayload), DEFAULT_GOOGLE_CLIENT_ID, nowMs);
    expect(ok).toEqual({
      ok: true,
      email: 'sajmontube@gmail.com',
      name: 'Szymon',
      expiresAt: validExp * 1000,
    });

    // Wrong issuer
    expect(
      parseGoogleIdToken(
        makeFakeGoogleJwt({ ...basePayload, iss: 'https://evil.example.com' }),
        DEFAULT_GOOGLE_CLIENT_ID,
        nowMs
      ).ok
    ).toBe(false);

    // Audience mismatch
    expect(
      parseGoogleIdToken(
        makeFakeGoogleJwt({ ...basePayload, aud: 'other-client.apps.googleusercontent.com' }),
        DEFAULT_GOOGLE_CLIENT_ID,
        nowMs
      ).ok
    ).toBe(false);

    // Expired token
    expect(
      parseGoogleIdToken(
        makeFakeGoogleJwt({ ...basePayload, exp: Math.floor(nowMs / 1000) - 10 }),
        DEFAULT_GOOGLE_CLIENT_ID,
        nowMs
      ).ok
    ).toBe(false);

    // Unverified email
    expect(
      parseGoogleIdToken(
        makeFakeGoogleJwt({ ...basePayload, email_verified: false }),
        DEFAULT_GOOGLE_CLIENT_ID,
        nowMs
      ).ok
    ).toBe(false);
  });
});

describe('RestrictedAuthManager', () => {
  it('authorizes allowed users, persists valid sessions, expires automatically, and signs out cleanly', () => {
    let nowMs = 1_700_000_000_000;
    const storage = createMemoryStorage();
    const manager = new RestrictedAuthManager({
      clientId: DEFAULT_GOOGLE_CLIENT_ID,
      storage,
      now: () => nowMs,
    });

    const events: RestrictedAuthState[] = [];
    const unsubscribe = manager.subscribe((st) => events.push(st));

    expect(manager.isAuthorized()).toBe(false);
    expect(manager.getState().status).toBe('signed_out');
    expect(manager.getState().configured).toBe(true);

    // Authorized user 1
    const token1 = makeFakeGoogleJwt({
      iss: 'https://accounts.google.com',
      aud: DEFAULT_GOOGLE_CLIENT_ID,
      exp: Math.floor(nowMs / 1000) + 1200,
      email: 'SajmonTube@gmail.com',
      email_verified: true,
    });
    const res1 = manager.handleCredential(token1);
    expect(res1.status).toBe('authorized');
    expect(res1.email).toBe('sajmontube@gmail.com');
    expect(manager.isAuthorized()).toBe(true);
    expect(storage.getItem(RESTRICTED_AUTH_STORAGE_KEY)).not.toBeNull();

    // Restores authorized session in a fresh manager instance
    const restored = new RestrictedAuthManager({
      clientId: DEFAULT_GOOGLE_CLIENT_ID,
      storage,
      now: () => nowMs,
    });
    expect(restored.isAuthorized()).toBe(true);
    expect(restored.getState().email).toBe('sajmontube@gmail.com');

    // Automatically expires when time passes exp
    nowMs += 1_300_000;
    expect(manager.isAuthorized()).toBe(false);
    expect(manager.getState().status).toBe('signed_out');
    expect(storage.getItem(RESTRICTED_AUTH_STORAGE_KEY)).toBeNull();

    // Authorized user 2
    const token2 = makeFakeGoogleJwt({
      iss: 'accounts.google.com',
      aud: DEFAULT_GOOGLE_CLIENT_ID,
      exp: Math.floor(nowMs / 1000) + 1200,
      email: 'matisawa20@gmail.com',
      email_verified: true,
    });
    expect(manager.handleCredential(token2).status).toBe('authorized');
    expect(manager.isAuthorized()).toBe(true);

    // Sign out clears session
    manager.signOut();
    expect(manager.isAuthorized()).toBe(false);
    expect(manager.getState().status).toBe('signed_out');
    expect(storage.getItem(RESTRICTED_AUTH_STORAGE_KEY)).toBeNull();
    expect(events.length).toBeGreaterThanOrEqual(3);

    unsubscribe();
  });

  it('denies access to unauthorized Google accounts without persisting credentials', () => {
    const nowMs = 1_700_000_000_000;
    const storage = createMemoryStorage();
    const manager = new RestrictedAuthManager({
      clientId: DEFAULT_GOOGLE_CLIENT_ID,
      storage,
      now: () => nowMs,
    });

    const token = makeFakeGoogleJwt({
      iss: 'https://accounts.google.com',
      aud: DEFAULT_GOOGLE_CLIENT_ID,
      exp: Math.floor(nowMs / 1000) + 1200,
      email: 'intruder@gmail.com',
      email_verified: true,
    });

    const state = manager.handleCredential(token);
    expect(state.status).toBe('unauthorized');
    expect(state.email).toBe('intruder@gmail.com');
    expect(manager.isAuthorized()).toBe(false);
    expect(storage.getItem(RESTRICTED_AUTH_STORAGE_KEY)).toBeNull();
  });
});

describe('Settings Restricted section HTML gating', () => {
  it('moves Special Fare Sounds out of general settings and hides it when signed out', () => {
    const html = buildSettingsPanelHtml(DEFAULT_SETTINGS, {
      status: 'signed_out',
      email: null,
      name: null,
      expiresAt: null,
      configured: true,
      error: null,
    });

    expect(html).toContain('RESTRICTED');
    expect(html).toContain('LOCKED');
    expect(html).toContain('s-google-signin-slot');
    expect(html).not.toContain('Special Fare Sounds');
    expect(html).not.toContain('s-special-sounds');
  });

  it('hides Special Fare Sounds and shows access denied for unauthorized emails', () => {
    const html = buildSettingsPanelHtml(DEFAULT_SETTINGS, {
      status: 'unauthorized',
      email: 'random@gmail.com',
      name: null,
      expiresAt: null,
      configured: true,
      error: null,
    });

    expect(html).toContain('ACCESS DENIED');
    expect(html).toContain('random@gmail.com');
    expect(html).toContain('s-restricted-signout');
    expect(html).not.toContain('Special Fare Sounds');
    expect(html).not.toContain('s-special-sounds');
  });

  it('shows Special Fare Sounds inside the Restricted section only when authorized', () => {
    const settingsOn = { ...DEFAULT_SETTINGS, specialFareSounds: true };
    const auth: RestrictedAuthState = {
      status: 'authorized',
      email: 'sajmontube@gmail.com',
      name: 'Szymon',
      expiresAt: Date.now() + 60_000,
      configured: true,
      error: null,
    };

    const panelHtml = buildSettingsPanelHtml(settingsOn, auth);
    const restrictedHtml = buildRestrictedSettingsHtml(settingsOn, auth);

    expect(restrictedHtml).toContain('UNLOCKED');
    expect(restrictedHtml).toContain('sajmontube@gmail.com');
    expect(restrictedHtml).toContain('Special Fare Sounds');
    expect(restrictedHtml).toContain('s-special-sounds');
    expect(restrictedHtml).toContain('>ON<');
    expect(restrictedHtml).toContain('s-restricted-signout');

    // Ensure Special Fare Sounds appears exactly once (inside the Restricted section, not in general settings)
    expect(panelHtml.match(/Special Fare Sounds/g)?.length).toBe(1);
    const restrictedIdx = panelHtml.indexOf('settings-restricted');
    const specialIdx = panelHtml.indexOf('Special Fare Sounds');
    expect(restrictedIdx).toBeGreaterThan(-1);
    expect(specialIdx).toBeGreaterThan(restrictedIdx);
  });
});
