import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import { Logger } from './logger';
import { CooldownError, PermissionError, ErrorHandler } from './errors';

/**
 * Command builder types that can be used with defineCommand
 */
type AnySlashCommandBuilder =
  | SlashCommandBuilder
  | SlashCommandOptionsOnlyBuilder
  | SlashCommandSubcommandsOnlyBuilder
  | Omit<SlashCommandBuilder, 'addSubcommand' | 'addSubcommandGroup'>;

/**
 * Options for creating a command
 */
export interface CommandOptions<TBuilder extends AnySlashCommandBuilder = AnySlashCommandBuilder> {
  /** The slash command builder with all options defined */
  data: TBuilder;
  /** Command category for organization */
  category?: string;
  /** Required permissions to execute (use PermissionFlagsBits) */
  permissions?: bigint[];
  /** Cooldown in seconds */
  cooldown?: number;
  /** The command handler */
  execute: (ctx: CommandContext) => Promise<void>;
}

/**
 * Context passed to command handlers with typed option getters
 * Provides a cleaner API than raw interaction.options
 */
export interface CommandContext {
  /** The original interaction */
  interaction: ChatInputCommandInteraction;

  // Option getters - delegate to interaction.options
  getString: (name: string, required?: boolean) => string | null;
  getInteger: (name: string, required?: boolean) => number | null;
  getNumber: (name: string, required?: boolean) => number | null;
  getBoolean: (name: string, required?: boolean) => boolean | null;
  getUser: (
    name: string,
    required?: boolean
  ) => ReturnType<ChatInputCommandInteraction['options']['getUser']>;
  getChannel: (
    name: string,
    required?: boolean
  ) => ReturnType<ChatInputCommandInteraction['options']['getChannel']>;
  getRole: (
    name: string,
    required?: boolean
  ) => ReturnType<ChatInputCommandInteraction['options']['getRole']>;
  getMentionable: (
    name: string,
    required?: boolean
  ) => ReturnType<ChatInputCommandInteraction['options']['getMentionable']>;
  getAttachment: (
    name: string,
    required?: boolean
  ) => ReturnType<ChatInputCommandInteraction['options']['getAttachment']>;

  // Response shortcuts
  reply: ChatInputCommandInteraction['reply'];
  editReply: ChatInputCommandInteraction['editReply'];
  followUp: ChatInputCommandInteraction['followUp'];
  deferReply: ChatInputCommandInteraction['deferReply'];
}

/**
 * Cooldown storage: Map<commandName, Map<userId, expiresAt>>
 */
const cooldowns = new Map<string, Map<string, number>>();

/**
 * Create a command context from an interaction
 */
function createContext(interaction: ChatInputCommandInteraction): CommandContext {
  return {
    interaction,
    // Option getters
    getString: (name, required) => interaction.options.getString(name, required),
    getInteger: (name, required) => interaction.options.getInteger(name, required),
    getNumber: (name, required) => interaction.options.getNumber(name, required),
    getBoolean: (name, required) => interaction.options.getBoolean(name, required),
    getUser: (name, required) => interaction.options.getUser(name, required),
    getChannel: (name, required) => interaction.options.getChannel(name, required),
    getRole: (name, required) => interaction.options.getRole(name, required),
    getMentionable: (name, required) => interaction.options.getMentionable(name, required),
    getAttachment: (name, required) => interaction.options.getAttachment(name, required),
    // Response methods (bound to interaction)
    reply: interaction.reply.bind(interaction),
    editReply: interaction.editReply.bind(interaction),
    followUp: interaction.followUp.bind(interaction),
    deferReply: interaction.deferReply.bind(interaction),
  };
}

/**
 * Check if user has required permissions
 */
function checkPermissions(
  interaction: ChatInputCommandInteraction,
  permissions: bigint[]
): boolean {
  if (permissions.length === 0) return true;
  if (!interaction.memberPermissions) return false;
  return permissions.every(perm => interaction.memberPermissions?.has(perm));
}

/**
 * Check cooldown and return remaining seconds if on cooldown
 */
function checkCooldown(
  commandName: string,
  userId: string,
  cooldownSeconds: number
): number | null {
  if (cooldownSeconds <= 0) return null;

  const now = Date.now();
  const commandCooldowns = cooldowns.get(commandName) ?? new Map<string, number>();
  const expiresAt = commandCooldowns.get(userId) ?? 0;

  if (now < expiresAt) {
    return Math.ceil((expiresAt - now) / 1000);
  }

  commandCooldowns.set(userId, now + cooldownSeconds * 1000);
  cooldowns.set(commandName, commandCooldowns);
  return null;
}

/**
 * Define a command with automatic error handling, permissions, and cooldown.
 */
export function defineCommand<TBuilder extends AnySlashCommandBuilder>(
  options: CommandOptions<TBuilder>
): {
  data: TBuilder;
  category: string;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
} {
  const { data, category = 'general', permissions = [], cooldown = 0, execute } = options;

  // Extract command name from builder
  const commandName = 'name' in data ? data.name : 'unknown';

  return {
    data,
    category,
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
      const startTime = Date.now();

      try {
        // Permission check
        if (!checkPermissions(interaction, permissions)) {
          throw new PermissionError(
            permissions.map(p => getPermissionName(p)),
            interaction.memberPermissions?.toArray()
          );
        }

        // Cooldown check
        const remainingCooldown = checkCooldown(commandName, interaction.user.id, cooldown);
        if (remainingCooldown !== null) {
          throw new CooldownError(remainingCooldown, commandName);
        }

        // Execute command with context
        const ctx = createContext(interaction);
        await execute(ctx);

        // Log successful execution
        Logger.info('Command executed', {
          command: commandName,
          user: interaction.user.tag,
          guild: interaction.guild?.name ?? 'DM',
          executionTime: `${Date.now() - startTime}ms`,
        });
      } catch (error) {
        // Handle errors through centralized error handler
        await ErrorHandler.handleInteractionError(
          error instanceof Error ? error : new Error(String(error)),
          interaction
        );
      }
    },
  };
}

/**
 * Get permission name from bigint
 */
function getPermissionName(permission: bigint): string {
  const entries = Object.entries(PermissionFlagsBits) as [string, bigint][];
  const found = entries.find(([, value]) => value === permission);
  return found?.[0] ?? String(permission);
}

/**
 * Simple command without permissions, cooldown, or advanced features.
 */
export function simpleCommand<TBuilder extends AnySlashCommandBuilder>(options: {
  data: TBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}): {
  data: TBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
} {
  return {
    data: options.data,
    execute: options.execute,
  };
}

// Re-export PermissionFlagsBits for convenience
export { PermissionFlagsBits };
