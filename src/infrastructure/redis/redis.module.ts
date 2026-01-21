import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisLockService } from './redis-lock.service';
import { RedisStatsService } from './redis-stats.service';
import { REDIS_CLIENT } from './redis.constants';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService) => {
        return new Redis({
          host: configService.get<string>('redis.host'),
          port: configService.get<number>('redis.port'),
          maxRetriesPerRequest: null,
        });
      },
      inject: [ConfigService],
    },
    RedisLockService,
    RedisStatsService,
  ],
  exports: [REDIS_CLIENT, RedisLockService, RedisStatsService],
})
export class RedisModule {}
