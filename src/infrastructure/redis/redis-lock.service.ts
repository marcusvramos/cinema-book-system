import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { calculateBackoffDelay, RetryOptions, LOCK_RETRY_OPTIONS } from '@common/utils/retry.util';

@Injectable()
export class RedisLockService {
  private readonly logger = new Logger(RedisLockService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async acquireLock(resource: string, ttlMs: number = 5000): Promise<string | null> {
    const lockKey = `lock:${resource}`;
    const lockToken = `${Date.now()}-${Math.random().toString(36).substring(2)}`;

    const result = await this.redis.set(lockKey, lockToken, 'PX', ttlMs, 'NX');

    if (result === 'OK') {
      this.logger.debug(`Lock acquired for ${resource}`);
      return lockToken;
    }

    this.logger.debug(`Failed to acquire lock for ${resource}`);
    return null;
  }

  async releaseLock(resource: string, lockToken: string): Promise<boolean> {
    const lockKey = `lock:${resource}`;

    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    const result = await this.redis.eval(script, 1, lockKey, lockToken);

    if (result === 1) {
      this.logger.debug(`Lock released for ${resource}`);
      return true;
    }

    this.logger.warn(`Failed to release lock for ${resource} - token mismatch`);
    return false;
  }

  async acquireLockWithRetry(
    resource: string,
    ttlMs: number = 5000,
    options: Partial<RetryOptions> = {},
  ): Promise<string | null> {
    const opts: RetryOptions = { ...LOCK_RETRY_OPTIONS, ...options };

    for (let attempt = 0; attempt < opts.maxRetries; attempt++) {
      const lockToken = await this.acquireLock(resource, ttlMs);
      if (lockToken) {
        if (attempt > 0) {
          this.logger.debug(`Lock acquired for ${resource} after ${attempt + 1} attempts`);
        }
        return lockToken;
      }

      if (attempt < opts.maxRetries - 1) {
        const delay = calculateBackoffDelay(attempt, opts);
        this.logger.debug(
          `Lock attempt ${attempt + 1}/${opts.maxRetries} failed for ${resource}, backoff ${delay}ms`,
        );
        await this.sleep(delay);
      }
    }

    this.logger.warn(`Failed to acquire lock for ${resource} after ${opts.maxRetries} attempts`);
    return null;
  }

  async withLock<T>(resource: string, fn: () => Promise<T>, ttlMs: number = 5000): Promise<T> {
    const lockToken = await this.acquireLockWithRetry(resource, ttlMs);

    if (!lockToken) {
      throw new Error(`Could not acquire lock for resource: ${resource}`);
    }

    try {
      return await fn();
    } finally {
      await this.releaseLock(resource, lockToken);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
