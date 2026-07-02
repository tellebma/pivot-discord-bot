import { reviewConfig } from '@/utils/reviewConfig';
import { runClaudeCli } from './claudeCli';
import type { PullRequestRef } from './github';

/**
 * Construit le prompt de relecture. Volontairement minimal : seule
 * l'identification de la PR est fournie, l'agent récupère lui-même la
 * description et le diff via la CLI `gh`, explore le checkout local du code
 * s'il est disponible, puis agit directement sur la PR (approbation ou
 * demande de changements).
 */
export function buildReviewPrompt(ref: PullRequestRef, hasLocalCheckout: boolean): string {
  const prTarget = `${ref.number} --repo ${ref.owner}/${ref.repo}`;
  const codeAccess = hasLocalCheckout
    ? 'Le code de la PR est déjà extrait dans le répertoire courant, sur la branche de la PR : explore-le avec Read, Grep et Glob pour comprendre le contexte autour du diff.'
    : "Aucun checkout local n'est disponible : si tu as besoin de contexte au-delà du diff, lis les fichiers concernés via `gh api`.";

  return [
    "Tu es chargé de la relecture (code review) d'une Pull Request GitHub. La CLI `gh` est disponible et déjà authentifiée : utilise-la pour consulter la PR et agir directement dessus.",
    '',
    '## Pull Request',
    `- Dépôt : ${ref.owner}/${ref.repo}`,
    `- Numéro : #${ref.number}`,
    `- URL : ${ref.url}`,
    '',
    '## Comment procéder',
    `- Récupère le titre et la description avec \`gh pr view ${prTarget}\`, puis le diff avec \`gh pr diff ${prTarget}\`.`,
    `- ${codeAccess}`,
    '',
    '## Ta mission',
    'Relis cette PR, puis agis directement dessus :',
    '- Si elle peut être approuvée, approuve-la.',
    '- Si des modifications sont nécessaires, demande des changements, en proposant concrètement chaque correction (fichier, ligne, correctif suggéré) directement dans la PR.',
    '',
    "Termine ta réponse par un court résumé en français (Markdown, quelques phrases) de ta relecture et de l'action effectuée : ce résumé sera publié sur Discord.",
    "Si une commande `gh` échoue, n'insiste pas : publie quand même ta relecture dans le résumé et signale que l'action sur GitHub n'a pas pu être réalisée.",
  ].join('\n');
}

/**
 * Sélectionne les outils autorisés pour l'agent. Sans checkout local, le
 * sous-processus hériterait du répertoire du bot (qui contient `.env`) : les
 * outils de lecture du système de fichiers (Read/Grep/Glob) sont alors
 * retirés, seule la CLI `gh` reste disponible.
 */
export function selectReviewTools(allowedTools: string[], hasLocalCheckout: boolean): string[] {
  if (hasLocalCheckout) return allowedTools;
  return allowedTools.filter(tool => tool.startsWith('Bash('));
}

/**
 * Invoque la CLI Claude en mode « print » (headless) et renvoie le texte de la
 * relecture. Le prompt est transmis via stdin pour éviter les limites de
 * longueur d'arguments. L'agent dispose d'une liste blanche d'outils : la CLI
 * `gh` pour consulter la PR et agir dessus, et Read/Grep/Glob pour explorer le
 * checkout local (`cwd`) en lecture seule — et rien d'autre.
 */
export function runClaudeReview(
  prompt: string,
  cwd?: string,
  env?: Record<string, string>
): Promise<string> {
  const { cliPath, model, extraArgs, timeoutMs, allowedTools, maxTurns } = reviewConfig.claude;
  const tools = selectReviewTools(allowedTools, cwd !== undefined);

  const args = ['-p', '--output-format', 'text'];
  if (tools.length > 0) {
    args.push('--allowedTools', ...tools);
  }
  if (model) {
    args.push('--model', model);
  }
  args.push('--max-turns', String(maxTurns));
  args.push(...extraArgs);

  return runClaudeCli({
    prompt,
    cliPath,
    args,
    timeoutMs,
    ...(cwd ? { cwd } : {}),
    ...(env ? { env } : {}),
  });
}
