import { Logger } from '@nestjs/common';
import { CinemaEvent, EventType, ReservationEvent } from '../publishers/event.types';
import { EventHandlerStrategy } from './event-handler.interface';

export class ReservationExpiredHandler implements EventHandlerStrategy {
  readonly eventType: EventType = 'reservation.expired';
  private readonly logger = new Logger(ReservationExpiredHandler.name);

  handle(event: CinemaEvent): void {
    const e = event as ReservationEvent;
    this.logger.log(`Reservation expired: ${e.reservationId}, seats released: ${e.seatIds.length}`);
  }
}
