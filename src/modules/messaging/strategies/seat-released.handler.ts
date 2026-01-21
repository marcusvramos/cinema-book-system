import { Injectable, Logger } from '@nestjs/common';
import { CinemaEvent, EventType, SeatEvent } from '../publishers/event.types';
import { EventHandlerStrategy } from './event-handler.interface';

@Injectable()
export class SeatReleasedHandler implements EventHandlerStrategy {
  readonly eventType: EventType = 'seat.released';
  private readonly logger = new Logger(SeatReleasedHandler.name);

  handle(event: CinemaEvent): void {
    const e = event as SeatEvent;
    this.logger.log(`Seats released: ${e.seatIds.length} seats for session ${e.sessionId}`);

    // Possíveis implementações em ambiente de produção:
    // 1. ENVIO DE MENSAGEM POR EMAIL
    // 2. NOTIFICAÇÃO PUSH
    // 3. INTEGRAÇÃO COM SISTEMA DE PONTOS/FIDELIDADE
    // 4. ATUALIZAÇÃO DE CACHE
    // 5. WEBHOOK PARA SISTEMAS EXTERNOS
  }
}
