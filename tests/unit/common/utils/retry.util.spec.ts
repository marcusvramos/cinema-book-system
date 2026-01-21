import { Logger } from '@nestjs/common';
import {
  calculateBackoffDelay,
  isRetryableError,
  withRetry,
  DEFAULT_RETRY_OPTIONS,
  RetryOptions,
} from '@common/utils/retry.util';

describe('retry.util', () => {
  describe('calculateBackoffDelay', () => {
    const options: RetryOptions = {
      maxRetries: 5,
      baseDelayMs: 100,
      maxDelayMs: 10000,
      backoffMultiplier: 2,
      jitterFactor: 0,
    };

    it('should calculate exponential delay for attempt 0', () => {
      const delay = calculateBackoffDelay(0, options);
      expect(delay).toBe(100);
    });

    it('should calculate exponential delay for attempt 1', () => {
      const delay = calculateBackoffDelay(1, options);
      expect(delay).toBe(200);
    });

    it('should calculate exponential delay for attempt 2', () => {
      const delay = calculateBackoffDelay(2, options);
      expect(delay).toBe(400);
    });

    it('should cap delay at maxDelayMs', () => {
      const delay = calculateBackoffDelay(10, options);
      expect(delay).toBeLessThanOrEqual(options.maxDelayMs);
    });

    it('should add jitter when jitterFactor is set', () => {
      const optionsWithJitter: RetryOptions = {
        ...options,
        jitterFactor: 0.5,
      };

      const delays = Array.from({ length: 10 }, () => calculateBackoffDelay(0, optionsWithJitter));
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });
  });

  describe('isRetryableError', () => {
    it('should return false for null', () => {
      expect(isRetryableError(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isRetryableError(undefined)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(isRetryableError('error')).toBe(false);
    });

    it('should return true for PostgreSQL serialization failure (40001)', () => {
      const error = { code: '40001' };
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for PostgreSQL deadlock (40P01)', () => {
      const error = { code: '40P01' };
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for connection failure (08006)', () => {
      const error = { code: '08006' };
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for ECONNRESET', () => {
      const error = { code: 'ECONNRESET' };
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for ETIMEDOUT', () => {
      const error = { code: 'ETIMEDOUT' };
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for ECONNREFUSED', () => {
      const error = { code: 'ECONNREFUSED' };
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for connection error message', () => {
      const error = { message: 'Connection refused' };
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for timeout error message', () => {
      const error = { message: 'Request timeout occurred' };
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for deadlock error message', () => {
      const error = { message: 'Deadlock detected' };
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return false for non-retryable error', () => {
      const error = { code: 'UNIQUE_VIOLATION', message: 'Duplicate key' };
      expect(isRetryableError(error)).toBe(false);
    });
  });

  describe('withRetry', () => {
    it('should return result on first success', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const result = await withRetry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable error and succeed', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce({ code: 'ECONNRESET' })
        .mockResolvedValueOnce('success');

      const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 10 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      const fn = jest.fn().mockRejectedValue({ code: 'ECONNRESET', message: 'Connection reset' });

      await expect(withRetry(fn, { maxRetries: 2, baseDelayMs: 10 })).rejects.toEqual({
        code: 'ECONNRESET',
        message: 'Connection reset',
      });
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should not retry on non-retryable error', async () => {
      const fn = jest.fn().mockRejectedValue({ code: 'UNIQUE_VIOLATION' });

      await expect(withRetry(fn, { maxRetries: 3 })).rejects.toEqual({ code: 'UNIQUE_VIOLATION' });
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should use logger when provided', async () => {
      const warnMock = jest.fn();
      const errorMock = jest.fn();
      const logger = { warn: warnMock, error: errorMock } as unknown as Logger;
      const fn = jest
        .fn()
        .mockRejectedValueOnce({ code: 'ECONNRESET' })
        .mockResolvedValueOnce('success');

      await withRetry(fn, { maxRetries: 3, baseDelayMs: 10 }, logger, 'test operation');

      expect(warnMock).toHaveBeenCalled();
    });

    it('should use default options when not provided', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      await withRetry(fn);

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('DEFAULT_RETRY_OPTIONS', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_RETRY_OPTIONS.maxRetries).toBe(5);
      expect(DEFAULT_RETRY_OPTIONS.baseDelayMs).toBe(100);
      expect(DEFAULT_RETRY_OPTIONS.maxDelayMs).toBe(10000);
      expect(DEFAULT_RETRY_OPTIONS.backoffMultiplier).toBe(2);
      expect(DEFAULT_RETRY_OPTIONS.jitterFactor).toBe(0.3);
    });
  });
});
