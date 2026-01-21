import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class RedisStatsService {
  private readonly logger = new Logger(RedisStatsService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async incrementCounter(key: string, amount: number = 1): Promise<number> {
    const result = await this.redis.incrby(`stats:${key}`, amount);
    this.logger.debug(`Counter ${key} incremented to ${result}`);
    return result;
  }

  async getCounter(key: string): Promise<number> {
    const value = await this.redis.get(`stats:${key}`);
    return value ? parseInt(value, 10) : 0;
  }

  async incrementSessionSales(sessionId: string, amount: number): Promise<void> {
    await this.redis.incr(`stats:session:${sessionId}:sales_count`);
    await this.redis.incrbyfloat(`stats:session:${sessionId}:total_revenue`, amount);
    this.logger.debug(`Session ${sessionId} stats updated: +1 sale, +${amount} revenue`);
  }

  async getSessionStats(sessionId: string): Promise<{ salesCount: number; totalRevenue: number }> {
    const [salesCount, totalRevenue] = await Promise.all([
      this.redis.get(`stats:session:${sessionId}:sales_count`),
      this.redis.get(`stats:session:${sessionId}:total_revenue`),
    ]);

    return {
      salesCount: salesCount ? parseInt(salesCount, 10) : 0,
      totalRevenue: totalRevenue ? parseFloat(totalRevenue) : 0,
    };
  }

  async incrementGlobalStats(amount: number): Promise<void> {
    await this.redis.incr('stats:global:total_sales');
    await this.redis.incrbyfloat('stats:global:total_revenue', amount);
  }

  async getGlobalStats(): Promise<{ totalSales: number; totalRevenue: number }> {
    const [totalSales, totalRevenue] = await Promise.all([
      this.redis.get('stats:global:total_sales'),
      this.redis.get('stats:global:total_revenue'),
    ]);

    return {
      totalSales: totalSales ? parseInt(totalSales, 10) : 0,
      totalRevenue: totalRevenue ? parseFloat(totalRevenue) : 0,
    };
  }
}
