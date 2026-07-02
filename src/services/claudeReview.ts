import { reviewConfig } from '@/utils/reviewConfig';
import { runClaudeCli } from './claudeCli';
import type { PullRequestMetadata } from './github';

/**
 * Construit le prompt de relecture. Volontairement simple : on demande une
 * relecture de la PR et on laisse l'agent agir directement dessus via la CLI
 * `gh` (approbation ou demande de changements).
 */
export function buildReviewPrompt(
  metadata: PullRequestMetadata,
  diff: string,
  diffTruncated: boolean
): string {
  const description =
    metadata.body.trim().length > 0 ? metadata.body.trim() : '(aucune description)';
  const prTarget = `${metadata.number} --repo ${metadata.owner}/${metadata.repo}`;
  const truncationNotice = diffTruncated
    ? '\n\n> ⚠️ Le diff ci-dessus a été tronqué. Récupère le diff complet avec `gh pr diff` si nécessaire.'
    : '';

  return [
    "Tu es chargé de la relecture (code review) d'une Pull Request GitHub. La CLI `gh` est disponible et déjà authentifiée : utilise-la pour agir directement sur la PR.",
    '',
    '## Pull Request',
    `- Dépôt : ${metadata.owner}/${metadata.repo}`,
    `- Numéro : #${metadata.number}`,
    `- URL : ${metadata.htmlUrl}`,
    `- Titre : ${metadata.title}`,
    `- Branches : \`${metadata.headRef}\` → \`${metadata.baseRef}\``,
    '',
    "## Description fournie par l'auteur",
    description,
    '',
    '## Diff',
    '```diff',
    diff,
    '```',
    truncationNotice,
    '',
    '## Ta mission',
    'Relis cette PR, puis agis directement dessus :',
    `- Si elle peut être approuvée, approuve-la : \`gh pr review ${prTarget} --approve --body "<justification courte>"\`.`,
    `- Si des modifications sont nécessaires, demande des changements : \`gh pr review ${prTarget} --request-changes --body "<modifications demandées>"\`, en proposant concrètement chaque correction (fichier, ligne, correctif suggéré) directement dans la PR.`,
    '',
    "Termine ta réponse par un court résumé en français (Markdown, quelques phrases) de ta relecture et de l'action effectuée : ce résumé sera publié sur Discord.",
    "Si une commande `gh` échoue, n'insiste pas : publie quand même ta relecture dans le résumé et signale que l'action sur GitHub n'a pas pu être réalisée.",
  ].join('\n');
}

/**
 * Invoque la CLI Claude en mode « print » (headless) et renvoie le texte de la
 * relecture. Le prompt est transmis via stdin pour éviter les limites de
 * longueur d'arguments. L'agent dispose d'une liste blanche d'outils limitée à
 * la CLI `gh` afin de pouvoir approuver ou commenter la PR — et rien d'autre.
 */
export function runClaudeReview(prompt: string): Promise<string> {
  const { cliPath, model, extraArgs, timeoutMs, allowedTools, maxTurns } = reviewConfig.claude;

  const args = ['-p', '--output-format', 'text', '--allowedTools', ...allowedTools];
  if (model) {
    args.push('--model', model);
  }
  args.push('--max-turns', String(maxTurns));
  args.push(...extraArgs);

  return runClaudeCli({ prompt, cliPath, args, timeoutMs });
}
