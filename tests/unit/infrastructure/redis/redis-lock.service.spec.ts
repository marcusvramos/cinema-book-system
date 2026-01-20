import { Test, TestingModule } from '@nestjs/testing';
import { RedisLockService } from '@infrastructure/redis/redis-lock.service';
import { REDIS_CLIENT } from '@infrastructure/redis/redis.constants';

describe('RedisLockService', () => {
  let service: RedisLockService;

  const mockRedis: {
    set: jest.Mock;
    eval: jest.Mock;
  } = {
    set: jest.fn(),
    eval: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisLockService,
        {
          provide: REDIS_CLIENT,
          useValue: mockRedis,
        },
      ],
    }).compile();

    service = module.get<RedisLockService>(RedisLockService);

    jest.clearAllMocks();
  });

  describe('acquireLock', () => {
    it('should acquire lock successfully when key is not locked', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const result = await service.acquireLock('test-resource', 5000);

      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(mockRedis.set).toHaveBeenCalledWith(
        'lock:test-resource',
        expect.any(String),
        'PX',
        5000,
        'NX',
      );
    });

    it('should return null when lock is already held', async () => {
      mockRedis.set.mockResolvedValue(null);

      const result = await service.acquireLock('test-resource', 5000);

      expect(result).toBeNull();
    });

    it('should use default TTL of 5000ms when not specified', async () => {
      mockRedis.set.mockResolvedValue('OK');

      await service.acquireLock('test-resource');

      expect(mockRedis.set).toHaveBeenCalledWith(
        'lock:test-resource',
        expect.any(String),
        'PX',
        5000,
        'NX',
      );
    });

    it('should generate unique lock tokens', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const token1 = await service.acquireLock('resource-1');
      const token2 = await service.acquireLock('resource-2');

      expect(token1).not.toBe(token2);
    });
  });

  describe('releaseLock', () => {
    it('should release lock when token matches', async () => {
      mockRedis.eval.mockResolvedValue(1);

      const result = await service.releaseLock('test-resource', 'valid-token');

      expect(result).toBe(true);
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining('redis.call("get"'),
        1,
        'lock:test-resource',
        'valid-token',
      );
    });

    it('should return false when token does not match', async () => {
      mockRedis.eval.mockResolvedValue(0);

      const result = await service.releaseLock('test-resource', 'invalid-token');

      expect(result).toBe(false);
    });

    it('should use Lua script to ensure atomic check-and-delete', async () => {
      mockRedis.eval.mockResolvedValue(1);

      await service.releaseLock('test-resource', 'token');

      const calls = mockRedis.eval.mock.calls as [string, number, string, string][];
      const luaScript = calls[0]?.[0] ?? '';
      expect(luaScript).toContain('redis.call("get"');
      expect(luaScript).toContain('redis.call("del"');
    });
  });

  describe('acquireLockWithRetry', () => {
    it('should return lock token on first successful attempt', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const result = await service.acquireLockWithRetry('test-resource', 5000, 3, 100);

      expect(result).toBeTruthy();
      expect(mockRedis.set).toHaveBeenCalledTimes(1);
    });

    it('should retry and succeed on subsequent attempt', async () => {
      mockRedis.set
        .mockResolvedValueOnce(null) // First attempt fails
        .mockResolvedValueOnce(null) // Second attempt fails
        .mockResolvedValueOnce('OK'); // Third attempt succeeds

      const result = await service.acquireLockWithRetry('test-resource', 5000, 5, 10);

      expect(result).toBeTruthy();
      expect(mockRedis.set).toHaveBeenCalledTimes(3);
    });

    it('should return null after all retries exhausted', async () => {
      mockRedis.set.mockResolvedValue(null);

      const result = await service.acquireLockWithRetry('test-resource', 5000, 3, 10);

      expect(result).toBeNull();
      expect(mockRedis.set).toHaveBeenCalledTimes(3);
    });
  });

  describe('withLock', () => {
    it('should execute function and release lock on success', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);

      const mockFn = jest.fn().mockResolvedValue('result');

      const result = await service.withLock('test-resource', mockFn, 5000);

      expect(result).toBe('result');
      expect(mockFn).toHaveBeenCalled();
      expect(mockRedis.eval).toHaveBeenCalled(); // Lock released
    });

    it('should release lock even when function throws', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);

      const mockFn = jest.fn().mockRejectedValue(new Error('Function error'));

      await expect(service.withLock('test-resource', mockFn, 5000)).rejects.toThrow(
        'Function error',
      );

      expect(mockRedis.eval).toHaveBeenCalled(); // Lock released
    });
  });

  describe('acquireLockWithExponentialBackoff', () => {
    it('should use exponential backoff delays between retries', async () => {
      mockRedis.set
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('OK');

      const startTime = Date.now();
      await service.acquireLockWithExponentialBackoff('test-resource', 5000, {
        maxRetries: 5,
        baseDelayMs: 50,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
        jitterFactor: 0,
      });
      const elapsed = Date.now() - startTime;

      // With 0 jitter: 50ms (first) + 100ms (second) = 150ms minimum
      expect(elapsed).toBeGreaterThanOrEqual(100);
    });

    it('should return null after max retries with exponential backoff', async () => {
      mockRedis.set.mockResolvedValue(null);

      const result = await service.acquireLockWithExponentialBackoff('test-resource', 5000, {
        maxRetries: 2,
        baseDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 2,
        jitterFactor: 0,
      });

      expect(result).toBeNull();
      expect(mockRedis.set).toHaveBeenCalledTimes(2);
    });
  });
});
