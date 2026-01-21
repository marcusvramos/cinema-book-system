import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventPublisher } from '@modules/messaging/publishers/event.publisher';

jest.mock('amqplib', () => ({
  connect: jest.fn(),
}));

import * as amqp from 'amqplib';

interface EventMessage {
  type: string;
  eventId: string;
  timestamp: string;
  reservationId?: string;
  saleId?: string;
  sessionId?: string;
  seatIds?: string[];
  amount?: number;
}

describe('EventPublisher', () => {
  let publisher: EventPublisher;
  let configService: jest.Mocked<ConfigService>;
  let mockChannel: {
    assertExchange: jest.Mock;
    assertQueue: jest.Mock;
    bindQueue: jest.Mock;
    publish: jest.Mock;
    waitForConfirms: jest.Mock;
  };
  let mockConnection: {
    createConfirmChannel: jest.Mock;
    on: jest.Mock;
    close: jest.Mock;
  };

  beforeEach(async () => {
    mockChannel = {
      assertExchange: jest.fn().mockResolvedValue(undefined),
      assertQueue: jest.fn().mockResolvedValue(undefined),
      bindQueue: jest.fn().mockResolvedValue(undefined),
      publish: jest.fn().mockReturnValue(true),
      waitForConfirms: jest.fn().mockResolvedValue(undefined),
    };

    mockConnection = {
      createConfirmChannel: jest.fn().mockResolvedValue(mockChannel),
      on: jest.fn(),
      close: jest.fn(),
    };

    (amqp.connect as jest.Mock).mockResolvedValue(mockConnection);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventPublisher,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('amqp://localhost'),
          },
        },
      ],
    }).compile();

    publisher = module.get<EventPublisher>(EventPublisher);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('should connect to RabbitMQ on init', async () => {
      await publisher.onModuleInit();

      expect(amqp.connect).toHaveBeenCalledWith('amqp://localhost');
      expect(mockConnection.createConfirmChannel).toHaveBeenCalled();
      expect(mockChannel.assertExchange).toHaveBeenCalledWith('cinema.events', 'topic', {
        durable: true,
      });
    });

    it('should not connect when URL is not configured', async () => {
      configService.get.mockReturnValue(undefined);

      await publisher.onModuleInit();

      expect(amqp.connect).not.toHaveBeenCalled();
    });

    it('should handle connection error and retry', async () => {
      jest.useFakeTimers();
      (amqp.connect as jest.Mock).mockRejectedValueOnce(new Error('Connection failed'));

      await publisher.onModuleInit();

      expect(amqp.connect).toHaveBeenCalledTimes(1);

      jest.useRealTimers();
    });
  });

  describe('publishReservationCreated', () => {
    it('should publish reservation created event', async () => {
      await publisher.onModuleInit();

      const reservation = {
        id: 'res-123',
        userId: 'user-123',
        sessionId: 'session-123',
        seats: [{ id: 'seat-1' }, { id: 'seat-2' }],
      };

      await publisher.publishReservationCreated(reservation);

      expect(mockChannel.publish).toHaveBeenCalled();
      const publishCall = mockChannel.publish.mock.calls[0] as [string, string, Buffer, object];
      expect(publishCall[0]).toBe('cinema.events');
      expect(publishCall[1]).toBe('reservation.created');
      const message = JSON.parse(publishCall[2].toString()) as EventMessage;
      expect(message.type).toBe('reservation.created');
      expect(message.reservationId).toBe('res-123');
      expect(message.seatIds).toEqual(['seat-1', 'seat-2']);
    });

    it('should handle reservation without seats', async () => {
      await publisher.onModuleInit();

      const reservation = {
        id: 'res-123',
        userId: 'user-123',
        sessionId: 'session-123',
      };

      await publisher.publishReservationCreated(reservation);

      const publishCall = mockChannel.publish.mock.calls[0] as [string, string, Buffer, object];
      const message = JSON.parse(publishCall[2].toString()) as EventMessage;
      expect(message.seatIds).toEqual([]);
    });
  });

  describe('publishReservationExpired', () => {
    it('should publish reservation expired event', async () => {
      await publisher.onModuleInit();

      const reservation = {
        id: 'res-123',
        userId: 'user-123',
        sessionId: 'session-123',
        seats: [{ id: 'seat-1' }],
      };

      await publisher.publishReservationExpired(reservation);

      expect(mockChannel.publish).toHaveBeenCalled();
      const publishCall = mockChannel.publish.mock.calls[0] as [string, string, Buffer, object];
      expect(publishCall[1]).toBe('reservation.expired');
      const message = JSON.parse(publishCall[2].toString()) as EventMessage;
      expect(message.type).toBe('reservation.expired');
    });
  });

  describe('publishPaymentConfirmed', () => {
    it('should publish payment confirmed event', async () => {
      await publisher.onModuleInit();

      const sale = {
        id: 'sale-123',
        userId: 'user-123',
        sessionId: 'session-123',
        totalAmount: 50.0,
      };
      const reservation = { id: 'res-123' };

      await publisher.publishPaymentConfirmed(sale, reservation);

      expect(mockChannel.publish).toHaveBeenCalled();
      const publishCall = mockChannel.publish.mock.calls[0] as [string, string, Buffer, object];
      expect(publishCall[1]).toBe('payment.confirmed');
      const message = JSON.parse(publishCall[2].toString()) as EventMessage;
      expect(message.type).toBe('payment.confirmed');
      expect(message.saleId).toBe('sale-123');
      expect(message.amount).toBe(50);
    });
  });

  describe('publishSeatReleased', () => {
    it('should publish seat released event', async () => {
      await publisher.onModuleInit();

      await publisher.publishSeatReleased('session-123', ['seat-1', 'seat-2']);

      expect(mockChannel.publish).toHaveBeenCalled();
      const publishCall = mockChannel.publish.mock.calls[0] as [string, string, Buffer, object];
      expect(publishCall[1]).toBe('seat.released');
      const message = JSON.parse(publishCall[2].toString()) as EventMessage;
      expect(message.type).toBe('seat.released');
      expect(message.sessionId).toBe('session-123');
      expect(message.seatIds).toEqual(['seat-1', 'seat-2']);
    });
  });

  describe('publish when not connected', () => {
    it('should not publish when not connected', async () => {
      const reservation = {
        id: 'res-123',
        userId: 'user-123',
        sessionId: 'session-123',
      };

      await publisher.publishReservationCreated(reservation);

      expect(mockChannel.publish).not.toHaveBeenCalled();
    });
  });
});
