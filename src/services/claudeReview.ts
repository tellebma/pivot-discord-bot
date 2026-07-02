import { spawn } from 'child_process';
import { reviewConfig } from '@/utils/reviewConfig';
import { ExternalServiceError } from '@/utils/errors';
import { Logger } from '@/utils/logger';
import type { PullRequestMetadata } from './github';

/**
 * Construit le prompt optimisé de relecture. L'agent est volontairement
 * « sans contexte » : il ne dispose que des métadonnées et du diff fournis, et
 * doit fonder toute sa revue sur ce seul contenu.
 */
export function buildReviewPrompt(
  metadata: PullRequestMetadata,
  diff: string,
  diffTruncated: boolean
): string {
  const description =
    metadata.body.trim().length > 0 ? metadata.body.trim() : '(aucune description)';
  const truncationNotice = diffTruncated
    ? '\n\n> ⚠️ Le diff a été tronqué car il dépasse la limite configurée. Base ta revue sur la portion fournie et signale que la couverture est partielle.'
    : '';

  return [
    "Tu es un ingénieur logiciel senior chargé d'une relecture de code (code review) approfondie et rigoureuse d'une Pull Request GitHub.",
    "On te fournit uniquement les métadonnées de la PR et son diff unifié. Tu n'as accès à AUCUN autre contexte, dépôt ou historique : fonde ta revue EXCLUSIVEMENT sur le diff ci-dessous.",
    '',
    '## Métadonnées de la Pull Request',
    `- Dépôt : ${metadata.owner}/${metadata.repo}`,
    `- Numéro : #${metadata.number}`,
    `- Titre : ${metadata.title}`,
    `- Auteur : ${metadata.author}`,
    `- Branches : \`${metadata.headRef}\` → \`${metadata.baseRef}\``,
    `- État : ${metadata.state}${metadata.merged ? ' (mergée)' : ''}`,
    `- Volume : ${metadata.changedFiles} fichier(s) modifié(s), +${metadata.additions} / -${metadata.deletions}`,
    '',
    "## Description fournie par l'auteur",
    description,
    '',
    '## Diff à relire',
    '```diff',
    diff,
    '```',
    truncationNotice,
    '',
    '## Ta mission',
    'Produis une relecture complète, actionnable et concise, en français, au format Markdown. Structure impérativement ta réponse ainsi :',
    '',
    '### 🔎 Résumé',
    '2 à 3 phrases décrivant ce que fait la PR et une appréciation globale.',
    '',
    '### 🐛 Bugs & correction',
    "Erreurs de logique, cas limites non gérés, régressions potentielles. Référence `fichier:ligne` quand c'est pertinent.",
    '',
    '### 🔒 Sécurité',
    "Failles, secrets exposés, injections, absence de validation des entrées, contrôle d'accès.",
    '',
    '### ⚡ Performance',
    'Requêtes N+1, boucles ou allocations coûteuses, opérations bloquantes.',
    '',
    '### 🧪 Tests',
    'Tests manquants ou insuffisants au regard des changements.',
    '',
    '### 🎨 Qualité & style',
    'Lisibilité, nommage, duplication, respect des conventions du langage.',
    '',
    '### ✅ Verdict',
    "Choisis exactement l'une des options : **Approuver**, **Approuver avec réserves**, ou **Demander des changements**, suivie d'une justification en une phrase.",
    '',
    'Règles :',
    "- Sois précis et évite les faux positifs : si une section n'a rien à signaler, écris « RAS ».",
    '- Priorise les problèmes bloquants ; ignore les détails purement cosmétiques.',
    "- Propose des correctifs ciblés plutôt que de réécrire l'ensemble de la PR.",
    '- Ne renvoie que la revue au format Markdown, sans préambule ni conclusion superflus.',
  ].join('\n');
}

/**
 * Invoque la CLI Claude en mode « print » (headless, session neuve donc sans
 * contexte) et renvoie le texte de la relecture. Le prompt est transmis via
 * stdin pour éviter les limites de longueur d'arguments.
 */
export function runClaudeReview(prompt: string): Promise<string> {
  const { cliPath, model, extraArgs, timeoutMs } = reviewConfig.claude;

  return new Promise<string>((resolve, reject) => {
    const args = ['-p', '--output-format', 'text'];
    if (model) {
      args.push('--model', model);
    }
    args.push(...extraArgs);

    Logger.debug('Spawning Claude CLI', { cliPath, args });

    const child = spawn(cliPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
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
          `La relecture Claude a dépassé le délai de ${timeoutMs} ms`,
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
        reject(
          new ExternalServiceError(
            `La CLI Claude s'est terminée avec le code ${code ?? 'inconnu'}: ${stderr.slice(0, 500)}`,
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
