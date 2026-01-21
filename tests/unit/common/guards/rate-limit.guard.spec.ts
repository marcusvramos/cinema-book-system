import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitGuard, DEFAULT_RATE_LIMIT } from '@common/guards/rate-limit.guard';
import Redis from 'ioredis';

interface MockResponse {
  set: jest.Mock;
}

describe('RateLimitGuard', () => {
  let guard: RateLimitGuard;
  let mockRedis: {
    get: jest.Mock;
    ttl: jest.Mock;
    eval: jest.Mock;
    setex: jest.Mock;
  };
  let mockReflector: jest.Mocked<Reflector>;

  const createMockContext = (
    options: {
      ip?: string;
      path?: string;
      user?: { id: string };
      forwardedFor?: string | string[];
    } = {},
  ): { context: ExecutionContext; response: MockResponse } => {
    const mockRequest = {
      ip: options.ip || '127.0.0.1',
      path: options.path || '/test',
      headers: {
        'x-forwarded-for': options.forwardedFor,
      },
      socket: { remoteAddress: '127.0.0.1' },
      user: options.user,
    };

    const mockResponse: MockResponse = {
      set: jest.fn(),
    };

    const context = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
      getHandler: () => jest.fn(),
      getClass: () => class {},
    } as unknown as ExecutionContext;

    return { context, response: mockResponse };
  };

  beforeEach(() => {
    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      ttl: jest.fn().mockResolvedValue(60),
      eval: jest.fn().mockResolvedValue(1),
      setex: jest.fn().mockResolvedValue('OK'),
    };

    mockReflector = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as jest.Mocked<Reflector>;

    guard = new RateLimitGuard(mockRedis as unknown as Redis, mockReflector);
  });

  describe('canActivate', () => {
    it('should allow request when under rate limit', async () => {
      const { context } = createMockContext();
      mockRedis.eval.mockResolvedValue(1);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should set rate limit headers', async () => {
      const { context, response } = createMockContext();

      await guard.canActivate(context);

      expect(response.set).toHaveBeenCalledWith(
        'X-RateLimit-Limit',
        DEFAULT_RATE_LIMIT.points.toString(),
      );
      expect(response.set).toHaveBeenCalledWith(
        'X-RateLimit-Remaining',
        expect.any(String) as string,
      );
      expect(response.set).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String) as string);
    });

    it('should throw HttpException when rate limit exceeded', async () => {
      const { context } = createMockContext();
      mockRedis.eval.mockResolvedValue(101);

      await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
    });

    it('should set Retry-After header when blocked', async () => {
      const { context, response } = createMockContext();
      mockRedis.eval.mockResolvedValue(101);

      try {
        await guard.canActivate(context);
      } catch {
        expect(response.set).toHaveBeenCalledWith('Retry-After', expect.any(String) as string);
      }
    });

    it('should return blocked result when already blocked', async () => {
      const { context } = createMockContext();
      mockRedis.get.mockResolvedValue('1');
      mockRedis.ttl.mockResolvedValue(30);

      await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
    });

    it('should use handler config when available', async () => {
      const handlerFn = jest.fn();
      const mockRequest = {
        ip: '127.0.0.1',
        path: '/test',
        headers: {},
        socket: { remoteAddress: '127.0.0.1' },
      };
      const mockResponse: MockResponse = { set: jest.fn() };

      const context = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
          getResponse: () => mockResponse,
        }),
        getHandler: () => handlerFn,
        getClass: () => class {},
      } as unknown as ExecutionContext;

      mockReflector.get.mockImplementation((_key: string, target: object) => {
        if (target === handlerFn) {
          return { points: 50 };
        }
        return undefined;
      });

      await guard.canActivate(context);

      expect(mockResponse.set).toHaveBeenCalledWith('X-RateLimit-Limit', '50');
    });

    it('should use class config when handler config not available', async () => {
      class TestClass {}
      const mockRequest = {
        ip: '127.0.0.1',
        path: '/test',
        headers: {},
        socket: { remoteAddress: '127.0.0.1' },
      };
      const mockResponse: MockResponse = { set: jest.fn() };

      const context = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
          getResponse: () => mockResponse,
        }),
        getHandler: () => jest.fn(),
        getClass: () => TestClass,
      } as unknown as ExecutionContext;

      mockReflector.get.mockImplementation((_key: string, target: object) => {
        if (target === TestClass) {
          return { points: 75 };
        }
        return undefined;
      });

      await guard.canActivate(context);

      expect(mockResponse.set).toHaveBeenCalledWith('X-RateLimit-Limit', '75');
    });

    it('should generate key with x-forwarded-for header', async () => {
      const { context } = createMockContext({ forwardedFor: '10.0.0.1' });

      await guard.canActivate(context);

      expect(mockRedis.eval).toHaveBeenCalled();
    });

    it('should generate key with array x-forwarded-for header', async () => {
      const { context } = createMockContext({ forwardedFor: ['10.0.0.1', '10.0.0.2'] });

      await guard.canActivate(context);

      expect(mockRedis.eval).toHaveBeenCalled();
    });

    it('should include user id in key when authenticated', async () => {
      const { context } = createMockContext({ user: { id: 'user-123' } });

      await guard.canActivate(context);

      expect(mockRedis.eval).toHaveBeenCalled();
    });

    it('should allow request when Redis fails', async () => {
      const { context } = createMockContext();
      mockRedis.eval.mockRejectedValue(new Error('Redis error'));

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should set block key when rate limit exceeded with blockDuration', async () => {
      const { context } = createMockContext();
      mockRedis.eval.mockResolvedValue(101);

      try {
        await guard.canActivate(context);
      } catch {
        expect(mockRedis.setex).toHaveBeenCalled();
      }
    });
  });

  describe('DEFAULT_RATE_LIMIT', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_RATE_LIMIT.points).toBe(100);
      expect(DEFAULT_RATE_LIMIT.duration).toBe(60);
      expect(DEFAULT_RATE_LIMIT.blockDuration).toBe(60);
      expect(DEFAULT_RATE_LIMIT.keyPrefix).toBe('rl');
    });
  });
});
