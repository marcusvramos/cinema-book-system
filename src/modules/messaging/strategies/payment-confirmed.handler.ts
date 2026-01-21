import { Logger } from '@nestjs/common';
import { CinemaEvent, EventType, PaymentEvent } from '../publishers/event.types';
import { EventHandlerStrategy } from './event-handler.interface';

export class PaymentConfirmedHandler implements EventHandlerStrategy {
  readonly eventType: EventType = 'payment.confirmed';
  private readonly logger = new Logger(PaymentConfirmedHandler.name);

  handle(event: CinemaEvent): void {
    const e = event as PaymentEvent;
    this.logger.log(`Payment confirmed: sale ${e.saleId}, amount ${e.amount}`);
  }
}
