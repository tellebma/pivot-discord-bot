import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

/**
 * Configuration de la commande `/ask` : recherche fonctionnelle (« métier »)
 * sur le code Pivot, réalisée par Claude Code exécuté localement (sur `main`)
 * dans un checkout du dépôt, en lecture seule.
 */
export interface AskConfig {
  /** La fonctionnalité est active uniquement si un dépôt local est fourni. */
  enabled: boolean;
  /** Chemin du checkout local du code Pivot à analyser (branche `main`). */
  repoPath: string | undefined;
  /** Chemin/commande de la CLI Claude Code. */
  cliPath: string;
  /** Modèle Claude à utiliser (optionnel). */
  model: string | undefined;
  /**
   * Outils autorisés (lecture seule). Garde-fou clé : sans Write/Edit/Bash dans
   * cette liste, l'agent ne peut ni modifier le code ni exécuter de commandes.
   */
  allowedTools: string[];
  /** Nombre maximal de tours d'exploration (borne le coût). */
  maxTurns: number;
  /** Délai maximal d'une recherche avant abandon, en millisecondes. */
  timeoutMs: number;
  /** Longueur maximale (caractères) de la question acceptée. */
  maxQuestionLength: number;
}

function parseList(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  const items = value
    .split(',')
    .map(item => item.trim())
    .filter(item => item.length > 0);
  return items.length > 0 ? items : fallback;
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const repoPath = process.env['ASK_REPO_PATH']?.trim() || undefined;

export const askConfig: AskConfig = {
  enabled: Boolean(repoPath),
  repoPath,
  cliPath: process.env['CLAUDE_CLI_PATH'] ?? 'claude',
  model: process.env['ASK_CLAUDE_MODEL'] || process.env['CLAUDE_CLI_MODEL'] || undefined,
  allowedTools: parseList(process.env['ASK_ALLOWED_TOOLS'], ['Read', 'Grep', 'Glob']),
  maxTurns: parseInteger(process.env['ASK_MAX_TURNS'], 30),
  timeoutMs: parseInteger(process.env['ASK_TIMEOUT_MS'], 300_000),
  maxQuestionLength: parseInteger(process.env['ASK_MAX_QUESTION_LENGTH'], 500),
};
