import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { Logger, splitForDiscord } from '@/utils';
import { askConfig } from '@/utils/askConfig';
import { ask } from '@/services/askService';

/**
 * Commande /ask : pose une question MÉTIER sur le produit Pivot. Le bot fait
 * explorer le code local (branche `main`) par Claude Code en lecture seule, puis
 * renvoie une réponse volontairement fonctionnelle (non technique).
 */
export default {
  data: new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Pose une question métier sur le produit Pivot (réponse fonctionnelle)')
    .addStringOption(option =>
      option
        .setName('question')
        .setDescription('Votre question fonctionnelle sur le produit Pivot')
        .setRequired(true)
        .setMaxLength(500)
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const question = interaction.options.getString('question', true);

    if (!askConfig.enabled) {
      await interaction.reply({
        content:
          "❌ La commande `/ask` n'est pas configurée sur ce serveur (dépôt Pivot local absent). Contactez un administrateur.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply();

    try {
      const result = await ask(question);

      const footer = result.notFound
        ? ''
        : '\n\n_ℹ️ Réponse fonctionnelle générée à partir du code Pivot — à valider par un référent métier._';
      const header = `💬 **Question métier**\n> ${question}\n\n`;
      const chunks = splitForDiscord(`${header}${result.answer}${footer}`);

      await interaction.editReply(chunks[0] ?? 'Réponse vide.');
      for (const chunk of chunks.slice(1)) {
        await interaction.followUp(chunk);
      }
    } catch (error) {
      Logger.error('Ask command failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      await interaction.editReply(
        '❌ La recherche métier a échoué. Consultez les logs pour plus de détails.'
      );
    }
  },
};
