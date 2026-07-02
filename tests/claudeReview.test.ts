import { describe, it, expect } from 'vitest';
import { buildReviewPrompt } from '@/services/claudeReview';
import type { PullRequestRef } from '@/services/github';

const ref: PullRequestRef = {
  owner: 'tellebma',
  repo: 'pivot-discord-bot',
  number: 42,
  url: 'https://github.com/tellebma/pivot-discord-bot/pull/42',
};

describe('buildReviewPrompt', () => {
  it('identifie la PR (dépôt, numéro, URL) sans injecter de diff ni de description', () => {
    const prompt = buildReviewPrompt(ref, true);
    expect(prompt).toContain('tellebma/pivot-discord-bot');
    expect(prompt).toContain('#42');
    expect(prompt).toContain('https://github.com/tellebma/pivot-discord-bot/pull/42');
    expect(prompt).not.toContain('```diff');
    expect(prompt).not.toContain('## Description');
  });

  it("demande à l'agent de récupérer lui-même la description et le diff via gh", () => {
    const prompt = buildReviewPrompt(ref, true);
    expect(prompt).toContain('gh pr view 42 --repo tellebma/pivot-discord-bot');
    expect(prompt).toContain('gh pr diff 42 --repo tellebma/pivot-discord-bot');
  });

  it('signale le checkout local quand il est disponible', () => {
    const prompt = buildReviewPrompt(ref, true);
    expect(prompt).toContain('répertoire courant');
    expect(prompt).toContain('Read, Grep et Glob');
  });

  it('propose le repli gh api quand le checkout local est indisponible', () => {
    const prompt = buildReviewPrompt(ref, false);
    expect(prompt).not.toContain('répertoire courant');
    expect(prompt).toContain('gh api');
  });

  it("demande d'approuver ou de proposer des changements directement sur la PR", () => {
    const prompt = buildReviewPrompt(ref, true);
    expect(prompt).toContain('approuve-la');
    expect(prompt).toContain('demande des changements');
    expect(prompt).toContain('résumé');
  });
});
