import { describe, it, expect } from 'vitest';
import { buildAskPrompt, enforceBusinessRegister, NOT_FOUND_SENTINEL } from '@/services/askService';

describe('buildAskPrompt', () => {
  it('inclut la question, le rôle métier et les garde-fous', () => {
    const prompt = buildAskPrompt('Comment sont calculées les remises ?');
    expect(prompt).toContain('Comment sont calculées les remises ?');
    expect(prompt).toContain('analyste fonctionnel');
    expect(prompt).toContain('MÉTIER');
    // Garde-fou anti-hallucination
    expect(prompt).toContain(NOT_FOUND_SENTINEL);
    // Garde-fou anti-registre technique
    expect(prompt).toContain('INTERDIT');
    // Isolation de la question (anti-injection)
    expect(prompt).toContain('"""');
  });
});

describe('enforceBusinessRegister', () => {
  it('laisse une réponse purement fonctionnelle intacte', () => {
    const answer = '**Réponse** : le produit applique une remise de fidélité.';
    const result = enforceBusinessRegister(answer);
    expect(result.strippedCode).toBe(false);
    expect(result.text).toBe(answer);
  });

  it('retire les blocs de code qui auraient échappé aux consignes', () => {
    const answer = 'Explication métier\n\n```ts\nconst x = computeDiscount();\n```\n\nSuite.';
    const result = enforceBusinessRegister(answer);
    expect(result.strippedCode).toBe(true);
    expect(result.text).not.toContain('computeDiscount');
    expect(result.text).toContain('extrait technique retiré');
  });

  it('détecte la phrase de repli « non trouvé »', () => {
    const result = enforceBusinessRegister(NOT_FOUND_SENTINEL);
    expect(result.text).toContain(NOT_FOUND_SENTINEL);
  });
});
