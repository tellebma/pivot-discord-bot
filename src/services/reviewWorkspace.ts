import { spawn } from 'child_process';
import { access, mkdir } from 'fs/promises';
import { join, resolve } from 'path';
import { reviewConfig } from '@/utils/reviewConfig';
import { Logger } from '@/utils/logger';
import { sanitizeMessage } from '@/utils/sanitize';
import type { PullRequestRef } from './github';

/** Délai maximal d'une commande git/gh de préparation du workspace. */
const COMMAND_TIMEOUT_MS = 180_000;

/**
 * Verrous en mémoire, un par dépôt : le checkout change la branche du clone,
 * deux relectures simultanées du même dépôt doivent donc être sérialisées.
 */
const repoLocks = new Map<string, Promise<unknown>>();

/**
 * Sérialise l'exécution de `fn` par clé : les appels partageant la même clé
 * s'exécutent l'un après l'autre, les clés distinctes restent parallèles.
 */
export async function withRepoLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = repoLocks.get(key) ?? Promise.resolve();
  const run = previous.then(fn);
  const lock = run.catch(() => undefined);
  repoLocks.set(key, lock);
  void lock.then(() => {
    if (repoLocks.get(key) === lock) repoLocks.delete(key);
  });
  return run;
}

function runCommand(command: string, args: string[], cwd?: string): Promise<void> {
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      ...(cwd ? { cwd } : {}),
    });

    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error(`\`${command} ${args.join(' ')}\` a dépassé ${COMMAND_TIMEOUT_MS} ms`));
    }, COMMAND_TIMEOUT_MS);
    timer.unref();

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolvePromise();
      } else {
        const detail = sanitizeMessage(stderr.trim()).slice(0, 300);
        reject(
          new Error(
            `\`${command} ${args.join(' ')}\` s'est terminé avec le code ${code ?? 'inconnu'} : ${detail}`
          )
        );
      }
    });
  });
}

async function isGitRepository(dir: string): Promise<boolean> {
  try {
    await access(join(dir, '.git'));
    return true;
  } catch {
    return false;
  }
}

/**
 * Prépare le checkout local du code de la PR : clone persistant par dépôt
 * (cache réutilisé entre les relectures), remise au propre, puis
 * `gh pr checkout` pour se placer sur la branche exacte de la PR (forks
 * compris). Renvoie `null` si le workspace est désactivé ou si la préparation
 * échoue — la relecture se replie alors sur la CLI `gh` seule.
 */
async function prepareReviewWorkspace(ref: PullRequestRef): Promise<string | null> {
  const baseDir = reviewConfig.workspaceDir;
  if (!baseDir) return null;

  const repoDir = resolve(baseDir, ref.owner, ref.repo);

  try {
    if (await isGitRepository(repoDir)) {
      // Le clone est réutilisé : on repart d'un état propre avant de changer
      // de branche (l'agent est en lecture seule, mais un checkout interrompu
      // peut laisser le clone sale).
      await runCommand('git', ['reset', '--hard'], repoDir);
      await runCommand('git', ['clean', '-fd'], repoDir);
    } else {
      await mkdir(resolve(baseDir, ref.owner), { recursive: true });
      await runCommand('gh', ['repo', 'clone', `${ref.owner}/${ref.repo}`, repoDir]);
    }

    // --force : réinitialise la branche locale si la PR a été force-pushée
    // depuis une relecture précédente (sinon le checkout non fast-forward échoue).
    await runCommand('gh', ['pr', 'checkout', String(ref.number), '--force'], repoDir);

    Logger.info('Review workspace ready', {
      repo: `${ref.owner}/${ref.repo}`,
      pr: ref.number,
      dir: repoDir,
    });
    return repoDir;
  } catch (error) {
    Logger.warn('Review workspace preparation failed, falling back to gh-only review', {
      repo: `${ref.owner}/${ref.repo}`,
      pr: ref.number,
      error: error instanceof Error ? sanitizeMessage(error.message) : String(error),
    });
    return null;
  }
}

/**
 * Exécute `fn` avec le chemin du checkout local de la PR (ou `null` en repli),
 * sous verrou du dépôt : le clone reste sur la branche de la PR pendant toute
 * la relecture.
 */
export async function withReviewWorkspace<T>(
  ref: PullRequestRef,
  fn: (workspaceDir: string | null) => Promise<T>
): Promise<T> {
  return withRepoLock(`${ref.owner}/${ref.repo}`, async () => {
    const workspaceDir = await prepareReviewWorkspace(ref);
    return fn(workspaceDir);
  });
}
