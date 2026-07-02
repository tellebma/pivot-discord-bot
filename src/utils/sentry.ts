import type * as SentryNode from '@sentry/node';
import type { ErrorEvent } from '@sentry/node';
import { Logger } from './logger';
import { sanitizeMessage } from './sanitize';

/**
 * Intégration Sentry optionnelle. Toutes les fonctions sont des no-op si la
 * variable d'environnement SENTRY_DSN est absente, ce qui rend l'observabilité
 * activable sans toucher au code applicatif.
 */
let sentry: typeof SentryNode | null = null;

export function initSentry(): void {
  const dsn = process.env['SENTRY_DSN'];
  if (!dsn) {
    Logger.debug('Sentry disabled (no SENTRY_DSN)');
    return;
  }

  try {
    // Import paresseux : évite de charger le SDK quand Sentry est désactivé.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sentry = require('@sentry/node') as typeof SentryNode;
    sentry.init({
      dsn,
      environment: process.env['NODE_ENV'] ?? 'production',
      tracesSampleRate: 0,
      beforeSend(event: ErrorEvent): ErrorEvent | null {
        if (event.message) {
          event.message = sanitizeMessage(event.message);
        }
        return event;
      },
    });
    Logger.info('Sentry initialized');
  } catch (error) {
    Logger.warn('Failed to initialize Sentry', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function captureError(error: Error, context?: Record<string, unknown>): void {
  if (!sentry) return;
  sentry.captureException(error, context ? { extra: context } : undefined);
}

export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!sentry) return;
  try {
    await sentry.flush(timeoutMs);
  } catch {
    // Best-effort : ne jamais bloquer le shutdown sur le flush.
  }
}
