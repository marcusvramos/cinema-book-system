import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { CinemaEvent, EventType } from '../publishers/event.types';
import { withRetry } from '@common/utils/retry.util';

type QueueConfig = {
  name: string;
  routingKey: EventType;
};

interface BatchConfig {
  size: number;
  timeoutMs: number;
}

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
  private readonly exchangeName = 'cinema.events';

  private readonly batchConfig: BatchConfig = {
    size: 10,
    timeoutMs: 1000,
  };

  private pendingMessages: Map<string, PendingMessage[]> = new Map();
  private batchTimers: Map<string, NodeJS.Timeout> = new Map();

  private readonly queues: QueueConfig[] = [
    { name: 'cinema.reservation.created', routingKey: 'reservation.created' },
    { name: 'cinema.reservation.expired', routingKey: 'reservation.expired' },
    { name: 'cinema.payment.confirmed', routingKey: 'payment.confirmed' },
    { name: 'cinema.seat.released', routingKey: 'seat.released' },
  ];

  constructor(private readonly configService: ConfigService) {
    this.queues.forEach((q) => this.pendingMessages.set(q.name, []));
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

      await this.channel.assertExchange(this.exchangeName, 'topic', {
        durable: true,
      });

      await this.channel.assertQueue('cinema.dlq', { durable: true });

      for (const queue of this.queues) {
        await this.channel.assertQueue(queue.name, {
          durable: true,
          arguments: {
            'x-dead-letter-exchange': '',
            'x-dead-letter-routing-key': 'cinema.dlq',
          },
        });
        await this.channel.bindQueue(queue.name, this.exchangeName, queue.routingKey);
      }

      await this.channel.prefetch(this.batchConfig.size * 2);

      for (const queue of this.queues) {
        await this.channel.consume(queue.name, (msg) => this.collectForBatch(msg, queue.name), {
          noAck: false,
        });
      }

      this.logger.log(
        `Event consumer connected to RabbitMQ (batch size: ${this.batchConfig.size})`,
      );

      this.connection.on('error', (err: Error) => {
        this.logger.error(`RabbitMQ consumer connection error: ${err.message}`);
      });

      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ consumer connection closed');
        setTimeout(() => void this.connect(), 5000);
      });
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to connect consumer: ${err.message}`);
      setTimeout(() => void this.connect(), 5000);
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

      if (pending.length >= this.batchConfig.size) {
        this.processBatch(queueName);
      } else if (!this.batchTimers.has(queueName)) {
        const timer = setTimeout(() => {
          this.processBatch(queueName);
        }, this.batchConfig.timeoutMs);
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
        () => {
          this.processEvent(payload);
          return Promise.resolve();
        },
        {
          maxRetries: 3,
          baseDelayMs: 100,
          maxDelayMs: 1000,
          backoffMultiplier: 2,
        },
        this.logger,
        'Process event ' + payload.eventId,
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

    for (const queueName of this.queues.map((q) => q.name)) {
      const pending = this.pendingMessages.get(queueName) || [];
      if (pending.length > 0) {
        this.logger.log(`Flushing ${pending.length} pending messages from ${queueName}`);
        flushPromises.push(Promise.resolve(this.processBatch(queueName)));
      }
    }

    await Promise.all(flushPromises);
  }

  private processEvent(event: CinemaEvent): void {
    if (!event || !event.eventId || !event.type) {
      throw new Error('Invalid event payload');
    }

    switch (event.type) {
      case 'reservation.created':
        this.logger.log(`Event ${event.eventId}: reservation created ${event.reservationId}`);
        return;
      case 'reservation.expired':
        this.logger.log(`Event ${event.eventId}: reservation expired ${event.reservationId}`);
        return;
      case 'payment.confirmed':
        this.logger.log(`Event ${event.eventId}: payment confirmed ${event.saleId}`);
        return;
      case 'seat.released':
        this.logger.log(`Event ${event.eventId}: seats released ${event.seatIds.length}`);
        return;
      default: {
        const unknownEvent = event as { type?: string };
        throw new Error(`Unhandled event type: ${unknownEvent.type ?? 'unknown'}`);
      }
    }
  }
}
