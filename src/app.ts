import { Client, GatewayIntentBits, Collection, REST, Routes } from 'discord.js';
import { CronJob } from 'cron';
import { readdirSync } from 'fs';
import { join } from 'path';
import { config as dotenvConfig } from 'dotenv';
import type { BotCommand, BotComponent, ExtendedClient } from '@/types/bot';
import {
  Logger,
  ErrorHandler,
  BotError,
  ConfigurationError,
  ExternalServiceError,
  ErrorCode,
  ErrorSeverity,
  initSentry,
  flushSentry,
  captureError,
  isLoadableModuleFile,
} from '@/utils';

dotenvConfig();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
}) as ExtendedClient;

client.commands = new Collection<string, BotCommand>();
client.components = new Collection<string, BotComponent>();

/** Registre des crons actifs, pour les arrêter proprement au shutdown. */
const activeCrons: CronJob[] = [];

async function loadCommands(): Promise<void> {
  const commands: unknown[] = [];
  const commandsPath = join(__dirname, 'commands');

  try {
    const commandFiles = readdirSync(commandsPath).filter(isLoadableModuleFile);

    for (const file of commandFiles) {
      const filePath = join(commandsPath, file);

      try {
        const commandModule = await import(filePath);
        const command = commandModule.default || commandModule;

        if ('data' in command && 'execute' in command) {
          client.commands.set(command.data.name, command as BotCommand);
          commands.push(command.data.toJSON());
          Logger.info('Command loaded', { command: command.data.name });
        } else {
          Logger.warn('Invalid command structure', {
            file: filePath,
            reason: 'Missing "data" or "execute" property',
          });
        }
      } catch (error) {
        await ErrorHandler.handle(
          new BotError(
            `Failed to load command: ${file}`,
            ErrorCode.INTERNAL_ERROR,
            { file },
            error instanceof Error ? error : undefined
          )
        );
      }
    }
  } catch {
    Logger.warn('Commands directory not found', { path: commandsPath });
  }

  if (commands.length > 0) {
    await deployCommands(commands);
  }
}

async function loadEvents(): Promise<void> {
  const eventsPath = join(__dirname, 'events');

  try {
    const eventFiles = readdirSync(eventsPath).filter(isLoadableModuleFile);

    for (const file of eventFiles) {
      const filePath = join(eventsPath, file);

      try {
        const eventModule = await import(filePath);
        const event = eventModule.default || eventModule;

        if (event.once) {
          client.once(event.name, (...args: unknown[]) => event.execute(...args));
        } else {
          client.on(event.name, (...args: unknown[]) => event.execute(...args));
        }
        Logger.info('Event loaded', { event: event.name });
      } catch (error) {
        await ErrorHandler.handle(
          new BotError(
            `Failed to load event: ${file}`,
            ErrorCode.INTERNAL_ERROR,
            { file },
            error instanceof Error ? error : undefined
          )
        );
      }
    }
  } catch {
    Logger.warn('Events directory not found', { path: eventsPath });
  }
}

async function deployCommands(commands: unknown[]): Promise<void> {
  if (!process.env['DISCORD_TOKEN'] || !process.env['DISCORD_CLIENT_ID']) {
    throw new ConfigurationError(
      'Missing required environment variables: DISCORD_TOKEN or DISCORD_CLIENT_ID',
      'DISCORD_TOKEN'
    );
  }

  const rest = new REST().setToken(process.env['DISCORD_TOKEN']);

  try {
    Logger.info('Refreshing application commands', { count: commands.length });

    await rest.put(Routes.applicationCommands(process.env['DISCORD_CLIENT_ID']), {
      body: commands,
    });

    Logger.info('Application commands refreshed successfully', { count: commands.length });
  } catch (error) {
    throw new ExternalServiceError(
      'Failed to deploy commands to Discord',
      'Discord API',
      undefined,
      true,
      {},
      error instanceof Error ? error : undefined
    );
  }
}

// Global error handlers with proper error handling system integration
process.on('unhandledRejection', (reason: unknown) => {
  const error =
    reason instanceof Error
      ? reason
      : new BotError(
          String(reason),
          ErrorCode.UNKNOWN_ERROR,
          { type: 'unhandledRejection' },
          undefined,
          ErrorSeverity.HIGH
        );

  void ErrorHandler.handle(error, { type: 'unhandledRejection' });
});

