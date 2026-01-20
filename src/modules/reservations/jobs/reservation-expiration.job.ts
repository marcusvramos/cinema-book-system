import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReservationsService } from '../reservations.service';

@Injectable()
export class ReservationExpirationJob {
  private readonly logger = new Logger(ReservationExpirationJob.name);
  private isProcessing = false;

  constructor(private readonly reservationsService: ReservationsService) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async handle(): Promise<void> {
    if (this.isProcessing) {
      this.logger.debug('Expiration job already running, skipping...');
      return;
    }

    this.isProcessing = true;

    try {
      const expiredCount = await this.reservationsService.expirePendingReservations();

      if (expiredCount > 0) {
        this.logger.log(`Expired ${expiredCount} reservation(s)`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error expiring reservations: ${message}`);
    } finally {
      this.isProcessing = false;
    }
  }
}
