export type EventType =
  | 'reservation.created'
  | 'reservation.expired'
  | 'payment.confirmed'
  | 'seat.released';

export interface BaseEvent {
  eventId: string;
  type: EventType;
  timestamp: string;
}

export interface ReservationEvent extends BaseEvent {
  type: 'reservation.created' | 'reservation.expired';
  reservationId: string;
  userId: string;
  sessionId: string;
  seatIds: string[];
}

export interface PaymentEvent extends BaseEvent {
  type: 'payment.confirmed';
  saleId: string;
  reservationId: string;
  userId: string;
  sessionId: string;
  amount: number;
}

export interface SeatEvent extends BaseEvent {
  type: 'seat.released';
  sessionId: string;
  seatIds: string[];
}

export type CinemaEvent = ReservationEvent | PaymentEvent | SeatEvent;
