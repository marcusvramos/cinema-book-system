import { Injectable, Logger } from '@nestjs/common';
import { CinemaEvent, EventType, PaymentEvent } from '../publishers/event.types';
import { EventHandlerStrategy } from './event-handler.interface';
import { RedisStatsService } from '@infrastructure/redis/redis-stats.service';

@Injectable()
export class PaymentConfirmedHandler implements EventHandlerStrategy {
  readonly eventType: EventType = 'payment.confirmed';
  private readonly logger = new Logger(PaymentConfirmedHandler.name);

  constructor(private readonly redisStatsService: RedisStatsService) {}

  async handle(event: CinemaEvent): Promise<void> {
    const e = event as PaymentEvent;
    this.logger.log(`Payment confirmed: sale ${e.saleId}, amount ${e.amount}`);

    await this.redisStatsService.incrementSessionSales(e.sessionId, e.amount);
    await this.redisStatsService.incrementGlobalStats(e.amount);

    const sessionStats = await this.redisStatsService.getSessionStats(e.sessionId);
    this.logger.log(
      `Session ${e.sessionId} stats: ${sessionStats.salesCount} sales, R$ ${sessionStats.totalRevenue.toFixed(2)} revenue`,
    );

    // Possíveis implementações em ambiente de produção:
    // 1. ENVIO DE MENSAGEM POR EMAIL
    // 2. NOTIFICAÇÃO PUSH
    // 3. INTEGRAÇÃO COM SISTEMA DE PONTOS/FIDELIDADE
    // 4. ATUALIZAÇÃO DE CACHE
    // 5. WEBHOOK PARA SISTEMAS EXTERNOS
  }
}
