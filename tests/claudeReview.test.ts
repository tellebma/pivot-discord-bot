import { describe, it, expect } from 'vitest';
import { buildReviewPrompt } from '@/services/claudeReview';
import type { PullRequestMetadata } from '@/services/github';

const metadata: PullRequestMetadata = {
  owner: 'tellebma',
  repo: 'pivot-discord-bot',
  number: 42,
  title: 'Ajoute la relecture de PR',
  body: 'Description de la PR',
  author: 'octocat',
  baseRef: 'main',
  headRef: 'feature/review',
  state: 'open',
  merged: false,
  additions: 120,
  deletions: 5,
  changedFiles: 8,
  htmlUrl: 'https://github.com/tellebma/pivot-discord-bot/pull/42',
};

describe('buildReviewPrompt', () => {
  it('inclut les métadonnées, le diff et la grille de relecture', () => {
    const prompt = buildReviewPrompt(metadata, 'diff --git a/x b/x', false);
    expect(prompt).toContain('tellebma/pivot-discord-bot');
    expect(prompt).toContain('#42');
    expect(prompt).toContain('Ajoute la relecture de PR');
    expect(prompt).toContain('diff --git a/x b/x');
    expect(prompt).toContain('### ✅ Verdict');
    expect(prompt).toContain('EXCLUSIVEMENT');
  });

  it('signale une troncature du diff quand demandé', () => {
    const truncated = buildReviewPrompt(metadata, 'diff', true);
    expect(truncated).toContain('tronqué');
    const full = buildReviewPrompt(metadata, 'diff', false);
    expect(full).not.toContain('tronqué');
  });

  it('gère une description vide', () => {
    const prompt = buildReviewPrompt({ ...metadata, body: '' }, 'diff', false);
    expect(prompt).toContain('(aucune description)');
  });
});
