import { Logger } from '@nestjs/common';
import { CinemaEvent, EventType, ReservationEvent } from '../publishers/event.types';
import { EventHandlerStrategy } from './event-handler.interface';

export class ReservationCreatedHandler implements EventHandlerStrategy {
  readonly eventType: EventType = 'reservation.created';
  private readonly logger = new Logger(ReservationCreatedHandler.name);

  handle(event: CinemaEvent): void {
    const e = event as ReservationEvent;
    this.logger.log(`Reservation created: ${e.reservationId} for user ${e.userId}`);
  }
}
