export const MESSAGING_CONSTANTS = {
  EXCHANGE_NAME: 'cinema.events',
  DLQ_NAME: 'cinema.dlq',
  RECONNECT_DELAY_MS: 5000,
  BATCH_SIZE: 10,
  BATCH_TIMEOUT_MS: 1000,
  PREFETCH_MULTIPLIER: 2,
} as const;

export const QUEUE_CONFIGS = [
  { name: 'cinema.reservation.created', routingKey: 'reservation.created' },
  { name: 'cinema.reservation.expired', routingKey: 'reservation.expired' },
  { name: 'cinema.payment.confirmed', routingKey: 'payment.confirmed' },
  { name: 'cinema.seat.released', routingKey: 'seat.released' },
] as const;

export type QueueRoutingKey = (typeof QUEUE_CONFIGS)[number]['routingKey'];

export const EXPIRATION_BATCH_LIMIT = 50;
