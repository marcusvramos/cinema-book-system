import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reservation } from './entities/reservation.entity';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { MessagingModule } from '../messaging/messaging.module';
import { ReservationExpirationJob } from './jobs/reservation-expiration.job';

@Module({
  imports: [TypeOrmModule.forFeature([Reservation]), MessagingModule],
  controllers: [ReservationsController],
  providers: [ReservationsService, ReservationExpirationJob],
  exports: [ReservationsService],
})
export class ReservationsModule {}
