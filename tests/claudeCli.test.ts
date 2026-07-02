import { describe, expect, it } from 'vitest';
import { runClaudeCli } from '@/services/claudeCli';

/**
 * Simule la CLI Claude avec `node -e` : permet de contrôler précisément les
 * flux stdout/stderr et le code de sortie sans dépendre de la vraie CLI.
 */
function runFakeCli(script: string): Promise<string> {
  return runClaudeCli({
    prompt: 'peu importe',
    cliPath: process.execPath,
    args: ['-e', script],
    timeoutMs: 10_000,
  });
}

describe('runClaudeCli', () => {
  it('renvoie stdout quand la CLI réussit', async () => {
    await expect(runFakeCli('process.stdout.write("resultat"); process.exit(0);')).resolves.toBe(
      'resultat'
    );
  });

  it("inclut stderr dans l'erreur quand la CLI échoue", async () => {
    await expect(
      runFakeCli('process.stderr.write("boom stderr"); process.exit(1);')
    ).rejects.toThrow(/boom stderr/);
  });

  it("inclut stdout dans l'erreur quand la CLI échoue sans rien écrire sur stderr", async () => {
    // La CLI Claude écrit ses erreurs (ex. « Invalid API key ») sur stdout :
    // sans cette remontée, le message d'erreur est vide et inexploitable.
    await expect(
      runFakeCli('process.stdout.write("Invalid API key"); process.exit(1);')
    ).rejects.toThrow(/Invalid API key/);
  });
});
