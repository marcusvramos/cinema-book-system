import { CinemaEvent, EventType } from '../publishers/event.types';

export interface EventHandlerStrategy {
  readonly eventType: EventType;
  handle(event: CinemaEvent): void;
}
