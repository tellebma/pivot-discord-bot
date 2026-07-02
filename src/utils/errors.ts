import { Logger } from './logger';
import { sanitizeMessage } from './sanitize';
import { MessageFlags } from 'discord.js';
import type { InteractionReplyOptions, RepliableInteraction } from 'discord.js';

/**
 * Error codes for categorizing different types of errors
 */
export enum ErrorCode {
  // General errors (1xxx)
  UNKNOWN_ERROR = 'E1000',
  INTERNAL_ERROR = 'E1001',
  NOT_IMPLEMENTED = 'E1002',

  // Command errors (2xxx)
  COMMAND_NOT_FOUND = 'E2000',
  COMMAND_EXECUTION_ERROR = 'E2001',
  COMMAND_DISABLED = 'E2002',

  // Validation errors (3xxx)
  VALIDATION_ERROR = 'E3000',
  INVALID_ARGUMENT = 'E3001',
  MISSING_ARGUMENT = 'E3002',
  ARGUMENT_OUT_OF_RANGE = 'E3003',

  // Permission errors (4xxx)
  PERMISSION_DENIED = 'E4000',
  INSUFFICIENT_BOT_PERMISSIONS = 'E4001',
  OWNER_ONLY = 'E4002',

  // Rate limiting errors (5xxx)
  COOLDOWN_ACTIVE = 'E5000',
  RATE_LIMITED = 'E5001',

  // Configuration errors (6xxx)
  CONFIGURATION_ERROR = 'E6000',
  MISSING_ENV_VARIABLE = 'E6001',
  INVALID_CONFIGURATION = 'E6002',

  // External service errors (7xxx)
  EXTERNAL_SERVICE_ERROR = 'E7000',
  DISCORD_API_ERROR = 'E7001',
  DATABASE_ERROR = 'E7002',
  NETWORK_ERROR = 'E7003',
}

/**
 * Error severity levels for prioritizing error handling
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Error context for additional debugging information
 */
export interface ErrorContext {
  userId?: string | undefined;
  guildId?: string | undefined;
  channelId?: string | undefined;
  commandName?: string | undefined;
  action?: string | undefined;
  [key: string]: unknown;
}

/**
 * Base error class for all bot-related errors
 */
export class BotError extends Error {
  public readonly code: ErrorCode;
  public readonly context: ErrorContext;
  public readonly timestamp: Date;
  public readonly isOperational: boolean;
  public readonly severity: ErrorSeverity;
  public readonly originalError: Error | undefined;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN_ERROR,
    context: ErrorContext = {},
    originalError?: Error,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM
  ) {
    super(message);
    this.name = 'BotError';
    this.code = code;
    this.context = context;
    this.timestamp = new Date();
    this.isOperational = true;
    this.severity = severity;
    this.originalError = originalError;

    // Maintains proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serialize error to JSON for logging
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      isOperational: this.isOperational,
      severity: this.severity,
      stack: this.stack,
      originalError: this.originalError
        ? {
            name: this.originalError.name,
            message: this.originalError.message,
            stack: this.originalError.stack,
          }
        : undefined,
    };
  }

  /**
   * Get user-friendly error message
   */
  getUserMessage(): string {
    return 'An error occurred while processing your request.';
  }
}

/**
 * Command execution errors
 */
export class CommandError extends BotError {
  public readonly commandName: string;
  public readonly userMessage: string;

  constructor(
    message: string,
    commandName: string,
    userMessage?: string,
    context: ErrorContext = {},
    originalError?: Error
  ) {
    super(message, ErrorCode.COMMAND_EXECUTION_ERROR, { ...context, commandName }, originalError);
    this.name = 'CommandError';
    this.commandName = commandName;
    this.userMessage = userMessage ?? 'An error occurred while executing this command.';
  }

  override getUserMessage(): string {
    return this.userMessage;
  }
}

/**
 * Validation errors for invalid input
 */
export class ValidationError extends BotError {
  public readonly field: string;
  public readonly expected: string | undefined;
  public readonly received: unknown;

  constructor(
    message: string,
    field: string,
    expected?: string,
    received?: unknown,
    context: ErrorContext = {}
  ) {
    super(message, ErrorCode.VALIDATION_ERROR, { ...context, field }, undefined, ErrorSeverity.LOW);
    this.name = 'ValidationError';
    this.field = field;
    this.expected = expected;
    this.received = received;
  }

  override getUserMessage(): string {
    if (this.expected) {
      return `Invalid value for "${this.field}". Expected ${this.expected}.`;
    }
    return `Invalid value for "${this.field}".`;
  }
}

/**
 * Permission errors when user lacks required permissions
 */
export class PermissionError extends BotError {
  public readonly requiredPermissions: string[];
  public readonly userPermissions: string[] | undefined;

