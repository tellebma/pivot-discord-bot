/**
 * Masque les secrets (URLs de connexion, tokens) avant de les écrire dans les
 * logs ou de les envoyer à un service externe (Sentry).
 */
const PATTERNS: readonly RegExp[] = [
  // URLs de connexion type postgres://user:pass@host:port/db
  /\b(?:postgres|postgresql|mongodb(?:\+srv)?|mysql|redis):\/\/[^\s'"]+/gi,
  // Tokens Discord (entête Authorization: Bot <token>)
  /\bBot\s+[A-Za-z0-9._-]{20,}/gi,
  // Tokens GitHub (ghp_, github_pat_, gho_, ghs_, ghr_)
  /\b(?:ghp|gho|ghs|ghr)_[A-Za-z0-9]{20,}/gi,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/gi,
];

const REDACTED = '[REDACTED]';

export function sanitizeMessage(message: string): string {
  return PATTERNS.reduce((acc, pattern) => acc.replace(pattern, REDACTED), message);
}

/**
 * Nettoie `.message` et `.stack` en place. La mutation est volontaire : elle
 * préserve le sous-type concret de l'erreur (E) et la fonction est appelée à
 * la frontière de logging, juste avant d'écrire/capturer l'erreur.
 */
export function sanitizeError<E extends Error>(error: E): E {
  error.message = sanitizeMessage(error.message);
  if (error.stack) {
    error.stack = sanitizeMessage(error.stack);
  }
  return error;
}
