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

  it("transmet les variables d'environnement supplémentaires au processus", async () => {
    // Utilisée pour injecter un GITHUB_TOKEN frais (GitHub App) dans la CLI `gh`.
    await expect(
      runClaudeCli({
        prompt: 'peu importe',
        cliPath: process.execPath,
        args: [
          '-e',
          'process.stdout.write(process.env.PIVOT_TEST_GH_TOKEN ?? "absent"); process.exit(0);',
        ],
        timeoutMs: 10_000,
        env: { PIVOT_TEST_GH_TOKEN: 'ghs_test' },
      })
    ).resolves.toBe('ghs_test');
  });

  it("inclut stdout dans l'erreur quand la CLI échoue sans rien écrire sur stderr", async () => {
    // La CLI Claude écrit ses erreurs (ex. « Invalid API key ») sur stdout :
    // sans cette remontée, le message d'erreur est vide et inexploitable.
    await expect(
      runFakeCli('process.stdout.write("Invalid API key"); process.exit(1);')
    ).rejects.toThrow(/Invalid API key/);
  });

  it('inclut stderr ET la fin de stdout quand la CLI échoue avec les deux flux', async () => {
    // Cas réel : stderr ne porte qu'un avertissement (workspace non trusté)
    // tandis que l'erreur réelle (max turns, clé invalide) est sur stdout.
    await expect(
      runFakeCli(
        'process.stderr.write("avertissement anodin"); process.stdout.write("erreur reelle en fin de sortie"); process.exit(1);'
      )
    ).rejects.toThrow(/avertissement anodin[\s\S]*erreur reelle en fin de sortie/);
  });
});
