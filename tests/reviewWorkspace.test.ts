import { describe, it, expect } from 'vitest';
import { withRepoLock } from '@/services/reviewWorkspace';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>(r => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('withRepoLock', () => {
  it('sérialise les exécutions partageant la même clé', async () => {
    const events: string[] = [];
    const gate = deferred();

    const first = withRepoLock('owner/repo', async () => {
      events.push('first:start');
      await gate.promise;
      events.push('first:end');
    });
    const second = withRepoLock('owner/repo', async () => {
      events.push('second:start');
    });

    // Laisse la microtask queue s'écouler : second ne doit PAS avoir démarré.
    await new Promise(r => setTimeout(r, 10));
    expect(events).toEqual(['first:start']);

    gate.resolve();
    await Promise.all([first, second]);
    expect(events).toEqual(['first:start', 'first:end', 'second:start']);
  });

  it('laisse les clés distinctes s’exécuter en parallèle', async () => {
    const events: string[] = [];
    const gate = deferred();

    const blocked = withRepoLock('owner/repo-a', async () => {
      await gate.promise;
      events.push('a');
    });
    const free = withRepoLock('owner/repo-b', async () => {
      events.push('b');
    });

    await free;
    expect(events).toEqual(['b']);

    gate.resolve();
    await blocked;
    expect(events).toEqual(['b', 'a']);
  });

  it("propage l'erreur sans bloquer les exécutions suivantes", async () => {
    await expect(
      withRepoLock('owner/repo-err', async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    await expect(withRepoLock('owner/repo-err', async () => 'ok')).resolves.toBe('ok');
  });

  it('renvoie la valeur produite par la fonction', async () => {
    await expect(withRepoLock('owner/repo-val', async () => 123)).resolves.toBe(123);
  });
});
