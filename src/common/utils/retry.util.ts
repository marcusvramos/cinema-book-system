import { Logger } from '@nestjs/common';

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 5,
  baseDelayMs: 100,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitterFactor: 0.3,
};

export function calculateBackoffDelay(attempt: number, options: RetryOptions): number {
  const exponentialDelay = options.baseDelayMs * Math.pow(options.backoffMultiplier, attempt);
  const cappedDelay = Math.min(exponentialDelay, options.maxDelayMs);
  const jitter = cappedDelay * options.jitterFactor * Math.random();
  return Math.floor(cappedDelay + jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const err = error as { code?: string; message?: string };

  const retryableCodes = [
    '40001', // PostgreSQL: serialization_failure
    '40P01', // PostgreSQL: deadlock_detected
    '08006', // PostgreSQL: connection_failure
    '08001', // PostgreSQL: sqlclient_unable_to_establish_sqlconnection
    '57P01', // PostgreSQL: admin_shutdown
    'ECONNRESET', // Node.js: connection reset by peer
    'ETIMEDOUT', // Node.js: connection timed out
    'ECONNREFUSED', // Node.js: connection refused
  ];

  if (err.code && retryableCodes.includes(err.code)) {
    return true;
  }

  const retryablePatterns = [
    'connection',
    'timeout',
    'temporarily unavailable',
    'too many connections',
    'deadlock',
  ];

  if (err.message) {
    const lowerMessage = err.message.toLowerCase();
    return retryablePatterns.some((pattern) => lowerMessage.includes(pattern));
  }

  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  logger?: Logger,
  operationName = 'operation',
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (!isRetryableError(error) || attempt === opts.maxRetries) {
        if (attempt > 0) {
          logger?.error(
            `${operationName} failed after ${attempt + 1} attempts: ${lastError.message}`,
          );
        }
        throw lastError;
      }

      const delay = calculateBackoffDelay(attempt, opts);
      logger?.warn(
        `${operationName} attempt ${attempt + 1}/${opts.maxRetries + 1} failed (retryable), retrying in ${delay}ms`,
      );

      await sleep(delay);
    }
  }

  throw lastError;
}
