import { describe, it, expect } from 'vitest';
import { splitForDiscord } from '@/utils/discord';

describe('splitForDiscord', () => {
  it('ne découpe pas un texte court', () => {
    expect(splitForDiscord('court')).toEqual(['court']);
  });

  it('renvoie un tableau vide pour une chaîne vide', () => {
    expect(splitForDiscord('')).toEqual([]);
  });

  it('découpe en respectant la limite de longueur', () => {
    const text = Array.from({ length: 200 }, (_, i) => `ligne ${i}`).join('\n');
    const chunks = splitForDiscord(text, 100);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(100);
    }
    // Le contenu reconstitué correspond au texte d'origine (aux \n de jointure près).
    expect(chunks.join('\n')).toContain('ligne 0');
    expect(chunks.join('\n')).toContain('ligne 199');
  });

  it('découpe en dur une ligne unique trop longue', () => {
    const longLine = 'a'.repeat(250);
    const chunks = splitForDiscord(longLine, 100);
    expect(chunks).toHaveLength(3);
    expect(chunks.join('')).toBe(longLine);
  });
});
