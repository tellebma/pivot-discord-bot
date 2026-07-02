import { reviewConfig } from '@/utils/reviewConfig';
import { Logger } from '@/utils/logger';
import {
  fetchPullRequest,
  fetchPullRequestDiff,
  type PullRequestMetadata,
  type PullRequestRef,
} from './github';
import { buildReviewPrompt, runClaudeReview } from './claudeReview';

/**
 * Résultat complet d'une relecture : métadonnées de la PR et texte produit par
 * l'agent Claude.
 */
export interface ReviewResult {
  metadata: PullRequestMetadata;
  review: string;
  diffTruncated: boolean;
}

/**
 * Orchestration de bout en bout d'une relecture de PR :
 *   1. récupère les métadonnées et le diff via l'API GitHub ;
 *   2. tronque le diff si nécessaire ;
 *   3. construit le prompt de relecture ;
 *   4. lance l'agent Claude via la CLI, avec la CLI `gh` comme seul outil
 *      autorisé pour approuver la PR ou demander des changements dessus.
 */
export async function generateReview(ref: PullRequestRef): Promise<ReviewResult> {
  Logger.info('Starting PR review', {
    repo: `${ref.owner}/${ref.repo}`,
    pr: ref.number,
  });

  const [metadata, rawDiff] = await Promise.all([fetchPullRequest(ref), fetchPullRequestDiff(ref)]);

  const diffTruncated = rawDiff.length > reviewConfig.maxDiffChars;
  const diff = diffTruncated ? rawDiff.slice(0, reviewConfig.maxDiffChars) : rawDiff;

  const prompt = buildReviewPrompt(metadata, diff, diffTruncated);
  const review = await runClaudeReview(prompt);

  Logger.info('PR review completed', {
    repo: `${ref.owner}/${ref.repo}`,
    pr: ref.number,
    diffTruncated,
    reviewLength: review.length,
  });

  return { metadata, review, diffTruncated };
}
