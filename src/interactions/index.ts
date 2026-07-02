import type { Collection } from 'discord.js';
import type { BotComponent } from '@/types/bot';

/**
 * Extrait la clé de registre d'un customId.
 * Convention : "namespace:action[:payload]" → "namespace:action".
 */
export function componentKey(customId: string): string {
  return customId.split(':').slice(0, 2).join(':');
}

/**
 * Récupère le payload d'un customId (3e segment et au-delà), ou '' si absent.
 */
export function componentPayload(customId: string): string {
  return customId.split(':').slice(2).join(':');
}

/**
 * Résout le composant enregistré pour un customId donné.
 */
export function resolveComponent(
  registry: Collection<string, BotComponent>,
  customId: string
): BotComponent | undefined {
  return registry.get(componentKey(customId));
}
