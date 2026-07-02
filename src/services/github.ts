import { reviewConfig } from '@/utils/reviewConfig';
import { ExternalServiceError } from '@/utils/errors';

/**
 * Référence d'une Pull Request GitHub extraite d'une URL.
 */
export interface PullRequestRef {
  owner: string;
  repo: string;
  number: number;
  url: string;
}

/**
 * Métadonnées d'une Pull Request utiles pour contextualiser la relecture.
 */
export interface PullRequestMetadata {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string;
  author: string;
  baseRef: string;
  headRef: string;
  state: string;
  merged: boolean;
  additions: number;
  deletions: number;
  changedFiles: number;
  htmlUrl: string;
}

// Capture owner / repo / numéro d'une URL de PR GitHub (globale pour multi-match).
const PR_URL_REGEX = /https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)(?:[/#?][^\s>]*)?/gi;

/**
 * Analyse une URL unique et renvoie la référence de PR correspondante, ou
 * `null` si l'URL n'est pas une URL de Pull Request GitHub.
 */
export function parsePullRequestUrl(url: string): PullRequestRef | null {
  PR_URL_REGEX.lastIndex = 0;
  const match = PR_URL_REGEX.exec(url);
  if (!match) return null;
  const [, owner, repo, number] = match;
  if (!owner || !repo || !number) return null;
  return {
    owner,
    repo,
    number: Number.parseInt(number, 10),
    url: `https://github.com/${owner}/${repo}/pull/${number}`,
  };
}

/**
 * Extrait toutes les références de PR distinctes présentes dans un texte
 * (contenu d'un message Discord par exemple).
 */
export function extractPullRequestRefs(content: string): PullRequestRef[] {
  const refs = new Map<string, PullRequestRef>();
  PR_URL_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = PR_URL_REGEX.exec(content)) !== null) {
    const [, owner, repo, number] = match;
    if (!owner || !repo || !number) continue;
    const ref: PullRequestRef = {
      owner,
      repo,
      number: Number.parseInt(number, 10),
      url: `https://github.com/${owner}/${repo}/pull/${number}`,
    };
    refs.set(`${owner}/${repo}#${ref.number}`, ref);
  }

  return [...refs.values()];
}

function buildHeaders(accept: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: accept,
    'User-Agent': 'pivot-discord-bot',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (reviewConfig.github.token) {
    headers['Authorization'] = `Bearer ${reviewConfig.github.token}`;
  }
  return headers;
}

function pullRequestEndpoint(ref: PullRequestRef): string {
  const base = reviewConfig.github.apiBaseUrl.replace(/\/+$/, '');
  return `${base}/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`;
}

interface RawPullRequest {
  title?: string;
  body?: string | null;
  user?: { login?: string } | null;
  base?: { ref?: string } | null;
  head?: { ref?: string } | null;
  state?: string;
  merged?: boolean;
  additions?: number;
  deletions?: number;
  changed_files?: number;
  html_url?: string;
}

/**
 * Récupère les métadonnées d'une Pull Request via l'API REST GitHub.
 */
export async function fetchPullRequest(ref: PullRequestRef): Promise<PullRequestMetadata> {
  let response: Response;
  try {
    response = await fetch(pullRequestEndpoint(ref), {
      headers: buildHeaders('application/vnd.github+json'),
    });
  } catch (error) {
    throw new ExternalServiceError(
      `Impossible de contacter l'API GitHub pour ${ref.owner}/${ref.repo}#${ref.number}`,
      'GitHub API',
      undefined,
      true,
      {},
      error instanceof Error ? error : undefined
    );
  }

  if (!response.ok) {
    throw new ExternalServiceError(
      `L'API GitHub a répondu ${response.status} pour ${ref.owner}/${ref.repo}#${ref.number}`,
      'GitHub API',
      response.status,
      response.status >= 500 || response.status === 429
    );
  }

  const data = (await response.json()) as RawPullRequest;

  return {
    owner: ref.owner,
    repo: ref.repo,
    number: ref.number,
    title: data.title ?? '(sans titre)',
    body: data.body ?? '',
    author: data.user?.login ?? 'inconnu',
    baseRef: data.base?.ref ?? '?',
    headRef: data.head?.ref ?? '?',
    state: data.state ?? 'unknown',
    merged: data.merged ?? false,
    additions: data.additions ?? 0,
    deletions: data.deletions ?? 0,
    changedFiles: data.changed_files ?? 0,
    htmlUrl: data.html_url ?? ref.url,
  };
}

/**
 * Récupère le diff unifié complet d'une Pull Request.
 */
export async function fetchPullRequestDiff(ref: PullRequestRef): Promise<string> {
  let response: Response;
  try {
    response = await fetch(pullRequestEndpoint(ref), {
      headers: buildHeaders('application/vnd.github.v3.diff'),
    });
  } catch (error) {
    throw new ExternalServiceError(
      `Impossible de récupérer le diff de ${ref.owner}/${ref.repo}#${ref.number}`,
      'GitHub API',
      undefined,
      true,
      {},
      error instanceof Error ? error : undefined
    );
  }

  if (!response.ok) {
    throw new ExternalServiceError(
      `L'API GitHub a répondu ${response.status} lors de la récupération du diff`,
      'GitHub API',
      response.status,
      response.status >= 500 || response.status === 429
    );
  }

  return response.text();
}
