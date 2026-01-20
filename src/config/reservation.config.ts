import { registerAs } from '@nestjs/config';

export const reservationConfig = registerAs('reservation', () => ({
  ttlSeconds: parseInt(process.env.RESERVATION_TTL_SECONDS ?? '30', 10),
}));
