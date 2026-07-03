import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { Logger, splitForDiscord } from '@/utils';
import { BotError } from '@/utils/errors';
import { parsePullRequestUrl } from '@/services/github';
import { generateReview } from '@/services/reviewService';

/**
 * Commande /review : déclenche manuellement une relecture complète d'une PR
 * GitHub, quel que soit le canal. Complète la surveillance automatique des
 * canaux configurés.
 */
export default {
  data: new SlashCommandBuilder()
    .setName('review')
    .setDescription("Lance une relecture complète d'une Pull Request GitHub")
    .addStringOption(option =>
      option
        .setName('url')
        .setDescription('URL de la Pull Request GitHub à relire')
        .setRequired(true)
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const url = interaction.options.getString('url', true);
    const ref = parsePullRequestUrl(url);

    if (!ref) {
      await interaction.reply({
        content:
          '❌ URL invalide. Fournissez une URL de Pull Request GitHub, ex. `https://github.com/owner/repo/pull/123`.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply();

    const label = `${ref.owner}/${ref.repo}#${ref.number}`;

    try {
      const result = await generateReview(ref);

      const header = `📋 **Relecture de [${label}](${result.metadata.htmlUrl})** — ${result.metadata.title}`;
      const chunks = splitForDiscord(`${header}\n\n${result.review}`);

      await interaction.editReply(chunks[0] ?? 'La relecture est vide.');
      for (const chunk of chunks.slice(1)) {
        await interaction.followUp(chunk);
      }
    } catch (error) {
      // L'erreur d'origine (ENOENT, refus réseau, ...) est souvent plus
      // parlante que le message enveloppé : la remonter dans les logs.
      const cause = error instanceof BotError ? error.originalError?.message : undefined;
      Logger.error('Manual review failed', {
        pr: label,
        error: error instanceof Error ? error.message : String(error),
        ...(cause ? { cause } : {}),
      });
      await interaction.editReply(
        `❌ La relecture de \`${label}\` a échoué. Consultez les logs pour plus de détails.`
      );
    }
  },
};
