import type { LogContext } from '@/types/bot';

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  [key: string]: unknown;
}

export class Logger {
  private static formatLogEntry(
    level: LogLevel,
    message: string,
    context: LogContext = {}
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message,
      ...context,
    };
  }

  private static output(logEntry: LogEntry): void {
    console.log(JSON.stringify(logEntry));
  }

  public static log(level: LogLevel, message: string, context: LogContext = {}): void {
    const logEntry = this.formatLogEntry(level, message, context);
    this.output(logEntry);
  }

  public static info(message: string, context: LogContext = {}): void {
    this.log(LogLevel.INFO, message, context);
  }

  public static warn(message: string, context: LogContext = {}): void {
    this.log(LogLevel.WARN, message, context);
  }

  public static error(message: string, context: LogContext = {}): void {
    this.log(LogLevel.ERROR, message, context);
  }

  public static debug(message: string, context: LogContext = {}): void {
    if (process.env['NODE_ENV'] === 'development') {
      this.log(LogLevel.DEBUG, message, context);
    }
  }
}
