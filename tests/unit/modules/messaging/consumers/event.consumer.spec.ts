import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventConsumer } from '@modules/messaging/consumers/event.consumer';
import {
  ReservationCreatedHandler,
  ReservationExpiredHandler,
  PaymentConfirmedHandler,
  SeatReleasedHandler,
} from '@modules/messaging/strategies';
import { RedisStatsService } from '@infrastructure/redis/redis-stats.service';
import * as amqp from 'amqplib';

jest.mock('amqplib', () => ({
  connect: jest.fn(),
}));

type ConsumeCallback = (msg: amqp.ConsumeMessage | null) => void;
type ConnectionEventHandler = () => void;

interface MockRedisStatsService {
  incrementSessionSales: jest.Mock;
  incrementGlobalStats: jest.Mock;
  getSessionStats: jest.Mock;
  getGlobalStats: jest.Mock;
  incrementCounter: jest.Mock;
  getCounter: jest.Mock;
}

describe('EventConsumer', () => {
  let consumer: EventConsumer;
  let configService: jest.Mocked<ConfigService>;
  let mockChannel: {
    assertExchange: jest.Mock;
    assertQueue: jest.Mock;
    bindQueue: jest.Mock;
    prefetch: jest.Mock;
    consume: jest.Mock;
    ack: jest.Mock;
    nack: jest.Mock;
    close: jest.Mock;
  };
  let mockConnection: {
    createChannel: jest.Mock;
    on: jest.Mock;
    close: jest.Mock;
  };

  const mockRedisStatsService: MockRedisStatsService = {
    incrementSessionSales: jest.fn().mockResolvedValue(undefined),
    incrementGlobalStats: jest.fn().mockResolvedValue(undefined),
    getSessionStats: jest.fn().mockResolvedValue({ salesCount: 1, totalRevenue: 25.0 }),
    getGlobalStats: jest.fn().mockResolvedValue({ totalSales: 10, totalRevenue: 250.0 }),
    incrementCounter: jest.fn().mockResolvedValue(1),
    getCounter: jest.fn().mockResolvedValue(0),
  };

  beforeEach(async () => {
    jest.useFakeTimers();

    mockChannel = {
      assertExchange: jest.fn().mockResolvedValue(undefined),
      assertQueue: jest.fn().mockResolvedValue(undefined),
      bindQueue: jest.fn().mockResolvedValue(undefined),
      prefetch: jest.fn().mockResolvedValue(undefined),
      consume: jest.fn().mockResolvedValue({ consumerTag: 'tag' }),
      ack: jest.fn(),
      nack: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    };

    mockConnection = {
      createChannel: jest.fn().mockResolvedValue(mockChannel),
      on: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    };

    (amqp.connect as jest.Mock).mockResolvedValue(mockConnection);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventConsumer,
        ReservationCreatedHandler,
        ReservationExpiredHandler,
        SeatReleasedHandler,
        {
          provide: PaymentConfirmedHandler,
          useFactory: () =>
            new PaymentConfirmedHandler(mockRedisStatsService as unknown as RedisStatsService),
        },
        {
          provide: RedisStatsService,
          useValue: mockRedisStatsService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('amqp://localhost'),
          },
        },
      ],
    }).compile();

    consumer = module.get<EventConsumer>(EventConsumer);
    configService = module.get(ConfigService);
  });

  const getConsumeCallback = (callIndex: number): ConsumeCallback => {
    const calls = mockChannel.consume.mock.calls as [string, ConsumeCallback][];
    return calls[callIndex][1];
  };

  const getConnectionHandler = (eventName: string): ConnectionEventHandler | undefined => {
    const calls = mockConnection.on.mock.calls as [string, ConnectionEventHandler][];
    const handlerCall = calls.find((call) => call[0] === eventName);
    return handlerCall?.[1];
  };

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('onModuleInit', () => {
    it('should connect to RabbitMQ on init', async () => {
      await consumer.onModuleInit();

      expect(amqp.connect).toHaveBeenCalledWith('amqp://localhost');
      expect(mockConnection.createChannel).toHaveBeenCalled();
      expect(mockChannel.assertExchange).toHaveBeenCalledWith('cinema.events', 'topic', {
        durable: true,
      });
    });

    it('should setup all queues', async () => {
      await consumer.onModuleInit();

      expect(mockChannel.assertQueue).toHaveBeenCalledTimes(5);
      expect(mockChannel.bindQueue).toHaveBeenCalledTimes(4);
    });

    it('should setup consumers for all queues', async () => {
      await consumer.onModuleInit();

      expect(mockChannel.consume).toHaveBeenCalledTimes(4);
    });

    it('should not connect when URL is not configured', async () => {
      configService.get.mockReturnValue(undefined);

      await consumer.onModuleInit();

      expect(amqp.connect).not.toHaveBeenCalled();
    });

    it('should handle connection error and schedule retry', async () => {
      (amqp.connect as jest.Mock).mockRejectedValueOnce(new Error('Connection failed'));

      await consumer.onModuleInit();

      expect(amqp.connect).toHaveBeenCalledTimes(1);
    });

    it('should register connection error handler', async () => {
      await consumer.onModuleInit();

      expect(mockConnection.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should register connection close handler', async () => {
      await consumer.onModuleInit();

      expect(mockConnection.on).toHaveBeenCalledWith('close', expect.any(Function));
    });
  });

  describe('onModuleDestroy', () => {
    it('should close channel and connection', async () => {
      await consumer.onModuleInit();
      await consumer.onModuleDestroy();

      expect(mockChannel.close).toHaveBeenCalled();
      expect(mockConnection.close).toHaveBeenCalled();
    });

    it('should handle close errors gracefully', async () => {
      mockChannel.close.mockRejectedValue(new Error('Close error'));
      mockConnection.close.mockRejectedValue(new Error('Close error'));

      await consumer.onModuleInit();
      await expect(consumer.onModuleDestroy()).resolves.not.toThrow();
    });
  });

  describe('message processing', () => {
    it('should process valid message', async () => {
      await consumer.onModuleInit();

      const consumeCallback = getConsumeCallback(0);
      const mockMessage = {
        content: Buffer.from(
          JSON.stringify({
            eventId: 'evt-123',
            type: 'reservation.created',
            reservationId: 'res-123',
            timestamp: new Date().toISOString(),
          }),
        ),
        fields: { deliveryTag: 1 },
        properties: {},
      } as unknown as amqp.ConsumeMessage;

      consumeCallback(mockMessage);

      jest.advanceTimersByTime(1500);

      await Promise.resolve();
      await Promise.resolve();
    });

    it('should handle null message', async () => {
      await consumer.onModuleInit();

      const consumeCallback = getConsumeCallback(0);
      consumeCallback(null);

      expect(mockChannel.ack).not.toHaveBeenCalled();
      expect(mockChannel.nack).not.toHaveBeenCalled();
    });

    it('should nack message with invalid JSON', async () => {
      await consumer.onModuleInit();

      const consumeCallback = getConsumeCallback(0);
      const mockMessage = {
        content: Buffer.from('invalid json'),
        fields: { deliveryTag: 1 },
        properties: {},
      } as unknown as amqp.ConsumeMessage;

      consumeCallback(mockMessage);

      expect(mockChannel.nack).toHaveBeenCalledWith(mockMessage, false, false);
    });

    it('should process batch when batch size is reached', async () => {
      await consumer.onModuleInit();

      const consumeCallback = getConsumeCallback(0);

      for (let i = 0; i < 10; i++) {
        const mockMessage = {
          content: Buffer.from(
            JSON.stringify({
              eventId: `evt-${i}`,
              type: 'reservation.created',
              reservationId: `res-${i}`,
              timestamp: new Date().toISOString(),
            }),
          ),
          fields: { deliveryTag: i + 1 },
          properties: {},
        } as unknown as amqp.ConsumeMessage;
        consumeCallback(mockMessage);
      }

      await Promise.resolve();
      await Promise.resolve();
    });

    it('should process different event types', async () => {
      await consumer.onModuleInit();

      const eventTypes = [
        { type: 'reservation.created', data: { reservationId: 'res-1' } },
        { type: 'reservation.expired', data: { reservationId: 'res-2' } },
        { type: 'payment.confirmed', data: { saleId: 'sale-1', amount: 25 } },
        { type: 'seat.released', data: { sessionId: 'session-1', seatIds: ['s1', 's2'] } },
      ];

      eventTypes.forEach((eventType, index) => {
        const consumeCallback = getConsumeCallback(index);
        const mockMessage = {
          content: Buffer.from(
            JSON.stringify({
              eventId: `evt-${index}`,
              type: eventType.type,
              ...eventType.data,
              timestamp: new Date().toISOString(),
            }),
          ),
          fields: { deliveryTag: index + 1 },
          properties: {},
        } as unknown as amqp.ConsumeMessage;
        consumeCallback(mockMessage);
      });

      jest.advanceTimersByTime(1500);

      await Promise.resolve();
      await Promise.resolve();
    });

    it('should update Redis stats on payment confirmed', async () => {
      await consumer.onModuleInit();

      const consumeCallback = getConsumeCallback(2);
      const mockMessage = {
        content: Buffer.from(
          JSON.stringify({
            eventId: 'evt-pay-1',
            type: 'payment.confirmed',
            saleId: 'sale-123',
            sessionId: 'session-456',
            amount: 50,
            timestamp: new Date().toISOString(),
          }),
        ),
        fields: { deliveryTag: 1 },
        properties: {},
      } as unknown as amqp.ConsumeMessage;

      consumeCallback(mockMessage);

      jest.advanceTimersByTime(1500);

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(mockRedisStatsService.incrementSessionSales).toHaveBeenCalledWith('session-456', 50);
      expect(mockRedisStatsService.incrementGlobalStats).toHaveBeenCalledWith(50);
    });
  });

  describe('connection recovery', () => {
    it('should schedule reconnection on connection close', async () => {
      await consumer.onModuleInit();

      const closeHandler = getConnectionHandler('close');

      (amqp.connect as jest.Mock).mockClear();

      if (closeHandler) {
        closeHandler();
      }

      jest.advanceTimersByTime(5000);

      expect(amqp.connect).toHaveBeenCalledTimes(1);
    });
  });
});
