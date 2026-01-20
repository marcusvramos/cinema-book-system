import { SetMetadata } from '@nestjs/common';
import { RATE_LIMIT_KEY, RateLimitConfig } from '../guards/rate-limit.guard';

export const RateLimit = (config: Partial<RateLimitConfig>) => SetMetadata(RATE_LIMIT_KEY, config);

export const StrictRateLimit = () => RateLimit({ points: 10, duration: 60, blockDuration: 300 });

export const WriteRateLimit = () => RateLimit({ points: 30, duration: 60 });
