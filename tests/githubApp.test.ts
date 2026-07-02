import { generateKeyPairSync, createVerify } from 'crypto';
import { describe, expect, it, vi } from 'vitest';
import { buildAppJwt, createInstallationTokenProvider } from '@/services/githubApp';
import { ExternalServiceError } from '@/utils/errors';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as Record<string, unknown>;
}

describe('buildAppJwt', () => {
  it('produit un JWT RS256 signé et vérifiable avec la clé publique', () => {
    const jwt = buildAppJwt('Iv23liixAAbOYPx3Xj47', privateKey, 1_700_000_000);
    const [header, payload, signature] = jwt.split('.');
    if (!header || !payload || !signature) throw new Error('JWT mal formé');

    expect(decodeSegment(header)).toEqual({ alg: 'RS256', typ: 'JWT' });

    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${header}.${payload}`);
    expect(verifier.verify(publicKey, Buffer.from(signature, 'base64url'))).toBe(true);
  });

  it("porte l'émetteur et une fenêtre de validité décalée (horloge GitHub)", () => {
    const now = 1_700_000_000;
    const jwt = buildAppJwt('4203824', privateKey, now);
    const payload = decodeSegment(jwt.split('.')[1] ?? '');

    expect(payload['iss']).toBe('4203824');
    // iat dans le passé (tolérance de dérive d'horloge), exp <= now + 10 min (max GitHub).
    expect(payload['iat']).toBeLessThan(now);
    expect(payload['exp']).toBeGreaterThan(now);
    expect(payload['exp']).toBeLessThanOrEqual(now + 600);
  });
});

describe('createInstallationTokenProvider', () => {
  function makeProvider(overrides: {
    fetchFn?: typeof fetch;
    now?: () => number;
    expiresAt?: string;
  }) {
    // Une Response fraîche par appel : un corps ne peut être lu qu'une fois.
    const fetchFn =
      overrides.fetchFn ??
      (vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              token: 'ghs_installation_token',
              expires_at: overrides.expiresAt ?? new Date(Date.now() + 3_600_000).toISOString(),
            }),
            { status: 201 }
          )
        )
      ) as unknown as typeof fetch);

    const provider = createInstallationTokenProvider({
      appId: 'Iv23liixAAbOYPx3Xj47',
      installationId: '144060663',
      apiBaseUrl: 'https://api.github.com',
      loadPrivateKey: () => Promise.resolve(privateKey),
      fetchFn,
      ...(overrides.now ? { now: overrides.now } : {}),
    });

    return { provider, fetchFn };
  }

  it("frappe un token d'installation via l'API GitHub", async () => {
    const { provider, fetchFn } = makeProvider({});

    await expect(provider()).resolves.toBe('ghs_installation_token');

    const call = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(call[0]).toBe('https://api.github.com/app/installations/144060663/access_tokens');
    expect(call[1].method).toBe('POST');
    expect((call[1].headers as Record<string, string>)['Authorization']).toMatch(/^Bearer ey/);
  });

  it('met le token en cache tant qu’il est loin de son expiration', async () => {
    const { provider, fetchFn } = makeProvider({});

    await provider();
    await provider();

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('frappe un nouveau token quand le précédent approche de son expiration', async () => {
    let currentTime = Date.now();
    const { provider, fetchFn } = makeProvider({
      now: () => currentTime,
      expiresAt: new Date(currentTime + 3_600_000).toISOString(),
    });

    await provider();
    currentTime += 3_600_000 - 60_000; // à 1 min de l'expiration
    await provider();

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("échoue avec une ExternalServiceError explicite quand l'API refuse", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response('{"message":"bad credentials"}', { status: 401 }));
    const { provider } = makeProvider({ fetchFn: fetchFn as unknown as typeof fetch });

    await expect(provider()).rejects.toBeInstanceOf(ExternalServiceError);
    await expect(provider()).rejects.toThrow(/401/);
  });
});
