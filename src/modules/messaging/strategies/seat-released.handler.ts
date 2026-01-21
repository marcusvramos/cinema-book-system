import { Logger } from '@nestjs/common';
import { CinemaEvent, EventType, SeatEvent } from '../publishers/event.types';
import { EventHandlerStrategy } from './event-handler.interface';

export class SeatReleasedHandler implements EventHandlerStrategy {
  readonly eventType: EventType = 'seat.released';
  private readonly logger = new Logger(SeatReleasedHandler.name);

  handle(event: CinemaEvent): void {
    const e = event as SeatEvent;
    this.logger.log(`Seats released: ${e.seatIds.length} seats for session ${e.sessionId}`);
  }
}
