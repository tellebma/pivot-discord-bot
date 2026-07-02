import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

/**
 * Configuration dédiée à la fonctionnalité de relecture de Pull Requests.
 * Toutes les valeurs sont dérivées de variables d'environnement, ce qui rend
 * les canaux surveillés, le binaire Claude et les limites entièrement
 * paramétrables sans toucher au code.
 */
export interface ReviewConfig {
  /** IDs des canaux Discord surveillés pour les liens de PR. Vide = aucun. */
  channelIds: string[];
  github: {
    /** Token GitHub optionnel (dépôts privés / limites de débit). */
    token: string | undefined;
    /** Base de l'API GitHub (personnalisable pour GitHub Enterprise). */
    apiBaseUrl: string;
  };
  claude: {
    /** Chemin/commande de la CLI Claude installée sur l'hôte. */
    cliPath: string;
    /** Modèle Claude à utiliser (optionnel, laisse le défaut de la CLI sinon). */
    model: string | undefined;
    /** Arguments supplémentaires passés à la CLI (séparés par des espaces). */
    extraArgs: string[];
    /** Délai maximal d'une relecture avant abandon, en millisecondes. */
    timeoutMs: number;
    /**
     * Outils autorisés pour l'agent de relecture : la CLI `gh` (consultation
     * de la PR, approbation, demande de changements) et la lecture seule du
     * checkout local (Read/Grep/Glob). Sans autre entrée dans cette liste,
     * l'agent ne peut rien exécuter d'autre.
     */
    allowedTools: string[];
    /** Nombre maximal de tours de l'agent (borne le coût). */
    maxTurns: number;
  };
  /**
   * Répertoire des clones locaux servant de checkout au code des PR relues
   * (un clone persistant par dépôt). `null` = checkout local désactivé, la
   * relecture passe uniquement par la CLI `gh`.
   */
  workspaceDir: string | null;
}

function parseList(value: string | undefined, fallback: string[] = []): string[] {
  if (!value) return fallback;
  const items = value
    .split(',')
    .map(item => item.trim())
    .filter(item => item.length > 0);
  return items.length > 0 ? items : fallback;
}

function parseArgs(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/\s+/)
    .map(item => item.trim())
    .filter(item => item.length > 0);
}

/**
 * Répertoire du workspace de relecture : valeur par défaut si la variable est
 * absente, `null` (désactivé) si elle est explicitement vide.
 */
function parseWorkspaceDir(value: string | undefined): string | null {
  if (value === undefined) return '.review-workspace';
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const reviewConfig: ReviewConfig = {
  channelIds: parseList(process.env['PR_REVIEW_CHANNEL_ID']),
  github: {
    token: process.env['GITHUB_TOKEN'] || undefined,
    apiBaseUrl: process.env['GITHUB_API_URL'] ?? 'https://api.github.com',
  },
  claude: {
    cliPath: process.env['CLAUDE_CLI_PATH'] ?? 'claude',
    model: process.env['CLAUDE_CLI_MODEL'] || undefined,
    extraArgs: parseArgs(process.env['CLAUDE_CLI_EXTRA_ARGS']),
    timeoutMs: parseInteger(process.env['CLAUDE_REVIEW_TIMEOUT_MS'], 300_000),
    allowedTools: parseList(process.env['PR_REVIEW_ALLOWED_TOOLS'], [
      'Bash(gh pr:*)',
      'Bash(gh api:*)',
      'Read',
      'Grep',
      'Glob',
    ]),
    maxTurns: parseInteger(process.env['PR_REVIEW_MAX_TURNS'], 20),
  },
  workspaceDir: parseWorkspaceDir(process.env['PR_REVIEW_WORKSPACE_DIR']),
};
