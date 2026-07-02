import { spawn } from 'child_process';
import { ExternalServiceError } from '@/utils/errors';
import { Logger } from '@/utils/logger';

/**
 * Options d'invocation de la CLI Claude.
 */
export interface ClaudeCliOptions {
  /** Prompt transmis via stdin (évite les limites de longueur d'arguments). */
  prompt: string;
  /** Chemin/commande de la CLI Claude. */
  cliPath: string;
  /** Arguments de ligne de commande (hors prompt). */
  args: string[];
  /** Délai maximal avant abandon, en millisecondes. */
  timeoutMs: number;
  /** Répertoire de travail (ex. checkout local du dépôt à analyser). */
  cwd?: string;
}

/**
 * Runner bas niveau de la CLI Claude en mode headless.
 *
 * Lance le binaire, écrit le prompt sur stdin et renvoie stdout. Toute erreur
 * (binaire absent, code de sortie non nul, dépassement de délai, sortie vide)
 * est convertie en `ExternalServiceError` exploitable par l'appelant.
 */
export function runClaudeCli(options: ClaudeCliOptions): Promise<string> {
  const { prompt, cliPath, args, timeoutMs, cwd } = options;

  return new Promise<string>((resolve, reject) => {
    Logger.debug('Spawning Claude CLI', { cliPath, args, cwd });

    const child = spawn(cliPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      ...(cwd ? { cwd } : {}),
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(
        new ExternalServiceError(
          `La CLI Claude a dépassé le délai de ${timeoutMs} ms`,
          'Claude CLI',
          undefined,
          true
        )
      );
    }, timeoutMs);
    timer.unref();

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        new ExternalServiceError(
          `Impossible de lancer la CLI Claude (${cliPath}). Est-elle installée et dans le PATH ?`,
          'Claude CLI',
          undefined,
          false,
          {},
          error
        )
      );
    });

    child.on('close', (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (code === 0) {
        const output = stdout.trim();
        if (output.length === 0) {
          reject(
            new ExternalServiceError(
              'La CLI Claude a renvoyé une sortie vide',
              'Claude CLI',
              undefined,
              true
            )
          );
          return;
        }
        resolve(output);
      } else {
        // La CLI Claude écrit souvent ses erreurs (ex. « Invalid API key »)
        // sur stdout : on s'y replie quand stderr est vide.
        const detail = stderr.trim() || stdout.trim();
        reject(
          new ExternalServiceError(
            `La CLI Claude s'est terminée avec le code ${code ?? 'inconnu'}: ${detail.slice(0, 500)}`,
            'Claude CLI',
            undefined,
            true
          )
        );
      }
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}
