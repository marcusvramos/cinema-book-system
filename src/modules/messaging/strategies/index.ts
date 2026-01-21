import { EventHandlerStrategy } from './event-handler.interface';
import { ReservationCreatedHandler } from './reservation-created.handler';
import { ReservationExpiredHandler } from './reservation-expired.handler';
import { PaymentConfirmedHandler } from './payment-confirmed.handler';
import { SeatReleasedHandler } from './seat-released.handler';

export { EventHandlerStrategy } from './event-handler.interface';
export { ReservationCreatedHandler } from './reservation-created.handler';
export { ReservationExpiredHandler } from './reservation-expired.handler';
export { PaymentConfirmedHandler } from './payment-confirmed.handler';
export { SeatReleasedHandler } from './seat-released.handler';

export const EVENT_HANDLERS: EventHandlerStrategy[] = [
  new ReservationCreatedHandler(),
  new ReservationExpiredHandler(),
  new PaymentConfirmedHandler(),
  new SeatReleasedHandler(),
];
