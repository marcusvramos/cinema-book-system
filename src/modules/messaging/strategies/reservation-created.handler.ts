import { Injectable, Logger } from '@nestjs/common';
import { CinemaEvent, EventType, ReservationEvent } from '../publishers/event.types';
import { EventHandlerStrategy } from './event-handler.interface';

@Injectable()
export class ReservationCreatedHandler implements EventHandlerStrategy {
  readonly eventType: EventType = 'reservation.created';
  private readonly logger = new Logger(ReservationCreatedHandler.name);

  handle(event: CinemaEvent): void {
    const e = event as ReservationEvent;
    this.logger.log(`Reservation created: ${e.reservationId} for user ${e.userId}`);

    // Possíveis implementações em ambiente de produção:
    // 1. ENVIO DE MENSAGEM POR EMAIL
    // 2. NOTIFICAÇÃO PUSH
    // 3. INTEGRAÇÃO COM SISTEMA DE PONTOS/FIDELIDADE
    // 4. ATUALIZAÇÃO DE CACHE
    // 5. WEBHOOK PARA SISTEMAS EXTERNOS
  }
}
