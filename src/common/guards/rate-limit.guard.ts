import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '@infrastructure/redis/redis.constants';

export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitConfig {
  points: number;
  duration: number;
  blockDuration?: number;
  keyPrefix?: string;
}

export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  points: 100,
  duration: 60,
  blockDuration: 60,
  keyPrefix: 'rl',
};

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const config = this.getRateLimitConfig(context);
    const request = context.switchToHttp().getRequest<Request>();
    const key = this.generateKey(request, config);

    try {
      const result = await this.checkRateLimit(key, config);

      const response = context.switchToHttp().getResponse<Response>();
      response.set('X-RateLimit-Limit', config.points.toString());
      response.set('X-RateLimit-Remaining', result.remaining.toString());
      response.set('X-RateLimit-Reset', result.resetTime.toString());

      if (!result.allowed) {
        response.set('Retry-After', result.retryAfter.toString());
        this.logger.warn(`Rate limit exceeded for ${key} - ${result.remaining}/${config.points}`);
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Too many requests, please try again later',
            error: 'Too Many Requests',
            retryAfter: result.retryAfter,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Rate limit check failed: ${errMsg}`);
      return true;
    }
  }

  private getRateLimitConfig(context: ExecutionContext): RateLimitConfig {
    const handlerConfig = this.reflector.get<RateLimitConfig>(RATE_LIMIT_KEY, context.getHandler());
    const classConfig = this.reflector.get<RateLimitConfig>(RATE_LIMIT_KEY, context.getClass());
    return { ...DEFAULT_RATE_LIMIT, ...classConfig, ...handlerConfig };
  }

  private generateKey(request: Request, config: RateLimitConfig): string {
    const forwardedFor = request.headers['x-forwarded-for'];
    const ip =
      request.ip ||
      (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor) ||
      request.socket.remoteAddress ||
      'unknown';

    const reqWithUser = request as Request & { user?: { id?: string } };
    const userId = reqWithUser.user?.id || 'anonymous';

    const path = request.path.replace(/\//g, ':');

    return `${config.keyPrefix}:${ip}:${userId}:${path}`;
  }

  private async checkRateLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const now = Date.now();
    const windowKey = `${key}:${Math.floor(now / (config.duration * 1000))}`;
    const blockKey = `${key}:blocked`;

    const blocked = await this.redis.get(blockKey);
    if (blocked) {
      const ttl = await this.redis.ttl(blockKey);
      return {
        allowed: false,
        remaining: 0,
        resetTime: now + ttl * 1000,
        retryAfter: ttl,
      };
    }

    const script = `
      local current = redis.call('INCR', KEYS[1])
      if current == 1 then
        redis.call('EXPIRE', KEYS[1], ARGV[1])
      end
      return current
    `;

    const count = (await this.redis.eval(script, 1, windowKey, config.duration)) as number;

    const remaining = Math.max(0, config.points - count);
    const resetTime = (Math.floor(now / (config.duration * 1000)) + 1) * config.duration * 1000;

    if (count > config.points) {
      if (config.blockDuration) {
        await this.redis.setex(blockKey, config.blockDuration, '1');
      }
      return {
        allowed: false,
        remaining: 0,
        resetTime,
        retryAfter: config.blockDuration || config.duration,
      };
    }

    return {
      allowed: true,
      remaining,
      resetTime,
      retryAfter: 0,
    };
  }
}
