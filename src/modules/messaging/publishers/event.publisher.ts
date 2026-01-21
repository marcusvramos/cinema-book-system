import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as amqp from 'amqplib';
import { PaymentEvent, ReservationEvent, SeatEvent } from './event.types';
import { MESSAGING_CONSTANTS } from '../messaging.constants';
import { setupAmqpInfrastructure } from '../amqp-setup.util';

@Injectable()
export class EventPublisher implements OnModuleInit {
  private readonly logger = new Logger(EventPublisher.name);
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.ConfirmChannel | null = null;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.connect();
  }

  private async connect(): Promise<void> {
    try {
      const url = this.configService.get<string>('rabbitmq.url');
      if (!url) {
        this.logger.warn('RabbitMQ URL not configured, messaging disabled');
        return;
      }

      this.connection = await amqp.connect(url);
      this.channel = await this.connection.createConfirmChannel();

      await setupAmqpInfrastructure(this.channel);

      this.isConnected = true;
      this.logger.log('Connected to RabbitMQ');

      this.connection.on('error', (err: Error) => {
        this.logger.error(`RabbitMQ connection error: ${err.message}`);
        this.isConnected = false;
      });

      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ connection closed');
        this.isConnected = false;
        setTimeout(() => void this.connect(), MESSAGING_CONSTANTS.RECONNECT_DELAY_MS);
      });
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to connect to RabbitMQ: ${err.message}`);
      setTimeout(() => void this.connect(), MESSAGING_CONSTANTS.RECONNECT_DELAY_MS);
    }
  }

  private async publish(
    routingKey: string,
    message: ReservationEvent | PaymentEvent | SeatEvent,
  ): Promise<void> {
    if (!this.isConnected || !this.channel) {
      this.logger.warn(`Cannot publish message, not connected to RabbitMQ`);
      return;
    }

    try {
      this.channel.publish(
        MESSAGING_CONSTANTS.EXCHANGE_NAME,
        routingKey,
        Buffer.from(JSON.stringify(message)),
        {
          persistent: true,
          contentType: 'application/json',
          messageId: message.eventId,
          type: message.type,
          timestamp: Math.floor(Date.now() / 1000),
        },
      );
      await this.channel.waitForConfirms();
      this.logger.debug(`Published message to ${routingKey}: ${JSON.stringify(message)}`);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to publish message: ${err.message}`);
    }
  }

  private createReservationEvent(
    type: 'reservation.created' | 'reservation.expired',
    reservation: { id: string; userId: string; sessionId: string; seats?: { id: string }[] },
  ): ReservationEvent {
    return {
      eventId: randomUUID(),
      type,
      reservationId: reservation.id,
      userId: reservation.userId,
      sessionId: reservation.sessionId,
      seatIds: reservation.seats?.map((s) => s.id) || [],
      timestamp: new Date().toISOString(),
    };
  }

  async publishReservationCreated(reservation: {
    id: string;
    userId: string;
    sessionId: string;
    seats?: { id: string }[];
  }): Promise<void> {
    const event = this.createReservationEvent('reservation.created', reservation);
    await this.publish('reservation.created', event);
  }

  async publishReservationExpired(reservation: {
    id: string;
    userId: string;
    sessionId: string;
    seats?: { id: string }[];
  }): Promise<void> {
    const event = this.createReservationEvent('reservation.expired', reservation);
    await this.publish('reservation.expired', event);
  }

  async publishPaymentConfirmed(
    sale: {
      id: string;
      userId: string;
      sessionId: string;
      totalAmount: number;
    },
    reservation: { id: string },
  ): Promise<void> {
    const event: PaymentEvent = {
      eventId: randomUUID(),
      type: 'payment.confirmed',
      saleId: sale.id,
      reservationId: reservation.id,
      userId: sale.userId,
      sessionId: sale.sessionId,
      amount: Number(sale.totalAmount),
      timestamp: new Date().toISOString(),
    };
    await this.publish('payment.confirmed', event);
  }

  async publishSeatReleased(sessionId: string, seatIds: string[]): Promise<void> {
    const event: SeatEvent = {
      eventId: randomUUID(),
      type: 'seat.released',
      sessionId,
      seatIds,
      timestamp: new Date().toISOString(),
    };
    await this.publish('seat.released', event);
  }
}
