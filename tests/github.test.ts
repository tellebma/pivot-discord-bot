import { describe, it, expect } from 'vitest';
import { parsePullRequestUrl, extractPullRequestRefs } from '@/services/github';

describe('parsePullRequestUrl', () => {
  it('parse une URL de PR valide', () => {
    const ref = parsePullRequestUrl('https://github.com/tellebma/pivot-discord-bot/pull/42');
    expect(ref).toEqual({
      owner: 'tellebma',
      repo: 'pivot-discord-bot',
      number: 42,
      url: 'https://github.com/tellebma/pivot-discord-bot/pull/42',
    });
  });

  it('accepte http et un fragment/suffixe', () => {
    const ref = parsePullRequestUrl('http://github.com/a/b/pull/7#issuecomment-1');
    expect(ref?.number).toBe(7);
    expect(ref?.url).toBe('https://github.com/a/b/pull/7');
  });

  it("rejette une URL qui n'est pas une PR", () => {
    expect(parsePullRequestUrl('https://github.com/a/b/issues/7')).toBeNull();
    expect(parsePullRequestUrl('https://example.com/a/b/pull/7')).toBeNull();
    expect(parsePullRequestUrl('pas une url')).toBeNull();
  });
});

describe('extractPullRequestRefs', () => {
  it('extrait plusieurs PR distinctes', () => {
    const content = 'Voir https://github.com/a/b/pull/1 et https://github.com/c/d/pull/2 svp';
    const refs = extractPullRequestRefs(content);
    expect(refs).toHaveLength(2);
    expect(refs.map(r => r.number)).toEqual([1, 2]);
  });

  it('déduplique les occurrences répétées', () => {
    const content = 'https://github.com/a/b/pull/1 encore https://github.com/a/b/pull/1';
    expect(extractPullRequestRefs(content)).toHaveLength(1);
  });

  it('renvoie un tableau vide sans lien de PR', () => {
    expect(extractPullRequestRefs('aucun lien ici')).toEqual([]);
  });
});
