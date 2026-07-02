import { Interaction } from 'discord.js';
import type { ExtendedClient } from '@/types/bot';
import { Logger, ErrorHandler } from '@/utils';
import { resolveComponent } from '@/interactions';

export default {
  name: 'interactionCreate',
  once: false,
  async execute(interaction: Interaction): Promise<void> {
    const client = interaction.client as ExtendedClient;

    try {
      // 1. Autocomplete
      if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (command?.autocomplete) {
          await command.autocomplete(interaction);
        }
        return;
      }

      // 2. Slash commands
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) {
          Logger.warn('Command not found', { commandName: interaction.commandName });
          return;
        }
        Logger.info('Command received', {
          command: interaction.commandName,
          user: interaction.user.tag,
          guild: interaction.guild?.name ?? 'DM',
        });
        await command.execute(interaction);
        return;
      }

      // 3. Composants (boutons, select menus, modals)
      if (
        interaction.isButton() ||
        interaction.isAnySelectMenu() ||
        interaction.isModalSubmit()
      ) {
        const component = resolveComponent(client.components, interaction.customId);
        if (!component) {
          Logger.warn('Component handler not found', { customId: interaction.customId });
          return;
        }
        Logger.info('Component received', {
          customId: interaction.customId,
          user: interaction.user.tag,
        });
        await component.execute(interaction);
        return;
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (interaction.isRepliable()) {
        await ErrorHandler.handleInteractionError(err, interaction);
      } else {
        await ErrorHandler.handle(err);
      }
    }
  },
};