  constructor(
    requiredPermissions: string[],
    userPermissions?: string[],
    context: ErrorContext = {}
  ) {
    const message = `Missing required permissions: ${requiredPermissions.join(', ')}`;
    super(message, ErrorCode.PERMISSION_DENIED, context, undefined, ErrorSeverity.LOW);
    this.name = 'PermissionError';
    this.requiredPermissions = requiredPermissions;
    this.userPermissions = userPermissions;
  }

  override getUserMessage(): string {
    return `You need the following permissions: ${this.requiredPermissions.join(', ')}`;
  }
}

/**
 * Cooldown errors when command is on cooldown
 */
export class CooldownError extends BotError {
  public readonly remainingTime: number;
  public readonly commandName: string;

  constructor(remainingTime: number, commandName: string, context: ErrorContext = {}) {
    const message = `Command "${commandName}" is on cooldown. ${remainingTime} seconds remaining.`;
    super(
      message,
      ErrorCode.COOLDOWN_ACTIVE,
      { ...context, commandName },
      undefined,
      ErrorSeverity.LOW
    );
    this.name = 'CooldownError';
    this.remainingTime = remainingTime;
    this.commandName = commandName;
  }

  override getUserMessage(): string {
    return `Please wait ${this.remainingTime} seconds before using this command again.`;
  }
}

/**
 * Configuration errors for missing or invalid configuration
 */
export class ConfigurationError extends BotError {
  public readonly configKey: string | undefined;

  constructor(message: string, configKey?: string, context: ErrorContext = {}) {
    super(
      message,
      ErrorCode.CONFIGURATION_ERROR,
      { ...context, configKey },
      undefined,
      ErrorSeverity.CRITICAL
    );
    this.name = 'ConfigurationError';
    this.configKey = configKey;
  }

  override getUserMessage(): string {
    return 'The bot is misconfigured. Please contact an administrator.';
  }
}

/**
 * External service errors for API failures, database issues, etc.
 */
export class ExternalServiceError extends BotError {
  public readonly serviceName: string;
  public readonly statusCode: number | undefined;
  public readonly retryable: boolean;

  constructor(
    message: string,
    serviceName: string,
    statusCode?: number,
    retryable: boolean = false,
    context: ErrorContext = {},
    originalError?: Error
  ) {
    super(
      message,
      ErrorCode.EXTERNAL_SERVICE_ERROR,
      { ...context, serviceName, statusCode },
      originalError,
      ErrorSeverity.HIGH
    );
    this.name = 'ExternalServiceError';
    this.serviceName = serviceName;
    this.statusCode = statusCode;
    this.retryable = retryable;
  }

  override getUserMessage(): string {
    if (this.retryable) {
      return `${this.serviceName} is temporarily unavailable. Please try again later.`;
    }
    return `An error occurred while communicating with ${this.serviceName}.`;
  }
}

/**
 * Type for error handlers
 */
export type ErrorHandlerFn = (error: BotError) => void | Promise<void>;

/**
 * Result of error handling
 */
export interface ErrorHandleResult {
  handled: boolean;
  error: BotError;
  reported: boolean;
}

/**
 * Central error handler for the bot
 */
export class ErrorHandler {
  private static handlers: ErrorHandlerFn[] = [];
  private static errorCounts: Map<ErrorCode, number> = new Map();
  private static lastErrors: BotError[] = [];
  private static readonly MAX_STORED_ERRORS = 100;

  /**
   * Register a custom error handler
   */
  static registerHandler(handler: ErrorHandlerFn): void {
    this.handlers.push(handler);
  }

  /**
   * Clear all registered handlers (useful for testing)
   */
  static clearHandlers(): void {
    this.handlers = [];
  }

  /**
   * Handle an error with logging and notification
   */
  static async handle(
    error: Error | BotError,
    context: ErrorContext = {}
  ): Promise<ErrorHandleResult> {
    const botError = this.normalizeError(error, context);

    // Track error counts
    const currentCount = this.errorCounts.get(botError.code) ?? 0;
    this.errorCounts.set(botError.code, currentCount + 1);

    // Store error for debugging
    this.storeError(botError);

    // Log the error
    this.logError(botError);

    // Call registered handlers
    let reported = false;
    for (const handler of this.handlers) {
      try {
        await handler(botError);
        reported = true;
      } catch (handlerError) {
        Logger.error('Error handler failed', {
          handlerError: handlerError instanceof Error ? handlerError.message : String(handlerError),
          originalError: botError.message,
        });
      }
    }

    return {
      handled: true,
      error: botError,
      reported,
    };
  }

