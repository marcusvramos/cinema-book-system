import { Injectable, Logger } from '@nestjs/common';
import { CinemaEvent, EventType, ReservationEvent } from '../publishers/event.types';
import { EventHandlerStrategy } from './event-handler.interface';

@Injectable()
export class ReservationExpiredHandler implements EventHandlerStrategy {
  readonly eventType: EventType = 'reservation.expired';
  private readonly logger = new Logger(ReservationExpiredHandler.name);

  handle(event: CinemaEvent): void {
    const e = event as ReservationEvent;
    this.logger.log(`Reservation expired: ${e.reservationId}, seats released: ${e.seatIds.length}`);

    // Possíveis implementações em ambiente de produção:
    // 1. ENVIO DE MENSAGEM POR EMAIL
    // 2. NOTIFICAÇÃO PUSH
    // 3. INTEGRAÇÃO COM SISTEMA DE PONTOS/FIDELIDADE
    // 4. ATUALIZAÇÃO DE CACHE
    // 5. WEBHOOK PARA SISTEMAS EXTERNOS
  }
}
