import {
  Client,
  Collection,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
} from 'discord.js';

/**
 * Any slash command builder type
 */
export type AnySlashCommandBuilder =
  | SlashCommandBuilder
  | SlashCommandOptionsOnlyBuilder
  | SlashCommandSubcommandsOnlyBuilder
  | Omit<SlashCommandBuilder, 'addSubcommand' | 'addSubcommandGroup'>;

export interface BotCommand {
  data: AnySlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  /** Optionnel : gère l'autocomplete des options de cette commande. */
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

/**
 * Composant interactif (bouton, select menu, modal) routé par préfixe de
 * customId. Convention : customId = "namespace:action[:payload]", la clé de
 * registre étant "namespace:action".
 */
export interface BotComponent {
  prefix: string;
  execute: (
    interaction: MessageComponentInteraction | ModalSubmitInteraction
  ) => Promise<void>;
}

export interface ExtendedClient extends Client {
  commands: Collection<string, BotCommand>;
  components: Collection<string, BotComponent>;
}

export interface ConfigType {
  discord: {
    token: string;
    clientId: string;
  };
  bot: {
    prefix: string;
    isDevelopment: boolean;
  };
}

export interface LogContext {
  [key: string]: unknown;
}
