import { Logger } from '@/utils/logger';
import { fetchPullRequest, type PullRequestMetadata, type PullRequestRef } from './github';
import { buildReviewPrompt, runClaudeReview } from './claudeReview';
import { withReviewWorkspace } from './reviewWorkspace';

/**
 * Résultat complet d'une relecture : métadonnées de la PR et texte produit par
 * l'agent Claude.
 */
export interface ReviewResult {
  metadata: PullRequestMetadata;
  review: string;
}

/**
 * Orchestration de bout en bout d'une relecture de PR :
 *   1. récupère les métadonnées via l'API GitHub (vérifie que la PR existe et
 *      alimente l'en-tête publié sur Discord) ;
 *   2. prépare le checkout local du code de la PR (clone + `gh pr checkout`),
 *      avec repli sans checkout si la préparation échoue ;
 *   3. lance l'agent Claude via la CLI : il récupère lui-même la description
 *      et le diff via `gh`, puis approuve la PR ou demande des changements.
 */
export async function generateReview(ref: PullRequestRef): Promise<ReviewResult> {
  Logger.info('Starting PR review', {
    repo: `${ref.owner}/${ref.repo}`,
    pr: ref.number,
  });

  const metadata = await fetchPullRequest(ref);

  const review = await withReviewWorkspace(ref, workspaceDir =>
    runClaudeReview(buildReviewPrompt(ref, workspaceDir !== null), workspaceDir ?? undefined)
  );

  Logger.info('PR review completed', {
    repo: `${ref.owner}/${ref.repo}`,
    pr: ref.number,
    reviewLength: review.length,
  });

  return { metadata, review };
}
