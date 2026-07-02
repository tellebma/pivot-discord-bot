/**
 * Indique si un fichier est un module chargeable par les loaders dynamiques
 * (commands, events, components, crons).
 *
 * Accepte les sources `.ts` (dev via tsx) et les `.js` compilés (production),
 * mais exclut les déclarations `.d.ts` générées par le build (`declaration:
 * true`) : les importer échoue et pollue les logs au démarrage.
 */
export function isLoadableModuleFile(file: string): boolean {
  if (file.endsWith('.d.ts')) return false;
  return file.endsWith('.ts') || file.endsWith('.js');
}