  /**
   * Handle an error that occurred during interaction handling
   */
  static async handleInteractionError(
    error: Error | BotError,
    interaction: RepliableInteraction
  ): Promise<void> {
    const baseContext = {
      userId: interaction.user.id,
      guildId: interaction.guildId ?? undefined,
      channelId: interaction.channelId ?? undefined,
    };
    const botError = this.normalizeError(
      error,
      'commandName' in interaction
        ? { ...baseContext, commandName: interaction.commandName as string }
        : baseContext
    );

    await this.handle(botError);

    const userMessage = botError.getUserMessage();

    try {
      const replyOptions: InteractionReplyOptions = {
        content: `${userMessage}`,
        flags: MessageFlags.Ephemeral,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(replyOptions);
      } else {
        await interaction.reply(replyOptions);
      }
    } catch (replyError) {
      Logger.error('Failed to send error response to user', {
        originalError: botError.message,
        replyError: replyError instanceof Error ? replyError.message : String(replyError),
      });
    }
  }

  /**
   * Normalize any error to a BotError
   */
  static normalizeError(error: Error | BotError, context: ErrorContext = {}): BotError {
    if (error instanceof BotError) {
      // Merge context
      return new BotError(
        error.message,
        error.code,
        { ...error.context, ...context },
        error.originalError,
        error.severity
      );
    }

    return new BotError(error.message, ErrorCode.UNKNOWN_ERROR, context, error);
  }

  /**
   * Check if an error is operational (expected) vs programming error
   */
  static isOperationalError(error: Error): boolean {
    if (error instanceof BotError) {
      return error.isOperational;
    }
    return false;
  }

  /**
   * Get error counts by code
   */
  static getErrorCounts(): Map<ErrorCode, number> {
    return new Map(this.errorCounts);
  }

  /**
   * Get recent errors for debugging
   */
  static getRecentErrors(limit: number = 10): BotError[] {
    return this.lastErrors.slice(-limit);
  }

  /**
   * Reset error statistics
   */
  static resetStats(): void {
    this.errorCounts.clear();
    this.lastErrors = [];
  }

  /**
   * Log an error appropriately based on severity
   */
  private static logError(error: BotError): void {
    // Masque les credentials (tokens, URLs de connexion) avant l'écriture des logs.
    const message = sanitizeMessage(error.message);
    const logContext = {
      code: error.code,
      severity: error.severity,
      ...error.context,
      stack: error.stack ? sanitizeMessage(error.stack) : error.stack,
    };

    switch (error.severity) {
      case ErrorSeverity.LOW:
        Logger.warn(message, logContext);
        break;
      case ErrorSeverity.MEDIUM:
        Logger.error(message, logContext);
        break;
      case ErrorSeverity.HIGH:
      case ErrorSeverity.CRITICAL:
        Logger.error(`[${error.severity.toUpperCase()}] ${message}`, logContext);
        break;
      default:
        Logger.error(message, logContext);
    }
  }

  /**
   * Store error for debugging purposes
   */
  private static storeError(error: BotError): void {
    this.lastErrors.push(error);
    if (this.lastErrors.length > this.MAX_STORED_ERRORS) {
      this.lastErrors.shift();
    }
  }
}

/**
 * Decorator for wrapping command handlers with error handling
 */
export function errorMiddleware<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T
): (...args: Parameters<T>) => Promise<void> {
  return async (...args: Parameters<T>): Promise<void> => {
    try {
      await fn(...args);
    } catch (error) {
      const interaction = args[0] as RepliableInteraction;
      if (
        interaction &&
        typeof interaction === 'object' &&
        'reply' in interaction &&
        typeof interaction.reply === 'function'
      ) {
        await ErrorHandler.handleInteractionError(
          error instanceof Error ? error : new Error(String(error)),
          interaction
        );
      } else {
        await ErrorHandler.handle(error instanceof Error ? error : new Error(String(error)));
      }
    }
  };
}

/**
 * Helper to create errors with proper typing
 */
export const createError = {
  command: (
    message: string,
    commandName: string,
    userMessage?: string,
    context?: ErrorContext
  ): CommandError => new CommandError(message, commandName, userMessage, context),

  validation: (
    message: string,
    field: string,
    expected?: string,
    received?: unknown
  ): ValidationError => new ValidationError(message, field, expected, received),

  permission: (requiredPermissions: string[], userPermissions?: string[]): PermissionError =>
    new PermissionError(requiredPermissions, userPermissions),

  cooldown: (remainingTime: number, commandName: string): CooldownError =>
    new CooldownError(remainingTime, commandName),

  config: (message: string, configKey?: string): ConfigurationError =>
    new ConfigurationError(message, configKey),

  external: (
    message: string,
    serviceName: string,
    statusCode?: number,
    retryable?: boolean
  ): ExternalServiceError => new ExternalServiceError(message, serviceName, statusCode, retryable),
};