process.on('uncaughtException', (error: Error) => {
  const botError = new BotError(
    error.message,
    ErrorCode.UNKNOWN_ERROR,
    { type: 'uncaughtException' },
    error,
    ErrorSeverity.CRITICAL
  );

  // Synchronous logging for uncaught exceptions
  Logger.error('Uncaught exception - shutting down', {
    error: botError.toJSON(),
  });

  process.exit(1);
});

// Graceful shutdown
const SHUTDOWN_TIMEOUT_MS = 10_000;
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  Logger.info('Shutting down gracefully', { signal });

  const hardExit = setTimeout(() => {
    Logger.error('Shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  hardExit.unref();

  for (const job of activeCrons) {
    job.stop();
  }

  await flushSentry();
  await client.destroy();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

async function loadComponents(): Promise<void> {
  const baseDir = join(__dirname, 'interactions');
  const subDirs = ['buttons', 'modals', 'selectMenus'];

  for (const sub of subDirs) {
    const dir = join(baseDir, sub);
    let componentFiles: string[];

    try {
      componentFiles = readdirSync(dir).filter(isLoadableModuleFile);
    } catch {
      // Dossier optionnel : on passe au suivant s'il n'existe pas.
      continue;
    }

    for (const file of componentFiles) {
      const filePath = join(dir, file);

      try {
        const componentModule = await import(filePath);
        const component = componentModule.default || componentModule;

        if ('prefix' in component && 'execute' in component) {
          client.components.set(component.prefix, component as BotComponent);
          Logger.info('Component loaded', { prefix: component.prefix });
        } else {
          Logger.warn('Invalid component structure', {
            file: filePath,
            reason: 'Missing "prefix" or "execute" property',
          });
        }
      } catch (error) {
        await ErrorHandler.handle(
          new BotError(
            `Failed to load component: ${file}`,
            ErrorCode.INTERNAL_ERROR,
            { file },
            error instanceof Error ? error : undefined
          )
        );
      }
    }
  }
}

async function loadCrons(): Promise<void> {
  const cronsPath = join(__dirname, 'crons');

  try {
    const cronFiles = readdirSync(cronsPath).filter(isLoadableModuleFile);

    for (const file of cronFiles) {
      const filePath = join(cronsPath, file);

      try {
        const cronModule = await import(filePath);
        const cron = cronModule.default || cronModule;

        if ('name' in cron && 'schedule' in cron && 'execute' in cron) {
          const job: CronJob = cron.execute(client);
          job.start();
          activeCrons.push(job);
          Logger.info('Cron loaded', { cron: cron.name, schedule: cron.schedule });
        } else {
          Logger.warn('Invalid cron structure', {
            file: filePath,
            reason: 'Missing "name", "schedule", or "execute" property',
          });
        }
      } catch (error) {
        await ErrorHandler.handle(
          new BotError(
            `Failed to load cron: ${file}`,
            ErrorCode.INTERNAL_ERROR,
            { file },
            error instanceof Error ? error : undefined
          )
        );
      }
    }
  } catch {
    Logger.warn('Crons directory not found', { path: cronsPath });
  }
}

// Initialize the bot
async function start(): Promise<void> {
  try {
    initSentry();
    // Remonte chaque erreur gérée vers Sentry (no-op si SENTRY_DSN absent).
    ErrorHandler.registerHandler(error => captureError(error));
    Logger.info('Starting bot initialization');

    await loadEvents();
    await loadCommands();
    await loadComponents();

    if (!process.env['DISCORD_TOKEN']) {
      throw new ConfigurationError('DISCORD_TOKEN is required', 'DISCORD_TOKEN');
    }

    await client.login(process.env['DISCORD_TOKEN']);
    await loadCrons();
  } catch (error) {
    const botError =
      error instanceof BotError
        ? error
        : new BotError(
            'Failed to start bot',
            ErrorCode.INTERNAL_ERROR,
            {},
            error instanceof Error ? error : undefined,
            ErrorSeverity.CRITICAL
          );

    await ErrorHandler.handle(botError);
    process.exit(1);
  }
}

void start();
