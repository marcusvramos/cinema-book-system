import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { CinemaEvent, EventType } from '../publishers/event.types';
import { withRetry, MESSAGE_RETRY_OPTIONS } from '@common/utils/retry.util';
import { MESSAGING_CONSTANTS, QUEUE_CONFIGS } from '../messaging.constants';
import { setupAmqpInfrastructure } from '../amqp-setup.util';
import {
  EventHandlerStrategy,
  ReservationCreatedHandler,
  ReservationExpiredHandler,
  PaymentConfirmedHandler,
  SeatReleasedHandler,
} from '../strategies';

interface PendingMessage {
  msg: amqp.ConsumeMessage;
  payload: CinemaEvent;
  queueName: string;
  receivedAt: number;
}

@Injectable()
export class EventConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventConsumer.name);
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;

  private pendingMessages: Map<string, PendingMessage[]> = new Map();
  private batchTimers: Map<string, NodeJS.Timeout> = new Map();

  private readonly handlerStrategies: Map<EventType, EventHandlerStrategy> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly reservationCreatedHandler: ReservationCreatedHandler,
    private readonly reservationExpiredHandler: ReservationExpiredHandler,
    private readonly paymentConfirmedHandler: PaymentConfirmedHandler,
    private readonly seatReleasedHandler: SeatReleasedHandler,
  ) {
    QUEUE_CONFIGS.forEach((q) => this.pendingMessages.set(q.name, []));
    this.registerHandlerStrategies();
  }

  private registerHandlerStrategies(): void {
    const handlers: EventHandlerStrategy[] = [
      this.reservationCreatedHandler,
      this.reservationExpiredHandler,
      this.paymentConfirmedHandler,
      this.seatReleasedHandler,
    ];

    handlers.forEach((handler) => {
      this.handlerStrategies.set(handler.eventType, handler);
    });
  }

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.flushAllBatches();

    this.batchTimers.forEach((timer) => clearTimeout(timer));
    this.batchTimers.clear();

    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }

  private async connect(): Promise<void> {
    try {
      const url = this.configService.get<string>('rabbitmq.url');
      if (!url) {
        this.logger.warn('RabbitMQ URL not configured, consumer disabled');
        return;
      }

      this.connection = await amqp.connect(url);
      this.channel = await this.connection.createChannel();

      await setupAmqpInfrastructure(this.channel);

      const prefetchCount =
        MESSAGING_CONSTANTS.BATCH_SIZE * MESSAGING_CONSTANTS.PREFETCH_MULTIPLIER;
      await this.channel.prefetch(prefetchCount);

      for (const queue of QUEUE_CONFIGS) {
        await this.channel.consume(queue.name, (msg) => this.collectForBatch(msg, queue.name), {
          noAck: false,
        });
      }

      this.logger.log(
        `Event consumer connected to RabbitMQ (batch size: ${MESSAGING_CONSTANTS.BATCH_SIZE})`,
      );

      this.connection.on('error', (err: Error) => {
        this.logger.error(`RabbitMQ consumer connection error: ${err.message}`);
      });

      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ consumer connection closed');
        setTimeout(() => void this.connect(), MESSAGING_CONSTANTS.RECONNECT_DELAY_MS);
      });
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to connect consumer: ${err.message}`);
      setTimeout(() => void this.connect(), MESSAGING_CONSTANTS.RECONNECT_DELAY_MS);
    }
  }

  private collectForBatch(msg: amqp.ConsumeMessage | null, queueName: string): void {
    if (!msg || !this.channel) {
      return;
    }

    try {
      const payload = JSON.parse(msg.content.toString()) as CinemaEvent;
      const pending = this.pendingMessages.get(queueName) || [];

      pending.push({
        msg,
        payload,
        queueName,
        receivedAt: Date.now(),
      });

      this.pendingMessages.set(queueName, pending);

      if (pending.length >= MESSAGING_CONSTANTS.BATCH_SIZE) {
        this.processBatch(queueName);
      } else if (!this.batchTimers.has(queueName)) {
        const timer = setTimeout(() => {
          this.processBatch(queueName);
        }, MESSAGING_CONSTANTS.BATCH_TIMEOUT_MS);
        this.batchTimers.set(queueName, timer);
      }
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to parse message from ${queueName}: ${err.message}`);
      this.channel.nack(msg, false, false);
    }
  }

  private processBatch(queueName: string): void {
    const timer = this.batchTimers.get(queueName);
    if (timer) {
      clearTimeout(timer);
      this.batchTimers.delete(queueName);
    }

    const pending = this.pendingMessages.get(queueName) || [];
    if (pending.length === 0) {
      return;
    }

    this.pendingMessages.set(queueName, []);

    const batchSize = pending.length;
    const startTime = Date.now();

    this.logger.debug(`Processing batch of ${batchSize} messages from ${queueName}`);

    const results = pending.map((item) => this.processMessageWithRetry(item));

    Promise.all(results)
      .then((outcomes) => {
        const succeeded = outcomes.filter((o) => o.success).length;
        const failed = outcomes.filter((o) => !o.success).length;
        const duration = Date.now() - startTime;

        this.logger.log(
          `Batch processed: ${succeeded} succeeded, ${failed} failed in ${duration}ms from ${queueName}`,
        );
      })
      .catch((err: Error) => {
        this.logger.error(`Batch processing error: ${err.message}`);
      });
  }

  private async processMessageWithRetry(
    item: PendingMessage,
  ): Promise<{ success: boolean; eventId: string }> {
    const { msg, payload, queueName } = item;

    try {
      await withRetry(
        async () => {
          await this.processEvent(payload);
        },
        MESSAGE_RETRY_OPTIONS,
        this.logger,
        `Process event ${payload.eventId}`,
      );

      this.channel?.ack(msg);
      return { success: true, eventId: payload.eventId };
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to process message ${payload.eventId} from ${queueName} after retries: ${err.message}`,
      );
      this.channel?.nack(msg, false, false);
      return { success: false, eventId: payload.eventId };
    }
  }

  private async flushAllBatches(): Promise<void> {
    const flushPromises: Promise<void>[] = [];

    for (const queue of QUEUE_CONFIGS) {
      const pending = this.pendingMessages.get(queue.name) || [];
      if (pending.length > 0) {
        this.logger.log(`Flushing ${pending.length} pending messages from ${queue.name}`);
        flushPromises.push(Promise.resolve(this.processBatch(queue.name)));
      }
    }

    await Promise.all(flushPromises);
  }

  private async processEvent(event: CinemaEvent): Promise<void> {
    if (!event || !event.eventId || !event.type) {
      throw new Error('Invalid event payload');
    }

    const strategy = this.handlerStrategies.get(event.type);
    if (!strategy) {
      throw new Error(`Unhandled event type: ${event.type}`);
    }

    await strategy.handle(event);
  }
}
