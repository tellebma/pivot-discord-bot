import { EmbedBuilder, Colors } from 'discord.js';

/**
 * Builders d'embeds cohérents pour des réponses standardisées.
 * Centraliser les couleurs/format évite la duplication entre commandes.
 */
export function successEmbed(title: string, description?: string): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(Colors.Green).setTitle(`✅ ${title}`);
  if (description) embed.setDescription(description);
  return embed;
}

export function errorEmbed(title: string, description?: string): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(Colors.Red).setTitle(`❌ ${title}`);
  if (description) embed.setDescription(description);
  return embed;
}

export function infoEmbed(title: string, description?: string): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(Colors.Blurple).setTitle(title);
  if (description) embed.setDescription(description);
  return embed;
}
