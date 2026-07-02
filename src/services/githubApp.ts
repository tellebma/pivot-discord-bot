import { createSign } from 'crypto';
import { readFile } from 'fs/promises';
import { reviewConfig } from '@/utils/reviewConfig';
import { ExternalServiceError } from '@/utils/errors';
import { Logger } from '@/utils/logger';

/**
 * Authentification GitHub App : les reviews apparaissent au nom de l'App
 * (`pivot-review-bot[bot]`) au lieu du compte propriétaire d'un PAT.
 *
 * Un token d'installation expire au bout d'une heure : il est frappé à la
 * demande (JWT signé avec la clé privée de l'App, échangé contre un token via
 * l'API) et mis en cache jusqu'à l'approche de son expiration.
 */

/** Marge avant expiration au-delà de laquelle le token en cache est refrappé. */
const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000;

/** Durée de vie du JWT d'App (max 10 min côté GitHub, on reste en dessous). */
const JWT_TTL_SECONDS = 540;

/** Tolérance de dérive d'horloge entre le bot et GitHub. */
const JWT_CLOCK_DRIFT_SECONDS = 60;

function base64url(data: Buffer | string): string {
  return Buffer.from(data).toString('base64url');
}

/**
 * Construit le JWT d'authentification de l'App (RS256). `appId` accepte
 * indifféremment l'App ID numérique ou le Client ID (`Iv1...`), conformément à
 * la documentation GitHub.
 */
export function buildAppJwt(
  appId: string,
  privateKey: string,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      iat: nowSeconds - JWT_CLOCK_DRIFT_SECONDS,
      exp: nowSeconds + JWT_TTL_SECONDS,
      iss: appId,
    })
  );

  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  const signature = base64url(signer.sign(privateKey));

  return `${header}.${payload}.${signature}`;
}

export interface InstallationTokenProviderOptions {
  /** App ID numérique ou Client ID de la GitHub App. */
  appId: string;
  /** ID de l'installation de l'App sur l'organisation. */
  installationId: string;
  /** Base de l'API GitHub (personnalisable pour GitHub Enterprise). */
  apiBaseUrl: string;
  /** Chargement de la clé privée PEM (fichier monté en volume en production). */
  loadPrivateKey: () => Promise<string>;
  /** Implémentation de fetch injectable (tests). */
  fetchFn?: typeof fetch;
  /** Horloge injectable (tests), en millisecondes. */
  now?: () => number;
}

interface RawInstallationToken {
  token?: string;
  expires_at?: string;
}

/**
 * Fabrique un fournisseur de tokens d'installation avec cache : chaque appel
 * renvoie un token valide, refrappé uniquement à l'approche de l'expiration.
 */
export function createInstallationTokenProvider(
  options: InstallationTokenProviderOptions
): () => Promise<string> {
  const fetchFn = options.fetchFn ?? fetch;
  const now = options.now ?? Date.now;
  const endpoint = `${options.apiBaseUrl.replace(/\/+$/, '')}/app/installations/${options.installationId}/access_tokens`;

  let cached: { token: string; expiresAtMs: number } | null = null;

  return async (): Promise<string> => {
    if (cached && cached.expiresAtMs - now() > TOKEN_REFRESH_MARGIN_MS) {
      return cached.token;
    }

    const privateKey = await options.loadPrivateKey();
    const jwt = buildAppJwt(options.appId, privateKey, Math.floor(now() / 1000));

    let response: Response;
    try {
      response = await fetchFn(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'pivot-discord-bot',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
    } catch (error) {
      throw new ExternalServiceError(
        "Impossible de contacter l'API GitHub pour frapper le token d'installation de la GitHub App",
        'GitHub API',
        undefined,
        true,
        {},
        error instanceof Error ? error : undefined
      );
    }

    if (!response.ok) {
      throw new ExternalServiceError(
        `L'API GitHub a répondu ${response.status} lors de la frappe du token d'installation (App ${options.appId}, installation ${options.installationId})`,
        'GitHub API',
        response.status,
        response.status >= 500 || response.status === 429
      );
    }

    const data = (await response.json()) as RawInstallationToken;
    if (!data.token) {
      throw new ExternalServiceError(
        "L'API GitHub a renvoyé une réponse sans token d'installation",
        'GitHub API',
        undefined,
        true
      );
    }

    cached = {
      token: data.token,
      expiresAtMs: data.expires_at ? Date.parse(data.expires_at) : now() + 3_600_000,
    };
    Logger.debug('GitHub App installation token minted', {
      installationId: options.installationId,
    });
    return cached.token;
  };
}

/** Fournisseur par défaut, construit paresseusement depuis la configuration. */
let defaultProvider: (() => Promise<string>) | null = null;

/**
 * Renvoie un token GitHub frais issu de la GitHub App, ou `null` si l'App
 * n'est pas configurée (repli sur le `GITHUB_TOKEN` statique).
 */
export async function getGithubAppToken(): Promise<string | null> {
  const app = reviewConfig.github.app;
  if (!app) return null;

  if (!defaultProvider) {
    defaultProvider = createInstallationTokenProvider({
      appId: app.appId,
      installationId: app.installationId,
      apiBaseUrl: reviewConfig.github.apiBaseUrl,
      loadPrivateKey: () => readFile(app.privateKeyPath, 'utf8'),
    });
  }
  return defaultProvider();
}

/**
 * Variables d'environnement à injecter dans les sous-processus (`gh`, CLI
 * Claude) pour qu'ils agissent au nom de la GitHub App. `undefined` si l'App
 * n'est pas configurée : les sous-processus héritent alors de l'environnement
 * du bot (GITHUB_TOKEN statique).
 */
export async function buildGithubAppEnv(): Promise<Record<string, string> | undefined> {
  const token = await getGithubAppToken();
  if (!token) return undefined;
  return { GITHUB_TOKEN: token, GH_TOKEN: token };
}
